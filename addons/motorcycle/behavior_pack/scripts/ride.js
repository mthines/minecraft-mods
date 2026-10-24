// Speedometer and ride tracking. No Minecraft imports here, so the tests can run it.

export const SAMPLE_TICKS = 4; // check riders 5 times a second (20 ticks = 1 second)
const TELEPORT_BLOCKS = 10; // a bigger jump between checks is a teleport, not driving

/** @typedef {{ x: number, y: number, z: number }} Vec3 */

/**
 * Speed in km/h between two spots, `ticks` apart. One block is one meter.
 * @param {Vec3} from @param {Vec3} to @param {number} ticks
 */
export function kmh(from, to, ticks) {
  const meters = Math.hypot(to.x - from.x, to.z - from.z);
  return Math.round((meters / (ticks / 20)) * 3.6);
}

/** Keeps track of everyone's ride, from getting on to getting off. */
export function createRides() {
  /** @type {Map<string, { last: Vec3, meters: number, topKmh: number, ticks: number }>} */
  const rides = new Map();
  return {
    /**
     * Call every SAMPLE_TICKS with where each rider is now.
     * @param {Map<string, Vec3>} riders player name → location
     * @returns {{ speeds: Map<string, number>, ended: { player: string, meters: number, topKmh: number, seconds: number }[] }}
     */
    sample(riders) {
      const speeds = new Map();
      for (const [player, here] of riders) {
        const ride = rides.get(player);
        if (!ride) {
          rides.set(player, { last: here, meters: 0, topKmh: 0, ticks: 0 });
          speeds.set(player, 0);
          continue;
        }
        const step = Math.hypot(here.x - ride.last.x, here.z - ride.last.z);
        const speed = step > TELEPORT_BLOCKS ? 0 : kmh(ride.last, here, SAMPLE_TICKS);
        if (step <= TELEPORT_BLOCKS) ride.meters += step;
        ride.topKmh = Math.max(ride.topKmh, speed);
        ride.ticks += SAMPLE_TICKS;
        ride.last = here;
        speeds.set(player, speed);
      }
      const ended = [];
      for (const [player, ride] of rides) {
        if (riders.has(player)) continue;
        rides.delete(player);
        ended.push({ player, meters: Math.round(ride.meters), topKmh: ride.topKmh, seconds: Math.round(ride.ticks / 20) });
      }
      return { speeds, ended };
    },
  };
}
