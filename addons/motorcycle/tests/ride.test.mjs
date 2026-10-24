import { test } from "node:test";
import assert from "node:assert/strict";
import { SAMPLE_TICKS, createRides, kmh } from "../behavior_pack/scripts/ride.js";

const at = (x, z) => ({ x, y: 64, z });

test("speed: 1 block in one second is 3.6 km/h", () => {
  assert.equal(kmh(at(0, 0), at(1, 0), 20), 4);
  assert.equal(kmh(at(0, 0), at(3, 4), 20), 18);
  assert.equal(kmh(at(0, 0), at(0, 0), 20), 0);
});

test("a ride adds up distance and top speed, and ends when the player gets off", () => {
  const rides = createRides();
  assert.deepEqual([...rides.sample(new Map([["Kid", at(0, 0)]])).speeds], [["Kid", 0]]);
  rides.sample(new Map([["Kid", at(2, 0)]])); // 2 blocks in 4 ticks = 36 km/h
  const { speeds } = rides.sample(new Map([["Kid", at(3, 0)]]));
  assert.equal(speeds.get("Kid"), 18);
  const { ended } = rides.sample(new Map());
  assert.deepEqual(ended, [{ player: "Kid", meters: 3, topKmh: 36, seconds: Math.round((2 * SAMPLE_TICKS) / 20) }]);
  assert.deepEqual(rides.sample(new Map()).ended, []); // reported once
});

test("a teleport while riding doesn't count as distance or speed", () => {
  const rides = createRides();
  rides.sample(new Map([["Kid", at(0, 0)]]));
  rides.sample(new Map([["Kid", at(500, 0)]]));
  rides.sample(new Map([["Kid", at(501, 0)]]));
  const [ride] = rides.sample(new Map()).ended;
  assert.equal(ride.meters, 1);
  assert.equal(ride.topKmh, 18);
});

test("two riders are tracked apart", () => {
  const rides = createRides();
  rides.sample(new Map([["A", at(0, 0)], ["B", at(0, 0)]]));
  const { ended } = rides.sample(new Map([["B", at(1, 0)]]));
  assert.deepEqual(ended.map((r) => r.player), ["A"]);
});
