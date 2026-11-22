// Played by simulated players on the test server: mc test gladiator
import { BlockPermutation, EnchantmentType, EntityDamageCause, EquipmentSlot, ItemStack, system, world } from "@minecraft/server";
import * as rankings from "../behavior_pack/scripts/ranking.js";

const FAN = "family:gladiator_fan";
const HOLDER = "family:gladiator_holder";
const RADIUS = 6;

/** A ring of `block` around a gold block in the middle, on the first level above the ground, with a button on top of its east side. `gaps`: every n-th block is left out. */
function buildRing(t, { radius = RADIUS, block = "minecraft:sandstone", gaps = 0 } = {}) {
  let n = 0;
  for (let x = -radius - 1; x <= radius + 1; x++) {
    for (let z = -radius - 1; z <= radius + 1; z++) {
      if (Math.round(Math.hypot(x, z)) !== radius) continue;
      if (gaps && ++n % gaps === 0 && !(x === radius && z === 0)) continue;
      t.place(block, x, 0, z);
    }
  }
  t.place("minecraft:gold_block", 0, 0, 0);
  // Two buttons on top of the ring's east and west blocks, one for each fighter (a stone button stays pressed for a second).
  for (const x of [radius, -radius]) t.dimension.getBlock(t.at(x, 1, 0)).setPermutation(BlockPermutation.resolve("minecraft:stone_button", { facing_direction: 1 }));
}

/** Presses the east button (side 1) or the west one (-1): a pressed stone button doesn't push again for a second. */
const press = (t, player, side = 1) => t.assert(player.interactWithBlock(t.at(side * RADIUS, 1, 0)), `${player.name} couldn't press the button`);
const fans = (t) => t.entities(FAN);
const middle = (t) => t.at(0.5, 0, 0.5);
const away = (t, player) => Math.hypot(player.location.x - middle(t).x, player.location.z - middle(t).z);
const container = (player) => player.getComponent("minecraft:inventory").container;
const hasItem = (player, type) => {
  const box = container(player);
  for (let i = 0; i < box.size; i++) if (box.getItem(i)?.typeId === type) return true;
  return false;
};
const worn = (player) => [EquipmentSlot.Head, EquipmentSlot.Chest, EquipmentSlot.Legs, EquipmentSlot.Feet, EquipmentSlot.Offhand].map((s) => player.getComponent("minecraft:equippable").getEquipment(s)?.typeId);
const health = (player) => player.getComponent("minecraft:health").currentValue;
const hasGear = (player) => container(player).getItem(0)?.typeId === "minecraft:iron_sword";
// The ranking is saved by the mod's own pack (a pack can't read another's saved data), so the test listens for the mod's announcement.
let latestRanking = [];
system.afterEvents.scriptEventReceive.subscribe(({ id, message }) => {
  if (id === "family:gladiator_ranking") latestRanking = rankings.parse(message);
});
const wins = (name) => latestRanking.find((e) => e.n === name)?.w ?? 0;
const losses = (name) => latestRanking.find((e) => e.n === name)?.l ?? 0;

/** Things of the player's own that must come back: a backpack item with a name, a hotbar item, and armor. */
function giveOwnThings(player) {
  const backpack = new ItemStack("minecraft:emerald", 33);
  backpack.nameTag = `${player.name}'s emeralds`;
  container(player).setItem(20, backpack);
  container(player).setItem(0, new ItemStack("minecraft:diamond_sword", 1));
  container(player).setItem(8, new ItemStack("minecraft:cooked_beef", 12));
  player.getComponent("minecraft:equippable").setEquipment(EquipmentSlot.Chest, new ItemStack("minecraft:netherite_chestplate", 1));
}

const ownThingsBack = (player) => {
  const emeralds = container(player).getItem(20);
  return emeralds?.typeId === "minecraft:emerald" && emeralds.amount === 33 && emeralds.nameTag === `${player.name}'s emeralds` && container(player).getItem(0)?.typeId === "minecraft:diamond_sword" && container(player).getItem(8)?.amount === 12 && worn(player)[1] === "minecraft:netherite_chestplate";
};

