import { ItemStack, Player, system, world } from "@minecraft/server";
import { groundAt as dryGroundAt } from "./ground.js";
import { planTracking } from "./track.js";
import { emit } from "./telemetry.js";

const HORN = "family:horde_horn";
const NEST = "family:horde_nest";
const HORDE_TAG = "family:horde"; // on every enemy the nest sent
const SAVE_KEY = "family:horde_game";
const OVERWORLD = "minecraft:overworld";

const SECONDS = 20; // Minecraft counts time in ticks: 20 ticks = 1 second.
const NEST_MIN = 150; // how far from the players a new nest appears, in blocks: far enough that it has to be found
const NEST_MAX = 220;
const AREA = "horde_nest"; // the ticking area that keeps the nest's chunks loaded while the round lasts
const LOAD_WAIT = 30 * SECONDS; // how long a far spot gets to load before another is tried
const WAVE_EVERY = 5 * SECONDS;
const BREAK = 15 * SECONDS; // between rounds
const RING_MIN = 18; // a wave appears this far from a player: inside the 35 blocks where a husk notices you
const RING_MAX = 26;
const MAX_ALIVE = 40; // the most horde enemies alive at once, so one script thread can keep up
const GUARD_TAG = "family:horde_guard"; // the enemies that stand at the nest: they stay there
const GUARD_RANGE = 40; // the guards appear when a player comes this close to the nest: far from every player, a hostile mob despawns at once
const TRACK_EVERY = 2 * SECONDS; // how often the horde is checked for enemies that lost the players
const TRACK_BUDGET = 8; // the most enemies moved or nudged per check
const MAX_PER_WAVE = 8; // the most spawned in one tick: a bigger wave comes over the next waves

const ARROWS = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"];
const COMPASS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];

/**
 * One game for the whole world. `nest` is where the Horde Nest stands, `nestId` its entity.
 * "placing" means the round is looking for a spot for its nest; "break" is the pause between rounds.
 * `guarded` is true once the guards stand at the nest.
 * @typedef {{ round: number, state: "placing" | "fight" | "break", nest: import("@minecraft/server").Vector3, nestId: string, guarded?: boolean }} Game
 */

/** @type {Game | null | undefined} */
let game;

function current() {
  if (game === undefined) {
    const saved = world.getDynamicProperty(SAVE_KEY);
    game = typeof saved === "string" ? JSON.parse(saved) : null;
  }
  return game;
}

/** @param {Game | null} next */
function save(next) {
  game = next;
  world.setDynamicProperty(SAVE_KEY, next ? JSON.stringify(next) : undefined);
}

const overworld = () => world.getDimension(OVERWORLD);
/** NPCs (simulated players from the npc mod) come through as undefined in other mods. */
const players = () => world.getPlayers().filter((p) => p && p.dimension.id === OVERWORLD);
const groundAt = (/** @type {number} */ x, /** @type {number} */ z) => dryGroundAt(overworld(), x, z);
const hordeMobs = () => overworld().getEntities({ tags: [HORDE_TAG] });

const spread = () => (Math.random() * 2 - 1);

/**
 * Where to stand at x, z near height `around`: the first solid block with two free blocks above it, looking down from a few
 * blocks above. Unlike the top of the world it also finds ground under trees, on slopes and in caves.
 * @param {number} x @param {number} z @param {number} around
 */
function groundNear(x, z, around) {
  try {
    let free = 0;
    for (let y = Math.floor(around) + 6; y >= Math.floor(around) - 8; y--) {
      const block = overworld().getBlock({ x, y, z });
      if (!block) return undefined; // not loaded
      if (block.isAir) {
        free++;
        continue;
      }
      if (free >= 2 && !block.isLiquid && !block.typeId.includes("leaves")) return y + 1;
      free = 0;
    }
  } catch {
    // not loaded
  }
  return undefined;
}

/**
 * A spot 18 to 26 blocks from `player`, mostly on the side of the nest (so the way the horde comes shows where it is), sometimes anywhere.
 * @param {Player} player @param {import("@minecraft/server").Vector3} nest
 */
