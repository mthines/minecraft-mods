import { ItemStack, Player, world, system } from "@minecraft/server";

// Use the Fill Bucket on the inside of a block: the hole it faces is filled with that block, like the paint bucket in Paint.
// The hole is one flat layer: a wall frame, a floor or ceiling ring, or a line between two posts.
// Use it on a staircase you started (up, straight, up, straight, ...) and it keeps building that pattern, see planStairs.

const BUCKET = "family:fill_bucket";
const MAX_BLOCKS = 500; // bigger than this is a leak, not a hole: a 20×20 wall is 400
const RADIUS = 64; // how far from the click the search may go
const PER_TICK = 25; // blocks placed per tick: a whole fill takes up to 1 second and never lags the server
const UNDO_TICKS = 200; // 10 seconds, from the last block placed
const CLICK_GAP = 6; // ticks: one click can arrive as several events

const NORMALS = { Up: [0, 1, 0], Down: [0, -1, 0], North: [0, 0, -1], South: [0, 0, 1], East: [1, 0, 0], West: [-1, 0, 0] };
const SIDE = RADIUS * 2 + 1;
const STAIR_SIDE = 64; // how far along a staircase the bucket looks for the blocks you already built
const STAIR_MAX_NEW = 40; // the most blocks one stair fill adds
const STAIR_MAX_STEPS = 80; // the most steps it walks, counting blocks that are already there

// The mode says what a click does, and it is the item in your hand: each mode is its own bucket with its own picture
// (the plain bucket is Auto; green steps, a blue wall, an orange floor and a teal line are the others), so you can see it without reading.
// Sneak and use the bucket in the air to swap it for the next one.
const MODES = ["auto", "stairs", "wall", "floor", "line"];
const BUCKETS = { auto: BUCKET, stairs: "family:fill_bucket_stairs", wall: "family:fill_bucket_wall", floor: "family:fill_bucket_floor", line: "family:fill_bucket_line" };
/** @type {Record<string, string>} item id → mode */
const MODE_OF = Object.fromEntries(Object.entries(BUCKETS).map(([mode, id]) => [id, mode]));
const LABEL = { auto: "Auto", stairs: "Stairs", wall: "Wall", floor: "Floor", line: "Line" };
const ABOUT = { auto: "guesses: the staircase or the hole", stairs: "builds the staircase on", wall: "fills a wall", floor: "fills a floor or ceiling", line: "fills a straight line to the next block" };

/** Swaps the bucket in the player's hand for the next mode's. @param {import("@minecraft/server").Player} player @param {string} mode the mode it is in now */
function nextMode(player, mode) {
  const next = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
  player.getComponent("minecraft:inventory")?.container?.setItem(player.selectedSlotIndex, new ItemStack(BUCKETS[next], 1));
  say(player, `§bFill Bucket mode: §f${LABEL[next]} §7(${ABOUT[next]})`);
}

/** @typedef {{ x: number, y: number, z: number }} Pos */
/** @typedef {{ cells: Pos[], next: number, place: import("@minecraft/server").BlockPermutation | undefined, dimension: import("@minecraft/server").Dimension, typeId: string, doneAt: number }} Job */

/** @type {Job[]} */
const jobs = [];
/** @type {Map<string, Job>} the last fill of each player, kept for undo */
const lastFill = new Map();
/** @type {Map<string, number>} */
const lastClick = new Map();
/** @type {number | undefined} */
let ticker;

/** @param {import("@minecraft/server").Player} player @param {string} text */
function say(player, text) {
  try { player.onScreenDisplay.setActionBar(text); } catch { /* simulated players have no screen */ }
}

/**
 * Flood-fills the empty blocks connected to `seed` inside the flat layer where axis `flat` stays the same.
 * Returns the cells, or undefined when the hole isn't closed (more than MAX_BLOCKS, too far, or an unloaded chunk).
 * @param {import("@minecraft/server").Dimension} dimension @param {Pos} seed @param {0 | 1 | 2} flat
 * @returns {Pos[] | undefined}
 */