/** Both players press the button; resolves once the fight has started (they have the gear). */
async function startFight(t, a, b) {
  press(t, a);
  await t.wait(5);
  press(t, b, -1);
  await t.until(() => hasGear(a) && hasGear(b), () => `The fight never started (fans: ${fans(t).length}, A has gear: ${hasGear(a)}, B has gear: ${hasGear(b)})`, 220);
}

/** Hits `to` with `from` until the gear is gone (the fight ended), or fails. */
async function fightUntilKnockedOut(t, from, to, loserIsTo = true) {
  for (let i = 0; i < 40 && hasGear(to); i++) {
    from.lookAtEntity(to);
    from.attackEntity(to);
    await t.wait(13);
  }
  t.assert(!hasGear(to) && !hasGear(from), "Nobody was knocked out after 40 hits");
  return loserIsTo;
}

export async function twoPlayersPressTheButtonAndFightUntilOneIsKnockedOut(t) {
  buildRing(t);
  const a = t.player("Alpha", 2, 0);
  const b = t.player("Bravo", 4, 0);
  const deaths = [];
  const sub = world.afterEvents.entityDie.subscribe(({ deadEntity }) => deaths.push(deadEntity?.nameTag ?? deadEntity?.typeId));
  try {
    giveOwnThings(a);
    giveOwnThings(b);
    const winsBefore = wins("Alpha");
    const lossesBefore = losses("Bravo");

    press(t, a);
    await t.wait(10);
    t.assert(fans(t).length === 0, "The crowd came before anyone accepted");
    press(t, b, -1);
    await t.until(() => fans(t).length >= 8, () => `The crowd didn't come: ${fans(t).length} fans`, 40);
    t.assert(fans(t).length <= 12, `Too many fans: ${fans(t).length}`);
    for (const fan of fans(t)) t.assert(Math.hypot(fan.location.x - middle(t).x, fan.location.z - middle(t).z) > RADIUS, "A fan stands inside the ring");

    await t.until(() => hasGear(a) && hasGear(b), "The fighters never got the sword", 200);
    t.assert(JSON.stringify(worn(a)) === JSON.stringify(worn(b)), `The fighters have different armor: ${worn(a)} and ${worn(b)}`);
    t.assert(worn(a).every(Boolean), `A piece of the gear is missing: ${worn(a)}`);
    t.assert(!hasItem(a, "minecraft:emerald") && !hasItem(a, "minecraft:diamond_sword") && !hasItem(b, "minecraft:cooked_beef"), "Their own things are still in their backpacks during the fight");
    t.assert(health(a) === 20 && health(b) === 20, "The fighters don't have full life");
    t.assert(t.dimension.getEntities({ type: HOLDER, location: t.origin, maxDistance: 16 }).length === 2, "Each fighter's things should be in a holder");

    await fightUntilKnockedOut(t, a, b);
    t.assert(b.isValid && a.isValid, "A fighter is gone");
    t.assert(health(b) === 20 && health(a) === 20, `Both should be at full life after the fight: ${health(a)} and ${health(b)}`);
    t.assert(away(t, b) > RADIUS + 1, `The knocked-out fighter should be outside the ring, but is ${away(t, b).toFixed(1)} blocks from the middle`);
    t.assert(away(t, a) < RADIUS, "The winner should still be inside the ring");
    t.assert(ownThingsBack(a) && ownThingsBack(b), "A fighter's own things didn't all come back");
    t.assert(!hasItem(a, "minecraft:iron_sword") && !hasItem(b, "minecraft:iron_sword") && worn(a)[0] === undefined, "The fight gear stayed with them");
    t.assert(hasItem(a, "minecraft:golden_apple") && !hasItem(b, "minecraft:golden_apple"), "Only the winner gets the golden apple");
    t.assert(t.dimension.getEntities({ type: HOLDER, location: t.origin, maxDistance: 16 }).length === 0, "A holder is left behind");
    t.assert(wins("Alpha") === winsBefore + 1 && losses("Bravo") === lossesBefore + 1, `The ranking should have one win for Alpha and one loss for Bravo, but it is ${JSON.stringify(latestRanking)} (before: ${winsBefore}, ${lossesBefore})`);
    t.assert(deaths.length === 0, `Somebody died: ${deaths}`);
    await t.until(() => fans(t).length === 0, `The crowd is still there after the fight: ${fans(t).length}`, 260);
  } finally {
    world.afterEvents.entityDie.unsubscribe(sub);
  }
}

