import assert from "node:assert/strict";
import { test } from "node:test";
import { cellsToTill, fillOf, plowCells, tilled, PLOW_WIDTH } from "../behavior_pack/scripts/farm.js";

test("the plow is three blocks wide and hangs behind the tractor", () => {
  const cells = plowCells({ x: 10.5, z: 10.5 }, 0); // facing south: behind is north (smaller z)
  assert.equal(cells.length, PLOW_WIDTH);
  assert.ok(cells.every((c) => c.z < 10), JSON.stringify(cells));
  assert.deepEqual(new Set(cells.map((c) => c.z)).size, 1, "in a row across the back");
  assert.deepEqual(cells.map((c) => c.x).sort((a, b) => a - b), [9, 10, 11]);
});

test("it only plows when it moves into a new block", () => {
  const first = cellsToTill(plowCells({ x: 10.5, z: 10.5 }, 0), undefined);
  assert.equal(first.cells.length, 3);
  const same = cellsToTill(plowCells({ x: 10.6, z: 10.6 }, 0), first.key);
  assert.equal(same.cells.length, 0);
  const moved = cellsToTill(plowCells({ x: 10.5, z: 12.5 }, 0), first.key);
  assert.equal(moved.cells.length, 3);
});

test("grass it never crossed isn't plowed", () => {
  const tilledKeys = new Set();
  let last;
  for (let z = 10.5; z < 20; z += 0.25) {
    const { key, cells } = cellsToTill(plowCells({ x: 10.5, z }, 0), last);
    last = key;
    for (const c of cells) tilledKeys.add(`${c.x},${c.z}`);
  }
  assert.ok(tilledKeys.has("10,10"), "behind the path is plowed");
  assert.ok(!tilledKeys.has("20,12") && !tilledKeys.has("10,25") && !tilledKeys.has("10,40"), "off the path is not");
  assert.ok(![...tilledKeys].some((k) => Number(k.split(",")[0]) > 11 || Number(k.split(",")[0]) < 9), "never wider than 3");
});

test("grass, dirt and paths turn into farmland, stone and water don't", () => {
  for (const type of ["minecraft:grass_block", "minecraft:dirt", "minecraft:dirt_path"]) assert.equal(tilled(type), "minecraft:farmland");
  for (const type of ["minecraft:stone", "minecraft:water", "minecraft:sand", "minecraft:farmland"]) assert.equal(tilled(type), undefined);
});

test("how full the bed is", () => {
  assert.equal(fillOf(27, 27), 0);
  assert.equal(fillOf(0, 27), 1);
  assert.ok(Math.abs(fillOf(9, 27) - 2 / 3) < 1e-9);
});
