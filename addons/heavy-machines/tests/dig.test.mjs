import { test } from "node:test";
import assert from "node:assert/strict";
import { AIM_DOWN, AIM_UP, aimFrom, face, findTree, isLiquid, shaftMiddle } from "../behavior_pack/scripts/dig.js";

const span = (blocks, axis) => [Math.min(...blocks.map((b) => b[axis])), Math.max(...blocks.map((b) => b[axis]))];

test("the drill points where the driver looks: up, down, or the nearest of four ways", () => {
  assert.equal(aimFrom(-60, 0).aim, AIM_UP);
  assert.equal(aimFrom(70, 123).aim, AIM_DOWN);
  assert.deepEqual(aimFrom(10, 0).dir, { x: 0, y: 0, z: 1 }); // south
  assert.deepEqual(aimFrom(0, 80).dir, { x: -1, y: 0, z: 0 }); // west
  assert.deepEqual(aimFrom(0, -170).dir, { x: 0, y: 0, z: -1 }); // north
  assert.deepEqual(aimFrom(0, 275).dir, { x: 1, y: 0, z: 0 }); // east
});

test("ahead, a 3×3 face sits just past the front, level with the floor", () => {
  // A machine pointing east (+x), its front edge at x 12 against the wall block at x 12.
  const blocks = face({ x: 11.0, y: 64, z: 20.5 }, { x: 1, y: 0, z: 0 }, 3);
  assert.equal(blocks.length, 9);
  assert.deepEqual(span(blocks, "x"), [12, 12]);
  assert.deepEqual(span(blocks, "y"), [64, 66]);
  assert.deepEqual(span(blocks, "z"), [19, 21]);
});

test("a machine pushed up against a wall drills that wall, wherever it is in its block", () => {
  // Pointing west, the front edge at x 9.0 touches the wall block at x 8.
  assert.deepEqual(span(face({ x: 10.0, y: 64, z: 20.5 }, { x: -1, y: 0, z: 0 }, 3), "x"), [8, 8]);
  // Pointing north, 0.3 from the wall: the face is still air, so it drives closer first.
  assert.deepEqual(span(face({ x: 10.5, y: 64, z: 20.3 }, { x: 0, y: 0, z: -1 }, 3), "z"), [19, 19]);
});

test("the tunnel is always wide enough for the machine, even off-center", () => {
  for (const x of [10.0, 10.2, 10.5, 10.8, 10.99]) {
    const [first, last] = span(face({ x, y: 64, z: 20.5 }, { x: 0, y: 0, z: 1 }, 3), "x");
    assert.ok(first <= x - 1 && last + 1 >= x + 1, `machine at x ${x} sticks out of the tunnel ${first}..${last + 1}`);
  }
});

test("bigger drill heads cut bigger faces", () => {
  for (const size of [5, 7]) {
    const blocks = face({ x: 0.5, y: 10, z: 0.5 }, { x: 0, y: 0, z: -1 }, size);
    assert.equal(blocks.length, size * size);
    assert.deepEqual(span(blocks, "y"), [10, 10 + size - 1]);
    const [first, last] = span(blocks, "x");
    assert.equal(last - first + 1, size);
  }
});

test("up and down cut the layer above the machine's roof, or below its floor", () => {
  const up = face({ x: 0.5, y: 10, z: 0.5 }, { x: 0, y: 1, z: 0 }, 3);
  assert.deepEqual(span(up, "y"), [13, 13]);
  assert.deepEqual(span(up, "x"), [-1, 1]);
  const down = face({ x: 0.5, y: 10, z: 0.5 }, { x: 0, y: -1, z: 0 }, 5);
  assert.equal(down.length, 25);
  assert.deepEqual(span(down, "y"), [9, 9]);
});

test("a machine drilling up or down stays in the middle of its shaft", () => {
  assert.deepEqual(shaftMiddle({ x: 0.9, y: 5, z: 0.2 }, 3), { x: 0.5, y: 5, z: 0.5 });
  assert.deepEqual(shaftMiddle({ x: 0.2, y: 5, z: 0.9 }, 5), { x: 0.5, y: 5, z: 0.5 });
});

test("water and lava, flowing or not, are liquids", () => {
  for (const type of ["minecraft:water", "minecraft:flowing_water", "minecraft:lava", "minecraft:flowing_lava"]) assert.ok(isLiquid(type), type);
  for (const type of ["minecraft:stone", "minecraft:water_bucket", "minecraft:lava_cauldron"]) assert.ok(!isLiquid(type), type);
});

/** A little world: blocks by "x,y,z". */
const world = (entries) => {
  const blocks = new Map(entries);
  return (p) => blocks.get(`${p.x},${p.y},${p.z}`);
};
const log = { type: "minecraft:oak_log" };
const leaf = { type: "minecraft:oak_leaves", natural: true };

test("a tree is all its logs, up and sideways, and its leaves", () => {
  const blockAt = world([
    ["0,0,0", log], ["0,1,0", log], ["0,2,0", log],
    ["1,3,0", log], ["2,3,1", log], // a branch going sideways and diagonally
    ["0,3,0", leaf], ["0,4,0", leaf], ["3,3,1", leaf],
    ["9,0,0", log], // another tree, not touching
  ]);
  const tree = findTree({ x: 0, y: 0, z: 0 }, blockAt);
  assert.ok(tree);
  assert.equal(tree.logs.length, 5);
  assert.equal(tree.leaves.length, 3);
});

test("logs with no natural leaves are a building, not a tree", () => {
  const playerLeaf = { type: "minecraft:oak_leaves", natural: false };
  assert.equal(findTree({ x: 0, y: 0, z: 0 }, world([["0,0,0", log], ["1,0,0", log], ["0,1,0", playerLeaf]])), undefined);
  assert.equal(findTree({ x: 0, y: 0, z: 0 }, world([["0,0,0", log], ["0,1,0", log]])), undefined);
});
