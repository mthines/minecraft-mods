// Played by simulated players on the test server: mc test lantern
import { EquipmentSlot, ItemStack } from "@minecraft/server";

const LIGHT = "minecraft:light_block_15";

/** Light blocks in the arena, as "x,y,z" relative to its corner. */
function lightsAround(t) {
  const found = [];
  for (let dx = -6; dx <= 6; dx++)
    for (let dy = 0; dy <= 3; dy++)
      for (let dz = -6; dz <= 6; dz++) if (t.dimension.getBlock(t.at(dx, dy, dz))?.typeId === LIGHT) found.push(`${dx},${dy},${dz}`);
  return found;
}

function equip(player, slot) {
  player.getComponent("minecraft:equippable").setEquipment(slot, new ItemStack("family:hand_lantern", 1));
}

export async function aLanternInTheShieldHandLightsUpWherePlayerIs(t) {
  const player = t.player("Walker", 0, 0);
  await t.wait(5);
  t.assert(lightsAround(t).length === 0, "There was light before the lantern came out");
  equip(player, EquipmentSlot.Offhand);
  await t.until(() => lightsAround(t).includes("0,1,0"), () => `No light at the player's head; lights: ${lightsAround(t).join(" ") || "none"}`, 20);
}

export async function theLightFollowsAndTheOldOneGoesOut(t) {
  const player = t.player("Walker", 0, 0);
  equip(player, EquipmentSlot.Offhand);
  await t.until(() => lightsAround(t).includes("0,1,0"), "The lantern never lit", 20);
  player.teleport(t.at(4.5, 0, 3.5));
  await t.until(
    () => lightsAround(t).join(" ") === "4,1,3",
    () => `After walking, the only light should be at the player's head; lights: ${lightsAround(t).join(" ") || "none"}`,
    20,
  );
}

export async function puttingTheLanternAwayTurnsTheLightOff(t) {
  const player = t.player("Walker", 0, 0);
  equip(player, EquipmentSlot.Offhand);
  await t.until(() => lightsAround(t).length === 1, "The lantern never lit", 20);
  player.getComponent("minecraft:equippable").setEquipment(EquipmentSlot.Offhand, undefined);
  await t.until(() => lightsAround(t).length === 0, () => `The light stayed on: ${lightsAround(t).join(" ")}`, 20);
}

export async function holdingItInTheMainHandWorksToo(t) {
  const player = t.player("Walker", 0, 0);
  player.setItem(new ItemStack("family:hand_lantern", 1), 0, true);
  await t.until(() => lightsAround(t).length === 1, "Holding the lantern in the hand gave no light", 20);
}

export async function theLightDoesNotReplaceBlocks(t) {
  t.place("minecraft:glass", 0, 1, 0);
  const player = t.player("Walker", 0, 0);
  equip(player, EquipmentSlot.Offhand);
  await t.until(() => lightsAround(t).length === 1, "The lantern never lit", 20);
  t.assert(t.dimension.getBlock(t.at(0, 1, 0))?.typeId === "minecraft:glass", "The light replaced the glass above the player");
}

export async function aLanternInThePocketLightsUpToo(t) {
  const player = t.player("Walker", 0, 0);
  player.getComponent("minecraft:inventory").container.setItem(20, new ItemStack("family:hand_lantern", 1));
  await t.until(() => lightsAround(t).includes("0,1,0"), "A lantern in the inventory gave no light", 20);
}

export async function droppingTheLanternTurnsTheLightOff(t) {
  const player = t.player("Walker", 0, 0);
  const inventory = player.getComponent("minecraft:inventory").container;
  inventory.setItem(20, new ItemStack("family:hand_lantern", 1));
  await t.until(() => lightsAround(t).length === 1, "The lantern never lit", 20);
  inventory.setItem(20);
  await t.until(() => lightsAround(t).length === 0, () => `The light stayed on: ${lightsAround(t).join(" ")}`, 20);
}

export async function theKitPutsTheLanternInTheInventory(t) {
  const player = t.player("Walker", 0, 0);
  await t.wait(5);
  const result = player.runCommand(`give @s family:hand_lantern 1`); // what mc kit lantern sends
  t.assert(result.successCount === 1, "give family:hand_lantern failed");
  const inventory = player.getComponent("minecraft:inventory").container;
  const has = () => [...Array(inventory.size).keys()].some((slot) => inventory.getItem(slot)?.typeId === "family:hand_lantern");
  await t.until(has, "The kit's lantern never showed up in the inventory", 20);
}

export async function usingTheLanternPutsItInTheShieldSlot(t) {
  const player = t.player("Walker", 0, 0);
  const equipment = player.getComponent("minecraft:equippable");
  equipment.setEquipment(EquipmentSlot.Offhand, new ItemStack("minecraft:totem_of_undying", 1));
  player.setItem(new ItemStack("family:hand_lantern", 1), 0, true);
  await t.wait(5);
  player.useItemInSlot(0);
  await t.until(
    () => equipment.getEquipment(EquipmentSlot.Offhand)?.typeId === "family:hand_lantern",
    () => `The shield slot has ${equipment.getEquipment(EquipmentSlot.Offhand)?.typeId ?? "nothing"} after using the lantern`,
    20,
  );
  const hand = equipment.getEquipment(EquipmentSlot.Mainhand)?.typeId;
  t.assert(hand === "minecraft:totem_of_undying", `What was in the shield slot should go to the hand, but the hand has ${hand ?? "nothing"}`);
}

const lanterns = (player) => {
  const inventory = player.getComponent("minecraft:inventory").container;
  let count = 0;
  for (let slot = 0; slot < inventory.size; slot++) if (inventory.getItem(slot)?.typeId === "family:hand_lantern") count += inventory.getItem(slot).amount;
  return count;
};

export async function respawningGivesALantern(t) {
  const player = t.player("Walker", 0, 0);
  player.removeTag("family:e2e"); // test players are left out of the spawn lantern
  player.kill();
  await t.wait(20);
  player.respawn();
  await t.until(() => lanterns(player) === 1, () => `After respawning the player should have 1 lantern, but has ${lanterns(player)}`, 60);
}