export async function aSpectatorOrOnePlayerAloneCantStartAFight(t) {
  buildRing(t, { block: "minecraft:smooth_sandstone", gaps: 14 }); // a ring with a few gaps, of another kind of sandstone
  const a = t.player("Alone", 2, 0);
  const spectator = t.player("Watcher", 9, 0); // outside the ring
  press(t, a);
  await t.wait(30);
  press(t, a); // the same player twice
  await t.wait(5);
  press(t, spectator, -1);
  await t.wait(60);
  t.assert(fans(t).length === 0, "A fight started with one player, or with a spectator outside the ring");
  t.assert(!hasGear(a), "The lonely player got fight gear");
  const b = t.player("Friend", -3, 0);
  press(t, b, -1);
  await t.until(() => fans(t).length > 0, "A real challenger didn't start the fight: the gaps or the spectator broke it", 40);
}

export async function aFightStopsIfSomeoneLeavesBeforeItStarts(t) {
  buildRing(t);
  const a = t.player("Stays", 2, 0);
  const b = t.player("Runs", 4, 0);
  giveOwnThings(b);
  press(t, a);
  press(t, b, -1);
  await t.until(() => fans(t).length > 0, "No crowd came", 40);
  b.teleport(t.at(RADIUS + 5, 0, 0.5)); // out of the ring during the countdown
  await t.until(() => fans(t).length === 0, "The crowd stayed after someone left the ring", 100);
  await t.wait(80);
  t.assert(!hasGear(a) && !hasGear(b), "Fight gear was given although the fight was off");
  t.assert(ownThingsBack(b), "Runs lost their things");
}

export async function nothingThatCouldKillAFighterWorks(t) {
  buildRing(t);
  const a = t.player("Safe", 2, 0);
  const b = t.player("Sorry", 4, 0);
  const spectator = t.player("Nosy", 0, 3);
  const deaths = [];
  const sub = world.afterEvents.entityDie.subscribe(({ deadEntity }) => deaths.push(deadEntity?.typeId));
  try {
    giveOwnThings(a);
    giveOwnThings(b);
    await startFight(t, a, b);

    // Not the other fighter: nothing happens.
    spectator.lookAtEntity(a);
    spectator.attackEntity(a);
    await t.wait(15);
    t.assert(health(a) === 20, `A spectator hurt a fighter: ${health(a)}`);
    a.applyDamage(1000, { cause: EntityDamageCause.fall });
    a.applyDamage(1000, { cause: EntityDamageCause.fire });
    await t.wait(5);
    t.assert(health(a) === 20 && hasGear(a), `A fall or fire hurt a fighter: ${health(a)}`);
    // Falling from far above the ring: they're put back inside long before it hurts.
    a.teleport(t.at(1, 40, 1));
    await t.until(() => a.location.y < t.at(0, 10, 0).y, "A never came down from the sky", 60);
    t.assert(a.isValid && health(a) > 0, "The fighter died in the fall");
    await t.until(() => away(t, a) < RADIUS && a.location.y < t.at(0, 4, 0).y, "A fighter high above the ring was never sent back", 120);
    // The strongest real hits: a netherite sword with Sharpness V and Strength IV (the fighters can't have either: this is a cheat).
    const sword = new ItemStack("minecraft:netherite_sword", 1);
    sword.getComponent("minecraft:enchantable").addEnchantment({ type: new EnchantmentType("sharpness"), level: 5 });
    container(a).setItem(0, sword);
    a.addEffect("strength", 600, { amplifier: 4 });
    let strongest = 0;
    const sub2 = world.afterEvents.entityHurt.subscribe(({ hurtEntity, damage }) => {
      if (hurtEntity?.id === b.id) strongest = Math.max(strongest, damage);
    });
    try {
      for (let i = 0; i < 12 && container(b).getItem(0)?.typeId === "minecraft:iron_sword"; i++) {
        a.lookAtEntity(b);
        a.attackEntity(b);
        await t.wait(14);
      }
    } finally {
      world.afterEvents.entityHurt.unsubscribe(sub2);
    }
    await t.until(() => !hasGear(b), "The strong hits never knocked the fighter out", 40);
    t.assert(strongest > 8, `The test's hit should be a strong one, but the most damage was ${strongest}`);
    t.assert(b.isValid && health(b) === 20 && deaths.length === 0, `A fighter died from the strongest hits: deaths ${deaths}`);
    t.assert(ownThingsBack(b), "Their things didn't come back after the huge hit");
    // The winner's hotbar slot was taken by the cheat sword: the diamond sword comes back to another slot instead of being lost.
    t.assert(hasItem(a, "minecraft:diamond_sword") && container(a).getItem(20)?.amount === 33, "The winner lost something");
  } finally {
    world.afterEvents.entityDie.unsubscribe(sub);
  }
}

