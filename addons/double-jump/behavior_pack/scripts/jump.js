// The jump button in the air, like A Short Hike: each golden feather you carry is one flap,
// and holding jump while falling glides. Feathers come back when you land.
// Plain logic, so it can be tested without a game: npm test

/** @typedef {{ wasDown: boolean, flaps: number, gliding?: boolean }} JumpState flaps: how many flaps used since leaving the ground; gliding: kept up while jump is held */

/** @returns {JumpState} */
export const fresh = () => ({ wasDown: false, flaps: 0 });

/**
 * One tick for one player.
 * "flap" throws them up and uses a feather, "glide" sinks slowly and moves fast, "none" is normal Minecraft.
 * @param {JumpState} state
 * @param {{ jump: boolean, onGround: boolean, falling: boolean, feathers: number, canFly: boolean }} input
 * @returns {{ state: JumpState, action: "flap" | "glide" | "none" }}
 */
export function step(state, { jump, onGround, falling, feathers, canFly }) {
  if (!canFly || onGround) return { state: { wasDown: jump, flaps: 0 }, action: "none" };
  const pressed = jump && !state.wasDown;
  if (pressed && state.flaps < feathers) return { state: { wasDown: true, flaps: state.flaps + 1 }, action: "flap" };
  const gliding = jump && (falling || !!state.gliding) && feathers > 0;
  return { state: { wasDown: jump, flaps: state.flaps, gliding }, action: gliding ? "glide" : "none" };
}

const CRUISE = 0.4; // blocks per tick across a level glide settles at (sprinting is about 0.28)
const MAX_SPEED = 1.1; // the fastest a glide goes across
const SINK = 0.04; // blocks per tick a level glide sinks
const DIVE_SINK = 0.7; // how much faster looking straight down sinks
const FLOAT_SINK = 0.025; // the slowest a glide sinks, looking up: it never climbs
const DIVE_FROM = 0.97; // without crouching, only looking (nearly) straight down, past about 75°, dives
const DIVE_CROUCHED = 0.25; // crouching dives this much looking level, and more the further down you look
const EASE = 0.2; // how quickly the sink follows where you look (1 = at once)
const CONVERT = 1; // how much of the fall a glide catches turns into speed across
const DIVE_PUSH = 0.03; // speed across gained each tick looking straight down
const SPEED_UP = 0.25; // how quickly a slow glide speeds up to cruise
const SLOW_DOWN = 0.012; // how slowly a fast glide loses its speed: a dive's speed lasts a few seconds

/**
 * One tick of gliding, like A Short Hike: falling fast into a glide, or diving, turns the fall into speed,
 * which drains back to cruising speed over a few seconds. Looking up floats; crouching, or looking straight down, dives.
 * @param {number} speed speed across before this tick, in blocks per tick
 * @param {{ fall: number, pitch: number, steering: boolean, crouching?: boolean }} input fall: blocks per tick downwards now;
 *   pitch: -1 looking straight up to 1 straight down; steering: a movement key is held; crouching: diving on purpose
 * @returns {{ speed: number, sink: number }} speed across and blocks per tick down for this tick
 */
export function glide(speed, { fall, pitch, steering, crouching = false }) {
  const dive = crouching ? DIVE_CROUCHED + (1 - DIVE_CROUCHED) * Math.max(0, pitch) : Math.max(0, (pitch - DIVE_FROM) / (1 - DIVE_FROM)) ** 2;
  const target = dive > 0 || pitch > 0 ? SINK + dive * DIVE_SINK : Math.max(FLOAT_SINK, SINK + pitch * (SINK - FLOAT_SINK) * 2);
  const sink = fall + (target - fall) * EASE;
  speed += Math.max(0, fall - sink) * CONVERT + dive * DIVE_PUSH;
  const cruise = steering ? CRUISE * (1 + Math.min(0, pitch) / 2) : 0;
  speed += (cruise - speed) * (speed < cruise ? SPEED_UP : SLOW_DOWN);
  return { speed: Math.min(MAX_SPEED, Math.max(0, speed)), sink: Math.max(FLOAT_SINK, sink) };
}
