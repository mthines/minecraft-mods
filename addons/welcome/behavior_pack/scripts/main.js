import { EquipmentSlot, ItemStack, system, world } from "@minecraft/server";

// Runs every time a player appears in the world.
world.afterEvents.playerSpawn.subscribe((event) => {
  // initialSpawn is true only when they first join, not after respawning.
  if (!event.initialSpawn) return;

  const player = event.player;
  if (!player?.isValid) return; // they left again straight away, or it's an NPC (undefined here)
  // § codes change the colour: §e = yellow, §b = aqua.
  player.sendMessage(`§eWelcome, §b${player.name}§e! Have fun!`);
  player.playSound("random.levelup");
});

// ./mc kit gives armor, elytra, a shield, heads and our own hats and boots like this (tools/lib/wearables.mjs):
// scriptevent family:wear {"who":"@a" or a name,"slot":"Head","item":"minecraft:iron_helmet","count":1}
// It goes on when that slot is empty, so a kit never takes off what someone already wears; the rest go in the backpack.
system.afterEvents.scriptEventReceive.subscribe(({ id, message }) => {
  if (id !== "family:wear") return;
  let wish;
  try {
    wish = JSON.parse(message);
  } catch {
    return;
  }
  const slot = EquipmentSlot[wish?.slot];
  if (!slot || typeof wish.item !== "string") return;
  for (const player of world.getAllPlayers()) {
    if (!player?.isValid || (wish.who !== "@a" && player.name !== wish.who)) continue; // NPCs are undefined here
    try {
      let rest = Math.max(1, Number(wish.count) || 1);
      const worn = player.getComponent("minecraft:equippable");
      if (worn && !worn.getEquipment(slot)) {
        worn.setEquipment(slot, new ItemStack(wish.item, 1));
        rest--;
      }
      const bag = player.getComponent("minecraft:inventory")?.container;
      while (rest > 0) {
        const stack = new ItemStack(wish.item, 1);
        const amount = Math.min(rest, stack.maxAmount);
        stack.amount = amount;
        const left = bag?.addItem(stack);
        if (left) player.dimension.spawnItem(left, player.location); // a full backpack: at their feet
        rest -= amount;
      }
    } catch {
      // that item isn't there (its mod isn't installed), or they just left
    }
  }
}, { namespaces: ["family"] });
