import { world } from "@minecraft/server";

// Runs every time a player appears in the world.
world.afterEvents.playerSpawn.subscribe((event) => {
  // initialSpawn is true only when they first join, not after respawning.
  if (!event.initialSpawn) return;

  const player = event.player;
  // § codes change the colour: §e = yellow, §b = aqua.
  player.sendMessage(`§eWelcome, §b${player.name}§e! Have fun!`);
  player.playSound("random.levelup");
});
