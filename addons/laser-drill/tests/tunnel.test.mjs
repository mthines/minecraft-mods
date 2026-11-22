import { test } from "node:test";
import assert from "node:assert/strict";
import { KEEP, LAYERS_PER_STEP, MAX_LAYERS, directionOf, layers, nextCount, startOf } from "../behavior_pack/scripts/tunnel.js";

const HEIGHT = { min: -64, max: 319 };

test("the tunnel runs along the axis you mostly look along", () => {
  assert.deepEqual(directionOf({ x: 0.1, y: 0.2, z: 0.97 }), { axis: "z", sign: 1 });
  assert.deepEqual(directionOf({ x: -0.9, y: 0.1, z: 0.3 }), { axis: "x", sign: -1 });
  assert.deepEqual(directionOf({ x: 0.1, y: -0.99, z: 0.1 }), { axis: "y", sign: -1 });
  assert.deepEqual(directionOf({ x: 0, y: 1, z: 0 }), { axis: "y", sign: 1 });
});

test("a sideways tunnel runs from the player's feet to above their head, starting past their own block", () => {
  // standing in block y 64 with eyes at 65.62
  const start = startOf({ x: 10.5, y: 65.62, z: 20.5 }, "x", 1);
  assert.deepEqual(start, { x: 11, y: 65, z: 20 });
  const box = layers(start, "x", 1, 0, 1, HEIGHT);
  assert.equal(box.from.y, 64);
  assert.equal(box.to.y, 66);
  assert.deepEqual([box.from.z, box.to.z], [19, 21]);
});

test("a shaft goes under or over the player", () => {
  const head = { x: 10.5, y: 65.62, z: 20.5 };
  assert.equal(startOf(head, "y", -1).y, 63);
  assert.equal(startOf(head, "y", 1).y, 66);
});

test("a step is 3 wide and 3 high, in layers of the right direction", () => {
  const box = layers({ x: 0, y: 70, z: 0 }, "z", -1, 8, LAYERS_PER_STEP, HEIGHT);
  assert.deepEqual(box.from, { x: -1, y: 69, z: -11 });
  assert.deepEqual(box.to, { x: 1, y: 71, z: -8 });
});

test("a shaft at the bottom or top of the world is cut to the world", () => {
  assert.equal(layers({ x: 0, y: -64, z: 0 }, "y", -1, 0, 4, HEIGHT).from.y, -64);
  assert.equal(layers({ x: 0, y: -70, z: 0 }, "y", -1, 0, 4, HEIGHT), undefined);
});

test("one hold reaches a long way and then stops", () => {
  assert.ok(MAX_LAYERS >= 100);
  assert.equal(nextCount(0), LAYERS_PER_STEP);
  assert.equal(nextCount(MAX_LAYERS - 1), 1);
  assert.equal(nextCount(MAX_LAYERS), 0);
});

test("bedrock, liquids and chests are left alone, stone and obsidian are not", () => {
  for (const kept of ["bedrock", "water", "lava", "chest", "barrier"]) assert.ok(KEEP.includes(`minecraft:${kept}`), kept);
  for (const dug of ["stone", "obsidian", "deepslate", "dirt", "sand", "gravel", "netherrack"]) assert.ok(!KEEP.includes(`minecraft:${dug}`), dug);
});
