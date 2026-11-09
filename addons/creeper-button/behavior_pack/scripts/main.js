import { EquipmentSlot, ItemStack, system, world } from "@minecraft/server";

const BUTTON = "family:creeper_button";
const HEAD = "minecraft:creeper_head";

const SECONDS = 20; // Minecraft counts time in ticks: 20 ticks = 1 second.
const FUSE = 1.5 * SECONDS; // the hiss before the boom, as long as a real creeper's
const BLAST = 3; // a creeper's explosion size
const LIFT = 1.6; // how hard the boom throws you up

const fusing = new Set(); // ids of players who are hissing right now

// Press Use with the button: you turn into a creeper, hiss, and go BOOM.
// The boom hurts and pushes mobs, but not you, and it breaks no blocks (this is the family world).
world.afterEvents.itemUse.subscribe(({ source: player, itemStack }) => {
  if (!player || itemStack?.typeId !== BUTTON) return; // NPCs come through as undefined
  if (fusing.has(player.id)) return;
  fusing.add(player.id);

  // A creeper head, unless you already wear a helmet.
  const equipment = player.getComponent("minecraft:equippable");
  const wearsHead = !equipment?.getEquipment(EquipmentSlot.Head);
  if (wearsHead) equipment.setEquipment(EquipmentSlot.Head, new ItemStack(HEAD, 1));

  player.dimension.playSound("random.fuse", player.location);
  player.onScreenDisplay.setActionBar("§aSsssssss...");
  // Safe from your own boom, and from the landing (resistance 5 blocks all damage).
  player.addEffect("resistance", 5 * SECONDS, { amplifier: 4, showParticles: false });

  system.runTimeout(() => {
    fusing.delete(player.id);
    if (!player.isValid) return; // they left the game
    boom(player);
    if (wearsHead && equipment.isValid && equipment.getEquipment(EquipmentSlot.Head)?.typeId === HEAD) {
      equipment.setEquipment(EquipmentSlot.Head, undefined); // you're you again
    }
    console.log(JSON.stringify({ "event.name": "minecraft.creeper_button.boom", "minecraft.player.name": player.name }));
  }, FUSE);
});

function boom(player) {
  const { dimension, location } = player;
  const options = { breaksBlocks: false, causesFire: false };
  try {
    dimension.createExplosion(location, BLAST, { ...options, source: player }); // you get the credit for what it hits
  } catch {
    dimension.createExplosion(location, BLAST, options);
  }
  dimension.spawnParticle("minecraft:huge_explosion_emitter", location);
  player.applyKnockback({ x: 0, z: 0 }, LIFT); // up you go!
  player.onScreenDisplay.setActionBar("§aBOOM!");
}