function ringSpot(player, nest) {
  const { x: px, y: py, z: pz } = player.location;
  const toNest = Math.atan2(nest.z - pz, nest.x - px);
  for (let attempt = 0; attempt < 6; attempt++) {
    const angle = Math.random() < 0.3 ? Math.random() * Math.PI * 2 : toNest + spread() * 1.2;
    const far = RING_MIN + Math.random() * (RING_MAX - RING_MIN);
    const x = px + Math.cos(angle) * far;
    const z = pz + Math.sin(angle) * far;
    const y = groundNear(x, z, py);
    if (y !== undefined) return { x, y, z };
  }
  return undefined;
}

/** The compass word for where `to` is seen from `from`. */
function compass(from, to) {
  const angle = (Math.atan2(to.x - from.x, -(to.z - from.z)) * 180) / Math.PI; // 0 = north
  return COMPASS[((Math.round(angle / 45) % 8) + 8) % 8];
}

/** Which way to turn to face `to`, as an arrow: ↑ is straight ahead. */
function arrow(player, to) {
  const { x, z } = player.location;
  const want = (Math.atan2(-(to.x - x), to.z - z) * 180) / Math.PI; // a player's yaw: 0 faces south, 90 faces west
  let turn = want - player.getRotation().y;
  turn = ((((turn + 180) % 360) + 360) % 360) - 180;
  return ARROWS[((Math.round(turn / 45) % 8) + 8) % 8];
}

const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/** @param {string} title @param {string} subtitle @param {string} [sound] */
function announce(title, subtitle, sound = "raid.horn") {
  for (const player of players()) {
    try {
      player.onScreenDisplay.setTitle(title, { subtitle, fadeInDuration: 5, stayDuration: 50, fadeOutDuration: 15 });
      player.playSound(sound);
    } catch {
      // they just left
    }
  }
}

/** Enemies for round `round`: a mix that gets meaner. Husks, because zombies and skeletons burn in the sun. */
function pickKind(round) {
  const kinds = ["minecraft:husk", "minecraft:husk"];
  if (round >= 3) kinds.push("minecraft:spider");
  if (round >= 4) kinds.push("minecraft:vindicator");
  return kinds[Math.floor(Math.random() * kinds.length)];
}

/** @param {string} type @param {{ x: number, z: number }} around @param {number} radius */
function spawnHorde(type, around, radius) {
  const x = around.x + spread() * radius;
  const z = around.z + spread() * radius;
  const y = groundAt(x, z);
  if (y === undefined) return undefined;
  try {
    const mob = overworld().spawnEntity(type, { x, y, z });
    mob.addTag(HORDE_TAG);
    return mob;
  } catch {
    return undefined;
  }
}

/** Lets go of the chunks around the nest. */
function removeArea() {
  try { overworld().runCommand(`tickingarea remove ${AREA}`); } catch { /* there was none */ }
}

/** @type {boolean} a nest is being placed: waiting for its far chunks to load */
let placing = false;

/** Tries a few spots around `cx, cz` once its chunks are loaded; true when the nest is placed. @param {Game} g @param {number} cx @param {number} cz */
function spawnNestNear(g, cx, cz) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const x = Math.floor(cx + spread() * 12) + 0.5;
    const z = Math.floor(cz + spread() * 12) + 0.5;
    const y = groundAt(x, z);
    if (y === undefined) continue; // not loaded yet, or water or treetops
    let nest;
    try {
      nest = overworld().spawnEntity(NEST, { x, y, z });
    } catch (error) {
      console.warn(`horde-rounds: placing the nest failed: ${error}`);
      continue;
    }
    try {
      nest.addTag("family:horde_game");
      // Tougher every round. The nest starts at its most (400, see entities/horde_nest.json): health can only be set at or below that.
      nest.getComponent("minecraft:health")?.setCurrentValue(Math.min(400, 60 + 25 * g.round));
    } catch (error) {
      console.warn(`horde-rounds: the nest's health couldn't be set: ${error}`);
    }
    g.nest = { x, y, z };
    g.nestId = nest.id;
    return true;
  }
  return false;
}

