import { ItemStack, world } from "@minecraft/server";

const COOKIE = "family:rainbow_cookie";
const SPAWN_COOKIES = 10; // everyone has at least this many after joining or respawning

const SECONDS = 20; // Minecraft counts time in ticks: 20 ticks = 1 second.

// Runs when a player finishes eating or drinking something.
world.afterEvents.itemCompleteUse.subscribe(({ itemStack, source: player }) => {
  if (itemStack.typeId !== COOKIE) return;

  player.getComponent("minecraft:health")?.resetToMaxValue(); // full life straight away
  player.addEffect("speed", 30 * SECONDS, { amplifier: 1 });
  player.addEffect("jump_boost", 30 * SECONDS, { amplifier: 1 });
  player.onScreenDisplay.setActionBar("§dFull life, and you feel super zoomy!");

  // A game event for Dash0 (see server/otelcol/config.yaml).
  console.log(JSON.stringify({ "event.name": "minecraft.rainbow_cookie.eaten", "minecraft.player.name": player.name }));
});

function cookies(player) {
  const inventory = player.getComponent("minecraft:inventory")?.container;
  let count = 0;
  for (let slot = 0; slot < (inventory?.size ?? 0); slot++) {
    const item = inventory.getItem(slot);
    if (item?.typeId === COOKIE) count += item.amount;
  }
  return count;
}

// Joining, or coming back after dying, tops the rainbow cookies up to 10.
// Not for NPCs, nor e2e test players (family:e2e), whose tests count on what's in their inventory.
world.afterEvents.playerSpawn.subscribe(({ player }) => {
  if (!player?.isValid || player.hasTag("family:npc") || player.hasTag("family:e2e")) return; // isValid: they may have left already
  const missing = SPAWN_COOKIES - cookies(player);
  if (missing <= 0) return;
  player.getComponent("minecraft:inventory")?.container?.addItem(new ItemStack(COOKIE, missing));
  console.log(JSON.stringify({ "event.name": "minecraft.rainbow_cookie.spawn_cookies", "minecraft.player.name": player.name, "minecraft.cookies.given": missing }));
});
