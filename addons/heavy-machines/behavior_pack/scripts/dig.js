// Which blocks the machines cut. No Minecraft imports here, so the tests can run it.

/** @typedef {{ x: number, y: number, z: number }} Vec3 */

export const HALF_WIDTH = 1; // the machines' collision box is 2 blocks wide, so they fit any tunnel 3 or wider
export const HEIGHT = 3; // how much room a machine and its driver need above the floor
export const AIM_UP = 1;
export const AIM_DOWN = 2;
const REACH = HALF_WIDTH + 0.1; // a block this far from the middle counts as touching the front
const SHAFT = 60; // looking further up or down than this drills a straight shaft
const LEVEL = 10; // looking this close to level keeps the tunnel flat
const STEEPEST = 1; // a tunnel climbs or drops at most one block for every block ahead (45°): a machine can't drive steeper

/**
 * Which way the drill points, from where the driver looks.
 * Ahead, the tunnel slopes the way the driver looks: a little down, a gentle slope down; further down, steeper, up to 45°.
 * @param {number} pitch degrees, negative is up
 * @param {number} yaw degrees: 0 is south (+z), 90 is west (-x)
 * @returns {{ aim: 0 | 1 | 2, dir: Vec3, slope: number }} aim: 0 ahead, AIM_UP, or AIM_DOWN; dir: one step that way;
 *   slope: blocks up (negative: down) for every block ahead, from -1 to 1
 */
export function aimFrom(pitch, yaw) {
  if (pitch < -SHAFT) return { aim: AIM_UP, dir: { x: 0, y: 1, z: 0 }, slope: 0 };
  if (pitch > SHAFT) return { aim: AIM_DOWN, dir: { x: 0, y: -1, z: 0 }, slope: 0 };
  const quarter = ((Math.round(yaw / 90) % 4) + 4) % 4;
  const dirs = [{ x: 0, y: 0, z: 1 }, { x: -1, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, { x: 1, y: 0, z: 0 }];
  const slope = Math.abs(pitch) < LEVEL ? 0 : Math.max(-STEEPEST, Math.min(STEEPEST, -Math.tan((pitch * Math.PI) / 180)));
  return { aim: 0, dir: dirs[quarter], slope };
}

/**
 * How a sloping tunnel steps: whole blocks, as often as the slope needs (a slope of 1/3 steps every third block).
 * @param {number} rise how far the tunnel is behind (or ahead of) its slope so far, from -0.5 to 0.5
 * @param {number} slope from aimFrom
 * @returns {{ step: -1 | 0 | 1, rise: number }} step: the next layer's floor, one block up, level, or one down; rise: carried to the layer after
 */
export function nextStep(rise, slope) {
  const due = rise + slope;
  const step = /** @type {-1 | 0 | 1} */ (Math.max(-1, Math.min(1, Math.round(due))) || 0);
  return { step, rise: due - step };
}

/**
 * The first of `size` blocks across, centered on `middle` as well as whole blocks allow.
 * They always reach past both sides of a machine there, even one pushed against a wall.
 */
const across = (middle, size) => Math.round(middle - size / 2);

/**
 * The blocks in front of a machine: a square `size` blocks across, facing `dir`.
 * Ahead, its bottom is level with the tunnel's floor, or a block above or below it where the tunnel slopes.
 * Up and down, it's centered on the machine.
 * @param {Vec3} at the machine's location (the middle of its bottom); ahead, y is the floor of the tunnel's last layer
 * @param {Vec3} dir one step the way it points (from aimFrom)
 * @param {number} size 3, 5, or 7
 * @param {-1 | 0 | 1} [step] ahead: the tunnel's floor steps up or down a block here (from nextStep)
 * @param {number} [ceiling] ahead: cut at least up to here, so the machine and its driver fit while they catch up with a slope
 * @returns {Vec3[]}
 */
export function face(at, dir, size, step = 0, ceiling = -Infinity) {
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
  const alongX = dir.x !== 0;
  const layer = frontLayer(at, dir);
  const side0 = across(alongX ? at.z : at.x, size);
  // A step cuts one row more: a machine is 2 blocks long, so it rolls down a step (or climbs it) a block behind the drill,
  // and its driver's head needs the room.
  const bottom = floor + step;
  const top = Math.max(bottom + size - 1 + Math.abs(step), ceiling);
  for (let side = 0; side < size; side++) {
    for (let y = bottom; y <= top; y++) {
      blocks.push(alongX ? { x: layer, y, z: side0 + side } : { x: side0 + side, y, z: layer });
    }
  }
  return blocks;
}

/**
 * Ahead, the x (or z) of the layer just past the machine's front.
 * @param {Vec3} at @param {Vec3} dir one of the four ways ahead
 */
export function frontLayer(at, dir) {
  return dir.x !== 0 ? Math.floor(at.x + dir.x * REACH) : Math.floor(at.z + dir.z * REACH);
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