/**
 * Puts a new nest 150 to 220 blocks from the players. That far, its chunks aren't loaded, so a ticking area loads them first and
 * the nest goes up when they are. One placement at a time. Calls `done(true)` when the nest stands, `done(false)` when nothing loaded in time.
 * @param {Game} g @param {(placed: boolean) => void} done
 */
function placeNest(g, done) {
  const here = players();
  if (placing || here.length === 0) return;
  placing = true;
  for (const stale of overworld().getEntities({ type: NEST })) stale.remove(); // one nest at a time: whatever is left from before goes
  removeArea();
  const anchor = here[Math.floor(Math.random() * here.length)].location;
  const far = NEST_MIN + Math.random() * (NEST_MAX - NEST_MIN);
  const angle = Math.random() * Math.PI * 2;
  const cx = Math.floor(anchor.x + Math.cos(angle) * far);
  const cz = Math.floor(anchor.z + Math.sin(angle) * far);
  try {
    overworld().runCommand(`tickingarea add circle ${cx} 64 ${cz} 2 ${AREA} true`);
  } catch (error) {
    console.warn(`horde-rounds: couldn't load the chunks for the nest: ${error}`);
    placing = false;
    return;
  }
  let waited = 0;
  const timer = system.runInterval(() => {
    waited += 10;
    const stopped = current() !== g; // the game ended while the chunks loaded
    const placed = !stopped && spawnNestNear(g, cx, cz);
    if (!placed && !stopped && waited < LOAD_WAIT) return;
    system.clearRun(timer);
    placing = false;
    if (!placed) removeArea();
    if (!stopped) done(placed);
  }, 10);
}

/** Guards around the nest, and a boss every 5th round. Called when a player gets close, not when the nest is placed. @param {Game} g */
function spawnGuards(g) {
  g.guarded = true;
  save(g);
  for (let i = 0; i < Math.min(1 + g.round, 5); i++) {
    const guard = spawnHorde("minecraft:husk", g.nest, 5);
    guard?.addTag(GUARD_TAG);
    guard?.addEffect("resistance", 600 * SECONDS, { amplifier: 0, showParticles: false });
  }
  if (g.round % 5 === 0) spawnHorde("minecraft:ravager", g.nest, 4)?.addTag(GUARD_TAG);
}

/** When the fight of this round began: the longer it takes to find the nest, the more of the horde there can be. */
let fightStart = 0;

/** Starts round `g.round`: a new nest far away, guards around it, and the title on screen. @param {Game} g */
function startRound(g) {
  g.state = "placing";
  g.guarded = false;
  save(g);
  for (const player of players()) player.onScreenDisplay.setActionBar("§7The horde is gathering...");
  placeNest(g, (placed) => {
    if (!placed) return; // the 1 second check below tries a new spot
    g.state = "fight";
    save(g);
    fightStart = system.currentTick;
    announce(`§cRound ${g.round}`, "Find the Horde Nest and destroy it!");
    emit("horde.round_started", { "minecraft.horde.round": g.round, "minecraft.horde.players": players().length });
  });
}

/** Ends round, sends the horde away, heals everyone, and starts the next round after a break. @param {string} [by] */
function roundCleared(by) {
  const g = current();
  if (!g || g.state !== "fight") return;
  g.state = "break";
  save(g);
  removeArea();
  let n = 0;
  for (const mob of hordeMobs()) {
    try {
      if (n++ % 3 === 0) mob.dimension.spawnParticle("minecraft:large_explosion", mob.location); // decoration: not on every one
      mob.remove();
    } catch {
      // already gone
    }
  }
  for (const player of players()) {
    try {
      player.addEffect("instant_health", 1, { amplifier: 4, showParticles: false });
      player.addEffect("regeneration", 10 * SECONDS, { showParticles: false });
      player.getComponent("minecraft:inventory")?.container?.addItem(new ItemStack("minecraft:golden_apple", 1));
    } catch {
      // a full backpack just means no apple
    }
  }
  announce(`§aRound ${g.round} cleared!`, `${by ? `${by} destroyed the nest. ` : ""}Next round in ${BREAK / SECONDS} seconds (blow the horn to start now)`, "random.totem");
  emit("horde.round_cleared", { "minecraft.horde.round": g.round, "minecraft.player.name": by ?? "nobody" });
  scheduleNext(g);
}

