import { system, world } from "@minecraft/server";
import { emit } from "./telemetry.js";

const SOUNDS = { "family:drill": "block.grindstone.use", "family:chainsaw": "mob.sheep.shear", "family:power_shovel": "block.grindstone.use" };

// Sneak and use the drill or the power shovel to switch it to 2x1 mode: every block you break takes the one above it too, so
// one dig makes a tunnel you can walk in. Sneak and use again to go back. It's remembered for each player.
const BIG_MODE = "family:power_tool_2x1"; // a tag on the player (it stays with them, and tests in other packs can see it, unlike a dynamic property)
const DIGGERS = ["family:drill", "family:power_shovel"];
// What the second block never takes, in case it's behind the one you dug: the unbreakable, and what has things inside.
const KEEP = new Set(["minecraft:bedrock", "minecraft:barrier", "minecraft:end_portal_frame", "minecraft:end_portal", "minecraft:structure_block", "minecraft:structure_void", "minecraft:jigsaw", "minecraft:command_block", "minecraft:repeating_command_block", "minecraft:chain_command_block", "minecraft:light_block"]);
const STAIRS_FROM = 25; // degrees: looking down at least this much, at the block a step below your feet, makes a stairway

const inBigMode = (player) => player.hasTag(BIG_MODE);

/** Breaks one more block the way a player would (it drops what it should), unless it's air, liquid, unbreakable or a container. */
function breakExtra(block) {
  if (!block?.isValid || block.isAir || block.isLiquid || KEEP.has(block.typeId) || block.getComponent("minecraft:inventory")) return;
  try {
    block.dimension.runCommand(`setblock ${block.x} ${block.y} ${block.z} air destroy`);
  } catch {
    // not loaded
  }
}

/**
 * The blocks 2x1 mode takes besides the one you broke: the block above it. Looking down at the block a step below your
 * feet (digging a way down) it takes the one above that too: a stairway needs your head's room as well.
 * @param {import("@minecraft/server").Block} broken @param {import("@minecraft/server").Player} player
 */
function extras(broken, player) {
  const above = broken.above();
  const list = [above];
  if (player.getRotation().x >= STAIRS_FROM && broken.y === Math.floor(player.location.y) - 1) list.push(above?.above());
  return list;
}

// A machine noise with every block, a second block in 2x1 mode, and a game event for Dash0.
world.afterEvents.playerBreakBlock.subscribe(({ player, block, itemStackBeforeBreak, brokenBlockPermutation }) => {
  const tool = itemStackBeforeBreak?.typeId;
  if (!tool || !(tool in SOUNDS)) return;
  block.dimension.playSound(SOUNDS[tool], block.location, { pitch: 1.4, volume: 0.6 });
  const big = DIGGERS.includes(tool) && inBigMode(player);
  if (big) for (const extra of extras(block, player)) breakExtra(extra);
  emit("power_tool.used", {
    "minecraft.player.name": player.name,
    "minecraft.tool.type": tool.replace("family:", ""),
    "minecraft.tool.mode": big ? "2x1" : "normal",
    "minecraft.block.type": brokenBlockPermutation.type.id.replace("minecraft:", ""),
  });
});

// Sneak and use: switch between normal and 2x1. Using on a block or on air both count, once per click.
const lastSwitch = new Map(); // player id -> tick
function maybeSwitch(player, itemStack) {
  if (!player?.isValid || !player.isSneaking || !DIGGERS.includes(itemStack?.typeId)) return;
  if (system.currentTick - (lastSwitch.get(player.id) ?? -100) < 10) return;
  lastSwitch.set(player.id, system.currentTick);
  const big = !inBigMode(player);
  if (big) player.addTag(BIG_MODE);
  else player.removeTag(BIG_MODE);
  player.onScreenDisplay.setActionBar(big ? "§b2x1 mode: every dig takes the block above too (sneak and use to switch back)" : "§7Normal mode: one block at a time");
  player.playSound("random.click", { pitch: big ? 1.6 : 1.1, volume: 0.6 });
}
world.afterEvents.itemUse.subscribe(({ source, itemStack }) => maybeSwitch(source, itemStack));
world.afterEvents.itemUseOn.subscribe(({ source, itemStack }) => maybeSwitch(source, itemStack));
world.afterEvents.playerLeave.subscribe(({ playerId }) => lastSwitch.delete(playerId));
