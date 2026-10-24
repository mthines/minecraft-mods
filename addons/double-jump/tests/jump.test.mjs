import { test } from "node:test";
import assert from "node:assert/strict";
import { fresh, glide, step } from "../behavior_pack/scripts/jump.js";

/** Plays ticks of input and returns the action of each. */
function play(ticks, feathers = 3) {
  let state = fresh();
  return ticks.map((input) => {
    const result = step(state, { canFly: true, feathers, falling: false, ...input });
    state = result.state;
    return result.action;
  });
}

const air = (jump, falling = false) => ({ jump, onGround: false, falling });
const ground = (jump) => ({ jump, onGround: true });
const tap = [air(true), air(false)];

test("a normal jump from the ground is normal", () => {
  assert.deepEqual(play([ground(true), air(true), air(false), air(false, true)]), ["none", "none", "none", "none"]);
});

test("pressing jump in the air flaps, one flap per feather", () => {
  const actions = play([ground(false), ...tap, ...tap, ...tap, ...tap], 3);
  assert.deepEqual(actions.filter((a) => a === "flap").length, 3, "three feathers, three flaps");
});

test("no feathers, no flaps and no gliding", () => {
  assert.deepEqual(play([...tap, air(true, true), air(true, true)], 0), ["none", "none", "none", "none"]);
});

test("holding jump while falling glides, but not while still going up", () => {
  assert.deepEqual(play([air(true), air(true), air(true, true), air(true, true), air(false, true)]), ["flap", "none", "glide", "glide", "none"]);
});

test("holding jump from a ground jump glides once falling", () => {
  assert.deepEqual(play([ground(true), air(true), air(true, true)]), ["none", "none", "glide"]);
});

test("out of flaps you can still glide", () => {
  assert.deepEqual(play([...tap, air(true, true), air(true, true)], 1), ["flap", "none", "glide", "glide"]);
});

test("landing gives the feathers back", () => {
  const actions = play([...tap, ground(false), air(false), ...tap], 1);
  assert.deepEqual(actions, ["flap", "none", "none", "none", "flap", "none"]);
});

test("not while it can't fly (creative flying, elytra, water, riding)", () => {
  let state = fresh();
  assert.equal(step(state, { jump: true, onGround: false, falling: false, feathers: 3, canFly: false }).action, "none");
});

/** Glides `ticks` ticks from `speed` and `fall`, the fall following the glide's sink, and returns where it ends up. */
function glideFor(ticks, { speed = 0, fall = 0.08, pitch = 0, steering = true, crouching = false } = {}) {
  for (let i = 0; i < ticks; i++) ({ speed, sink: fall } = glide(speed, { fall, pitch, steering, crouching }));
  return { speed, fall };
}

test("a level glide settles at a steady speed and sink", () => {
  const { speed, fall } = glideFor(200);
  assert.ok(speed > 0.35 && speed < 0.45, `speed ${speed}`);
  assert.ok(Math.abs(fall - 0.04) < 0.01, `sink ${fall}`);
});

test("falling fast into a glide turns the fall into speed, which drains back over seconds", () => {
  const after = glideFor(10, { speed: 0.1, fall: 1.2 });
  assert.ok(after.speed > 0.7, `caught a fast fall at only ${after.speed}`);
  assert.ok(after.fall < 0.25, `still falling ${after.fall} a tick`);
  assert.ok(glideFor(40, { speed: 0.1, fall: 1.2 }).speed > 0.5, "the speed should last a couple of seconds");
  assert.ok(glideFor(400, { speed: 0.1, fall: 1.2 }).speed < 0.45, "and settle back to cruising");
});

test("the catch is smooth: the fall slows over a few ticks, not at once", () => {
  assert.ok(glide(0.4, { fall: 1, pitch: 0, steering: true }).sink > 0.7);
});

test("diving goes faster and sinks faster; looking up floats slower but never climbs", () => {
  const level = glideFor(60, { speed: 0.4 });
  const dive = glideFor(60, { speed: 0.4, pitch: 1 });
  const up = glideFor(60, { speed: 0.4, pitch: -1 });
  assert.ok(dive.speed > level.speed + 0.3 && dive.fall > level.fall * 3, `dive ${JSON.stringify(dive)}`);
  assert.ok(up.speed < level.speed && up.fall < level.fall && up.fall > 0.02, `up ${JSON.stringify(up)}`);
});

test("without crouching, only looking straight down dives", () => {
  assert.deepEqual(glideFor(60, { speed: 0.4, pitch: 0.9 }), glideFor(60, { speed: 0.4 }), "looking well down still floats");
  assert.ok(glideFor(60, { speed: 0.4, pitch: 1 }).fall > 0.5, "straight down dives");
});

test("crouching dives, steeper the further down you look", () => {
  const level = glideFor(60, { speed: 0.4 }).fall;
  const crouched = glideFor(60, { speed: 0.4, crouching: true }).fall;
  const crouchedDown = glideFor(60, { speed: 0.4, pitch: 0.5, crouching: true }).fall;
  assert.ok(crouched > level * 3 && crouchedDown > crouched * 1.5, `level ${level}, crouched ${crouched}, crouched looking down ${crouchedDown}`);
});

test("once gliding, holding jump keeps gliding even when it barely sinks", () => {
  assert.deepEqual(play([ground(true), air(true, true), air(true, false), air(false, false)]), ["none", "glide", "glide", "none"]);
});

test("pulling out of a dive swoops: the dive's fall becomes speed", () => {
  const dive = glideFor(40, { speed: 0.4, pitch: 0.7, crouching: true });
  const out = glideFor(10, { ...dive, pitch: 0 });
  assert.ok(out.speed > dive.speed - 0.05, `pulled out at ${out.speed} from ${dive.speed}`);
  assert.ok(out.fall < 0.3, `still diving ${out.fall}`);
});

test("speed is capped, and letting go of the keys coasts to a stop", () => {
  assert.ok(glideFor(300, { speed: 0.4, pitch: 1 }).speed <= 1.1);
  assert.ok(glideFor(400, { speed: 0.8, steering: false }).speed < 0.05);
});
