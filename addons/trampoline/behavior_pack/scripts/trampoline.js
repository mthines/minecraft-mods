// The trampoline rules. Nothing in here talks to Minecraft, so tests can run it on a computer.
//
// A trampoline is a square of slime blocks with a wooden edge around it, all on the same level:
//
//     . W W W .        S = slime block (the bouncy bed)
//     W S S S W        W = planks of any wood, or wool of any colour (the edge)
//     W S S S W        . = corners, can be anything
//     W S S S W
//     . W W W .
//
// Dig a hole one block deep first and it sits flat in the ground, like a real backyard trampoline.

// Bigger number = higher bounce. `blocks` is roughly how high you fly.
/** @type {Record<number, { strength: number, blocks: number }>} */
export const SIZES = {
  2: { strength: 0.8, blocks: 4 },
  3: { strength: 1.18, blocks: 8 },
  4: { strength: 1.63, blocks: 14 },
  5: { strength: 2.11, blocks: 22 },
};

// Biggest first, so a block shared by two possible trampolines picks the one actually built.
const SIZES_BIGGEST_FIRST = Object.keys(SIZES).map(Number).sort((a, b) => b - a);

/** @param {string | undefined} typeId */
export const isBed = (typeId) => typeId === "minecraft:slime";

/** @param {string | undefined} typeId */
// Planks are easy to get from any tree. Wool still works for colourful trampolines.
export const isEdge = (typeId) => (typeId?.endsWith("_planks") || typeId?.endsWith("_wool")) ?? false;

/**
 * @typedef {(x: number, y: number, z: number) => string | undefined} GetType
 * @typedef {{ x: number, y: number, z: number, size: number }} Trampoline
 *   x, y, z is the slime block in the corner with the smallest x and z.
 */

/**
 * True when there is a complete trampoline of this size with its bed corner at x, y, z.
 * @param {GetType} getType
 * @param {Trampoline} t
 */
export function isComplete(getType, { x, y, z, size }) {
  for (let dx = 0; dx < size; dx++) {
    for (let dz = 0; dz < size; dz++) {
      if (!isBed(getType(x + dx, y, z + dz))) return false;
    }
  }
  for (let i = 0; i < size; i++) {
    if (
      !isEdge(getType(x + i, y, z - 1)) ||
      !isEdge(getType(x + i, y, z + size)) ||
      !isEdge(getType(x - 1, y, z + i)) ||
      !isEdge(getType(x + size, y, z + i))
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Finds the trampoline that the block at x, y, z completes, if any.
 * @param {GetType} getType
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @returns {Trampoline | undefined}
 */
export function findTrampoline(getType, x, y, z) {
  for (const size of SIZES_BIGGEST_FIRST) {
    // Every bed corner whose trampoline, edge included, would cover this block.
    for (let cx = x - size; cx <= x + 1; cx++) {
      for (let cz = z - size; cz <= z + 1; cz++) {
        const t = { x: cx, y, z: cz, size };
        if (isComplete(getType, t)) return t;
      }
    }
  }
  return undefined;
}

/**
 * True when the block at x, y, z is part of the trampoline's bed or edge (corners don't count).
 * @param {Trampoline} t
 * @param {number} x
 * @param {number} y
 * @param {number} z
 */
export function covers(t, x, y, z) {
  if (y !== t.y) return false;
  const inX = x >= t.x && x < t.x + t.size;
  const inZ = z >= t.z && z < t.z + t.size;
  const edgeX = x === t.x - 1 || x === t.x + t.size;
  const edgeZ = z === t.z - 1 || z === t.z + t.size;
  return (inX && inZ) || (inX && edgeZ) || (edgeX && inZ);
}

/**
 * True when x, z is above the slime bed.
 * @param {Trampoline} t
 * @param {number} x
 * @param {number} z
 */
export function isOverBed(t, x, z) {
  return x >= t.x && x < t.x + t.size && z >= t.z && z < t.z + t.size;
}

const WOODS = ["oak", "birch", "spruce", "dark_oak"];

/**
 * What's in the starter chest: enough slime and planks for the biggest trampoline, and a shovel to dig the hole.
 * @returns {{ item: string, amount: number }[]}
 */
export function starterKit() {
  const biggest = Math.max(...Object.keys(SIZES).map(Number));
  return [
    { item: "minecraft:slime", amount: biggest * biggest },
    // One kind of wood per side of the edge.
    ...WOODS.map((wood) => ({ item: `minecraft:${wood}_planks`, amount: biggest })),
    { item: "minecraft:iron_shovel", amount: 1 },
  ];
}
