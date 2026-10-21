import { test } from "node:test";
import assert from "node:assert/strict";
import { SIZES, covers, findTrampoline, starterKit } from "../behavior_pack/scripts/trampoline.js";

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
function build(size, { corners = false, wool = () => "minecraft:white_wool" } = {}) {
  const w = world();
  for (let dx = -1; dx <= size; dx++) {
    for (let dz = -1; dz <= size; dz++) {
      const inside = (n) => n >= 0 && n < size;
      if (inside(dx) && inside(dz)) w.set(10 + dx, 64, 20 + dz, "minecraft:slime");
      else if (inside(dx) || inside(dz)) w.set(10 + dx, 64, 20 + dz, wool(dx, dz));
      else if (corners) w.set(10 + dx, 64, 20 + dz, "minecraft:oak_planks");
    }
  }
  return w;
}

for (const size of Object.keys(SIZES).map(Number)) {
  test(`finds a size ${size} trampoline from the last slime or wool block placed`, () => {
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

test("wool colours can be mixed", () => {
  const colours = ["red", "blue", "lime", "yellow"];
  const w = build(4, { wool: (dx, dz) => `minecraft:${colours[(dx + dz + 8) % 4]}_wool` });
  assert.equal(findTrampoline(w.getType, 11, 64, 21)?.size, 4);
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
  w.set(9, 65, 20, "minecraft:white_wool");
  assert.equal(findTrampoline(w.getType, 10, 64, 20), undefined);
});

test("sizes bigger than the biggest supported size are not trampolines", () => {
  const w = build(6);
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

test("the starter chest holds enough to build the biggest trampoline", () => {
  const biggest = Math.max(...Object.keys(SIZES).map(Number));
  const kit = starterKit();
  const count = (match) => kit.filter(({ item }) => match(item)).reduce((n, { amount }) => n + amount, 0);
  assert.equal(count((item) => item === "minecraft:slime"), biggest * biggest);
  assert.ok(count((item) => item.endsWith("_wool")) >= 4 * biggest);
  assert.ok(kit.every(({ amount }) => amount <= 64), "each slot holds at most one stack");
});
