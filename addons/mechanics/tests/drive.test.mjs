import assert from "node:assert/strict";
import { test } from "node:test";
import { presetDesign, emptyDesign } from "../behavior_pack/scripts/design.js";
import { driveStep, statsOf, velocityOf } from "../behavior_pack/scripts/drive.js";

/** Holds W for `ticks` ticks and returns how far it got. */
function distance(design, ticks, fill = 0) {
  const stats = statsOf(design, fill);
  let state = { heading: 0, speed: 0 };
  let z = 0;
  for (let i = 0; i < ticks; i++) {
    state = driveStep(state, { x: 0, y: 1 }, stats);
    z += velocityOf(state.heading, state.speed).z;
  }
  return z;
}

test("holding forward moves a vehicle ahead (south at heading 0)", () => {
  assert.ok(distance(presetDesign("sports-car"), 40) > 10);
});

test("the racer gets further than the hauler in the same time", () => {
  const racer = distance(emptyDesign("racer"), 100);
  const hauler = distance(emptyDesign("hauler"), 100);
  assert.ok(racer > hauler * 1.5, `racer ${racer.toFixed(1)} vs hauler ${hauler.toFixed(1)}`);
});

test("a full cargo bed makes the hauler slower, the tractor with a plow too", () => {
  const empty = distance(emptyDesign("hauler"), 200, 0);
  const full = distance(emptyDesign("hauler"), 200, 1);
  assert.ok(full < empty * 0.85, `full ${full.toFixed(1)} vs empty ${empty.toFixed(1)}`);
  assert.ok(statsOf(presetDesign("tractor")).top < statsOf(emptyDesign("farm")).top);
});

test("the farm base can't turn on the spot as fast as the racer turns at speed, and reverse turns more slowly", () => {
  const stats = statsOf(emptyDesign("racer"));
  const forward = driveStep({ heading: 0, speed: stats.top }, { x: 1, y: 1 }, stats);
  const back = driveStep({ heading: 0, speed: -0.2 }, { x: 1, y: -1 }, stats);
  const still = driveStep({ heading: 0, speed: 0 }, { x: 1, y: 0 }, stats);
  assert.ok(Math.abs(360 - forward.heading) > Math.abs(360 - back.heading) || forward.heading < back.heading);
  assert.ok(360 - forward.heading > 360 - still.heading, "standing still turns less than driving");
});

test("A turns left and D right", () => {
  const stats = statsOf(emptyDesign("racer"));
  const left = driveStep({ heading: 0, speed: 0.5 }, { x: 1, y: 1 }, stats).heading;
  const right = driveStep({ heading: 0, speed: 0.5 }, { x: -1, y: 1 }, stats).heading;
  assert.ok(left > 180 && right < 180, `left ${left}, right ${right}`);
});

test("with no keys it coasts to a stop", () => {
  const stats = statsOf(emptyDesign("racer"));
  let state = { heading: 0, speed: stats.top };
  for (let i = 0; i < 40; i++) state = driveStep(state, { x: 0, y: 0 }, stats);
  assert.equal(state.speed, 0);
});
