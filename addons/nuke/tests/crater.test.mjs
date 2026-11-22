import test from "node:test";
import assert from "node:assert/strict";
import { buildColumns, depths, loadedReach } from "../behavior_pack/scripts/crater.js";

const HUGE = { radius: 120, up: 48, down: 60 };

test("the columns are a full circle, nearest the middle first", () => {
  const { dx, dz } = buildColumns(24);
  let count = 0;
  for (let x = -24; x <= 24; x++) for (let z = -24; z <= 24; z++) if (Math.hypot(x, z) <= 24) count++;
  assert.equal(dx.length, count);
  assert.equal(dx[0], 0);
  assert.equal(dz[0], 0);
  let last = 0;
  for (let i = 0; i < dx.length; i++) {
    const flat = Math.hypot(dx[i], dz[i]);
    assert.ok(Math.floor(flat) >= Math.floor(last), "a column came out before one nearer the middle");
    last = flat;
  }
});

test("the floor is a round bowl: deepest in the middle, shallower and shallower towards the edge, not flat", () => {
  const depth = (flat) => depths(HUGE, 120, flat).down;
  assert.equal(depth(0), 60);
  assert.equal(depth(120), 0);
  const profile = [0, 20, 40, 60, 80, 100, 115].map(depth);
  for (let i = 1; i < profile.length; i++) assert.ok(profile[i] < profile[i - 1], `the floor should keep rising towards the edge: ${profile}`);
  assert.ok(depth(104) < 30, "the old flat floor went all the way out to 104 blocks at full depth");
});

test("a plain nuke is a ball", () => {
  const nuke = { radius: 24, up: 24, down: 24 };
  assert.deepEqual(depths(nuke, 24, 0), { up: 24, down: 24 });
  assert.equal(depths(nuke, 24, 24).down, 0);
});

test("a crater shrunk to fit keeps its shape, scaled down", () => {
  const full = depths(HUGE, 120, 0).down;
  const half = depths(HUGE, 60, 0).down;
  assert.equal(half, full / 2);
  assert.equal(depths(HUGE, 60, 60).down, 0);
});

test("the reach is how far the loaded world goes in the shortest direction, so the crater never has a straight wall", () => {
  const square = (half) => (x, z) => Math.abs(x) <= half && Math.abs(z) <= half; // chunks load as a square around the players
  assert.equal(loadedReach(() => true, 120), 120);
  const reach = loadedReach(square(64), 120);
  assert.ok(reach <= 64 && reach >= 48, `reach ${reach} should be a little under the nearest edge of 64`);
  // off-centre: the nearest edge decides
  const lopsided = (x, z) => x > -200 && x < 20 && Math.abs(z) < 200;
  assert.ok(loadedReach(lopsided, 120) <= 20);
  assert.ok(loadedReach(() => false, 120) >= 8, "never nothing at all");
});
