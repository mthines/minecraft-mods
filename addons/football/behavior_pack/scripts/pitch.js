// Goals and scoring. No Minecraft imports here, so the tests can run it.

export const GOAL_BLOCK = "minecraft:white_concrete";
export const WIDTH = { min: 4, max: 12 }; // the whole goal, posts included
export const HEIGHT = { min: 3, max: 6 }; // posts included, so the opening is one less
export const DISTANCE = { min: 8, max: 96 }; // between two goals that face each other
const OPEN = new Set(["minecraft:air", "minecraft:short_grass"]);

/** @typedef {(x: number, y: number, z: number) => string | undefined} GetType */
/** @typedef {{ x: number, y: number, z: number }} Vec3 */
/**
 * A goal frame. It spans `axis` (x or z); (x, y, z) is the bottom of the post with the lowest `axis` value.
 * @typedef {{ axis: "x" | "z", x: number, y: number, z: number, width: number, height: number }} Goal
 */

/** The axis a goal faces along: across its frame. @param {Goal} goal */
export const facing = (goal) => (goal.axis === "x" ? "z" : "x");

/** The block `u` along the goal and `dy` up from its bottom. @param {Goal} goal */
function cell(goal, u, dy) {
  return goal.axis === "x" ? { x: goal.x + u, y: goal.y + dy, z: goal.z } : { x: goal.x, y: goal.y + dy, z: goal.z + u };
}

/**
 * Two posts on the ground, a crossbar on top, nothing in between.
 * @param {GetType} getType @param {Goal} goal
 */
export function isGoal(getType, goal) {
  const { width, height } = goal;
  if (width < WIDTH.min || width > WIDTH.max || height < HEIGHT.min || height > HEIGHT.max) return false;
  const is = (u, dy, test) => {
    const { x, y, z } = cell(goal, u, dy);
    return test(getType(x, y, z));
  };
  const frame = (t) => t === GOAL_BLOCK;
  const ground = (t) => t !== undefined && t !== GOAL_BLOCK && !OPEN.has(t);
  const open = (t) => t !== undefined && OPEN.has(t);
  // Cheapest checks first: most places aren't goals, and the post bottoms say so straight away.
  if (!is(0, 0, frame) || !is(width - 1, 0, frame)) return false;
  if (!is(0, -1, ground) || !is(width - 1, -1, ground)) return false;
  for (let dy = 0; dy < height; dy++) if (!is(0, dy, frame) || !is(width - 1, dy, frame)) return false;
  for (let u = 1; u < width - 1; u++) if (!is(u, height - 1, frame)) return false;
  for (let u = 1; u < width - 1; u++) for (let dy = 0; dy < height - 1; dy++) if (!is(u, dy, open)) return false;
  return true;
}

/**
 * The goal that the goal block at (x, y, z) is part of, if it completes one.
 * @param {GetType} getType @param {number} x @param {number} y @param {number} z
 * @returns {Goal | undefined}
 */
export function findGoal(getType, x, y, z) {
  if (getType(x, y, z) !== GOAL_BLOCK) return undefined;
  const limit = 2 * HEIGHT.max + WIDTH.max;
  for (const axis of /** @type {const} */ (["x", "z"])) {
    // Every goal block joined to this one in the frame's plane; a goal is exactly its outline.
    const seen = new Set([`${axis === "x" ? x : z},${y}`]);
    const todo = [[axis === "x" ? x : z, y]];
    while (todo.length && seen.size <= limit) {
      const [u, v] = /** @type {number[]} */ (todo.pop());
      for (const [nu, nv] of [[u + 1, v], [u - 1, v], [u, v + 1], [u, v - 1]]) {
        const key = `${nu},${nv}`;
        if (seen.has(key)) continue;
        if (getType(axis === "x" ? nu : x, nv, axis === "x" ? z : nu) !== GOAL_BLOCK) continue;
        seen.add(key);
        todo.push([nu, nv]);
      }
    }
    if (seen.size > limit) continue;
    const cells = [...seen].map((k) => k.split(",").map(Number));
    const us = cells.map(([u]) => u);
    const ys = cells.map(([, v]) => v);
    const minU = Math.min(...us);
    const goal = {
      axis,
      x: axis === "x" ? minU : x,
      y: Math.min(...ys),
      z: axis === "x" ? z : minU,
      width: Math.max(...us) - minU + 1,
      height: Math.max(...ys) - Math.min(...ys) + 1,
    };
    if (isGoal(getType, goal)) return goal;
  }
  return undefined;
}

/**
 * A goal of the same size, straight across from this one.
 * @param {GetType} getType @param {Goal} goal
 * @returns {Goal | undefined}
 */
export function findOpponent(getType, goal) {
  const n = facing(goal);
  for (let d = DISTANCE.min; d <= DISTANCE.max; d++) {
    for (const sign of [1, -1]) {
      const other = { ...goal, [n]: goal[n] + sign * d };
      if (isGoal(getType, other)) return other;
    }
  }
  return undefined;
}

/**
 * Two facing goals. Blue defends the one with the lower coordinate, Red the other.
 * @param {Goal} a @param {Goal} b
 */
export function makePitch(a, b) {
  const n = facing(a);
  const [blue, red] = a[n] < b[n] ? [a, b] : [b, a];
  const middle = (/** @type {Goal} */ g) => cell(g, (g.width - 1) / 2, 0);
  const center = {
    x: (middle(blue).x + middle(red).x) / 2 + 0.5,
    y: blue.y,
    z: (middle(blue).z + middle(red).z) / 2 + 0.5,
  };
  return { blue, red, center };
}

/** @typedef {ReturnType<typeof makePitch>} Pitch */

/**
 * Which goal the ball just went into, moving from `before` to `now`: "blue", "red", or undefined.
 * @param {Pitch} pitch @param {Vec3} before @param {Vec3} now
 */
export function scoredIn(pitch, before, now) {
  for (const side of /** @type {const} */ (["blue", "red"])) {
    const goal = pitch[side];
    const n = facing(goal);
    const line = goal[n] + 0.5; // the middle of the goal's blocks
    const crossed = side === "blue" ? before[n] > line && now[n] <= line : before[n] < line && now[n] >= line;
    if (!crossed) continue;
    const u = now[goal.axis] - goal[goal.axis];
    const up = now.y - goal.y;
    if (u >= 1 && u < goal.width - 1 && up >= 0 && up < goal.height - 1) return side;
  }
  return undefined;
}

/** Whether (x, y, z) is one of the goal's blocks. @param {Goal} goal */
export function isPartOf(goal, x, y, z) {
  const u = (goal.axis === "x" ? x : z) - goal[goal.axis];
  const along = goal.axis === "x" ? z === goal.z : x === goal.x;
  const dy = y - goal.y;
  if (!along || u < 0 || u >= goal.width || dy < 0 || dy >= goal.height) return false;
  return u === 0 || u === goal.width - 1 || dy === goal.height - 1;
}
