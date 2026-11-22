import assert from "node:assert/strict";
import { test } from "node:test";
import { BASES, PART_BY_KEY, PRESETS, allowed, seatSets, seatSlotsOf, slotIndex, slotsOf } from "../behavior_pack/scripts/catalog.js";
import { PROPERTY_MAX, SLOTS_PER_PROPERTY, count, decode, dirToModel, emptyDesign, encode, pack, pickFilledSlot, pickFreeSlot, presetDesign, propertiesOf, seatsOf, toModel, unpack } from "../behavior_pack/scripts/design.js";

/** Aims from `from` (default: from the side and a little above) at the middle of a slot of a base. */
function aimAtSlot(baseKey, i, from) {
  const slot = slotsOf(baseKey)[i];
  from ??= { x: slot.x + 0.1, y: 1.7, z: slot.z + 5 };
  const to = { x: slot.x, y: BASES[baseKey].deckTop + slot.y + slot.cell / 2, z: slot.z };
  const d = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
  const len = Math.hypot(d.x, d.y, d.z);
  return { origin: from, dir: { x: d.x / len, y: d.y / len, z: d.z / len } };
}
const cell = slotIndex;
/** Aims straight down at a slot, so only the cell under the crosshair is near the aim. */
const aimDown = (baseKey, i) => aimAtSlot(baseKey, i, { x: slotsOf(baseKey)[i].x, y: 4, z: slotsOf(baseKey)[i].z + 0.05 });
const side = (base, n) => slotsOf(base).findIndex((slot) => slot.kind === "side") + n;

test("a design survives encoding, for every preset", () => {
  for (const name of Object.keys(PRESETS)) {
    const design = presetDesign(name);
    assert.deepEqual(decode(encode(design)), design);
  }
});