/** @type {Game | null} the game whose next round is already counting down */
let counting = null;
let breakId = 0; // which countdown is the live one: skipping the break makes the old one a no-op

/** After the break, the next round starts. The 1 second check calls this again after a /reload lost the timer. @param {Game} g */
function scheduleNext(g) {
  if (counting === g) return;
  counting = g;
  const id = ++breakId;
  system.runTimeout(() => {
    if (id !== breakId) return; // skipped
    nextRound(g);
  }, BREAK);
}

/** Starts the next round now, ending the break. @param {Game} g */
function nextRound(g) {
  breakId++;
  counting = null;
  if (current() !== g || g.state !== "break") return;
  g.round += 1;
  startRound(g);
}

/** Stops the game and clears the nest and the horde. @param {string} [by] */
function endGame(by) {
  const g = current();
  if (!g) return;
  save(null);
  removeArea();
  const nests = overworld().getEntities({ type: NEST });
  for (const entity of [...nests, ...hordeMobs()]) {
    try {
      entity.remove();
    } catch {
      // already gone
    }
  }
  announce("§eGame over", `You reached round ${g.round}`, "random.toast");
  emit("horde.game_ended", { "minecraft.horde.round": g.round, "minecraft.player.name": by ?? "nobody" });
}

const justBlew = new Set(); // ids of players who blew the horn this second: one tap is one blow

// Blow the horn: starts a game, or stops the one that's going.
world.afterEvents.itemUse.subscribe(({ source: player, itemStack }) => {
  if (!player || itemStack?.typeId !== HORN) return;
  if (justBlew.has(player.id)) return;
  justBlew.add(player.id);
  system.runTimeout(() => justBlew.delete(player.id), SECONDS);
  if (player.dimension.id !== OVERWORLD) {
    player.onScreenDisplay.setActionBar("§cThe horde only comes in the overworld");
    return;
  }
  const running = current();
  if (running?.state === "break") {
    nextRound(running); // blowing the horn in the break starts the next round now
    return;
  }
  if (running) {
    endGame(player.name);
    return;
  }
  for (const stale of overworld().getEntities({ type: NEST })) stale.remove(); // left over from a crash
  /** @type {Game} */
  const g = { round: 1, state: "placing", nest: { x: 0, y: 0, z: 0 }, nestId: "" };
  emit("horde.game_started", { "minecraft.player.name": player.name });
  startRound(g);
});

// Destroying the nest wins the round.
world.afterEvents.entityDie.subscribe(
  ({ damageSource }) => {
    const killer = damageSource.damagingEntity;
    roundCleared(killer instanceof Player ? killer.name : undefined);
  },
  { entityTypes: [NEST] },
);

// The nest can also go without dying: /kill, or removed. If players are close enough that its chunk is loaded, that counts too.
system.runInterval(() => {
  const g = current();
  if (!g) return;
  // A /reload loses timeouts: pick the game up again from where it was saved.
  if (g.state === "placing") return placing ? undefined : startRound(g); // a /reload loses the wait for the chunks: start it again
  if (g.state === "break") return scheduleNext(g);
  const nest = world.getEntity(g.nestId);
  if (nest?.isValid) {
    if (!g.guarded && players().some((p) => flat(p.location, g.nest) < GUARD_RANGE)) spawnGuards(g);
    try {
      nest.dimension.spawnParticle("minecraft:villager_angry", { x: g.nest.x, y: g.nest.y + 3.2, z: g.nest.z });
      if (Math.random() < 0.3) nest.dimension.playSound("mob.wither.ambient", g.nest, { volume: 0.4, pitch: 0.6 });
    } catch {
      // not loaded
    }
    return;
  }
  if (players().some((p) => flat(p.location, g.nest) < 32)) roundCleared(undefined);
}, SECONDS);

