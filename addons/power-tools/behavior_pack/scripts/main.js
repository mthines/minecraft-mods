import { world } from "@minecraft/server";
import { emit } from "./telemetry.js";

const SOUNDS = { "family:drill": "block.grindstone.use", "family:chainsaw": "mob.sheep.shear", "family:power_shovel": "block.grindstone.use" };

// A machine noise with every block, and a game event for Dash0.
world.afterEvents.playerBreakBlock.subscribe(({ player, block, itemStackBeforeBreak, brokenBlockPermutation }) => {
  const tool = itemStackBeforeBreak?.typeId;
  if (!tool || !(tool in SOUNDS)) return;
  block.dimension.playSound(SOUNDS[tool], block.location, { pitch: 1.4, volume: 0.6 });
  emit("power_tool.used", {
    "minecraft.player.name": player.name,
    "minecraft.tool.type": tool.replace("family:", ""),
    "minecraft.block.type": brokenBlockPermutation.type.id.replace("minecraft:", ""),
  });
});
