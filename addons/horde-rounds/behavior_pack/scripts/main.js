import { ItemStack, Player, system, world } from "@minecraft/server";
import { emit } from "./telemetry.js";

const HORN = "family:horde_horn";
const NEST = "family:horde_nest";
const HORDE_TAG = "family:horde"; // on every enemy the nest sent
const SAVE_KEY = "family:horde_game";
const OVERWORLD = "minecraft:overworld";

const SECONDS = 20; // Minecraft counts time in ticks: 20 ticks = 1 second.
const NEST_MIN = 30; // how far from the players a new nest appears, in blocks
const NEST_MAX = 50;
const WAVE_EVERY = 5 * SECONDS;
const BREAK = 15 * SECONDS; // between rounds
const MARCH_FROM = 26; // a horde far from the nest appears this far from the nearest player, on the side of the nest
const MAX_ALIVE = 32; // the most horde enemies alive at once, so one script thread can keep up
const MAX_PER_WAVE = 8; // the most spawned in one tick: a bigger wave comes over the next waves

const ARROWS = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"];
const COMPASS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];

/**
 * One game for the whole world. `nest` is where the Horde Nest stands, `nestId` its entity.
 * "placing" means the round is looking for a spot for its nest; "break" is the pause between rounds.
 * @typedef {{ round: number, state: "placing" | "fight" | "break", nest: import("@minecraft/server").Vector3, nestId: string }} Game
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
const hordeMobs = () => overworld().getEntities({ tags: [HORDE_TAG] });

/** The y to stand at over x, z: the first free block above the ground, or undefined (not loaded, water, treetops). */
function groundAt(x, z) {
  try {
    const top = overworld().getTopmostBlock({ x, z });
    if (!top || top.isLiquid || top.typeId.includes("leaves")) return undefined;
    return top.location.y + 1;
  } catch {
    return undefined; // the chunk isn't loaded
  }
}

const spread = () => (Math.random() * 2 - 1);

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

/** Puts a new nest 30 to 50 blocks from the players. Returns false when no spot was found. @param {Game} g */
function placeNest(g) {
  const here = players();
  if (here.length === 0) return false;
  const anchor = here[Math.floor(Math.random() * here.length)].location;
  for (let attempt = 0; attempt < 16; attempt++) {
    const far = attempt < 12 ? NEST_MIN + Math.random() * (NEST_MAX - NEST_MIN) : 10 + Math.random() * 10; // last tries: whatever is loaded
    const angle = Math.random() * Math.PI * 2;
    const x = Math.floor(anchor.x + Math.cos(angle) * far) + 0.5;
    const z = Math.floor(anchor.z + Math.sin(angle) * far) + 0.5;
    const y = groundAt(x, z);
    if (y === undefined) continue;
    try {
      const nest = overworld().spawnEntity(NEST, { x, y, z });
      nest.addTag("family:horde_game");
      // Tougher every round, up to the most the nest can hold.
      nest.getComponent("minecraft:health")?.setCurrentValue(Math.min(400, 60 + 25 * g.round));
      g.nest = { x, y, z };
      g.nestId = nest.id;
      return true;
    } catch {
      // not loaded after all: try another spot
    }
  }
  return false;
}

/** Starts round `g.round`: a new nest, guards around it, and the title on screen. @param {Game} g */
function startRound(g) {
  g.state = "placing";
  save(g);
  if (!placeNest(g)) return; // nowhere loaded to put it: the 1 second check below tries again
  g.state = "fight";
  save(g);
  for (let i = 0; i < Math.min(1 + g.round, 5); i++) {
    const guard = spawnHorde("minecraft:husk", g.nest, 5);
    guard?.addEffect("resistance", 600 * SECONDS, { amplifier: 0, showParticles: false });
  }
  if (g.round % 5 === 0) spawnHorde("minecraft:ravager", g.nest, 4); // a boss every 5th round
  announce(`§cRound ${g.round}`, "Find the Horde Nest and destroy it!");
  emit("horde.round_started", { "minecraft.horde.round": g.round, "minecraft.horde.players": players().length });
}

/** Ends round, sends the horde away, heals everyone, and starts the next round after a break. @param {string} [by] */
function roundCleared(by) {
  const g = current();
  if (!g || g.state !== "fight") return;
  g.state = "break";
  save(g);
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
  announce(`§aRound ${g.round} cleared!`, `${by ? `${by} destroyed the nest. ` : ""}Next round in ${BREAK / SECONDS} seconds`, "random.totem");
  emit("horde.round_cleared", { "minecraft.horde.round": g.round, "minecraft.player.name": by ?? "nobody" });
  scheduleNext(g);
}

/** @type {Game | null} the game whose next round is already counting down */
let counting = null;

/** After the break, the next round starts. The 1 second check calls this again after a /reload lost the timer. @param {Game} g */
function scheduleNext(g) {
  if (counting === g) return;
  counting = g;
  system.runTimeout(() => {
    counting = null;
    if (current() !== g || g.state !== "break") return;
    g.round += 1;
    startRound(g);
  }, BREAK);
}

/** Stops the game and clears the nest and the horde. @param {string} [by] */
function endGame(by) {
  const g = current();
  if (!g) return;
  save(null);
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
  if (current()) {
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
  if (g.state === "placing") return startRound(g);
  if (g.state === "break") return scheduleNext(g);
  const nest = world.getEntity(g.nestId);
  if (nest?.isValid) {
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

// A wave of the horde every 5 seconds. They come in from the side of the nest, so the way they come shows where it is.
system.runInterval(() => {
  const g = current();
  if (!g || g.state !== "fight") return;
  const here = players();
  if (here.length === 0) return;
  const alive = hordeMobs().length;
  const cap = Math.min(MAX_ALIVE, 6 + 2 * g.round + 3 * (here.length - 1));
  const count = Math.min(cap - alive, MAX_PER_WAVE, 2 + Math.ceil(g.round / 2) + here.length);
  if (count <= 0) return;

  const nearest = here.reduce((a, b) => (flat(a.location, g.nest) <= flat(b.location, g.nest) ? a : b));
  const gap = flat(nearest.location, g.nest);
  const at = gap <= MARCH_FROM + 4
    ? g.nest
    : { x: nearest.location.x + ((g.nest.x - nearest.location.x) / gap) * MARCH_FROM, z: nearest.location.z + ((g.nest.z - nearest.location.z) / gap) * MARCH_FROM };
  for (let i = 0; i < count; i++) spawnHorde(pickKind(g.round), at, 6);
  if (gap > MARCH_FROM + 4) {
    for (const player of here) player.onScreenDisplay.setActionBar(`§cThe horde is coming from the ${compass(player.location, g.nest)}!`);
  }
}, WAVE_EVERY);

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
