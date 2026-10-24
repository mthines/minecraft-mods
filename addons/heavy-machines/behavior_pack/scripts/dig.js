// Which blocks the machines cut. No Minecraft imports here, so the tests can run it.

/** @typedef {{ x: number, y: number, z: number }} Vec3 */

export const HALF_WIDTH = 1; // the machines' collision box is 2 blocks wide, so they fit any tunnel 3 or wider
export const HEIGHT = 3; // how much room a machine and its driver need above the floor
export const AIM_UP = 1;
export const AIM_DOWN = 2;
const REACH = HALF_WIDTH + 0.1; // a block this far from the middle counts as touching the front

/**
 * Which way the drill points, from where the driver looks.
 * @param {number} pitch degrees, negative is up
 * @param {number} yaw degrees: 0 is south (+z), 90 is west (-x)
 * @returns {{ aim: 0 | 1 | 2, dir: Vec3 }} aim: 0 ahead, AIM_UP, or AIM_DOWN; dir: one step that way
 */
export function aimFrom(pitch, yaw) {
  if (pitch < -40) return { aim: AIM_UP, dir: { x: 0, y: 1, z: 0 } };
  if (pitch > 40) return { aim: AIM_DOWN, dir: { x: 0, y: -1, z: 0 } };
  const quarter = ((Math.round(yaw / 90) % 4) + 4) % 4;
  const dirs = [{ x: 0, y: 0, z: 1 }, { x: -1, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, { x: 1, y: 0, z: 0 }];
  return { aim: 0, dir: dirs[quarter] };
}

/** The first of `size` blocks across, centered on `middle` as well as whole blocks allow. */
const across = (middle, size) => Math.round(middle - size / 2);

/**
 * The blocks in front of a machine: a square `size` blocks across, facing `dir`.
 * Ahead, its bottom is level with the machine's floor, so tunnels stay flat. Up and down, it's centered on the machine.
 * @param {Vec3} at the machine's location (the middle of its bottom)
 * @param {Vec3} dir one step the way it points (from aimFrom)
 * @param {number} size 3, 5, or 7
 * @returns {Vec3[]}
 */
export function face(at, dir, size) {
  const floor = Math.floor(at.y + 0.01);
  /** @type {Vec3[]} */
  const blocks = [];
  if (dir.y !== 0) {
    const y = dir.y > 0 ? floor + HEIGHT : floor - 1;
    const x0 = across(at.x, size);
    const z0 = across(at.z, size);
    for (let dx = 0; dx < size; dx++) for (let dz = 0; dz < size; dz++) blocks.push({ x: x0 + dx, y, z: z0 + dz });
    return blocks;
  }
  // Ahead: one layer just past the front, `size` wide across the way it points.
  const front = (along, step) => Math.floor(along + step * REACH);
  const alongX = dir.x !== 0;
  const layer = alongX ? front(at.x, dir.x) : front(at.z, dir.z);
  const side0 = across(alongX ? at.z : at.x, size);
  for (let side = 0; side < size; side++) {
    for (let up = 0; up < size; up++) {
      blocks.push(alongX ? { x: layer, y: floor + up, z: side0 + side } : { x: side0 + side, y: floor + up, z: layer });
    }
  }
  return blocks;
}

/**
 * Where a machine drilling up or down should stand: the middle of its shaft, so it stays lined up layer after layer.
 * @param {Vec3} at @param {number} size
 */
export function shaftMiddle(at, size) {
  return { x: across(at.x, size) + size / 2, y: at.y, z: across(at.z, size) + size / 2 };
}

/** @param {string} type */
export const isLog = (type) => type.endsWith("_log") && !type.includes("stripped"); // stripped logs only come from players
/** @param {string} type */
export const isLeaves = (type) => type.endsWith("leaves") || type === "minecraft:azalea_leaves_flowered";

const LEAF_REACH = 5; // leaves this many steps from a log, through other leaves, belong to the tree
const MOST_BLOCKS = 1500; // a giant jungle tree with its leaves is about 1000

/**
 * The whole tree that a log belongs to: every log touching it, in any direction (branches go sideways),
 * and the leaves around them.
 * @param {Vec3} start a log
 * @param {(at: Vec3) => { type: string, natural?: boolean } | undefined} blockAt what's there; natural is false for leaves a player placed
 * @returns {{ logs: Vec3[], leaves: Vec3[] } | undefined} undefined when it isn't a tree: logs with no natural leaves are something a player built
 */
export function findTree(start, blockAt) {
  const key = (/** @type {Vec3} */ p) => `${p.x},${p.y},${p.z}`;
  const seen = new Set([key(start)]);
  /** @type {Vec3[]} */
  const logs = [];
  const queue = [start];
  while (queue.length && logs.length < MOST_BLOCKS) {
    const log = /** @type {Vec3} */ (queue.shift());
    logs.push(log);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const next = { x: log.x + dx, y: log.y + dy, z: log.z + dz };
      if (seen.has(key(next))) continue;
      seen.add(key(next));
      const block = blockAt(next);
      if (block && isLog(block.type)) queue.push(next);
    }
  }
  // The leaves: out from the logs, through leaves only.
  /** @type {Vec3[]} */
  const leaves = [];
  let natural = false;
  const leafSeen = new Set(logs.map(key));
  let edge = logs;
  for (let step = 0; step < LEAF_REACH && edge.length && logs.length + leaves.length < MOST_BLOCKS; step++) {
    /** @type {Vec3[]} */
    const next = [];
    for (const p of edge) {
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        const q = { x: p.x + dx, y: p.y + dy, z: p.z + dz };
        if (leafSeen.has(key(q))) continue;
        leafSeen.add(key(q));
        const block = blockAt(q);
        if (!block || !isLeaves(block.type)) continue;
        if (block.natural !== false) natural = true;
        else continue; // a player's leaves (a hedge, a roof) stay
        leaves.push(q);
        next.push(q);
      }
    }
    edge = next;
  }
  return natural ? { logs, leaves } : undefined;
}

/** Blocks no machine cuts. */
export const UNBREAKABLE = new Set([
  "minecraft:bedrock", "minecraft:barrier", "minecraft:command_block", "minecraft:chain_command_block", "minecraft:repeating_command_block",
  "minecraft:structure_block", "minecraft:structure_void", "minecraft:jigsaw", "minecraft:end_portal_frame", "minecraft:end_portal",
  "minecraft:portal", "minecraft:end_gateway", "minecraft:light_block", "minecraft:allow", "minecraft:deny", "minecraft:border_block",
  "minecraft:reinforced_deepslate", "minecraft:invisible_bedrock",
]);

/** @param {string} type */
export const isLiquid = (type) => /(^|:|_)(water|lava)$/.test(type);
