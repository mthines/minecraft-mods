import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_DESIGNS, costOf, lore, recall, remember } from "../behavior_pack/scripts/blueprint.js";
import { PART_BY_ID, PRESETS } from "../behavior_pack/scripts/catalog.js";
import { decode, emptyDesign, encode, presetDesign } from "../behavior_pack/scripts/design.js";

test("a saved design builds the same parts in the same slots", () => {
  const design = presetDesign("truck");
  const again = decode(encode(design));
  assert.deepEqual(again.slots, design.slots);
  assert.equal(again.paint, design.paint);
  assert.equal(again.base, design.base);
});

test("building from a blueprint costs nothing for everybody", () => {
  for (const name of Object.keys(PRESETS)) assert.deepEqual(costOf(presetDesign(name)), []);
});

test("the registry keeps a design once, newest last, and no more than the cap", () => {
  let registry = [];
  registry = remember(registry, presetDesign("jet"));
  registry = remember(registry, presetDesign("truck"));
  registry = remember(registry, presetDesign("jet"));
  assert.equal(registry.length, 2);
  assert.equal(registry.at(-1), encode(presetDesign("jet")));
  for (let paint = 0; paint < 16; paint++) {
    for (const base of ["racer", "hauler"]) registry = remember(registry, { ...emptyDesign(base), paint });
  }
  assert.equal(registry.length, MAX_DESIGNS);
});

test("an unreadable registry is an empty one, and bad lines are skipped", () => {
  assert.deepEqual(recall(undefined), []);
  assert.deepEqual(recall("not json"), []);
  assert.deepEqual(recall(JSON.stringify(["nonsense", encode(presetDesign("tractor"))])), [encode(presetDesign("tractor"))]);
});

test("a packed vehicle lists its parts", () => {
  const lines = lore(presetDesign("sports-car"), (id) => PART_BY_ID[id].name);
  assert.ok(lines.some((line) => line.includes("2 × Seat")), lines.join(" | "));
});
