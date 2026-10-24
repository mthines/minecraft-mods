// How the captain's keys move the ship. No Minecraft imports here, so the tests can run it.

export const TURN_DEGREES = 3; // per tick while A or D is held: a full circle in 6 seconds
export const TOP_SPEED = 0.4; // blocks per tick forward (8 a second, like a boat); backward is slower
export const BACK_SPEED = 0.15;
const PICKUP = 0.15; // how much of the gap to the wanted speed closes each tick, so it speeds up and slows down smoothly

/**
 * Which way the ship goes for a heading, as Minecraft turns things: 0 is south (+z), 90 is west (-x).
 * @param {number} heading degrees
 */
export function forward(heading) {
  const r = (heading * Math.PI) / 180;
  return { x: -Math.sin(r), z: Math.cos(r) };
}

/**
 * One tick of sailing.
 * @param {number} heading where the ship points now, in degrees
 * @param {{ x: number, y: number }} keys the captain's movement keys: y 1 is W, -1 is S; x 1 is A, -1 is D
 * @param {{ x: number, z: number }} velocity how fast the ship moves now, in blocks per tick
 * @returns {{ heading: number, push: { x: number, z: number } }} the new heading, and the push to give the ship
 */
export function sail(heading, keys, velocity) {
  // A turns left and D right, as on a boat. Turning is slower in reverse.
  const next = (((heading - keys.x * TURN_DEGREES * (keys.y < 0 ? 0.5 : 1)) % 360) + 360) % 360;
  const speed = keys.y > 0 ? keys.y * TOP_SPEED : keys.y < 0 ? keys.y * BACK_SPEED : 0;
  const dir = forward(next);
  return {
    heading: next,
    push: { x: (dir.x * speed - velocity.x) * PICKUP, z: (dir.z * speed - velocity.z) * PICKUP },
  };
}
