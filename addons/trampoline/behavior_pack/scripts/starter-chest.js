import { ItemStack, world } from "@minecraft/server";
import { starterKit } from "./trampoline.js";

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

// The first time each player joins, put a chest with trampoline materials next to them.
world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (!initialSpawn || player.getDynamicProperty(GOT_KIT)) return;

  const items = starterKit().map(({ item, amount }) => new ItemStack(item, amount));
  const spot = findChestSpot(player);
  if (spot) {
    spot.dimension.setBlockType(spot.location, "minecraft:chest");
    const chest = spot.getComponent("minecraft:inventory")?.container;
    for (const item of items) chest?.addItem(item);
    player.sendMessage("§aA chest with §etrampoline blocks§a appeared next to you! Build slime with a wooden edge.");
  } else {
    // Nowhere flat to put a chest (in water, say): straight into their pockets instead.
    const inventory = player.getComponent("minecraft:inventory")?.container;
    for (const item of items) inventory?.addItem(item);
    player.sendMessage("§aYou got §etrampoline blocks§a! Build slime with a wooden edge.");
  }
  player.setDynamicProperty(GOT_KIT, true);
});
