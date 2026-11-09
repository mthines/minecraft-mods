// Search and load: every item is a kit called item:<name>, found by typing part of its name.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ITEMS, itemCount, itemOfKit, searchItems } from "./items.mjs";
import { kitItems } from "./kits.mjs";

test("every item Minecraft has can be found and given", () => {
  assert.ok(ITEMS.length > 1000);
  for (const name of ["oak_planks", "diamond_sword", "bedrock", "creeper_spawn_egg"]) assert.deepEqual(kitItems(`item:${name}`)?.[0]?.[0], `minecraft:${name}`);
});

test("a made-up item is no kit", () => {
  assert.equal(itemOfKit("item:not_a_thing"), undefined);
  assert.equal(kitItems("item:not_a_thing"), undefined);
  assert.equal(itemOfKit("oak_planks"), undefined);
});

test("tools come as one, blocks as a stack", () => {
  assert.equal(itemCount("diamond_sword"), 1);
  assert.equal(itemCount("oak_boat"), 1);
  assert.equal(itemCount("oak_planks"), 64);
});

test("searching: words in any order, spaces for underscores, best match first", () => {
  assert.deepEqual(searchItems("stairs oak").items.slice(0, 1), ["oak_stairs"]);
  assert.equal(searchItems("oak stairs").items[0], "oak_stairs");
  assert.deepEqual(searchItems("  "), { items: [], total: 0 });
  const many = searchItems("a", 5);
  assert.equal(many.items.length, 5);
  assert.ok(many.total > 5);
});
