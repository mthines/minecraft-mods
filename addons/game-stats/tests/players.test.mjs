import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_LEVEL_UPS_AT_ONCE,
  TRAVEL_STEP_BLOCKS,
  createOdometer,
  dimensionName,
  isSnack,
  levelsReached,
  travelMode,
} from "../behavior_pack/scripts/players.js";

const still = { isGliding: false, isFlying: false, isSwimming: false, isInWater: false, isSprinting: false };

test("names the three dimensions simply", () => {
  assert.equal(dimensionName("minecraft:overworld"), "overworld");
  assert.equal(dimensionName("minecraft:nether"), "nether");
  assert.equal(dimensionName("minecraft:the_nether"), "nether");
  assert.equal(dimensionName("minecraft:the_end"), "end");
  assert.equal(dimensionName("family:candy_land"), "family:candy_land");
});

test("riding wins over everything, then gliding, flying, swimming, sprinting", () => {
  assert.equal(travelMode({ ...still, mount: "horse", isInWater: true }), "riding");
  assert.equal(travelMode({ ...still, isGliding: true, isSprinting: true }), "gliding");
  assert.equal(travelMode({ ...still, isFlying: true }), "flying");
  assert.equal(travelMode({ ...still, isInWater: true }), "swimming");
  assert.equal(travelMode({ ...still, isSwimming: true, isSprinting: true }), "swimming");
  assert.equal(travelMode({ ...still, isSprinting: true }), "sprinting");
  assert.equal(travelMode(still), "walking");
});

test("reports one travel step per TRAVEL_STEP_BLOCKS, carrying the rest over", () => {
  const odometer = createOdometer();
  assert.equal(odometer.move("steve", "overworld", { x: 0, z: 0 }, "walking"), 0); // first sighting
  let steps = 0;
  for (let x = 4; x <= 400; x += 4) steps += odometer.move("steve", "overworld", { x, z: 0 }, "walking");
  assert.equal(steps, 400 / TRAVEL_STEP_BLOCKS);
  assert.equal(odometer.move("steve", "overworld", { x: 450, z: 0 }, "walking"), 0); // 50 carried over
  assert.equal(odometer.move("steve", "overworld", { x: 500, z: 0 }, "walking"), 1);
});

test("counts sideways distance only, so trampoline bounces aren't travel", () => {
  const odometer = createOdometer();
  odometer.move("alex", "overworld", { x: 0, z: 0 }, "walking");
  assert.equal(odometer.move("alex", "overworld", { x: 60, z: 80 }, "walking"), 1); // 3-4-5 triangle: 100 blocks
});

test("keeps travel modes apart", () => {
  const odometer = createOdometer();
  odometer.move("alex", "overworld", { x: 0, z: 0 }, "walking");
  assert.equal(odometer.move("alex", "overworld", { x: 60, z: 0 }, "walking"), 0);
  assert.equal(odometer.move("alex", "overworld", { x: 120, z: 0 }, "riding"), 0);
  assert.equal(odometer.move("alex", "overworld", { x: 160, z: 0 }, "walking"), 1);
  assert.equal(odometer.move("alex", "overworld", { x: 200, z: 0 }, "riding"), 1);
});

test("ignores teleports, portals, and respawns", () => {
  const odometer = createOdometer();
  odometer.move("steve", "overworld", { x: 0, z: 0 }, "walking");
  assert.equal(odometer.move("steve", "overworld", { x: 5000, z: 0 }, "walking"), 0); // /tp
  assert.equal(odometer.move("steve", "nether", { x: 5050, z: 0 }, "walking"), 0); // portal
  odometer.jumped("steve"); // respawn
  assert.equal(odometer.move("steve", "nether", { x: 0, z: 0 }, "walking"), 0);
  assert.equal(odometer.move("steve", "nether", { x: 99, z: 0 }, "walking"), 0);
  assert.equal(odometer.move("steve", "nether", { x: 100, z: 0 }, "walking"), 1);
});

test("forgetting a player drops their unfinished distance", () => {
  const odometer = createOdometer();
  odometer.move("steve", "overworld", { x: 0, z: 0 }, "walking");
  odometer.move("steve", "overworld", { x: 90, z: 0 }, "walking");
  odometer.forget("steve");
  odometer.move("steve", "overworld", { x: 90, z: 0 }, "walking");
  assert.equal(odometer.move("steve", "overworld", { x: 100, z: 0 }, "walking"), 0);
});

test("level-ups: every level reached, none on the first look or when going down", () => {
  assert.deepEqual(levelsReached(undefined, 7), []);
  assert.deepEqual(levelsReached(4, 4), []);
  assert.deepEqual(levelsReached(4, 5), [5]);
  assert.deepEqual(levelsReached(4, 6), [5, 6]);
  assert.deepEqual(levelsReached(30, 2), []);
});

test("level-ups: a huge /xp jump reports only the last few levels", () => {
  const reached = levelsReached(0, 500);
  assert.equal(reached.length, MAX_LEVEL_UPS_AT_ONCE);
  assert.equal(reached.at(-1), 500);
});

test("snacks are food or drinks, not crossbows", () => {
  assert.equal(isSnack("minecraft:cooked_beef", true), true);
  assert.equal(isSnack("family:rainbow_cookie", true), true);
  assert.equal(isSnack("minecraft:potion", false), true);
  assert.equal(isSnack("minecraft:milk_bucket", false), true);
  assert.equal(isSnack("minecraft:crossbow", false), false);
});
