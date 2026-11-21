// Played by simulated players on the test server: mc test nuke
import { ItemStack } from "@minecraft/server";

const NUKE = "family:nuke";
const count = (player) => {
  const inventory = player.getComponent("minecraft:inventory").container;
  let total = 0;
  for (let slot = 0; slot < inventory.size; slot++) if (inventory.getItem(slot)?.typeId === NUKE) total += inventory.getItem(slot).amount;
  return total;
};

async function aimAt(t, player, spot) {
  await t.until(() => {
    player.lookAtLocation(spot);
    return player.getBlockFromViewDirection({ maxDistance: 20 })?.block.typeId === "minecraft:stone";
  }, "The test player never turned to the tower", 20);
}

export async function aNukeClearsABigCraterButNotFarAway(t) {
  // a stone tower 8 blocks away to aim at, and another one far outside the crater
  for (let y = 0; y < 4; y++) {
    t.place("minecraft:stone", 0, y, 8);
    t.place("minecraft:stone", 0, y, 40);
  }
  const player = t.player();
  await t.wait(5);
  t.hold(player, NUKE);
  await aimAt(t, player, t.at(0.5, 3.5, 8.5));
  player.useItemInSlot(0);
  const block = (x, y, z) => t.dimension.getBlock(t.at(x, y, z))?.typeId;
  await t.until(() => block(0, 0, 8) === "minecraft:air" && block(0, -1, 14) === "minecraft:air", () => `The tower and the ground around it should be gone (${block(0, 0, 8)}, ${block(0, -1, 14)})`, 20 * 20);
  t.assert(block(0, 1, 40) === "minecraft:stone", "Far away from the crater, the other tower should still stand");
}

export async function severalNukesCanBeFiredAtTheSameTime(t) {
  // two towers, one in front and one behind; the second nuke goes off while the first is still counting down
  for (let y = 0; y < 4; y++) {
    t.place("minecraft:stone", 0, y, 8);
    t.place("minecraft:stone", 0, y, -8);
  }
  const player = t.player();
  await t.wait(5);
  const inventory = player.getComponent("minecraft:inventory").container;
  inventory.setItem(0, new ItemStack(NUKE, 16)); // a full stack in one slot
  player.selectedSlotIndex = 0;
  await aimAt(t, player, t.at(0.5, 3.5, 8.5));
  player.useItemInSlot(0);
  await t.wait(20); // a simulated player can't use an item again right away
  t.assert(count(player) === 15, `Firing one should leave 15 of the 16, not ${count(player)}`);
  await aimAt(t, player, t.at(0.5, 3.5, -7.5));
  player.useItemInSlot(0);
  await t.wait(5);
  t.assert(count(player) === 14, `Firing a second one while the first counts down should leave 14, not ${count(player)}`);
  const block = (x, y, z) => t.dimension.getBlock(t.at(x, y, z))?.typeId;
  await t.until(() => block(0, 0, 8) === "minecraft:air" && block(0, 0, -8) === "minecraft:air", () => `Both towers should be gone (${block(0, 0, 8)}, ${block(0, 0, -8)})`, 20 * 20);
}

export async function everyoneGetsFourNukesWhenSpawning(t) {
  const player = t.player("Soldier");
  player.removeTag("family:e2e"); // test players are left out of the spawn nukes
  player.getComponent("minecraft:inventory").container.clearAll();
  player.kill();
  await t.wait(20);
  player.respawn();
  await t.until(() => count(player) === 4, () => `After respawning there should be 4 nukes, but there are ${count(player)}`, 60);
}

export async function everySizeIsAnItemYouCanHold16Of(t) {
  for (const id of ["family:nuke", "family:big_nuke", "family:huge_nuke", "family:mega_nuke"]) {
    t.assert(new ItemStack(id, 1).maxAmount === 16, `${id} should stack to 16`);
  }
}

export async function aBigNukeReachesFurtherThanAPlainOne(t) {
  // 40 blocks from the middle: outside a plain nuke's 24, inside the big one's 72
  for (let y = 0; y < 4; y++) t.place("minecraft:stone", 0, y, 8);
  const player = t.player();
  await t.wait(5);
  const inventory = player.getComponent("minecraft:inventory").container;
  inventory.setItem(0, new ItemStack("family:big_nuke", 2));
  player.selectedSlotIndex = 0;
  await aimAt(t, player, t.at(0.5, 3.5, 8.5));
  player.useItemInSlot(0);
  const block = (x, y, z) => t.dimension.getBlock(t.at(x, y, z))?.typeId;
  t.assert(block(0, -1, 48) !== "minecraft:air", "Before the blast the ground 40 blocks from the middle is still there");
  await t.until(() => block(0, -1, 48) === "minecraft:air", () => `A big nuke should clear the ground 40 blocks from its middle (${block(0, -1, 48)})`, 60 * 20);
}