function flood(dimension, seed, flat) {
  const free = [0, 1, 2].filter((axis) => axis !== flat);
  const origin = [seed.x, seed.y, seed.z];
  /** @type {Set<number>} */
  const seen = new Set();
  const keyOf = (/** @type {number[]} */ c) => ((c[0] - origin[0] + RADIUS) * SIDE + (c[1] - origin[1] + RADIUS)) * SIDE + (c[2] - origin[2] + RADIUS);
  /** @type {number[][]} */
  const queue = [origin];
  seen.add(keyOf(origin));
  /** @type {Pos[]} */
  const cells = [];
  for (let head = 0; head < queue.length; head++) {
    const c = queue[head];
    let block;
    try { block = dimension.getBlock({ x: c[0], y: c[1], z: c[2] }); } catch { return undefined; }
    if (!block) return undefined;
    if (!block.isAir) continue;
    if (cells.length >= MAX_BLOCKS) return undefined;
    cells.push({ x: c[0], y: c[1], z: c[2] });
    for (const axis of free) {
      for (const step of [-1, 1]) {
        const n = [c[0], c[1], c[2]];
        n[axis] += step;
        if (Math.abs(n[axis] - origin[axis]) > RADIUS) return undefined;
        const key = keyOf(n);
        if (seen.has(key)) continue;
        seen.add(key);
        queue.push(n);
      }
    }
  }
  return cells;
}

/** The layers to try, best first: a wall facing the player, a floor, ... @param {number} faceAxis @param {import("@minecraft/server").Player} player @returns {(0 | 1 | 2)[]} */
function layerAxes(faceAxis, player) {
  if (faceAxis === 0) return [2, 1];
  if (faceAxis === 2) return [0, 1];
  const look = player.getViewDirection();
  return Math.abs(look.x) > Math.abs(look.z) ? [0, 2] : [2, 0];
}

/** Every stair block (oak, stone, brick, ...) counts as a staircase block: they can be mixed. @param {string} typeId */
const isStair = (typeId) => typeId.endsWith("_stairs");
/** @param {string} a @param {string} b */
const alike = (a, b) => a === b || (isStair(a) && isStair(b));
/** A stair block's weirdo_direction is the way it climbs. */
const CLIMBS = [{ axis: 0, sign: 1 }, { axis: 0, sign: -1 }, { axis: 2, sign: 1 }, { axis: 2, sign: -1 }];

/**
 * The blocks of the same type that follow a line from `from`, one step at a time along `dir`:
 * straight on, one up, or one down. It stops when there isn't exactly one way to go on.
 * @param {import("@minecraft/server").Dimension} dimension @param {Pos} from @param {{ x: number, z: number }} dir @param {string} typeId
 * @returns {Pos[]}
 */
function follow(dimension, from, dir, typeId) {
  /** @type {Pos[]} */
  const line = [];
  let pos = from;
  while (line.length < STAIR_SIDE) {
    /** @type {Pos[]} */
    const ahead = [];
    for (const dy of [0, 1, -1]) {
      const at = { x: pos.x + dir.x, y: pos.y + dy, z: pos.z + dir.z };
      try { const there = dimension.getBlock(at); if (there && alike(there.typeId, typeId)) ahead.push(at); } catch { /* not loaded */ }
    }
    if (ahead.length !== 1) break;
    pos = ahead[0];
    line.push(pos);
  }
  return line;
}

/** The smallest repeating piece of `steps` (1 up, 0 straight, -1 down) that is repeated at least once, or undefined. @param {number[]} steps */
function patternOf(steps) {
  for (let size = 1; size <= Math.max(1, steps.length - 1); size++) {
    if (steps.every((step, i) => step === steps[i % size])) return steps.slice(0, size);
  }
  return undefined;
}

/**
 * A staircase you started: the blocks of the clicked block's type that go up and down along a line.
 * The bucket reads the pattern (up, straight, up, straight, ...) and keeps building it ahead of you.
 * It stops at something in the way, where the line you built goes another way (like two straights in a row), or at the length limit.
 * A stair block climbs the way it faces, and a lone stair block is enough: it continues as a plain staircase going up.
 * Returns undefined when the clicked block isn't part of a staircase. Otherwise a plan: the blocks to add, or just a message when there is nothing to add.
 * @param {import("@minecraft/server").Player} player @param {import("@minecraft/server").Block} block
 * @returns {{ message: string, cells?: Pos[], place?: import("@minecraft/server").BlockPermutation, typeId?: string } | undefined}
 */
