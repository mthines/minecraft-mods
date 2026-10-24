import { test } from "node:test";
import assert from "node:assert/strict";
import { blockAt, box, checkPlan, facing } from "../behavior_pack/scripts/plan.js";

test("a good plan passes, with defaults filled in", () => {
  const result = checkPlan({ actions: [{ do: "dig", at: { forward: 2 } }, { do: "say", text: "Done!" }] });
  assert.equal(result.ok, true);
  assert.deepEqual(result.plan, {
    npc: "new",
    actions: [{ do: "dig", at: { forward: 2, right: 0, up: 0 }, width: 1, length: 1, depth: 1 }, { do: "say", text: "Done!" }],
  });
});

test("unknown actions, bad blocks, and huge sizes are refused", () => {
  const result = checkPlan({ npc: "Bob", actions: [{ do: "fly" }, { do: "build", block: "cobble stone", width: 500 }] });
  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 3, result.errors.join("\n"));
});

test("an empty plan is refused", () => {
  assert.equal(checkPlan({ actions: [] }).ok, false);
  assert.equal(checkPlan("dig a hole").ok, false);
});

test("facing snaps to the nearest of north, east, south, west", () => {
  assert.deepEqual(facing({ x: 0.9, z: 0.3 }), { x: 1, z: 0 });
  assert.deepEqual(facing({ x: -0.2, z: -0.95 }), { x: 0, z: -1 });
});

test("forward and right turn with the player: facing south (+z), right is west (-x)", () => {
  const feet = { x: 10.5, y: 64, z: 20.5 };
  assert.deepEqual(blockAt(feet, { x: 0, z: 1 }, { forward: 2, right: 1, up: 0 }), { x: 9, y: 64, z: 22 });
  assert.deepEqual(blockAt(feet, { x: 1, z: 0 }, { forward: 2, right: 1, up: -1 }), { x: 12, y: 63, z: 21 });
});

test("a 3 by 3 hole two deep is 18 blocks, centered, going down", () => {
  const blocks = box({ x: 0, y: 64, z: 0 }, { x: 0, z: 1 }, { forward: 3, right: 0, up: -1 }, 3, 3, 2, -1);
  assert.equal(blocks.length, 18);
  assert.deepEqual([...new Set(blocks.map((b) => b.y))], [63, 62]);
  assert.deepEqual([...new Set(blocks.map((b) => b.z))].sort(), [2, 3, 4]);
  assert.equal(blocks.filter((b) => !b.edge).length, 2, "one middle block per layer");
});
