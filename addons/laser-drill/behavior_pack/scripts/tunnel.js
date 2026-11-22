// The maths of the laser drill's tunnel, with nothing from @minecraft/server in it so npm test can run it.

export const WIDTH = 3; // the tunnel is 3 wide and 3 high
export const MAX_LAYERS = 128; // how far one hold reaches
export const LAYERS_PER_STEP = 4; // layers cleared by one fill (3 x 3 x 4 = 36 blocks at most)
export const STEP_TICKS = 2; // ticks between steps: 4 layers per 2 ticks is 40 blocks of tunnel a second

const COLORS = ["white", "orange", "magenta", "light_blue", "yellow", "lime", "pink", "gray", "light_gray", "cyan", "purple", "blue", "brown", "green", "red", "black"];

/** Blocks the beam leaves alone: what can't be broken, liquids (clearing them makes them flow), and blocks with an inventory. */
export const KEEP = [
  "bedrock", "barrier", "command_block", "repeating_command_block", "chain_command_block", "structure_block", "jigsaw",
  "end_portal", "end_portal_frame", "portal", "reinforced_deepslate", "allow", "deny", "border_block", "structure_void",
  "water", "flowing_water", "lava", "flowing_lava",
  "chest", "trapped_chest", "barrel", "ender_chest", "hopper", "furnace", "lit_furnace", "blast_furnace", "lit_blast_furnace",
  "smoker", "lit_smoker", "dropper", "dispenser", "brewing_stand", "lectern", "jukebox", "chiseled_bookshelf", "decorated_pot", "crafter",
  "undyed_shulker_box", ...COLORS.map((c) => `${c}_shulker_box`),
].map((name) => `minecraft:${name}`);

/** The axis the player mostly looks along, and which way. @param {{ x: number, y: number, z: number }} view @returns {{ axis: "x" | "y" | "z", sign: 1 | -1 }} */
export function directionOf(view) {
  const axis = ["x", "y", "z"].reduce((best, a) => (Math.abs(view[a]) > Math.abs(view[best]) ? a : best), "z");
  return { axis, sign: view[axis] < 0 ? -1 : 1 };
}

/**
 * Where the tunnel starts: the middle block of the first layer. Sideways it runs from the player's feet to above their head
 * (the middle row is the block of their eyes); up and down it is a shaft over or under them.
 * @param {{ x: number, y: number, z: number }} head the player's eyes
 * @param {"x" | "y" | "z"} axis
 * @param {1 | -1} sign
 */
export function startOf(head, axis, sign) {
  const start = { x: Math.floor(head.x), y: Math.floor(head.y), z: Math.floor(head.z) };
  if (axis === "y") start.y += sign > 0 ? 1 : -2;
  else start[axis] += sign;
  return start;
}

/**
 * The box (min and max corners) of `count` layers, `offset` layers into the tunnel, or undefined when none of it is inside the world's height.
 * @param {{ x: number, y: number, z: number }} start
 * @param {{ min: number, max: number }} height the lowest and highest block y of the world
 */
export function layers(start, axis, sign, offset, count, height) {
  const a = start[axis] + sign * offset;
  const b = start[axis] + sign * (offset + count - 1);
  const box = { from: { x: start.x - 1, y: start.y - 1, z: start.z - 1 }, to: { x: start.x + 1, y: start.y + 1, z: start.z + 1 } };
  box.from[axis] = Math.min(a, b);
  box.to[axis] = Math.max(a, b);
  box.from.y = Math.max(box.from.y, height.min);
  box.to.y = Math.min(box.to.y, height.max);
  return box.from.y > box.to.y ? undefined : box;
}

/** How many layers the next step clears: a full step, or what is left of the reach. */
export const nextCount = (done) => Math.max(0, Math.min(LAYERS_PER_STEP, MAX_LAYERS - done));

/** The middle of a box's last layer, to show the beam there. */
export const tipOf = (start, axis, sign, done) => ({ x: start.x + 0.5, y: start.y + 0.5, z: start.z + 0.5, [axis]: start[axis] + sign * (done - 1) + 0.5 });