function planStairs(player, block) {
  const dimension = block.dimension;
  const { typeId } = block;
  const look = player.getViewDirection();
  const facing = isStair(typeId) ? CLIMBS[Number(block.permutation.getState("weirdo_direction") ?? 0)] : undefined;
  /** @type {{ axis: 0 | 2, line: Pos[], score: number } | undefined} */
  let best;
  for (const axis of /** @type {const} */ ([0, 2])) {
    if (facing && axis !== facing.axis) continue;
    const dir = axis === 0 ? { x: 1, z: 0 } : { x: 0, z: 1 };
    const back = follow(dimension, block.location, { x: -dir.x, z: -dir.z }, typeId);
    const line = [...back.reverse(), block.location, ...follow(dimension, block.location, dir, typeId)];
    if (line.every((p) => p.y === line[0].y) && !(facing && line.length === 1)) continue; // a flat line is no staircase
    const looking = Math.abs(axis === 0 ? look.x : look.z);
    const score = line.length + looking * 0.1; // the longer line wins, and a tie goes to the way you look
    if (!best || score > best.score) best = { axis, line, score };
  }
  if (!best) return undefined;

  // Build ahead of you: the end of the line that is in the direction you look.
  const forward = facing ? facing.sign : (best.axis === 0 ? look.x : look.z) >= 0 ? 1 : -1;
  const ordered = forward === 1 ? best.line : [...best.line].reverse();
  const steps = ordered.slice(1).map((p, i) => p.y - ordered[i].y);
  const pattern = steps.length === 0 ? [1] : patternOf(steps); // a lone stair block: up, up, up
  if (!pattern) {
    return { message: "§eBuild one more step of the staircase so the bucket can see the pattern" };
  }
  const dir = best.axis === 0 ? { x: forward, z: 0 } : { x: 0, z: forward };
  const end = ordered[ordered.length - 1];
  const last = dimension.getBlock(end);
  if (!last) return undefined;

  /** @type {Pos[]} */
  const cells = [];
  let why = "the staircase ended";
  let pos = end;
  for (let i = 0; i < STAIR_MAX_STEPS; i++) {
    const rise = pattern[(steps.length + i) % pattern.length];
    const target = { x: pos.x + dir.x, y: pos.y + rise, z: pos.z + dir.z };
    let there;
    try { there = dimension.getBlock(target); } catch { there = undefined; }
    if (!there) { why = "it reached the edge of what is loaded"; break; }
    if (alike(there.typeId, typeId)) { pos = target; continue; } // already built: walk on
    if (!there.isAir) { why = "something is in the way"; break; }
    const turns = [-1, 0, 1].some((dy) => {
      if (dy === rise) return false;
      try { const other = dimension.getBlock({ x: pos.x + dir.x, y: pos.y + dy, z: pos.z + dir.z }); return !!other && alike(other.typeId, typeId); } catch { return false; }
    });
    if (turns) { why = "the line you built goes another way here"; break; }
    cells.push(target);
    pos = target;
    if (cells.length >= STAIR_MAX_NEW) { why = `the limit of ${STAIR_MAX_NEW} blocks`; break; }
  }
  if (cells.length === 0) return { message: `§eNothing to add: ${why}` };
  return { cells, place: last.permutation, typeId: last.typeId, message: `§aBuilt ${cells.length} more blocks of the staircase (stopped: ${why}). Hit with it within 10 seconds to undo.` };
}

/** The wall layers to try, best first. @param {number} faceAxis @param {import("@minecraft/server").Player} player @returns {(0 | 2)[]} */
function wallAxes(faceAxis, player) {
  if (faceAxis === 0) return [2, 0];
  if (faceAxis === 2) return [0, 2];
  const look = player.getViewDirection();
  return Math.abs(look.x) > Math.abs(look.z) ? [0, 2] : [2, 0];
}

const LINE_MAX = 64; // how far from the clicked block the other end can be

