// The shape of a nuke's crater, with nothing from Minecraft in it so the tests can check it (tests/crater.test.mjs).

/**
 * Every column (x, z offset) of a circle of this radius, nearest the middle first: one fill per column instead of one command
 * per block, and nearest first makes the crater open outwards like a shockwave. Sorted by whole blocks of distance without a
 * real sort (the biggest circle has 180,000 columns).
 * @param {number} radius
 * @returns {{ dx: Int16Array, dz: Int16Array }}
 */
export function buildColumns(radius) {
  const rings = Array.from({ length: radius + 2 }, () => 0);
  for (let dx = -radius; dx <= radius; dx++) for (let dz = -radius; dz <= radius; dz++) if (Math.hypot(dx, dz) <= radius) rings[Math.floor(Math.hypot(dx, dz)) + 1]++;
  for (let i = 1; i < rings.length; i++) rings[i] += rings[i - 1]; // where each ring starts
  const total = rings[rings.length - 1];
  const result = { dx: new Int16Array(total), dz: new Int16Array(total) };
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dz = -radius; dz <= radius; dz++) {
      const flat = Math.hypot(dx, dz);
      if (flat > radius) continue;
      const at = rings[Math.floor(flat)]++;
      result.dx[at] = dx;
      result.dz[at] = dz;
    }
  }
  return result;
}

/**
 * How far up and down a column `flat` blocks from the middle is cleared: the crater is a ball squashed to `up` above and
 * `down` below the middle (a plain ball when they equal the radius), and shrunk to fit `reach`, so it stays round and keeps its shape.
 * @param {{ radius: number, up: number, down: number }} size @param {number} reach the radius it really gets @param {number} flat
 */
export function depths(size, reach, flat) {
  const round = Math.sqrt(Math.max(0, 1 - (flat * flat) / (reach * reach)));
  const scale = reach / size.radius;
  return { up: Math.floor(size.up * scale * round), down: Math.floor(size.down * scale * round) };
}

/**
 * The radius a crater can really have: the nearest edge of the world that's loaded, from the middle, looking in several
 * directions. Only loaded chunks can be cleared, and they're a square around the players: a crater bigger than that would be
 * cut into a square with straight walls. The smaller round crater is better.
 * @param {(x: number, z: number) => boolean} isLoaded @param {number} radius the size's full radius
 * @param {{ directions?: number, step?: number }} [options]
 */
export function loadedReach(isLoaded, radius, { directions = 16, step = 8 } = {}) {
  let reach = radius;
  for (let i = 0; i < directions; i++) {
    const angle = (i / directions) * Math.PI * 2;
    for (let d = step; d <= radius; d += step) {
      if (!isLoaded(Math.cos(angle) * d, Math.sin(angle) * d)) {
        reach = Math.min(reach, d - step); // the last place that was loaded (a chunk is 16 wide, a step 8)
        break;
      }
    }
  }
  return Math.max(reach, Math.min(radius, step));
}
