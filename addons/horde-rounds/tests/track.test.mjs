// node --test: which horde enemies get brought back or nudged toward the players.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LOST, NEST_HOME, planTracking } from "../behavior_pack/scripts/track.js";

const mob = (id, x, z, guard = false) => ({ id, x, z, guard });
const nobody = new Map();

test("an enemy far from every player is lost, and goes to the nearest player", () => {
  const { lost } = planTracking([mob("a", 300, 0)], [{ x: 0, z: 0 }, { x: 300 - LOST - 30, z: 0 }], nobody); // 78 from the second player, 300 from the first
  assert.deepEqual(lost.map((m) => [m.id, m.near]), [["a", 1]]);
});

test("an enemy near a player is not lost", () => {
  const { lost, idle } = planTracking([mob("a", 20, 0)], [{ x: 0, z: 0 }], nobody);
  assert.equal(lost.length + idle.length, 0);
});

test("guards at the nest stay there, however far from the players", () => {
  const { lost, idle } = planTracking([mob("guard", 200, 0, true)], [{ x: 0, z: 0 }], new Map([["guard", { x: 200, z: 0 }]]));
  assert.equal(lost.length + idle.length, 0);
});

test("an enemy that stood still, away from the player, is idle: it gets a nudge", () => {
  const { idle } = planTracking([mob("a", 20, 0)], [{ x: 0, z: 0 }], new Map([["a", { x: 20.1, z: 0 }]]));
  assert.deepEqual(idle.map((m) => m.id), ["a"]);
});

test("an enemy that is walking, or already at the player, is left alone", () => {
  const walking = planTracking([mob("a", 20, 0)], [{ x: 0, z: 0 }], new Map([["a", { x: 22, z: 0 }]]));
  const there = planTracking([mob("b", 2, 0)], [{ x: 0, z: 0 }], new Map([["b", { x: 2, z: 0 }]]));
  assert.equal(walking.idle.length + there.idle.length, 0);
});

test("a new enemy is not idle: nothing to compare with yet", () => {
  assert.equal(planTracking([mob("a", 20, 0)], [{ x: 0, z: 0 }], nobody).idle.length, 0);
});

test("with no players nobody is lost", () => {
  const { lost } = planTracking([mob("a", 500, 0)], [], nobody);
  assert.equal(lost.length, 0);
});

test("an enemy at the nest is not lost, however far the players are: it waits there for them", () => {
  const nest = { x: 300, z: 0 };
  const atNest = planTracking([mob("a", 300 + NEST_HOME - 5, 0)], [{ x: 0, z: 0 }], nobody, nest);
  assert.equal(atNest.lost.length, 0);
  const strayed = planTracking([mob("b", 300 + NEST_HOME + 5, 0)], [{ x: 0, z: 0 }], nobody, nest);
  assert.deepEqual(strayed.lost.map((m) => m.id), ["b"]);
});
