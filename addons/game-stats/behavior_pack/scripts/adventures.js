import { system, world } from "@minecraft/server";
import { shortName } from "./blocks.js";
import {
  PLAYING_EVERY_SECONDS,
  createOdometer,
  dimensionName,
  isSnack,
  levelsReached,
  travelMode,
} from "./players.js";
import { emit } from "./telemetry.js";

// Play time, travel, level-ups, snacks, and trips to the Nether and the End.

const SECOND = 20; // Minecraft counts time in ticks: 20 ticks = 1 second.

const odometer = createOdometer();
/** @type {Map<string, number>} player id → level last time we looked */
const levels = new Map();

/** @param {import("@minecraft/server").Player} player */
function biomeOf(player) {
  try {
    return shortName(player.dimension.getBiome(player.location).id);
  } catch {
    return undefined; // in a chunk that is still loading
  }
}

/** @param {import("@minecraft/server").Player} player */
function mountOf(player) {
  try {
    const ridingOn = player.getComponent("minecraft:riding")?.entityRidingOn;
    return ridingOn ? shortName(ridingOn.typeId) : undefined;
  } catch {
    return undefined;
  }
}

// Once a minute, one event per player online. Counting them gives minutes played, and where.
system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    const biome = biomeOf(player);
    emit("player.playing", {
      "minecraft.player.name": player.name,
      "minecraft.dimension": dimensionName(player.dimension.id),
      ...(biome && { "minecraft.biome": biome }),
    });
  }
}, PLAYING_EVERY_SECONDS * SECOND);

// Once a second: how far everyone moved, and whether anyone levelled up.
system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    const mount = mountOf(player);
    const mode = travelMode({
      mount,
      isGliding: player.isGliding,
      isFlying: player.isFlying,
      isSwimming: player.isSwimming,
      isInWater: player.isInWater,
      isSprinting: player.isSprinting,
    });
    const steps = odometer.move(player.id, player.dimension.id, player.location, mode);
    for (let i = 0; i < steps; i++) {
      emit("player.traveled", {
        "minecraft.player.name": player.name,
        "minecraft.travel.mode": mode,
        ...(mount && { "minecraft.mount.type": mount }),
      });
    }

    for (const level of levelsReached(levels.get(player.id), player.level)) {
      emit("player.level_up", { "minecraft.player.name": player.name, "minecraft.player.level": level });
    }
    levels.set(player.id, player.level);
  }
}, SECOND);

// Respawning moves you without travelling.
world.afterEvents.playerSpawn.subscribe(({ player }) => odometer.jumped(player.id));

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  odometer.forget(playerId);
  levels.delete(playerId);
});

// Through a portal: "How many times did we go to the Nether?"
world.afterEvents.playerDimensionChange.subscribe(({ player, fromDimension, toDimension }) => {
  odometer.jumped(player.id);
  emit("player.dimension_changed", {
    "minecraft.player.name": player.name,
    "minecraft.dimension.from": dimensionName(fromDimension.id),
    "minecraft.dimension.to": dimensionName(toDimension.id),
  });
});

// Eating and drinking: "What do we eat the most?"
world.afterEvents.itemCompleteUse.subscribe(({ itemStack, source: player }) => {
  let isFood = false;
  try {
    isFood = itemStack.getComponent("minecraft:food") !== undefined;
  } catch {
    // some items can't be asked: treat them as not food
  }
  if (!isSnack(itemStack.typeId, isFood)) return;
  emit("item.consumed", { "minecraft.player.name": player.name, "minecraft.item.type": shortName(itemStack.typeId) });
});
