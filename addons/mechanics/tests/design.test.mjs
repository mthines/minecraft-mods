import assert from "node:assert/strict";
import { test } from "node:test";
import { BASES, PART_BY_KEY, PRESETS, slotsOf, allowed } from "../behavior_pack/scripts/catalog.js";
import { count, decode, dirToModel, emptyDesign, encode, normalizeSeats, pickFilledSlot, pickFreeSlot, presetDesign, toModel } from "../behavior_pack/scripts/design.js";

/** Aims from `from` at the middle of a slot of a base. */
function aimAtSlot(baseKey, i, from) {
  const slot = slotsOf(baseKey)[i];
  from ??= { x: slot.x + 0.1, y: 1.7, z: slot.z + 5 };
  const to = { x: slot.x, y: BASES[baseKey].deckTop + 0.5, z: slot.z };
  const d = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
  const len = Math.hypot(d.x, d.y, d.z);
  return { origin: from, dir: { x: d.x / len, y: d.y / len, z: d.z / len } };
}

test("a design survives encoding, for every preset", () => {
  for (const name of Object.keys(PRESETS)) {
    const design = presetDesign(name);
    assert.deepEqual(decode(encode(design)), design);
  }
});

test("a line that is not a design is refused", () => {
  assert.equal(decode("nonsense"), undefined);
  assert.equal(decode("2|racer|0,0,0,0,0,0,0,0,0|0"), undefined);
  assert.equal(decode("1|plane|0|0"), undefined);
  assert.equal(decode("1|racer|0,0,0|0"), undefined);
  assert.equal(decode("1|racer|5,0,0,0,0,0,0,0,0|0"), undefined, "a wing can't sit on the deck");
  assert.equal(decode(undefined), undefined);
});

test("every preset only puts parts where they fit", () => {
  for (const name of Object.keys(PRESETS)) {
    const design = presetDesign(name);
    slotsOf(design.base).forEach((slot, i) => {
      const id = design.slots[i];
      if (id) assert.ok(allowed(slot, Object.values(PART_BY_KEY).find((p) => p.id === id).key), `${name} slot ${i}`);
    });
  }
});

test("a body block aimed at the back fills a back slot, not a front one", () => {
  const design = emptyDesign("racer");
  const back = pickFreeSlot(design, "body", aimAtSlot("racer", 4, { x: 0.2, y: 1.7, z: 6 }));
  assert.ok([4, 5].includes(back), `slot ${back}`);
  const front = pickFreeSlot(design, "body", aimAtSlot("racer", 1, { x: 0.2, y: 1.7, z: -6 }));
  assert.ok([0, 1].includes(front), `slot ${front}`);
});

test("a filled slot isn't picked again, and the wrench finds the part you aim at", () => {
  const design = emptyDesign("racer");
  design.slots[4] = PART_BY_KEY.body.id;
  assert.notEqual(pickFreeSlot(design, "body", aimAtSlot("racer", 4)), 4);
  assert.equal(pickFilledSlot(design, aimAtSlot("racer", 4)), 4);
  assert.equal(pickFilledSlot(design, aimAtSlot("racer", 1, { x: -0.5, y: 3, z: -1.2 })), -1, "nothing is there");
});

test("a part only goes in a slot it fits: wings on the sides, seats in the front", () => {
  const design = emptyDesign("racer");
  const wing = pickFreeSlot(design, "wing", aimAtSlot("racer", 6, { x: 5, y: 1.5, z: 3 }));
  assert.equal(wing, 6);
  assert.equal(pickFreeSlot(design, "wing", aimAtSlot("racer", 4, { x: 0.5, y: 3, z: 1.05 })), -1, "no wing on the deck");
  assert.equal(pickFreeSlot(design, "seat", aimAtSlot("racer", 4)), 0, "a seat goes in the first seat slot wherever you aim");
});

test("seats fill in order, up to the base's maximum", () => {
  const design = emptyDesign("farm");
  assert.equal(pickFreeSlot(design, "seat", aimAtSlot("farm", 0)), 2);
  design.slots[2] = PART_BY_KEY.seat.id;
  assert.equal(pickFreeSlot(design, "seat", aimAtSlot("farm", 0)), -1, "the tractor has one seat");
});

test("taking a seat off moves the other seats forward", () => {
  const design = emptyDesign("racer");
  design.slots[1] = PART_BY_KEY.seat.id;
  const { seats } = normalizeSeats(design);
  assert.equal(seats, 1);
  assert.equal(design.slots[0], PART_BY_KEY.seat.id);
  assert.equal(design.slots[1], 0);
  assert.equal(count(design, "seat"), 1);
});

test("model space: ahead is the front (-z), and left is +x", () => {
  const at = { x: 10, y: 0, z: 10 };
  const ahead = toModel({ x: 10, y: 0, z: 13 }, at, 0); // heading 0 faces south (+z)
  assert.ok(ahead.z < -2.9, `ahead ${JSON.stringify(ahead)}`);
  const left = toModel({ x: 12, y: 0, z: 10 }, at, 0); // facing south, east is on the left
  assert.ok(left.x > 1.9, `left ${JSON.stringify(left)}`);
  const west = toModel({ x: 7, y: 0, z: 10 }, at, 90); // heading 90 faces west: ahead
  assert.ok(west.z < -2.9, `west ${JSON.stringify(west)}`);
  assert.ok(Math.abs(dirToModel({ x: 0, y: 0, z: 1 }, 0).z + 1) < 1e-9);
});

test("a seat isn't put where another part stands, since the rider would sit inside it", () => {
  const design = emptyDesign("racer");
  design.slots[0] = PART_BY_KEY.body.id;
  assert.equal(pickFreeSlot(design, "seat", aimAtSlot("racer", 1)), -1);
  design.slots[0] = 0;
  assert.equal(pickFreeSlot(design, "seat", aimAtSlot("racer", 1)), 0);
  design.slots[0] = PART_BY_KEY.seat.id;
  design.slots[1] = PART_BY_KEY.glass.id;
  assert.equal(pickFreeSlot(design, "seat", aimAtSlot("racer", 1)), -1, "the second seat's spot has a window on it");
});
