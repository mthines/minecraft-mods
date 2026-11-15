// Where something can stand on dry land. Its own file so the tests can try it on a pond.

/** Blocks the top of the world can be that are no place to stand: treetops, plants in the water, ice, fire. */
const NO_GROUND = /leaves|seagrass|kelp|ice|lava|water|cactus|fire|magma|vine|lily/;

/**
 * The y to stand at over x, z: the first free block above the ground, or undefined when it isn't loaded or isn't dry land
 * (water, treetops, sea floor). The top block can be the sea floor if the world's height doesn't count water, so the two blocks
 * above the spot must be free of water too.
 * @param {import("@minecraft/server").Dimension} dimension @param {number} x @param {number} z
 */
export function groundAt(dimension, x, z) {
  try {
    const top = dimension.getTopmostBlock({ x, z });
    if (!top || top.isLiquid || NO_GROUND.test(top.typeId)) return undefined;
    const y = top.location.y + 1;
    for (const dy of [0, 1]) {
      const above = dimension.getBlock({ x, y: y + dy, z });
      if (!above || above.isLiquid) return undefined;
    }
    return y;
  } catch {
    return undefined; // the chunk isn't loaded
  }
}
