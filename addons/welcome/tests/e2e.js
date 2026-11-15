// Played by simulated players on the test server: mc test welcome

const wear = (player, slot, item, count = 1) => player.dimension.runCommand(`scriptevent family:wear ${JSON.stringify({ who: player.name, slot, item, count })}`);
const inBackpack = (player, item) => {
  const bag = player.getComponent("minecraft:inventory").container;
  let found = 0;
  for (let slot = 0; slot < bag.size; slot++) if (bag.getItem(slot)?.typeId === item) found += bag.getItem(slot).amount;
  return found;
};

export async function armorFromAKitGoesOnWhenThatSlotIsEmpty(t) {
  const player = t.player("Wearer");
  await t.wait(5);
  player.getComponent("minecraft:inventory").container.clearAll();
  const worn = player.getComponent("minecraft:equippable");
  wear(player, "Head", "minecraft:iron_helmet");
  await t.until(() => worn.getEquipment("Head")?.typeId === "minecraft:iron_helmet", () => `The head holds ${worn.getEquipment("Head")?.typeId}`, 20);
  t.assert(inBackpack(player, "minecraft:iron_helmet") === 0, "The helmet that was put on is also in the backpack");

  // Already wearing one: the next goes in the backpack and the first stays on.
  wear(player, "Head", "minecraft:golden_helmet");
  await t.until(() => inBackpack(player, "minecraft:golden_helmet") === 1, () => `${inBackpack(player, "minecraft:golden_helmet")} golden helmets in the backpack`, 20);
  t.assert(worn.getEquipment("Head")?.typeId === "minecraft:iron_helmet", `The helmet was swapped for ${worn.getEquipment("Head")?.typeId}`);
}

export async function aShieldGoesInTheShieldHandAndTheOtherPiecesFollow(t) {
  const player = t.player("Wearer");
  await t.wait(5);
  player.getComponent("minecraft:inventory").container.clearAll();
  const worn = player.getComponent("minecraft:equippable");
  worn.setEquipment("Chest", undefined);
  worn.setEquipment("Offhand", undefined); // the lantern mod puts a lantern there at spawn
  wear(player, "Offhand", "minecraft:shield");
  wear(player, "Chest", "minecraft:elytra", 2); // two: one on, one in the backpack
  await t.until(() => worn.getEquipment("Offhand")?.typeId === "minecraft:shield" && worn.getEquipment("Chest")?.typeId === "minecraft:elytra", () => `Shield hand ${worn.getEquipment("Offhand")?.typeId}, chest ${worn.getEquipment("Chest")?.typeId}`, 20);
  await t.until(() => inBackpack(player, "minecraft:elytra") === 1, () => `${inBackpack(player, "minecraft:elytra")} spare elytra in the backpack`, 20);
}