// A wave of the horde every 5 seconds, around every player, for as long as the nest stands. The longer it takes, the more there can be.
// Most come in from the side of the nest, so the way they come shows where it is.
system.runInterval(() => {
  const g = current();
  if (!g || g.state !== "fight") return;
  const here = players();
  if (here.length === 0) return;
  const alive = hordeMobs().filter((m) => !m.hasTag(GUARD_TAG)).length;
  const minutes = Math.floor((system.currentTick - fightStart) / (20 * SECONDS)); // +2 enemies the horde may have every 20 seconds
  const cap = Math.min(MAX_ALIVE, 6 + 2 * g.round + 3 * (here.length - 1) + 2 * minutes);
  const count = Math.min(cap - alive, MAX_PER_WAVE, 2 + Math.ceil(g.round / 2) + here.length);
  let spawned = 0;
  for (let i = 0; i < count; i++) {
    const spot = ringSpot(here[i % here.length], g.nest);
    if (!spot) continue; // no ground here (water, a cliff): the next wave tries again
    try {
      overworld().spawnEntity(pickKind(g.round), spot).addTag(HORDE_TAG);
      spawned++;
    } catch {
      // not loaded
    }
  }
  if (spawned > 0) {
    for (const player of here) {
      if (flat(player.location, g.nest) > RING_MAX + 10) player.onScreenDisplay.setActionBar(`§cThe horde is coming from the ${compass(player.location, g.nest)}!`);
    }
  }
}, WAVE_EVERY);

/** @type {Map<string, { x: number, z: number }>} horde enemy id → where it was at the last check */
const lastSpot = new Map();

// The horde finds the players, however far away: an enemy that lost them is brought back to a ring around the nearest one,
// and one that stands still far from a player is nudged toward them. (A mob's own target can't be set from a script.)
system.runInterval(() => {
  const g = current();
  if (!g || g.state !== "fight") {
    lastSpot.clear();
    return;
  }
  const here = players();
  if (here.length === 0) return;
  const horde = hordeMobs().filter((mob) => mob.isValid);
  const byId = new Map(horde.map((mob) => [mob.id, mob]));
  const { lost, idle } = planTracking(
    horde.map((mob) => ({ id: mob.id, x: mob.location.x, z: mob.location.z, guard: mob.hasTag(GUARD_TAG) })),
    here.map((player) => ({ x: player.location.x, z: player.location.z })),
    lastSpot,
  );
  const seen = new Set(byId.keys());
  for (const mob of horde) lastSpot.set(mob.id, { x: mob.location.x, z: mob.location.z });
  // Enemies that lost the players come first: they are no use where they stand.
  let budget = TRACK_BUDGET;
  for (const { id, near } of lost) {
    if (budget-- <= 0) break;
    const spot = ringSpot(here[near], g.nest);
    try { if (spot) byId.get(id)?.teleport(spot); } catch (error) { console.warn(`horde-rounds: couldn't bring an enemy back: ${error}`); }
  }
  for (const { id, near, gap } of idle) {
    if (budget-- <= 0) break;
    const mob = byId.get(id);
    try { mob?.applyImpulse({ x: ((here[near].location.x - mob.location.x) / gap) * 0.5, y: 0.3, z: ((here[near].location.z - mob.location.z) / gap) * 0.5 }); } catch { /* removed */ }
  }
  for (const id of lastSpot.keys()) if (!seen.has(id)) lastSpot.delete(id);
}, TRACK_EVERY);

// Hold the horn to sense the nest: an arrow and how far away it is.
system.runInterval(() => {
  const g = current();
  if (!g) return;
  for (const player of players()) {
    const held = player.getComponent("minecraft:inventory")?.container?.getItem(player.selectedSlotIndex);
    if (held?.typeId !== HORN) continue;
    player.onScreenDisplay.setActionBar(
      g.state === "fight"
        ? `§cNest §f${arrow(player, g.nest)} §e${Math.round(flat(player.location, g.nest) / 5) * 5} blocks §7(round ${g.round})`
        : `§aRound ${g.round} §7${g.state === "break" ? "cleared! " : ""}Get ready...`,
    );
  }
}, 10);
