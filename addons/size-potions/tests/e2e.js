// Played by simulated players on the test server: mc test size-potions
const scale = (player) => player.getComponent("minecraft:scale")?.value ?? 1;
const speed = (player) => player.getComponent("minecraft:movement")?.currentValue ?? 0;
const NORMAL_SPEED = 0.1;

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
  await t.until(() => Math.abs(scale(player) - 0.4) < 0.001, () => `After drinking the shrink potion the scale is ${scale(player)}, not 0.4`, 80);
  const bottle = player.getComponent("minecraft:inventory")?.container?.getItem(0);
  t.assert(bottle?.typeId === "minecraft:glass_bottle", `Drinking should leave an empty bottle, not ${bottle?.typeId}`);
  t.assert(speed(player) < NORMAL_SPEED, `A tiny player should walk slower, but their speed is ${speed(player)}`);
  await t.until(() => scale(player) === 1, () => `Still at scale ${scale(player)} after the potion ran out`, 120);
  t.assert(Math.abs(speed(player) - NORMAL_SPEED) < 0.001, `Back to normal size, but the speed is ${speed(player)}, not ${NORMAL_SPEED}`);
}

export async function aGrowPotionMakesYouAGiantThatJumpsHigh(t) {
  const player = quickPlayer(t, "Giant");
  await t.wait(5);
  await drink(t, player, "family:grow_potion");
  await t.until(() => scale(player) === 2.5, () => `After drinking the grow potion the scale is ${scale(player)}, not 2.5`, 80);
  t.assert(player.getEffect("jump_boost") && player.getEffect("strength"), "A giant should jump high and hit hard");
  t.assert(speed(player) > NORMAL_SPEED, `A giant should walk faster, but their speed is ${speed(player)}`);
  await t.until(() => scale(player) === 1 && !player.getEffect("jump_boost"), () => `Still at scale ${scale(player)} after the potion ran out`, 120);
  t.assert(Math.abs(speed(player) - NORMAL_SPEED) < 0.001, `Back to normal size, but the speed is ${speed(player)}, not ${NORMAL_SPEED}`);
}

export async function growingWhileTinyMakesYouNormalSizeAgain(t) {
  const player = t.player("Swapper");
  await t.wait(5);
  await drink(t, player, "family:shrink_potion");
  await t.until(() => Math.abs(scale(player) - 0.4) < 0.001, "The shrink potion didn't work", 80);
  await t.wait(5);
  await drink(t, player, "family:grow_potion");
  await t.until(() => scale(player) === 1, () => `Grow while 0.4 times normal size should give normal size again, but the scale is ${scale(player)}`, 80);
}

export async function eachPotionGrowsYouFurtherUpToTenTimesAndNoMore(t) {
  const player = t.player("Huge");
  await t.wait(5);
  for (const size of [2.5, 6.25, 10, 10]) {
    await drink(t, player, "family:grow_potion");
    await t.until(() => Math.abs(scale(player) - size) < 0.001, () => `The scale is ${scale(player)}, not ${size}`, 80);
    await t.wait(5);
  }
  await t.wait(20); // a simulated player can't use an item again right away
  await drink(t, player, "family:shrink_potion");
  await t.until(() => scale(player) === 6.25, () => `Shrinking from 10 times should give 6.25, but the scale is ${scale(player)}`, 80);
  t.assert(player.getEffect("jump_boost") && player.getEffect("strength"), "A giant should jump high and hit hard");
}

export async function eachShrinkPotionMakesYouSmallerDownToATenth(t) {
  const player = t.player("Ant");
  await t.wait(5);
  for (const size of [0.4, 0.16, 0.1, 0.1]) {
    await drink(t, player, "family:shrink_potion");
    await t.until(() => Math.abs(scale(player) - size) < 0.001, () => `The scale is ${scale(player)}, not ${size}`, 80);
    await t.wait(5);
  }
}

export async function drinkingAnotherPotionStartsTheTimeOver(t) {
  const player = quickPlayer(t, "Reset"); // 3 seconds per potion
  await t.wait(5);
  await drink(t, player, "family:grow_potion");
  await t.until(() => scale(player) === 2.5, "The grow potion didn't work", 80);
  await t.wait(10);
  await drink(t, player, "family:grow_potion");
  await t.until(() => scale(player) === 6.25, "The second potion didn't work", 80);
  await t.wait(30); // more than three seconds since the first potion: it would have worn off by now without the second
  t.assert(scale(player) === 6.25, `The second potion should have started the time over, but the scale is ${scale(player)}`);
  await t.until(() => scale(player) === 1, () => `Still at scale ${scale(player)} after the potion ran out`, 120);
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
  await t.until(() => Math.abs(scale(player) - 0.4) < 0.001, "The shrink potion didn't work", 80);
  player.moveToLocation(beyond);
  await t.until(() => player.location.z > wall + 1, () => `The tiny player didn't get through the hole (z ${player.location.z.toFixed(2)}, the wall at ${wall})`, 100);
  player.stopMoving();
}
