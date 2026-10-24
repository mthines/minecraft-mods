// Played by simulated players on the test server: mc test magic-wand
import { ItemStack } from "@minecraft/server";

// Husks are zombies that don't burn in daylight, so they're a steady target.
const TARGET = "minecraft:husk";
const health = (mob) => mob.getComponent("minecraft:health")?.currentValue ?? 0;

/** A wizard holding the wand, facing a husk `distance` blocks away. */
async function setUp(t, distance = 6) {
  const player = t.player("Wizard");
  player.setItem(new ItemStack("family:magic_wand", 1), 0, true);
  const mob = t.dimension.spawnEntity(TARGET, t.at(0.5, 0, distance + 0.5));
  await t.wait(10);
  await aim(t, player, mob);
  return { player, mob, full: health(mob) };
}

/** Left-click: casts the spell. */
async function castSpell(t, player) {
  player.attack();
  await t.wait(12);
}

/** A quick right-click: the next spell. */
async function switchSpell(t, player) {
  t.assert(player.useItemInSlot(0), "Couldn't press Use");
  await t.wait(2);
  player.stopUsingItem();
  await t.wait(12);
}

/** Turns the player to the mob's head, until it really does. */
async function aim(t, player, mob) {
  await t.until(() => {
    player.lookAtLocation(mob.getHeadLocation());
    const from = player.getHeadLocation();
    const to = mob.getHeadLocation();
    const d = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
    const look = player.getViewDirection();
    // Within about 2.5°: still on a husk 6 blocks away, and reachable while the husk walks up to the player.
    return (look.x * d.x + look.y * d.y + look.z * d.z) / Math.hypot(d.x, d.y, d.z) > 0.999;
  }, "The test player never turned to the husk", 40);
}

export async function theFireSpellHurtsAMob(t) {
  const { player, mob, full } = await setUp(t);
  await castSpell(t, player);
  await t.until(() => !mob.isValid || health(mob) < full, `The husk still has full health (${full}) after the fire spell`);
}

export async function thePushSpellThrowsAMobAway(t) {
  const { player, mob, full } = await setUp(t);
  await switchSpell(t, player);
  await aim(t, player, mob);
  const before = mob.location.z;
  await castSpell(t, player);
  await t.until(() => mob.location.z > before + 4, () => `The husk only moved ${(mob.location.z - before).toFixed(1)} blocks after the push spell`);
  t.assert(health(mob) >= full - 1, "The push spell should push, not hurt");
}

export async function theFriendSpellMakesAMobFriendly(t) {
  const { player, mob, full } = await setUp(t, 3);
  await switchSpell(t, player);
  await switchSpell(t, player);
  await aim(t, player, mob);
  await castSpell(t, player);
  await t.until(() => mob.isValid && mob.hasTag("family:friend"), "The husk didn't become a friend");
  t.assert(mob.typeId === TARGET, `The friend should still be a husk, not ${mob.typeId}`);
  t.assert(health(mob) >= full - 1, "The friend spell shouldn't hurt the husk");
  t.assert(t.entities("minecraft:wolf").length === 0, "The friend spell shouldn't make a wolf any more");

  // The husk still walks up to the player, but its hits don't hurt.
  const playerFull = health(player);
  await t.wait(100);
  t.assert(mob.isValid, "The friendly husk disappeared");
  t.assert(health(player) >= playerFull, `The friendly husk hurt the player (${health(player)} of ${playerFull})`);
}

export async function aFriendFightsOtherMonsters(t) {
  const { player, mob } = await setUp(t, 3);
  await switchSpell(t, player);
  await switchSpell(t, player);
  await aim(t, player, mob);
  await castSpell(t, player);
  await t.until(() => mob.isValid && mob.hasTag("family:friend"), "The husk didn't become a friend");

  // A spider shows up behind the friendly husk (spiders don't burn, so only a hit hurts it).
  const enemy = t.dimension.spawnEntity("minecraft:spider", t.at(0.5, 0, 8.5));
  await t.wait(10);
  const enemyFull = health(enemy);
  await t.until(() => !enemy.isValid || health(enemy) < enemyFull, "The friendly husk never attacked the spider", 400);
  t.assert(mob.isValid && mob.hasTag("family:friend"), "The husk should still be a friend");
}
