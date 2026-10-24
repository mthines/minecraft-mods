import { EquipmentSlot, world } from "@minecraft/server";
import "./adventures.js";
import { category, shortName } from "./blocks.js";
import { emit } from "./telemetry.js";

/** @param {import("@minecraft/server").BlockType} type */
function blockAttributes(type) {
  return { "minecraft.block.type": shortName(type.id), "minecraft.block.category": category(type.id) };
}

/** What the player holds in their main hand, like "diamond_sword", or "hand" when it's empty. */
function heldItem(/** @type {import("@minecraft/server").Player} */ player) {
  try {
    const item = player.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Mainhand);
    return item ? shortName(item.typeId) : "hand";
  } catch {
    return "hand";
  }
}

// Digging, chopping, and mining. The block is already air here, so read what it was.
world.afterEvents.playerBreakBlock.subscribe(({ brokenBlockPermutation, itemStackBeforeBreak, player }) => {
  emit("block.broken", {
    "minecraft.player.name": player.name,
    ...blockAttributes(brokenBlockPermutation.type),
    "minecraft.held_item.type": itemStackBeforeBreak ? shortName(itemStackBeforeBreak.typeId) : "hand",
  });
});

// Building.
world.afterEvents.playerPlaceBlock.subscribe(({ block, player }) => {
  emit("block.placed", { "minecraft.player.name": player.name, ...blockAttributes(block.type) });
});

// Fights: a player beats a mob, or a player dies.
world.afterEvents.entityDie.subscribe(({ deadEntity, damageSource }) => {
  const attacker = damageSource.damagingEntity;
  if (!deadEntity) return; // NPCs (simulated players from the npc mod) come through as undefined in other mods
  if (deadEntity.typeId === "minecraft:player") {
    emit("player.died", {
      "minecraft.player.name": /** @type {import("@minecraft/server").Player} */ (deadEntity).name,
      "minecraft.death.cause": damageSource.cause,
      "minecraft.mob.type": attacker ? shortName(attacker.typeId) : "none",
    });
  } else if (attacker?.typeId === "minecraft:player") {
    const player = /** @type {import("@minecraft/server").Player} */ (attacker);
    emit("mob.killed", {
      "minecraft.player.name": player.name,
      "minecraft.mob.type": shortName(deadEntity.typeId),
      "minecraft.held_item.type": heldItem(player),
    });
  }
});
