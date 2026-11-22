import assert from "node:assert/strict";
import { test } from "node:test";
import { PART_BY_KEY } from "../behavior_pack/scripts/catalog.js";
import { emptyDesign, presetDesign } from "../behavior_pack/scripts/design.js";
import { flightHint, flightOf, hoverStep, planeStep, statsOf, CLIMB, SINK } from "../behavior_pack/scripts/drive.js";

const withParts = (base, slots) => {
  const design = emptyDesign(base);
  for (const [i, key] of Object.entries(slots)) design.slots[i] = PART_BY_KEY[key].id;
  return design;
};

test("a truck with one thruster stays on the ground and says it needs more", () => {
  const truck = withParts("hauler", { 0: "seat", 3: "thruster" });
  const flight = flightOf(truck);
  assert.equal(flight.mode, "ground");
  assert.ok(flight.missing >= 1);
  assert.match(flightHint(flight), /thruster/);
});

test("a racer with enough thrusters hovers, and holds its height for 2 seconds", () => {
  const racer = withParts("racer", { 0: "seat", 2: "thruster", 3: "thruster" });
  const flight = flightOf(racer);
  assert.equal(flight.mode, "hover");
  let y = 0;
  let state = { heading: 0, speed: 0 };
  for (let i = 0; i < 40; i++) {
    const next = hoverStep(state, { x: 0, y: 0 }, false, flight, statsOf(racer));
    state = next;
    y += next.vy;
  }
  assert.ok(y > -1.5 && y < 0, `it sank ${y.toFixed(2)} blocks in 2 seconds`);
  assert.equal(hoverStep(state, { x: 0, y: 0 }, true, flight, statsOf(racer)).vy, CLIMB);
  assert.equal(hoverStep(state, { x: 0, y: 0 }, false, flight, statsOf(racer)).vy, -SINK);
});

test("with a pair of wings it is a plane, and flies where you look", () => {
  const jet = presetDesign("jet");
  const flight = flightOf(jet);
  assert.equal(flight.mode, "plane");
  let speed = 0;
  let position = { x: 0, y: 0, z: 0 };
  const look = { x: 0, y: 0.5, z: 0.866 }; // ahead and up
  for (let i = 0; i < 30; i++) {
    const next = planeStep(speed, 1, look, flight);
    speed = next.speed;
    position = { x: position.x + next.velocity.x, y: position.y + next.velocity.y, z: position.z + next.velocity.z };
  }
  assert.ok(position.z > 5 && position.y > 3 && position.x === 0, JSON.stringify(position));
});

test("one wing is not a pair: it hovers", () => {
  const design = withParts("racer", { 2: "thruster", 3: "thruster", 6: "wing" });
  assert.equal(flightOf(design).mode, "hover");
});

test("W faster, S slower down to hovering", () => {
  const flight = flightOf(presetDesign("jet"));
  let speed = flight.air;
  for (let i = 0; i < 100; i++) speed = planeStep(speed, -1, { x: 0, y: 0, z: 1 }, flight).speed;
  assert.equal(speed, 0);
});

test("a full cargo bed is heavier, so the truck needs more thrusters", () => {
  const empty = flightOf(emptyDesign("hauler"), 0).weight;
  const full = flightOf(emptyDesign("hauler"), 1).weight;
  assert.ok(full > empty);
});

test("a plain base has no thrusters, so no hint", () => {
  assert.equal(flightHint(flightOf(emptyDesign("racer"))), "");
});
