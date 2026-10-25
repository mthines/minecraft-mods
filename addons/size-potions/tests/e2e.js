// Played by simulated players on the test server: mc test size-potions
const scale = (player) => player.getComponent("minecraft:scale")?.value ?? 1;

/** Drinks the potion in the first hotbar slot. */
async function drink(t, player, potion) {
  t.hold(player, potion);
  t.assert(player.useItemInSlot(0), `Couldn't start drinking the ${potion}`);
}

/** A test player whose potions last 3 seconds instead of 30. */
function quickPlayer(t, name, dx = 0, dz = 0) {
  const player = t.player(name, dx, dz);
  player.addTag("family:short_potions");
  return player;
}

export async function aShrinkPotionMakesYouTinyThenYouPopBack(t) {
  const player = quickPlayer(t, "Tiny");
  await t.wait(5);
  await drink(t, player, "family:shrink_potion");
  await t.until(() => scale(player) === 0.25, () => `After drinking the shrink potion the scale is ${scale(player)}, not 0.25`, 80);
  const bottle = player.getComponent("minecraft:inventory")?.container?.getItem(0);
  t.assert(bottle?.typeId === "minecraft:glass_bottle", `Drinking should leave an empty bottle, not ${bottle?.typeId}`);
  await t.until(() => scale(player) === 1, () => `Still at scale ${scale(player)} after the potion ran out`, 120);
}

export async function aGrowPotionMakesYouAGiantThatJumpsHigh(t) {
  const player = quickPlayer(t, "Giant");
  await t.wait(5);
  await drink(t, player, "family:grow_potion");
  await t.until(() => scale(player) === 2.5, () => `After drinking the grow potion the scale is ${scale(player)}, not 2.5`, 80);
  t.assert(player.getEffect("jump_boost") && player.getEffect("strength"), "A giant should jump high and hit hard");
  await t.until(() => scale(player) === 1 && !player.getEffect("jump_boost"), () => `Still at scale ${scale(player)} after the potion ran out`, 120);
}

export async function growingWhileTinySwapsToGiant(t) {
  const player = t.player("Swapper");
  await t.wait(5);
  await drink(t, player, "family:shrink_potion");
  await t.until(() => scale(player) === 0.25, "The shrink potion didn't work", 80);
  await t.wait(5);
  await drink(t, player, "family:grow_potion");
  await t.until(() => scale(player) === 2.5, () => `Drinking grow while tiny should make a giant, but the scale is ${scale(player)}`, 80);
}

export async function dyingMakesYouNormalSizeAgain(t) {
  const player = t.player("Respawner");
  await t.wait(5);
  await drink(t, player, "family:grow_potion");
  await t.until(() => scale(player) === 2.5, "The grow potion didn't work", 80);
  player.kill();
  await t.wait(20);
  player.respawn();
  await t.until(() => scale(player) === 1, () => `After respawning the scale is ${scale(player)}, not 1`, 60);
}

export async function aTinyPlayerFitsThroughAOneBlockHole(t) {
  // A stone wall across the way, with one hole one block high at the bottom.
  for (let dx = -3; dx <= 3; dx++) for (let dy = 0; dy <= 3; dy++) if (dx !== 0 || dy !== 0) t.place("minecraft:stone", dx, dy, 2);
  const player = t.player("Squeezer");
  const wall = t.at(0, 0, 2).z;
  const beyond = { ...t.at(0.5, 0, 5.5) };
  await t.wait(5);
  player.moveToLocation(beyond);
  await t.wait(40);
  t.assert(player.location.z < wall, `A normal-size player got through the one-block hole (z ${player.location.z.toFixed(2)})`);
  player.stopMoving();
  await drink(t, player, "family:shrink_potion");
  await t.until(() => scale(player) === 0.25, "The shrink potion didn't work", 80);
  player.moveToLocation(beyond);
  await t.until(() => player.location.z > wall + 1, () => `The tiny player didn't get through the hole (z ${player.location.z.toFixed(2)}, the wall at ${wall})`, 100);
  player.stopMoving();
}
