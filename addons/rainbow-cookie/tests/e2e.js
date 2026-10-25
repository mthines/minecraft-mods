// Played by simulated players on the test server: mc test rainbow-cookie
import { ItemStack } from "@minecraft/server";
const health = (player) => player.getComponent("minecraft:health");

export async function aCookieHealsYouToFullLife(t) {
  const player = t.player("Hungry");
  await t.wait(5);
  health(player)?.setCurrentValue(4);
  t.hold(player, "family:rainbow_cookie");
  player.useItemInSlot(0);
  await t.until(() => health(player)?.currentValue === health(player)?.effectiveMax, () => `Still at ${health(player)?.currentValue} of ${health(player)?.effectiveMax} life after eating a cookie`, 80);
  t.assert(player.getEffect("speed"), "The cookie should make you fast too");
}

const cookies = (player) => {
  const inventory = player.getComponent("minecraft:inventory").container;
  let count = 0;
  for (let slot = 0; slot < inventory.size; slot++) if (inventory.getItem(slot)?.typeId === "family:rainbow_cookie") count += inventory.getItem(slot).amount;
  return count;
};

export async function respawningTopsUpToTenCookies(t) {
  const player = t.player("Hungry");
  player.removeTag("family:e2e"); // test players are left out of the spawn cookies
  player.kill();
  await t.wait(20);
  player.respawn();
  await t.until(() => cookies(player) === 10, () => `After respawning the player should have 10 cookies, but has ${cookies(player)}`, 60);
  const inventory = player.getComponent("minecraft:inventory").container;
  inventory.clearAll();
  inventory.setItem(9, new ItemStack("family:rainbow_cookie", 3)); // some eaten
  player.kill();
  await t.wait(20);
  player.respawn();
  await t.until(() => cookies(player) === 10, () => `Respawning with 3 cookies should top up to 10, but has ${cookies(player)}`, 60);
}