/**
 * Line mode: from the face you clicked, straight ahead until the next solid block; the empty blocks between the two are filled.
 * @param {import("@minecraft/server").Block} block @param {number[]} normal the clicked face's direction
 * @returns {{ message: string, cells?: Pos[], place?: import("@minecraft/server").BlockPermutation, typeId?: string }}
 */
function planLine(block, normal) {
  const dimension = block.dimension;
  /** @type {Pos[]} */
  const cells = [];
  for (let step = 1; step <= LINE_MAX; step++) {
    const at = { x: block.x + normal[0] * step, y: block.y + normal[1] * step, z: block.z + normal[2] * step };
    let there;
    try { there = dimension.getBlock(at); } catch { there = undefined; }
    if (!there) return { message: "§eThe other end isn't loaded: stand closer" };
    if (there.isAir) {
      cells.push(at);
      continue;
    }
    if (there.isLiquid) return { message: "§eThere is water or lava in the way: no block at the other end" };
    if (cells.length === 0) return { message: "§eNothing between: the two blocks touch. Use the bucket on the side facing the gap" };
    return { cells, place: block.permutation, typeId: block.typeId, message: `§aFilled a line of ${cells.length} blocks. Hit with it within 10 seconds to undo. §7[Line]` };
  }
  return { message: `§eNo block at the other end within ${LINE_MAX} blocks` };
}

function ensureTicker() {
  if (ticker !== undefined) return;
  ticker = system.runInterval(() => {
    let budget = PER_TICK;
    while (budget > 0 && jobs.length > 0) {
      const job = jobs[0];
      while (budget > 0 && job.next < job.cells.length) {
        const cell = job.cells[job.next++];
        budget--;
        try {
          const block = job.dimension.getBlock(cell);
          if (!block) continue;
          if (job.place) {
            if (block.isAir) block.setPermutation(job.place);
          } else if (block.typeId === job.typeId) block.setType("minecraft:air");
        } catch { /* chunk not loaded */ }
      }
      if (job.next >= job.cells.length) {
        job.doneAt = system.currentTick;
        jobs.shift();
      }
    }
    if (jobs.length === 0 && ticker !== undefined) {
      system.clearRun(ticker);
      ticker = undefined;
    }
  }, 1);
}

/** @param {import("@minecraft/server").Player} player @param {import("@minecraft/server").Block} block @param {string} face @param {string} mode */
function fill(player, block, face, mode) {
  const normal = NORMALS[face];
  if (!normal) return;
  if (block.isAir || block.isLiquid || block.getComponent("minecraft:inventory")) {
    say(player, "§eUse the bucket on the inside of a solid block");
    return;
  }
  const dimension = block.dimension;
  if (mode === "line") {
    const plan = planLine(block, normal);
    if (plan.cells && plan.place && plan.typeId) queue(player, dimension, plan.cells, plan.place, plan.typeId, block.location, plan.message);
    else say(player, plan.message);
    return;
  }
  const stairs = mode === "auto" || mode === "stairs" ? planStairs(player, block) : undefined;
  const seed = { x: block.x + normal[0], y: block.y + normal[1], z: block.z + normal[2] };
  const start = dimension.getBlock(seed);
  /** @type {Pos[][]} */
  const closed = [];
  if (start?.isAir && mode !== "stairs") {
    const faceAxis = normal.findIndex((v) => v !== 0);
    const axes = mode === "floor" ? [1] : mode === "wall" ? wallAxes(faceAxis, player) : layerAxes(faceAxis, player);
    for (const axis of axes) {
      const cells = flood(dimension, seed, axis);
      if (cells) closed.push(cells);
    }
  }
  // Two things the bucket could do: build the staircase on, or fill the closed hole. A click does the staircase when there is one;
  // sneaking and clicking does the other. With only one possible, it does that.
  if (!stairs?.cells && closed.length === 0) {
    say(player, stairs?.message ?? (mode === "stairs" ? "§eThat isn't a staircase: use the bucket on a stair block, or on a staircase you started" : mode === "wall" || mode === "floor" ? `§eThe ${mode} isn't closed (more than ${MAX_BLOCKS} blocks), or you clicked the wrong way: close the gaps first` : start?.isAir ? `§eThe hole isn't closed (more than ${MAX_BLOCKS} blocks): close the gaps first` : "§eUse the bucket on the side of a block that faces an empty hole"));
    return;
  }
  if (stairs?.cells && stairs.place && stairs.typeId && !(mode === "auto" && closed.length > 0 && player.isSneaking)) {
    const other = closed.length > 0 ? " Sneak and use it to fill the hole instead." : "";
    queue(player, dimension, stairs.cells, stairs.place, stairs.typeId, block.location, stairs.message + other + ` §7[${LABEL[mode]}]`);
    return;
  }
  const cells = !stairs?.cells && closed.length > 1 && player.isSneaking ? closed[1] : closed[0];
  const other = stairs?.cells ? " Sneak and use it for the staircase." : closed.length > 1 ? " Sneak and use it for the other way." : "";
  queue(player, dimension, cells, block.permutation, block.typeId, block.location, `§aFilled ${cells.length} blocks! Hit with it within 10 seconds to undo.${other} §7[${LABEL[mode]}]`);
}