export async function leavingTheRingAgainAndAgainLosesTheFight(t) {
  buildRing(t);
  const a = t.player("Home", 2, 0);
  const b = t.player("Away", 4, 0);
  giveOwnThings(a);
  giveOwnThings(b);
  const lossesBefore = losses("Away");
  await startFight(t, a, b);
  b.teleport(t.at(RADIUS + 4, 0, 0.5));
  await t.until(() => away(t, b) < RADIUS, "A fighter who left the ring wasn't sent back", 40);
  t.assert(hasGear(b), "The fight ended after the first time out of the ring");
  for (let i = 0; i < 3 && hasGear(b); i++) {
    b.teleport(t.at(RADIUS + 4, 0, 0.5));
    await t.wait(15);
  }
  await t.until(() => !hasGear(a) && !hasGear(b), "Leaving the ring again and again didn't end the fight", 40);
  t.assert(ownThingsBack(a) && ownThingsBack(b), "Their things didn't come back");
  t.assert(losses("Away") === lossesBefore + 1, "The one who left should lose");
}

export async function aFighterWhoLogsOutLosesAndTheOtherGetsTheirThingsBack(t) {
  buildRing(t);
  const a = t.player("Stayer", 2, 0);
  const b = t.player("Quitter", 4, 0);
  giveOwnThings(a);
  giveOwnThings(b);
  await startFight(t, a, b);
  b.disconnect();
  await t.until(() => !hasGear(a), "The other fighter was left in the fight", 60);
  t.assert(ownThingsBack(a), "The winner's own things didn't come back");
  await t.until(() => fans(t).length === 0, "The crowd stayed", 260);
  // The quitter's things are still safe in the holder, waiting for them.
  t.assert(t.dimension.getEntities({ type: HOLDER, location: t.origin, maxDistance: 16 }).length === 1, "The holder with the quitter's things should wait for them");
}

export async function aFighterWhoDiesAnywayGetsTheirThingsBackWhenTheyRespawn(t) {
  buildRing(t);
  const a = t.player("Lives", 2, 0);
  const b = t.player("Dies", 4, 0);
  giveOwnThings(a);
  giveOwnThings(b);
  await startFight(t, a, b);
  b.kill(); // not something the game can cause: a grown-up's /kill
  await t.until(() => !hasGear(a), "The other fighter was left in the fight", 60);
  t.assert(ownThingsBack(a), "The winner's own things didn't come back");
  await t.wait(10);
  t.assert(b.respawn(), "Couldn't respawn");
  await t.until(() => ownThingsBack(b), () => `The dead fighter's things didn't come back when they respawned (emeralds: ${container(b).getItem(20)?.typeId})`, 200);
}
