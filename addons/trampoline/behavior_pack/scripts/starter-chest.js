import { EquipmentSlot, ItemStack, world } from "@minecraft/server";
import { emit } from "./telemetry.js";
import { HOTBAR_KIT, OFFHAND_ITEM, starterChest } from "./trampoline.js";

const GOT_KIT = "family:got_trampoline_kit";

// Spots next to the player to try, closest first.
const SPOTS = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [-1, 1], [1, -1], [-1, -1],
  [2, 0], [-2, 0], [0, 2], [0, -2],
];

/** @param {import("@minecraft/server").Player} player */
function findChestSpot(player) {
  const { x, y, z } = player.location;
  for (const [dx, dz] of SPOTS) {
    try {
      const block = player.dimension.getBlock({ x: Math.floor(x) + dx, y: Math.floor(y), z: Math.floor(z) + dz });
      const ground = block?.below();
      if (block?.isAir && ground && !ground.isAir && !ground.isLiquid) return block;
    } catch {
      // outside the world: try the next spot
    }
  }
  return undefined;
}

/** @param {string} item @param {number} amount */
function make(item, amount) {
  try {
    return new ItemStack(item, amount);
  } catch {
    return undefined; // that item's mod isn't installed
  }
}

/** Put an item in the first empty slot from `from` up (0 = item bar, 9 = backpack); false when there's none. */
function putInSlot(container, item, from) {
  for (let slot = from; slot < container.size; slot++) {
    if (container.getItem(slot)) continue;
    container.setItem(slot, item);
    return true;
  }
  return false;
}

// The first time each player joins: power tools and the fill bucket in the item bar, the hand lantern in the shield hand, golden feathers in the backpack (the double-jump mod puts those there),
// and a chest next to them with the heavy machines, a bed, weapons and ammo.
world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (!initialSpawn || !player?.isValid || player.getDynamicProperty(GOT_KIT)) return; // isValid: they may have left already
  if (player.hasTag("family:npc")) return; // NPCs (the npc mod) don't need one

  const inventory = player.getComponent("minecraft:inventory")?.container;
  if (inventory) {
    HOTBAR_KIT.forEach(([item, amount], slot) => {
      const stack = make(item, amount);
      if (stack && !putInSlot(inventory, stack, slot)) inventory.addItem(stack);
    });
  }
  const lantern = make(OFFHAND_ITEM, 1);
  const equipment = player.getComponent("minecraft:equippable");
  if (lantern && equipment && !equipment.getEquipment(EquipmentSlot.Offhand)) equipment.setEquipment(EquipmentSlot.Offhand, lantern);

  const items = starterChest().flatMap(({ item, amount }) => make(item, amount) ?? []);
  const spot = findChestSpot(player);
  if (spot) {
    spot.dimension.setBlockType(spot.location, "minecraft:chest");
    const chest = spot.getComponent("minecraft:inventory")?.container;
    for (const item of items) chest?.addItem(item);
    player.sendMessage("§aYou start with §epower tools and a fill bucket in your item bar, a lantern in your shield hand§a (and golden feathers in your backpack). A chest appeared next to you with §eheavy machines, a bed, weapons and ammo§a!");
  } else {
    // Nowhere flat to put a chest (in water, say): straight into their pockets instead.
    for (const item of items) inventory?.addItem(item);
    player.sendMessage("§aYou start with §epower tools and a fill bucket in your item bar, a lantern in your shield hand§a (and golden feathers in your backpack), and you got §eheavy machines, a bed, weapons and ammo§a too!");
  }
  player.setDynamicProperty(GOT_KIT, true);
  emit("starter_chest.given", { "minecraft.player.name": player.name, "minecraft.starter_chest.placed": Boolean(spot) });
});