/** Puts the blocks to place in the queue, remembered for undo. @param {import("@minecraft/server").Player} player @param {import("@minecraft/server").Dimension} dimension @param {Pos[]} cells @param {import("@minecraft/server").BlockPermutation} place @param {string} typeId @param {Pos} sound @param {string} message */
function queue(player, dimension, cells, place, typeId, sound, message) {
  /** @type {Job} */
  const job = { cells, next: 0, place, dimension, typeId, doneAt: Infinity };
  jobs.push(job);
  lastFill.set(player.id, job);
  ensureTicker();
  try { dimension.playSound("bucket.empty_water", sound, { pitch: 1.3, volume: 0.8 }); } catch { /* not loaded */ }
  say(player, message);
}

/** @param {import("@minecraft/server").Player} player */
function undo(player) {
  const job = lastFill.get(player.id);
  if (!job || job.doneAt === Infinity) return; // nothing to undo, or still filling (doneAt is Infinity then): the next hit undoes it
  lastFill.delete(player.id);
  if (system.currentTick - job.doneAt > UNDO_TICKS) return;
  jobs.push({ cells: job.cells, next: 0, place: undefined, dimension: job.dimension, typeId: job.typeId, doneAt: Infinity });
  ensureTicker();
  say(player, "§bUndone!");
}

world.beforeEvents.playerInteractWithBlock.subscribe(({ player, block, blockFace, itemStack }) => {
  const mode = itemStack ? MODE_OF[itemStack.typeId] : undefined;
  if (!player || !mode) return;
  const now = system.currentTick;
  if (now - (lastClick.get(player.id) ?? -100) < CLICK_GAP) return;
  lastClick.set(player.id, now);
  system.run(() => { if (block.isValid) fill(player, block, blockFace, mode); }); // a before event can't change the world

});

// Sneak and use it in the air (not on a block) changes the mode.
world.afterEvents.itemUse.subscribe(({ source: player, itemStack }) => {
  const mode = itemStack ? MODE_OF[itemStack.typeId] : undefined;
  if (!player || !mode) return;
  if (system.currentTick - (lastClick.get(player.id) ?? -100) < CLICK_GAP) return; // that was the click on a block
  if (player.isSneaking) nextMode(player, mode); // sneak and use in the air: the next mode
});

// Hitting a block or a mob with the bucket undoes the last fill, for 10 seconds after it. (The API has no event for swinging at the air.)
const heldMode = (/** @type {Player} */ player) => MODE_OF[player.getComponent("minecraft:inventory")?.container?.getItem(player.selectedSlotIndex)?.typeId ?? ""];
for (const hit of [world.afterEvents.entityHitBlock, world.afterEvents.entityHitEntity]) {
  hit.subscribe(({ damagingEntity: player }) => {
    if (player instanceof Player && heldMode(player)) undo(player); // NPCs come through as undefined in other mods: instanceof leaves them out
  });
}

// The bucket doesn't break blocks: hitting your build to undo it must not take pieces out of it.
world.beforeEvents.playerBreakBlock.subscribe((event) => {
  if (event.itemStack && MODE_OF[event.itemStack.typeId]) event.cancel = true;
});

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  lastFill.delete(playerId);
  lastClick.delete(playerId);
});
