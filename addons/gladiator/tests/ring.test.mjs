import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_CROWD, MAX_RADIUS, MIN_CROWD, MIN_RADIUS, backInside, crowdSize, crowdSpots, exitSpot, findRing, isButton, isInside, isSandstone, middleOf } from "../behavior_pack/scripts/ring.js";

/** A world of blocks in a map: a ring of `radius` around the gold block at 0, 0, 0 with `skip` blocks left out. */
function world({ radius = 6, block = "minecraft:sandstone", skip = () => false, y = 0 } = {}) {
  const blocks = new Map([[`0,${y},0`, "minecraft:gold_block"]]);
  let n = 0;
  for (let x = -radius - 1; x <= radius + 1; x++) {
    for (let z = -radius - 1; z <= radius + 1; z++) {
      if (Math.round(Math.hypot(x, z)) === radius && !skip(n++)) blocks.set(`${x},${y},${z}`, block);
    }
  }
  return (x, yy, z) => blocks.get(`${x},${yy},${z}`);
}

test("sandstone of every kind counts, other blocks don't", () => {
  for (const id of ["minecraft:sandstone", "minecraft:smooth_sandstone", "minecraft:cut_sandstone", "minecraft:chiseled_sandstone", "minecraft:red_sandstone", "minecraft:smooth_red_sandstone"]) assert.ok(isSandstone(id), id);
  for (const id of ["minecraft:sand", "minecraft:stone", "minecraft:gold_block", undefined]) assert.ok(!isSandstone(id), String(id));
  assert.ok(isButton("minecraft:stone_button") && isButton("minecraft:wooden_button") && !isButton("minecraft:stone"));
});

test("a button on the edge finds rings from the smallest to the biggest radius", () => {
  for (let radius = MIN_RADIUS; radius <= MAX_RADIUS; radius++) {
    const ring = findRing(world({ radius }), radius, 1, 0); // on top of the ring's block, east of the middle
    assert.deepEqual(ring, { x: 0, y: 0, z: 0, radius }, `radius ${radius}`);
  }
});

test("a button next to the ring on the ground outside finds it too", () => {
  assert.equal(findRing(world({ radius: 6 }), 7, 0, 1)?.radius, 6);
});

test("a few gaps are fine, a ring that is mostly gone is not", () => {
  assert.ok(findRing(world({ skip: (n) => n % 12 === 0 }), 6, 1, 0), "one block in 12 missing");
  assert.equal(findRing(world({ skip: (n) => n % 2 === 0 }), 6, 1, 0), undefined, "half missing");
});

test("a ring needs its gold block, sandstone, and the right size", () => {
  const noGold = (x, y, z) => (x === 0 && y === 0 && z === 0 ? "minecraft:stone" : world()(x, y, z));
  assert.equal(findRing(noGold, 6, 1, 0), undefined);
  assert.equal(findRing(world({ block: "minecraft:stone" }), 6, 1, 0), undefined);
  assert.equal(findRing(world({ radius: MIN_RADIUS - 1 }), MIN_RADIUS - 1, 1, 0), undefined, "too small");
  assert.equal(findRing(world({ radius: MAX_RADIUS + 1 }), MAX_RADIUS + 1, 1, 0), undefined, "too big");
});

test("a button far from the ring doesn't start it, and a ring on another level isn't found", () => {
  assert.equal(findRing(world(), 20, 1, 0), undefined);
  assert.equal(findRing(world({ y: 5 }), 6, 1, 0), undefined);
  assert.ok(findRing(world({ y: 5 }), 6, 6, 0), "the button is one above the ring");
});

test("finding a ring never looks at more blocks than the budget", () => {
  let lookups = 0;
  const w = world({ radius: MAX_RADIUS });
  findRing((x, y, z) => (lookups++, w(x, y, z)), MAX_RADIUS, 1, 0);
  findRing((x, y, z) => (lookups++, "minecraft:gold_block"), 0, 0, 0);
  assert.ok(lookups < 6000, `${lookups} lookups`);
});

test("inside means within the wall and near the ring's level", () => {
  const ring = { x: 0, y: 64, z: 0, radius: 6 };
  assert.ok(isInside(ring, { x: 0.5, y: 65, z: 0.5 }));
  assert.ok(isInside(ring, { x: 3.5, y: 65, z: 3.5 }));
  assert.ok(!isInside(ring, { x: 8, y: 65, z: 0.5 }));
  assert.ok(isInside(ring, { x: 7, y: 65, z: 0.5 }, 1), "margin");
  assert.ok(!isInside(ring, { x: 0.5, y: 90, z: 0.5 }), "far above");
  const back = backInside(ring, { x: 12.5, y: 65, z: 0.5 });
  assert.ok(isInside(ring, back, -1) && back.x > 0, "sent back on the same side");
});

test("the crowd stands outside the ring, evenly, facing the middle, within the cap", () => {
  for (let radius = MIN_RADIUS; radius <= MAX_RADIUS; radius++) {
    const ring = { x: 10, y: 0, z: 10, radius };
    const spots = crowdSpots(ring);
    assert.equal(spots.length, crowdSize(ring));
    assert.ok(spots.length >= MIN_CROWD && spots.length <= MAX_CROWD);
    for (const s of spots) {
      const d = Math.hypot(s.x - middleOf(ring).x, s.z - middleOf(ring).z);
      assert.ok(d > radius + 1, "outside the ring's blocks");
      // yaw 0 faces +z: facing the middle means moving along the yaw direction gets closer
      const step = { x: s.x + -Math.sin((s.yaw * Math.PI) / 180), z: s.z + Math.cos((s.yaw * Math.PI) / 180) };
      assert.ok(Math.hypot(step.x - middleOf(ring).x, step.z - middleOf(ring).z) < d, "faces the middle");
    }
  }
});

test("a knocked-out fighter goes beyond the crowd, on the side they were on", () => {
  const ring = { x: 0, y: 0, z: 0, radius: 6 };
  const spot = exitSpot(ring, { x: -3, z: 0.5 });
  assert.ok(spot.x < -ring.radius - 2);
  assert.ok(Math.hypot(spot.x - 0.5, spot.z - 0.5) > ring.radius + 2);
  assert.ok(Number.isFinite(exitSpot(ring, { x: 0.5, z: 0.5 }).x), "standing right in the middle");
});
