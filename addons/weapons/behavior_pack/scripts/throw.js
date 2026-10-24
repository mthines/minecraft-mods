// How hard a grenade is thrown. No Minecraft imports here, so the tests can run it.

export const THROW = { weakest: 0.4, strongest: 2.0, fullTicks: 20 }; // speeds in blocks per tick; 20 ticks = 1 second

/** The longer Use is held (up to a second), the harder the throw. @param {number} heldTicks */
export function throwSpeed(heldTicks) {
  const charge = Math.min(Math.max(heldTicks, 0), THROW.fullTicks) / THROW.fullTicks;
  return THROW.weakest + (THROW.strongest - THROW.weakest) * charge;
}
