import { world } from "@minecraft/server";

const COFFEE = "family:coffee";
const CAKE = "family:cake_slice";

const SECONDS = 20; // Minecraft counts time in ticks: 20 ticks = 1 second.

// Runs when a player finishes eating or drinking something.
world.afterEvents.itemCompleteUse.subscribe(({ itemStack, source: player }) => {
  if (!player) return; // NPCs come through as undefined on the family server
  if (itemStack?.typeId === COFFEE) {
    player.addEffect("speed", 60 * SECONDS, { amplifier: 2 }); // super fast for a minute
    player.onScreenDisplay.setActionBar("§6Mmm, coffee! You feel super fast!");
  } else if (itemStack?.typeId === CAKE) {
    player.addEffect("regeneration", 5 * SECONDS, { amplifier: 1 });
    player.onScreenDisplay.setActionBar("§dYum, cake!");
  } else return;

  // A game event for Dash0 (see server/otelcol/config.yaml).
  console.log(JSON.stringify({ "event.name": "minecraft.cafe.eaten", "minecraft.player.name": player.name, "minecraft.item": itemStack.typeId }));
});
