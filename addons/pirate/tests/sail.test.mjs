import { test } from "node:test";
import assert from "node:assert/strict";
import { BACK_SPEED, TOP_SPEED, TURN_DEGREES, forward, sail } from "../behavior_pack/scripts/sail.js";

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} is not ${b}`);
const still = { x: 0, z: 0 };

test("heading 0 sails south (+z) and 90 sails west (-x), as Minecraft turns things", () => {
  near(forward(0).z, 1);
  near(forward(0).x, 0);
  near(forward(90).x, -1);
  near(forward(90).z, 0);
});

test("W pushes the ship forward, and it speeds up until it reaches top speed", () => {
  let velocity = still;
  for (let i = 0; i < 200; i++) {
    const { push } = sail(0, { x: 0, y: 1 }, velocity);
    velocity = { x: velocity.x + push.x, z: velocity.z + push.z };
  }
  near(Math.round(velocity.z * 1000) / 1000, TOP_SPEED);
  near(velocity.x, 0);
});

test("S backs up, slower than forward", () => {
  const { push } = sail(0, { x: 0, y: -1 }, still);
  assert.ok(push.z < 0);
  assert.ok(Math.abs(push.z) < Math.abs(sail(0, { x: 0, y: 1 }, still).push.z));
  assert.ok(BACK_SPEED < TOP_SPEED);
});

test("no keys: the ship slows down instead of stopping dead", () => {
  const { push } = sail(0, { x: 0, y: 0 }, { x: 0, z: TOP_SPEED });
  assert.ok(push.z < 0, "it should slow down");
  assert.ok(TOP_SPEED + push.z > 0, "but still drift forward for a moment");
});

test("A turns left and D turns right, and the heading stays between 0 and 360", () => {
  assert.equal(sail(0, { x: 1, y: 1 }, still).heading, 360 - TURN_DEGREES);
  assert.equal(sail(0, { x: -1, y: 1 }, still).heading, TURN_DEGREES);
  assert.equal(sail(359, { x: -1, y: 0 }, still).heading, (359 + TURN_DEGREES) % 360);
});