test("a line that is not a design is refused", () => {
  const racer = emptyDesign("racer");
  assert.equal(decode("nonsense"), undefined);
  assert.equal(decode(encode(racer).replace("2|", "1|")), undefined, "the old version's slots mean something else");
  assert.equal(decode("2|plane|0|0"), undefined);
  assert.equal(decode("2|racer|0,0,0|0"), undefined);
  const wingOnDeck = emptyDesign("racer");
  wingOnDeck.slots[0] = PART_BY_KEY.wing.id;
  assert.equal(decode(encode(wingOnDeck)), undefined, "a wing can't sit on the deck");
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

test("slots pack into entity properties and come back, and every property stays in range", () => {
  for (const name of Object.keys(PRESETS)) {
    const design = presetDesign(name);
    const values = pack(design.slots);
    assert.equal(values.length, propertiesOf(design.base));
    assert.ok(values.every((v) => Number.isInteger(v) && v >= 0 && v <= PROPERTY_MAX), name);
    assert.deepEqual(unpack(values, design.slots.length), design.slots);
  }
  assert.ok(propertiesOf("racer") + 1 <= 32, "an entity has room for 32 properties");
  assert.equal(SLOTS_PER_PROPERTY, 5);
});

test("a body block aimed at the back fills a back cell, not a front one", () => {
  const design = emptyDesign("racer");
  const back = slotsOf("racer")[pickFreeSlot(design, "body", aimAtSlot("racer", cell("racer", 0, 1, 4), { x: 0.2, y: 1.7, z: 6 }))];
  assert.ok(back.row >= 4, JSON.stringify(back));
  const front = slotsOf("racer")[pickFreeSlot(design, "body", aimAtSlot("racer", cell("racer", 0, 1, 1), { x: 0.2, y: 1.7, z: -6 }))];
  assert.ok(front.row <= 1, JSON.stringify(front));
});

test("a filled cell isn't picked again, and the wrench finds the part you aim at", () => {
  const design = emptyDesign("racer");
  const i = cell("racer", 0, 1, 4);
  design.slots[i] = PART_BY_KEY.body.id;
  assert.notEqual(pickFreeSlot(design, "body", aimAtSlot("racer", i)), i);
  assert.equal(pickFilledSlot(design, aimAtSlot("racer", i)), i);
  assert.equal(pickFilledSlot(design, aimAtSlot("racer", cell("racer", 0, 1, 1), { x: -0.5, y: 3, z: -1.2 })), -1, "nothing is there");
});

test("parts stack: a cell above the deck needs a part next to it", () => {
  const design = emptyDesign("racer");
  const above = cell("racer", 1, 1, 3);
  const aim = aimAtSlot("racer", above, { x: 0.25, y: 1.6, z: 5 });
  const bare = pickFreeSlot(design, "body", aim);
  assert.equal(slotsOf("racer")[bare].layer, 0, "with nothing underneath, it goes on the deck");
  design.slots[cell("racer", 0, 1, 3)] = PART_BY_KEY.body.id;
  assert.equal(pickFreeSlot(design, "body", aimAtSlot("racer", above, { x: 0.25, y: 1.6, z: 5 })), above, "on top of the part it goes up a layer");
  assert.equal(pickFilledSlot(design, aimAtSlot("racer", cell("racer", 0, 1, 3))), cell("racer", 0, 1, 3));
});

test("a part only goes in a slot it fits: wings on the sides, seats on seat spots", () => {
  const design = emptyDesign("racer");
  const wing = pickFreeSlot(design, "wing", aimAtSlot("racer", side("racer", 0), { x: 5, y: 1.5, z: 3 }));
  assert.equal(wing, side("racer", 0));
  assert.equal(pickFreeSlot(design, "wing", aimAtSlot("racer", cell("racer", 0, 1, 4), { x: 0.5, y: 3, z: 1.05 })), -1, "no wing on the deck");
  assert.equal(pickFreeSlot(design, "seat", aimAtSlot("racer", cell("racer", 0, 1, 4))), -1, "the middle of the deck is not a seat spot");
});

test("a seat goes where you aim, on any seat spot", () => {
  const spots = seatSlotsOf("racer");
  assert.ok(spots.length >= 4);
  for (const i of spots) assert.equal(pickFreeSlot(emptyDesign("racer"), "seat", aimDown("racer", i)), i);
});

test("seats keep apart, and there are no more than the base takes", () => {
  const design = emptyDesign("racer");
  const first = cell("racer", 0, 0, 1);
  design.slots[first] = PART_BY_KEY.seat.id;
  assert.equal(pickFreeSlot(design, "seat", aimDown("racer", cell("racer", 0, 0, 2))), -1, "a seat right behind it is too close");
  const second = cell("racer", 0, 3, 1);
  assert.equal(pickFreeSlot(design, "seat", aimDown("racer", second)), second);
  design.slots[second] = PART_BY_KEY.seat.id;
  assert.equal(pickFreeSlot(design, "seat", aimDown("racer", cell("racer", 0, 3, 3))), -1, "the racer has two seats");
  const farm = emptyDesign("farm");
  farm.slots[cell("farm", 0, 1, 2)] = PART_BY_KEY.seat.id;
  assert.equal(pickFreeSlot(farm, "seat", aimDown("farm", cell("farm", 0, 2, 3))), -1, "the tractor has one seat");
});

test("the seats on a vehicle are named, so the vehicle can swap its riders' seats", () => {
  const design = emptyDesign("racer");
  assert.deepEqual(seatsOf(design), { slots: [], key: "none" });
  design.slots[cell("racer", 0, 3, 1)] = PART_BY_KEY.seat.id;
  design.slots[cell("racer", 0, 0, 1)] = PART_BY_KEY.seat.id;
  const { slots, key } = seatsOf(design);
  assert.deepEqual(slots, [...slots].sort((a, b) => a - b), "front to back, left to right: the first is the driver's");
  assert.equal(count(design, "seat"), 2);
  assert.ok(seatSets("racer").some((set) => set.join("_") === key), "an entity group exists for every choice of seats");
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
  const spot = cell("racer", 0, 0, 1);
  design.slots[spot] = PART_BY_KEY.body.id;
  assert.notEqual(pickFreeSlot(design, "seat", aimDown("racer", spot)), spot, "it goes on another seat spot, never into the part");
});
