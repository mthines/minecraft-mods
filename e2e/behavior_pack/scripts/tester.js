// What a mod's tests/e2e.js gets as `t`: a flat arena, simulated players, and waiting helpers.
import { GameMode, ItemStack, system } from "@minecraft/server";
import { spawnSimulatedPlayer } from "@minecraft/server-gametest";

/**
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {{ x: number, z: number }} corner the arena's north-west corner
 * @param {number} size how far the arena reaches east and south
 */
export async function makeTester(dimension, corner, size) {
  const wait = (/** @type {number} */ ticks) => new Promise((resolve) => system.runTimeout(resolve, ticks));

  // The ticking area takes a moment to load. The test world is flat: find its top block.
  let ground;
  for (let i = 0; i < 100 && ground === undefined; i++) {
    try {
      for (let y = 0; y > -64 && ground === undefined; y--) {
        const block = dimension.getBlock({ x: corner.x, y, z: corner.z });
        if (!block) break; // not loaded yet
        if (!block.isAir) ground = y;
      }
    } catch {
      // not loaded yet
    }
    if (ground === undefined) await wait(2); // all air also means it isn't loaded yet
  }
  if (ground === undefined) throw new Error("The test area never loaded");
  // The arena can span several chunks: wait until all of it is loaded, not just one corner.
  const loaded = () => {
    for (let dx = 0; dx <= size + 15; dx += 16) {
      for (let dz = 0; dz <= size + 15; dz += 16) {
        const spot = { x: corner.x + Math.min(dx, size), y: ground, z: corner.z + Math.min(dz, size) };
        try {
          if (!dimension.getBlock(spot)) return false;
        } catch {
          return false;
        }
      }
    }
    return true;
  };
  for (let i = 0; i < 100 && !loaded(); i++) await wait(2);
  if (!loaded()) throw new Error("The test area never fully loaded");

  /** The middle of the arena, standing on the ground. */
  const origin = { x: corner.x + size / 2, y: ground + 1, z: corner.z + size / 2 };
  /** @type {import("@minecraft/server-gametest").SimulatedPlayer[]} */
  const players = [];

  const t = {
    dimension,
    origin,
    wait,
    /** A spot `dx, dy, dz` from the arena's middle; dy 0 is the first block above the ground. */
    at: (dx = 0, dy = 0, dz = 0) => ({ x: origin.x + dx, y: origin.y + dy, z: origin.z + dz }),
    /** Sets a block, `dx, dy, dz` from the middle. */
    place(type, dx = 0, dy = 0, dz = 0) {
      const block = dimension.getBlock(t.at(dx, dy, dz));
      if (!block) throw new Error(`Can't place ${type} at ${dx}, ${dy}, ${dz}: not loaded`);
      block.setType(type);
    },
    /** A simulated player standing `dx, dz` from the middle. */
    player(name = `Tester${players.length + 1}`, dx = 0, dz = 0) {
      const player = spawnSimulatedPlayer({ dimension, ...t.at(dx + 0.5, 0, dz + 0.5) }, name, GameMode.Survival);
      player.addTag("family:e2e"); // no spawn lantern or cookies: a test that wants them removes the tag and respawns
      players.push(player);
      return player;
    },
    /** Puts an item in the player's first hotbar slot and selects it. */
    hold(player, item, amount = 1) {
      player.setItem(new ItemStack(item, amount), 0, true);
    },
    /** Entities of a type in the arena. */
    entities(type) {
      return dimension.getEntities({ type, location: origin, maxDistance: size });
    },
    /** Fails with `message` unless `ok`. */
    assert(ok, message) {
      if (!ok) throw new Error(message);
    },
    /** Waits until `check` returns something truthy (and returns it), or fails with `message` (or what `message()` returns). */
    async until(check, message, ticks = 100) {
      for (let i = 0; i < ticks; i++) {
        const result = check();
        if (result) return result;
        await wait(1);
      }
      throw new Error(typeof message === "function" ? message() : message);
    },
    cleanUp() {
      for (const player of players) {
        try {
          player.disconnect();
        } catch {
          // already gone
        }
      }
      for (const entity of dimension.getEntities({ location: origin, maxDistance: size, excludeTypes: ["minecraft:player"] })) {
        try {
          entity.remove();
        } catch {
          // already gone
        }
      }
      dimension.runCommand(`fill ${corner.x} ${origin.y} ${corner.z} ${corner.x + size} ${origin.y + 8} ${corner.z + size} air`);
    },
  };
  return t;
}
