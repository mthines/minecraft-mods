import { world } from "@minecraft/server";
import { category, shortName } from "./blocks.js";

// Game events for the OpenTelemetry Collector, which sends them to Dash0 (see server/otelcol/config.yaml).
// Each event is one JSON line in the server console; the Collector turns it into a log record.
/**
 * @param {string} name what happened, like "block.broken"
 * @param {Record<string, string | number | boolean>} attributes details, like the block type
 */
function emit(name, attributes) {
  console.log(JSON.stringify({ "event.name": `minecraft.${name}`, ...attributes }));
}

/** @param {import("@minecraft/server").BlockType} type */
function blockAttributes(type) {
  return { "minecraft.block.type": shortName(type.id), "minecraft.block.category": category(type.id) };
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
  if (deadEntity.typeId === "minecraft:player") {
    emit("player.died", {
      "minecraft.player.name": /** @type {import("@minecraft/server").Player} */ (deadEntity).name,
      "minecraft.death.cause": damageSource.cause,
      "minecraft.mob.type": attacker ? shortName(attacker.typeId) : "none",
    });
  } else if (attacker?.typeId === "minecraft:player") {
    emit("mob.killed", {
      "minecraft.player.name": /** @type {import("@minecraft/server").Player} */ (attacker).name,
      "minecraft.mob.type": shortName(deadEntity.typeId),
    });
  }
});
