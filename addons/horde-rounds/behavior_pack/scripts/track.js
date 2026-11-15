// Which horde enemies need help finding the players. No game objects in here, so a plain test can try it.

export const LOST = 48; // an enemy this far from every player is brought back to the nearest one
const IDLE_GAP = 5; // closer than this it is already at the player
const STILL = 0.6; // moved less than this since the last check: it is standing still

/**
 * @param {{ id: string, x: number, z: number, guard: boolean }[]} mobs the horde
 * @param {{ x: number, z: number }[]} players
 * @param {Map<string, { x: number, z: number }>} before where each enemy was at the last check
 * @returns {{ lost: { id: string, near: number, gap: number }[], idle: { id: string, near: number, gap: number }[] }}
 *   `near` is the index of the nearest player; guards stay at the nest and are left out
 */
export function planTracking(mobs, players, before) {
  const lost = [];
  const idle = [];
  for (const mob of mobs) {
    if (mob.guard) continue;
    let near = -1;
    let gap = Infinity;
    players.forEach((player, i) => {
      const d = Math.hypot(player.x - mob.x, player.z - mob.z);
      if (d < gap) {
        gap = d;
        near = i;
      }
    });
    if (near < 0) continue;
    const was = before.get(mob.id);
    if (gap > LOST) lost.push({ id: mob.id, near, gap });
    else if (gap > IDLE_GAP && was && Math.hypot(was.x - mob.x, was.z - mob.z) < STILL) idle.push({ id: mob.id, near, gap });
  }
  return { lost, idle };
}
