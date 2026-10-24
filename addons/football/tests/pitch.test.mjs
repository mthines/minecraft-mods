import { test } from "node:test";
import assert from "node:assert/strict";
import { GOAL_BLOCK, findGoal, findOpponent, isGoal, isPartOf, makePitch, scoredIn } from "../behavior_pack/scripts/pitch.js";

/** A pretend world: grass ground at y = 63, air above, goal blocks where we put them. */
function world() {
  const blocks = new Map();
  const getType = (x, y, z) => blocks.get(`${x},${y},${z}`) ?? (y <= 63 ? "minecraft:grass_block" : "minecraft:air");
  return { getType, set: (x, y, z, t = GOAL_BLOCK) => blocks.set(`${x},${y},${z}`, t) };
}

/** Builds a goal across x (or z) with its first post at x, 64, z. */
function build(w, { x = 0, z = 0, axis = "x", width = 5, height = 3 } = {}) {
  const at = (u, dy) => (axis === "x" ? w.set(x + u, 64 + dy, z) : w.set(x, 64 + dy, z + u));
  for (let dy = 0; dy < height; dy++) at(0, dy), at(width - 1, dy);
  for (let u = 1; u < width - 1; u++) at(u, height - 1);
  return { axis, x, y: 64, z, width, height };
}

test("finds a goal from any of its blocks, in either direction", () => {
  for (const axis of ["x", "z"]) {
    const w = world();
    const goal = build(w, { axis, x: 10, z: 20, width: 6, height: 4 });
    const blocks = axis === "x" ? [[10, 64, 20], [15, 66, 20], [12, 67, 20]] : [[10, 64, 20], [10, 67, 25], [10, 67, 22]];
    for (const [x, y, z] of blocks) assert.deepEqual(findGoal(w.getType, x, y, z), goal, `${axis} ${x},${y},${z}`);
  }
});

test("a goal needs an open middle, its posts on the ground, and a sensible size", () => {
  const w = world();
  build(w, { width: 5, height: 3 });
  w.set(2, 64, 0, "minecraft:stone"); // something in the way
  assert.equal(findGoal(w.getType, 0, 64, 0), undefined);

  const floating = world();
  const goal = build(floating, { width: 5, height: 3 });
  assert.equal(isGoal(floating.getType, { ...goal, y: 70 }), false);

  const tiny = world();
  build(tiny, { width: 3, height: 3 });
  assert.equal(findGoal(tiny.getType, 0, 64, 0), undefined);

  const unfinished = world();
  build(unfinished, { width: 5, height: 3 });
  unfinished.set(2, 66, 0, "minecraft:air"); // gap in the crossbar
  assert.equal(findGoal(unfinished.getType, 0, 64, 0), undefined);
});

test("finds the goal of the same size straight across, in either direction", () => {
  const w = world();
  const a = build(w, { z: 0 });
  const b = build(w, { z: 30 });
  assert.deepEqual(findOpponent(w.getType, a), b);
  assert.deepEqual(findOpponent(w.getType, b), a);
});

test("goals of different sizes, off to the side, or too close don't make a pitch", () => {
  const sizes = world();
  const a = build(sizes, { z: 0 });
  build(sizes, { z: 30, width: 6 });
  assert.equal(findOpponent(sizes.getType, a), undefined);

  const side = world();
  const c = build(side, { z: 0 });
  build(side, { x: 2, z: 30 });
  assert.equal(findOpponent(side.getType, c), undefined);

  const close = world();
  const d = build(close, { z: 0 });
  build(close, { z: 5 });
  assert.equal(findOpponent(close.getType, d), undefined);
});

test("the ball spawns in the middle; Blue defends the lower goal", () => {
  const w = world();
  const a = build(w, { z: 30 });
  const b = build(w, { z: 0 });
  const pitch = makePitch(a, b);
  assert.deepEqual(pitch.blue, b);
  assert.deepEqual(pitch.center, { x: 2.5, y: 64, z: 15.5 });
});

test("scores only when the ball goes into a goal's mouth from the pitch", () => {
  const w = world();
  const pitch = makePitch(build(w, { z: 0 }), build(w, { z: 30 }));
  const ball = (x, z, y = 64) => ({ x, y, z });
  assert.equal(scoredIn(pitch, ball(2.5, 1.2), ball(2.5, 0.4)), "blue");
  assert.equal(scoredIn(pitch, ball(2.5, 29.8), ball(2.5, 30.6)), "red");
  assert.equal(scoredIn(pitch, ball(0.5, 1.2), ball(0.5, 0.4)), undefined, "hit the post");
  assert.equal(scoredIn(pitch, ball(2.5, 1.2, 66), ball(2.5, 0.4, 66)), undefined, "over the bar");
  assert.equal(scoredIn(pitch, ball(2.5, -0.5), ball(2.5, 0.6)), undefined, "from behind the goal");
  assert.equal(scoredIn(pitch, ball(2.5, 10), ball(2.5, 11)), undefined, "in play");
});

test("knows which blocks belong to a goal", () => {
  const goal = { axis: "x", x: 0, y: 64, z: 0, width: 5, height: 3 };
  assert.equal(isPartOf(goal, 0, 64, 0), true);
  assert.equal(isPartOf(goal, 2, 66, 0), true);
  assert.equal(isPartOf(goal, 2, 64, 0), false, "the open middle");
  assert.equal(isPartOf(goal, 0, 64, 1), false);
});
