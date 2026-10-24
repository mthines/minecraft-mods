import { test } from "node:test";
import assert from "node:assert/strict";
import { category, shortName } from "../behavior_pack/scripts/blocks.js";

test("sorts everyday blocks into groups", () => {
  assert.equal(category("minecraft:oak_log"), "wood");
  assert.equal(category("minecraft:stripped_birch_log"), "wood");
  assert.equal(category("minecraft:crimson_stem"), "wood");
  assert.equal(category("minecraft:oak_leaves"), "leaves");
  assert.equal(category("minecraft:grass_block"), "dirt");
  assert.equal(category("minecraft:dirt"), "dirt");
  assert.equal(category("minecraft:stone"), "stone");
  assert.equal(category("minecraft:cobbled_deepslate"), "stone");
  assert.equal(category("minecraft:gravel"), "sand");
  assert.equal(category("minecraft:spruce_planks"), "planks");
  assert.equal(category("minecraft:short_grass"), "plant");
  assert.equal(category("minecraft:red_tulip"), "plant");
  assert.equal(category("minecraft:leaf_litter"), "plant");
});

test("ores win over stone, including deepslate ones", () => {
  assert.equal(category("minecraft:diamond_ore"), "ore");
  assert.equal(category("minecraft:deepslate_diamond_ore"), "ore");
  assert.equal(category("minecraft:ancient_debris"), "ore");
});

test("anything else is other, including mod blocks", () => {
  assert.equal(category("minecraft:crafting_table"), "other");
  assert.equal(category("family:cake"), "other");
});

test("drops only the minecraft namespace", () => {
  assert.equal(shortName("minecraft:oak_log"), "oak_log");
  assert.equal(shortName("family:rainbow_cookie"), "family:rainbow_cookie");
});
