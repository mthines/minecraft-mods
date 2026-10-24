import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FINISHED_EDGE, OTHER_MODS_KIT, SIZES, covers, edgeBlocks, findTrampoline, starterChest, starterKit } from "../behavior_pack/scripts/trampoline.js";

/** A pretend world: a map from "x,y,z" to block type. */
function world() {
  const blocks = new Map();
  return {
    set: (x, y, z, type) => blocks.set(`${x},${y},${z}`, type),
    delete: (x, y, z) => blocks.delete(`${x},${y},${z}`),
    getType: (x, y, z) => blocks.get(`${x},${y},${z}`),
  };
}

/** Builds a size×size trampoline with its bed corner at 10, 64, 20. */
function build(size, { corners = false, edge = () => "minecraft:oak_planks" } = {}) {
  const w = world();
  for (let dx = -1; dx <= size; dx++) {
    for (let dz = -1; dz <= size; dz++) {
      const inside = (n) => n >= 0 && n < size;
      if (inside(dx) && inside(dz)) w.set(10 + dx, 64, 20 + dz, "minecraft:slime");
      else if (inside(dx) || inside(dz)) w.set(10 + dx, 64, 20 + dz, edge(dx, dz));
      else if (corners) w.set(10 + dx, 64, 20 + dz, "minecraft:oak_planks");
    }
  }
  return w;
}

for (const size of Object.keys(SIZES).map(Number)) {
  test(`finds a size ${size} trampoline from the last slime or edge block placed`, () => {
    const w = build(size);
    const expected = { x: 10, y: 64, z: 20, size };
    assert.deepEqual(findTrampoline(w.getType, 10 + size - 1, 64, 20 + size - 1), expected); // far bed corner
    assert.deepEqual(findTrampoline(w.getType, 9, 64, 20), expected); // edge block
  });
}

test("corners can be empty or any block", () => {
  assert.equal(findTrampoline(build(3).getType, 10, 64, 20)?.size, 3);
  assert.equal(findTrampoline(build(3, { corners: true }).getType, 10, 64, 20)?.size, 3);
});

test("the edge can mix any planks and any wool", () => {
  const edges = ["oak_planks", "cherry_planks", "red_wool", "bamboo_planks", "lime_wool", "crimson_planks"];
  const w = build(4, { edge: (dx, dz) => `minecraft:${edges[(dx + dz + 12) % edges.length]}` });
  assert.equal(findTrampoline(w.getType, 11, 64, 21)?.size, 4);
});

test("other blocks do not count as an edge", () => {
  for (const block of ["minecraft:cobblestone", "minecraft:oak_log", "minecraft:oak_slab", "minecraft:dirt"]) {
    assert.equal(findTrampoline(build(3, { edge: () => block }).getType, 10, 64, 20), undefined, block);
  }
});

test("a missing edge block means no trampoline yet", () => {
  const w = build(3);
  w.delete(11, 64, 19);
  assert.equal(findTrampoline(w.getType, 10, 64, 20), undefined);
});

test("a bed with a non-slime block is not a trampoline", () => {
  const w = build(3);
  w.set(11, 64, 21, "minecraft:dirt");
  assert.equal(findTrampoline(w.getType, 10, 64, 20), undefined);
});

test("an edge one block higher or lower does not count", () => {
  const w = build(2);
  w.delete(9, 64, 20);
  w.set(9, 65, 20, "minecraft:oak_planks");
  assert.equal(findTrampoline(w.getType, 10, 64, 20), undefined);
});

test("sizes bigger than the biggest supported size are not trampolines", () => {
  const tooBig = Math.max(...Object.keys(SIZES).map(Number)) + 1;
  const w = build(tooBig);
  assert.equal(findTrampoline(w.getType, 12, 64, 22), undefined);
});

test("covers the bed and edge, but not the corners or other levels", () => {
  const t = { x: 10, y: 64, z: 20, size: 3 };
  assert.equal(covers(t, 11, 64, 21), true); // bed
  assert.equal(covers(t, 13, 64, 20), true); // edge
  assert.equal(covers(t, 9, 64, 19), false); // corner
  assert.equal(covers(t, 11, 65, 21), false); // above
});

test("bigger trampolines bounce higher, close to the advertised height", () => {
  // Bedrock player physics: gravity 0.08 blocks/tick², 2% air drag per tick.
  const height = (v) => {
    let y = 0;
    while (v > 0) {
      y += v;
      v = (v - 0.08) * 0.98;
    }
    return y;
  };
  const sizes = Object.keys(SIZES).map(Number).sort((a, b) => a - b);
  let previous = 0;
  for (const size of sizes) {
    const h = height(SIZES[size].strength);
    assert.ok(h > previous, `size ${size} should bounce higher than size ${size - 1}`);
    assert.ok(Math.abs(h - SIZES[size].blocks) / SIZES[size].blocks < 0.1, `size ${size} flies ${h.toFixed(1)} blocks`);
    previous = h;
  }
});

test("a finished trampoline's black edge still counts as a trampoline", () => {
  const size = 3;
  const w = build(size);
  const edge = edgeBlocks({ x: 10, y: 64, z: 20, size });
  assert.equal(edge.length, 4 * size);
  for (const { x, y, z } of edge) {
    assert.equal(w.getType(x, y, z), "minecraft:oak_planks", `${x},${z} is an edge block`);
    w.set(x, y, z, FINISHED_EDGE);
  }
  assert.equal(findTrampoline(w.getType, 10, 64, 20)?.size, size);
});

test("the starter chest holds enough to build the biggest trampoline", () => {
  const biggest = Math.max(...Object.keys(SIZES).map(Number));
  const kit = starterKit();
  const count = (match) => kit.filter(({ item }) => match(item)).reduce((n, { amount }) => n + amount, 0);
  assert.equal(count((item) => item === "minecraft:slime"), biggest * biggest);
  assert.ok(count((item) => item.endsWith("_planks")) >= 4 * biggest);
  assert.ok(kit.every(({ amount }) => amount <= 64), "each slot holds at most one stack");
  assert.ok(kit.length <= 27, "everything fits in one chest");
});

test("the starter chest also has the power-tools, double-jump, weapons and weapons-ammo kits, and it all fits", () => {
  const kits = ["power-tools/kit.json", "double-jump/kit.json", "weapons/kit.json", "weapons/kit-ammo.json"];
  const total = (/** @type {[string, number][]} */ items) => {
    const sums = new Map();
    for (const [item, amount] of items) sums.set(item, (sums.get(item) ?? 0) + amount);
    return Object.fromEntries([...sums].sort());
  };
  const fromKits = kits.flatMap((kit) => JSON.parse(readFileSync(new URL(`../../${kit}`, import.meta.url), "utf8")).items);
  assert.deepEqual(total(OTHER_MODS_KIT), total(fromKits));
  const chest = starterChest();
  assert.ok(chest.every(({ amount }) => amount <= 64), "each slot holds at most one stack");
  assert.ok(chest.length <= 27, `everything fits in one chest (${chest.length} slots)`);
});
