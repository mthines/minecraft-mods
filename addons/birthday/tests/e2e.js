// Played by simulated players on the test server: mc test birthday
import { ItemStack } from "@minecraft/server";

export async function eatingTheCakeMakesYouFastAndBouncy(t) {
  const player = t.player("Guest");
  await t.wait(5);
  t.hold(player, "family:birthday_cake");
  player.useItemInSlot(0);
  await t.until(() => player.getEffect("speed") && player.getEffect("jump_boost"), "Eating the birthday cake should make you fast and bouncy", 80);
}

export async function theDannebrogGoesUpOnAPoleWithAWhiteCross(t) {
  t.place("minecraft:stone", 0, 0, 4);
  const player = t.player("Flagger");
  await t.wait(5);
  t.hold(player, "family:dannebrog");
  await t.until(() => {
    player.lookAtLocation(t.at(0.5, 0.5, 4.5));
    return player.getBlockFromViewDirection({ maxDistance: 10 })?.block.typeId === "minecraft:stone";
  }, "The test player never turned to the stone block", 20);
  player.useItemInSlot(0);
  const block = (x, y, z) => t.dimension.getBlock(t.at(x, y, z))?.typeId;
  // the pole stands on the stone, and the flag hangs to the right of someone looking south
  await t.until(() => block(0, 1, 4) === "minecraft:fence" || block(0, 1, 4) === "minecraft:oak_fence", () => `No pole on the block (${block(0, 1, 4)})`, 40);
  t.assert(block(-2, 7, 4) === "minecraft:red_wool", `The flag should be red (${block(-2, 7, 4)})`);
  t.assert(block(-5, 7, 4) === "minecraft:white_wool", `The flag should have a white cross (${block(-5, 7, 4)})`);
  t.assert(block(-2, 9, 4) === "minecraft:white_wool", `The cross should reach across the flag (${block(-2, 9, 4)})`);
}

const has = (player, typeId) => {
  const inventory = player.getComponent("minecraft:inventory").container;
  for (let slot = 0; slot < inventory.size; slot++) if (inventory.getItem(slot)?.typeId === typeId) return true;
  return false;
};

export async function theBirthdayKidGetsACakeAndAFlagOnJoining(t) {
  const player = t.player("Walter");
  player.removeTag("family:e2e"); // test players are left out of the gifts
  player.getComponent("minecraft:inventory").container.clearAll();
  player.kill();
  await t.wait(20);
  player.respawn();
  await t.until(() => has(player, "family:birthday_cake") && has(player, "family:dannebrog"), "Walter should get a birthday cake and a flag after respawning", 60);
  t.assert(has(player, "family:birthday_hat") && has(player, "family:birthday_boots"), "Walter should get the red and white outfit too");
}
