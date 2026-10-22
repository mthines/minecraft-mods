// The rules for play time, travel, levels, and snacks. Nothing in here talks to Minecraft, so tests can run it on a computer.
import { shortName } from "./blocks.js";

/** Every player online gets one "minecraft.player.playing" event this often, so counting them counts minutes. */
export const PLAYING_EVERY_SECONDS = 60;

/** One "minecraft.player.traveled" event per this many blocks, so the dashboard can multiply by it. */
export const TRAVEL_STEP_BLOCKS = 100;

/** Moving further than this in one second is a teleport or a respawn, not travel. An ice-road boat does about 70. */
export const MAX_BLOCKS_PER_SECOND = 100;

/** A /xp command can add hundreds of levels at once; report at most this many level-ups per check. */
export const MAX_LEVEL_UPS_AT_ONCE = 10;

/** Drinks don't have a food component, but they still count as a snack. */
const DRINKS = new Set(["potion", "milk_bucket", "ominous_bottle", "honey_bottle"]);

/** "minecraft:overworld" → "overworld", "minecraft:nether" → "nether", "minecraft:the_end" → "end" */
export function dimensionName(id) {
  const name = shortName(id);
  if (name === "nether" || name === "the_nether") return "nether";
  if (name === "the_end") return "end";
  return name;
}

/**
 * How a player is getting around right now. Riding wins, so a horse in water is still riding.
 * @param {{ mount?: string, isGliding: boolean, isFlying: boolean, isSwimming: boolean, isInWater: boolean, isSprinting: boolean }} player
 * @returns {"riding" | "gliding" | "flying" | "swimming" | "sprinting" | "walking"}
 */
export function travelMode({ mount, isGliding, isFlying, isSwimming, isInWater, isSprinting }) {
  if (mount) return "riding";
  if (isGliding) return "gliding"; // elytra
  if (isFlying) return "flying"; // creative mode
  if (isSwimming || isInWater) return "swimming";
  if (isSprinting) return "sprinting";
  return "walking";
}

/**
 * Adds up how far each player goes, per travel mode, and says when another TRAVEL_STEP_BLOCKS are done.
 * Only sideways distance counts, so bouncing on a trampoline isn't travel.
 */
export function createOdometer() {
  /** @type {Map<string, { dimension: string, x: number, z: number }>} player id → where they were last time */
  const last = new Map();
  /** @type {Map<string, Map<string, number>>} player id → mode → blocks not reported yet */
  const pending = new Map();

  return {
    /**
     * Call about once a second for each player.
     * @param {string} playerId
     * @param {string} dimension
     * @param {{ x: number, z: number }} location
     * @param {string} mode from travelMode()
     * @returns {number} how many travel events to send for this mode (usually 0)
     */
    move(playerId, dimension, { x, z }, mode) {
      const before = last.get(playerId);
      last.set(playerId, { dimension, x, z });
      if (!before || before.dimension !== dimension) return 0;

      const distance = Math.hypot(x - before.x, z - before.z);
      if (distance > MAX_BLOCKS_PER_SECOND) return 0;

      const modes = pending.get(playerId) ?? new Map();
      pending.set(playerId, modes);
      const total = (modes.get(mode) ?? 0) + distance;
      const steps = Math.floor(total / TRAVEL_STEP_BLOCKS);
      modes.set(mode, total - steps * TRAVEL_STEP_BLOCKS);
      return steps;
    },

    /** After a respawn or a portal: start measuring again from wherever they are next. @param {string} playerId */
    jumped(playerId) {
      last.delete(playerId);
    },

    /** The player left. @param {string} playerId */
    forget(playerId) {
      last.delete(playerId);
      pending.delete(playerId);
    },
  };
}

/**
 * The levels a player just reached, like [5, 6] going from level 4 to 6.
 * Nothing the first time we see them, and nothing when levels go down (dying, enchanting).
 * @param {number | undefined} before
 * @param {number} after
 * @returns {number[]}
 */
export function levelsReached(before, after) {
  if (before === undefined || after <= before) return [];
  const from = Math.max(before + 1, after - MAX_LEVEL_UPS_AT_ONCE + 1);
  return Array.from({ length: after - from + 1 }, (_, i) => from + i);
}

/**
 * True for things you eat or drink, false for other items that finish "using", like a loaded crossbow.
 * @param {string} typeId like "minecraft:cooked_beef"
 * @param {boolean} isFood whether the item has a food component
 */
export function isSnack(typeId, isFood) {
  return isFood || DRINKS.has(shortName(typeId));
}
