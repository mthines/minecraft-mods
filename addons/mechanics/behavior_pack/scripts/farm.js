// How the plow works. No Minecraft imports here, so the tests can run it.
import { forward } from "./drive.js";

export const PLOW_WIDTH = 3;
export const TILLABLE = ["minecraft:grass_block", "minecraft:dirt", "minecraft:dirt_path"];

/** Which blocks the plow is over: the block it is over now, and the two beside it. `back` is how far behind the middle it hangs. */
export function plowCells(/** @type {{ x: number, z: number }} */ at, /** @type {number} */ heading, back = 1.5) {
  const dir = forward(heading);
  const centre = { x: at.x - dir.x * back, z: at.z - dir.z * back };
  const left = { x: dir.z, z: -dir.x }; // along the plow's width
  const half = (PLOW_WIDTH - 1) / 2;
  return Array.from({ length: PLOW_WIDTH }, (_, k) => ({ x: Math.floor(centre.x + left.x * (k - half)), z: Math.floor(centre.z + left.z * (k - half)) }));
}

/** Only plows when it moves into a new block: the cells to till, or none while it is still over the same ones. */
export function cellsToTill(/** @type {{ x: number, z: number }[]} */ cells, /** @type {string | undefined} */ lastKey) {
  const key = cells.map((c) => `${c.x},${c.z}`).join(";");
  return { key, cells: key === lastKey ? [] : cells };
}

/** What a block turns into, or undefined if the plow leaves it alone. */
export const tilled = (/** @type {string} */ typeId) => (TILLABLE.includes(typeId) ? "minecraft:farmland" : undefined);

/** How full a cargo bed is: 0 empty, 1 full. */
export const fillOf = (/** @type {number} */ emptySlots, /** @type {number} */ size) => (size > 0 ? 1 - emptySlots / size : 0);
