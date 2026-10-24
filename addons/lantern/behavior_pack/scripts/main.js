import { EquipmentSlot, system, world } from "@minecraft/server";
import { emit } from "./telemetry.js";

// Minecraft has no light that moves, so an invisible light block follows the player instead,
// and the one they walked away from is taken out again.
const LANTERN = "family:hand_lantern";
const LIGHT = "minecraft:light_block_15";
const SAVED = "lantern:lights";

/** @type {Map<string, { dimension: string, x: number, y: number, z: number }>} the light each player carries, by player id */
const lights = new Map();
/** Lights to take out once their chunk is loaded again. */
let leftBehind = [];

/** A lantern anywhere on the player counts: shield hand, hand, or pocket. */
function carriesLantern(player) {
  if (player.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Offhand)?.typeId === LANTERN) return true;
  const inventory = player.getComponent("minecraft:inventory")?.container;
  for (let slot = 0; slot < (inventory?.size ?? 0); slot++) if (inventory.getItem(slot)?.typeId === LANTERN) return true;
  return false;
}

/** Where the light goes: the first air block at the player's head, feet, or just above. */
function lightSpot(player) {
  const { x, y, z } = player.location;
  for (const dy of [1, 0, 2]) {
    const block = player.dimension.getBlock({ x: Math.floor(x), y: Math.floor(y) + dy, z: Math.floor(z) });
    if (block?.isAir || block?.typeId === LIGHT) return { dimension: player.dimension.id, ...block.location };
  }
}

/** Takes a light out, or keeps it for later if its chunk isn't loaded. */
function takeOut(light) {
  const block = world.getDimension(light.dimension).getBlock(light);
  if (!block) return leftBehind.push(light);
  if (block.typeId === LIGHT) block.setType("minecraft:air");
}

const same = (a, b) => a?.dimension === b?.dimension && a?.x === b?.x && a?.y === b?.y && a?.z === b?.z;

function save() {
  const all = [...lights.entries(), ...leftBehind.map((light, i) => [`left-${i}`, light])];
  world.setDynamicProperty(SAVED, JSON.stringify(Object.fromEntries(all)));
}

// Use puts the lantern in the shield slot, like a shield equips itself; what was there goes to the hand.
world.afterEvents.itemUse.subscribe(({ source: player, itemStack }) => {
  if (itemStack.typeId !== LANTERN) return;
  const equipment = player.getComponent("minecraft:equippable");
  if (!equipment) return;
  const before = equipment.getEquipment(EquipmentSlot.Offhand);
  equipment.setEquipment(EquipmentSlot.Offhand, itemStack);
  equipment.setEquipment(EquipmentSlot.Mainhand, before);
  player.playSound("armor.equip_generic");
  emit("lantern.worn", { "minecraft.player.name": player.name });
});

// Lights saved by an earlier run belong to nobody now: take them all out.
system.run(() => {
  for (const light of Object.values(JSON.parse(String(world.getDynamicProperty(SAVED) ?? "{}")))) takeOut(light);
  save();
});

system.runInterval(() => {
  let changed = false;
  const online = new Set();
  for (const player of world.getAllPlayers()) {
    if (!player) continue; // NPCs (simulated players from the npc mod) come through as undefined in other mods
    online.add(player.id);
    const old = lights.get(player.id);
    const spot = carriesLantern(player) ? lightSpot(player) : undefined;
    if (same(old, spot)) {
      // Another player's light that shared this spot may have gone out with them.
      const block = spot && world.getDimension(spot.dimension).getBlock(spot);
      if (block?.isAir) block.setType(LIGHT);
      continue;
    }
    if (spot) {
      world.getDimension(spot.dimension).getBlock(spot)?.setType(LIGHT);
      lights.set(player.id, spot);
    } else {
      lights.delete(player.id);
    }
    if (old) takeOut(old);
    if (!old !== !spot) emit(spot ? "lantern.lit" : "lantern.put_away", { "minecraft.player.name": player.name });
    changed = true;
  }
  // Players who left.
  for (const [id, light] of lights) {
    if (online.has(id)) continue;
    takeOut(light);
    lights.delete(id);
    changed = true;
  }
  const waiting = leftBehind;
  leftBehind = [];
  for (const light of waiting) takeOut(light);
  if (changed || leftBehind.length !== waiting.length) save();
}, 2);
