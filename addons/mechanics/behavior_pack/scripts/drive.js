// How a vehicle moves: on the ground, hovering, and flying. No Minecraft imports here, so the tests can run it.
import { BASES, PART_BY_KEY } from "./catalog.js";
import { count, partsOn } from "./design.js";

const LIFT_PER_THRUSTER = 3;
export const SINK = 0.02; // blocks per tick a hovering vehicle sinks with no input
export const CLIMB = 0.25; // blocks per tick it rises while you hold jump
export const PLANE_ACCEL = 0.04;

/** Which way a heading points, as Minecraft turns things: 0 is south (+z), 90 is west (-x). */
export function forward(/** @type {number} */ heading) {
  const r = (heading * Math.PI) / 180;
  return { x: -Math.sin(r), z: Math.cos(r) };
}

/**
 * What a design drives like.
 * @param {import("./design.js").Design} design @param {number} [fill] how full the cargo bed is, 0 to 1
 */
export function statsOf(design, fill = 0) {
  const base = BASES[design.base];
  const farm = design.base === "farm" && count(design, "plow") > 0;
  const load = Math.min(1, Math.max(0, fill));
  const top = (farm ? Math.min(base.top, base.plowTop ?? base.top) : base.top) * (1 - 0.3 * load); // a full bed costs 30% of the top speed
  const accel = base.accel * (1 - 0.5 * load); // and half of how fast it gets there
  return { top, back: base.back, accel, turn: base.turn };
}

/**
 * One tick on the ground.
 * @param {{ heading: number, speed: number }} state speed is blocks per tick, negative when backing up
 * @param {{ x: number, y: number }} keys y 1 is W, -1 is S; x 1 is A, -1 is D
 * @param {{ top: number, back: number, accel: number, turn: number }} stats
 */
export function driveStep(state, keys, stats) {
  let speed = state.speed;
  if (keys.y > 0.3) speed = Math.min(stats.top, speed + stats.accel);
  else if (keys.y < -0.3) speed = Math.max(-stats.back, speed - stats.accel * 2);
  else speed = speed > 0 ? Math.max(0, speed - stats.accel) : Math.min(0, speed + stats.accel); // coasts to a stop
  // A and D turn left and right, more slowly in reverse, and hardly at all standing still.
  const moving = Math.min(1, Math.abs(speed) / (stats.top * 0.4));
  const turn = stats.turn * (0.25 + 0.75 * moving) * (speed < -0.01 ? 0.5 : 1);
  const heading = (((state.heading - keys.x * turn) % 360) + 360) % 360;
  return { heading, speed };
}

/** The velocity (x and z) for a heading and speed. */
export function velocityOf(/** @type {number} */ heading, /** @type {number} */ speed) {
  const dir = forward(heading);
  return { x: dir.x * speed, z: dir.z * speed };
}

/**
 * Weight, lift, and which way it moves.
 * @param {import("./design.js").Design} design @param {number} [fill] how full the cargo bed is, 0 to 1
 */
export function flightOf(design, fill = 0) {
  const base = BASES[design.base];
  const weight = base.weight + partsOn(design) * PART_BY_KEY.seat.weight + (base.cargo ? fill * 2 : 0);
  const thrusters = count(design, "thruster");
  const lift = thrusters * LIFT_PER_THRUSTER;
  const wings = count(design, "wing");
  /** @type {"ground" | "hover" | "plane"} */
  const mode = lift < weight ? "ground" : wings >= 2 ? "plane" : "hover";
  const missing = mode === "ground" && thrusters > 0 ? Math.ceil((weight - lift) / LIFT_PER_THRUSTER) : 0;
  return { weight, lift, thrusters, wings, mode, missing, air: base.air + 0.2 * Math.min(thrusters, 4) };
}

/** What the action bar says about flying, or "" when it has no thrusters and nobody expects it to fly. */
export function flightHint(/** @type {ReturnType<typeof flightOf>} */ flight) {
  if (flight.mode === "ground") return flight.missing > 0 ? `🔥 +${flight.missing} thruster${flight.missing > 1 ? "s" : ""} to fly` : "";
  return flight.mode === "plane" ? "✈ plane: W faster, S slower, look where to fly" : "🔥 hover: hold jump to climb, W/S/A/D to drive";
}

/**
 * One tick of hovering: jump climbs, no input sinks slowly, W/S/A/D drive like on the ground.
 * @returns {{ heading: number, speed: number, vy: number }}
 */
export function hoverStep(/** @type {{ heading: number, speed: number }} */ state, /** @type {{ x: number, y: number }} */ keys, /** @type {boolean} */ jump, /** @type {ReturnType<typeof flightOf>} */ flight, /** @type {{ back: number, accel: number, turn: number }} */ stats) {
  const next = driveStep(state, keys, { ...stats, top: flight.air * 0.6 });
  return { ...next, vy: jump ? CLIMB : -SINK };
}

/**
 * One tick of flying a plane: W faster, S slower down to hovering; it flies where you look.
 * @param {number} speed @param {number} forwardKey y of the movement keys @param {{ x: number, y: number, z: number }} look unit length
 */
export function planeStep(speed, forwardKey, look, /** @type {ReturnType<typeof flightOf>} */ flight) {
  let next = speed;
  if (forwardKey > 0.3) next = Math.min(flight.air, next + PLANE_ACCEL);
  else if (forwardKey < -0.3) next = Math.max(0, next - PLANE_ACCEL);
  return { speed: next, velocity: { x: look.x * next, y: look.y * next, z: look.z * next } };
}
