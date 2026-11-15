import assert from "node:assert/strict";
import { test } from "node:test";
import { giveCommands, wearSlot } from "./wearables.mjs";

test("armor, elytra, a shield and heads have a slot; tools and blocks don't", () => {
  assert.equal(wearSlot("minecraft:netherite_helmet"), "slot.armor.head");
  assert.equal(wearSlot("minecraft:golden_chestplate"), "slot.armor.chest");
  assert.equal(wearSlot("minecraft:elytra"), "slot.armor.chest");
  assert.equal(wearSlot("minecraft:chainmail_leggings"), "slot.armor.legs");
  assert.equal(wearSlot("minecraft:leather_boots"), "slot.armor.feet");
  assert.equal(wearSlot("minecraft:shield"), "slot.weapon.offhand");
  assert.equal(wearSlot("minecraft:carved_pumpkin"), "slot.armor.head");
  assert.equal(wearSlot("minecraft:dragon_head"), "slot.armor.head");
  for (const item of ["minecraft:diamond_sword", "minecraft:oak_planks", "minecraft:horse_armor", "minecraft:iron_horse_armor", "family:drill"]) assert.equal(wearSlot(item), undefined, item);
});

test("our own hats and boots are worn where their item file says", () => {
  assert.equal(wearSlot("family:pirate_hat"), "slot.armor.head");
  assert.equal(wearSlot("family:cloud_boots"), "slot.armor.feet");
});

test("a kit gives wearables through the welcome mod and the rest with give", () => {
  const commands = giveCommands("@a", [["minecraft:iron_helmet", 1], ["minecraft:oak_planks", 64]]);
  assert.equal(commands[0], "testfor @a");
  assert.match(commands[1], /^scriptevent family:wear \{.*"slot":"Head".*"item":"minecraft:iron_helmet"/);
  assert.equal(commands[2], "give @a minecraft:oak_planks 64");
  assert.deepEqual(giveCommands("@a", [["minecraft:oak_planks", 64]]), ["give @a minecraft:oak_planks 64"]);
});
