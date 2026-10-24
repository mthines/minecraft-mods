import { world } from "@minecraft/server";

const SECONDS = 20; // Minecraft counts time in ticks: 20 ticks = 1 second.

// Runs when a player finishes eating or drinking something.
world.afterEvents.itemCompleteUse.subscribe(({ itemStack, source: player }) => {
  if (itemStack.typeId !== "family:rainbow_cookie") return;

  player.getComponent("minecraft:health")?.resetToMaxValue(); // full life straight away
  player.addEffect("speed", 30 * SECONDS, { amplifier: 1 });
  player.addEffect("jump_boost", 30 * SECONDS, { amplifier: 1 });
  player.onScreenDisplay.setActionBar("§dFull life, and you feel super zoomy!");

  // A game event for Dash0 (see server/otelcol/config.yaml).
  console.log(JSON.stringify({ "event.name": "minecraft.rainbow_cookie.eaten", "minecraft.player.name": player.name }));
});
