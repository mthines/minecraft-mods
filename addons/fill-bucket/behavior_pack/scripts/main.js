import { world, system } from "@minecraft/server";

// Use the Fill Bucket on the inside of a block: the hole it faces is filled with that block, like the paint bucket in Paint.
// The hole is one flat layer: a wall frame, a floor or ceiling ring, or a line between two posts.

const BUCKET = "family:fill_bucket";
const MAX_BLOCKS = 500; // bigger than this is a leak, not a hole: a 20×20 wall is 400
const RADIUS = 64; // how far from the click the search may go
const PER_TICK = 25; // blocks placed per tick: a whole fill takes up to 1 second and never lags the server
const UNDO_TICKS = 60; // 3 seconds, from the last block placed
const CLICK_GAP = 6; // ticks: one click can arrive as several events

const NORMALS = { Up: [0, 1, 0], Down: [0, -1, 0], North: [0, 0, -1], South: [0, 0, 1], East: [1, 0, 0], West: [-1, 0, 0] };
const SIDE = RADIUS * 2 + 1;

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

/** @param {import("@minecraft/server").Player} player @param {import("@minecraft/server").Block} block @param {string} face */
function fill(player, block, face) {
  const normal = NORMALS[face];
  if (!normal) return;
  if (block.isAir || block.isLiquid || block.getComponent("minecraft:inventory")) {
    say(player, "§eUse the bucket on the inside of a solid block");
    return;
  }
  const seed = { x: block.x + normal[0], y: block.y + normal[1], z: block.z + normal[2] };
  const dimension = block.dimension;
  const start = dimension.getBlock(seed);
  if (!start?.isAir) {
    say(player, "§eUse the bucket on the side of a block that faces an empty hole");
    return;
  }
  const faceAxis = normal.findIndex((v) => v !== 0);
  /** @type {Pos[][]} */
  const closed = [];
  for (const axis of layerAxes(faceAxis, player)) {
    const cells = flood(dimension, seed, axis);
    if (cells) closed.push(cells);
  }
  if (closed.length === 0) {
    say(player, `§eThe hole isn't closed (more than ${MAX_BLOCKS} blocks): close the gaps first`);
    return;
  }
  const cells = closed.length > 1 && player.isSneaking ? closed[1] : closed[0];
  /** @type {Job} */
  const job = { cells, next: 0, place: block.permutation, dimension, typeId: block.typeId, doneAt: Infinity };
  jobs.push(job);
  lastFill.set(player.id, job);
  ensureTicker();
  try { dimension.playSound("bucket.empty_water", block.location, { pitch: 1.3, volume: 0.8 }); } catch { /* not loaded */ }
  const other = closed.length > 1 ? " Sneak and use it for the other way." : "";
  say(player, `§aFilled ${cells.length} blocks! Use it in the air within 3 seconds to undo.${other}`);
}

/** @param {import("@minecraft/server").Player} player */
function undo(player) {
  const job = lastFill.get(player.id);
  if (!job) return;
  lastFill.delete(player.id);
  if (system.currentTick - job.doneAt > UNDO_TICKS) return; // doneAt is Infinity while still filling: no undo yet
  jobs.push({ cells: job.cells, next: 0, place: undefined, dimension: job.dimension, typeId: job.typeId, doneAt: Infinity });
  ensureTicker();
  say(player, "§bUndone!");
}

world.beforeEvents.playerInteractWithBlock.subscribe(({ player, block, blockFace, itemStack }) => {
  if (!player || itemStack?.typeId !== BUCKET) return;
  const now = system.currentTick;
  if (now - (lastClick.get(player.id) ?? -100) < CLICK_GAP) return;
  lastClick.set(player.id, now);
  system.run(() => { if (block.isValid) fill(player, block, blockFace); }); // a before event can't change the world

});

// Using it in the air (not on a block) undoes the last fill, for 3 seconds after it.
world.afterEvents.itemUse.subscribe(({ source: player, itemStack }) => {
  if (!player || itemStack?.typeId !== BUCKET) return;
  if (system.currentTick - (lastClick.get(player.id) ?? -100) < CLICK_GAP) return; // that was the click on a block
  undo(player);
});

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  lastFill.delete(playerId);
  lastClick.delete(playerId);
});
