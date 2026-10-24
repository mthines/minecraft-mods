// Played by simulated players on the test server: mc test pirate
import { EntityDamageCause, EquipmentSlot, ItemStack } from "@minecraft/server";

// Husks are zombies that don't burn in daylight, so only the saber sets them on fire.
const TARGET = "minecraft:husk";
const health = (mob) => mob.getComponent("minecraft:health")?.currentValue ?? 0;
const burning = (mob) => mob.isValid && mob.getComponent("minecraft:onfire") !== undefined;

/** A pirate holding `item`, next to a husk. */
async function setUp(t, item) {
  const player = t.player("Pirate");
  if (item) player.setItem(new ItemStack(item, 1), 0, true);
  const mob = t.dimension.spawnEntity(TARGET, t.at(0.5, 0, 2.5));
  await t.wait(10);
  return { player, mob, full: health(mob) };
}

export async function theSaberSetsAMobOnFire(t) {
  const { player, mob, full } = await setUp(t, "family:pirate_saber");
  player.lookAtEntity(mob);
  t.assert(player.attackEntity(mob), "The pirate couldn't hit the husk");
  await t.until(() => burning(mob), "The husk didn't catch fire from the saber", 20);
  t.assert(health(mob) < full, `The saber didn't hurt the husk (${health(mob)} of ${full})`);
}

export async function aPunchDoesNotSetAMobOnFire(t) {
  const { player, mob } = await setUp(t);
  player.lookAtEntity(mob);
  t.assert(player.attackEntity(mob), "The pirate couldn't hit the husk");
  await t.wait(10);
  t.assert(!burning(mob), "A plain punch set the husk on fire");
}

// ── The outfit ───────────────────────────────────────────────────────────────

const OUTFIT = [
  ["family:pirate_hat", EquipmentSlot.Head],
  ["family:pirate_coat", EquipmentSlot.Chest],
  ["family:pirate_trousers", EquipmentSlot.Legs],
  ["family:pirate_boots", EquipmentSlot.Feet],
];
const worn = (player, slot) => player.getComponent("minecraft:equippable")?.getEquipment(slot)?.typeId;

export async function usingAPieceOfTheOutfitPutsItOn(t) {
  const player = t.player("Pirate");
  await t.wait(10);
  for (const [item, slot] of OUTFIT) {
    t.hold(player, item);
    // A simulated player's use can be refused right after the one before, like a player clicking too fast: try again.
    await t.until(() => { if (worn(player, slot) !== item) player.useItemInSlot(0); return worn(player, slot) === item; }, () => `Using the ${item} didn't put it on (${slot} has ${worn(player, slot)})`, 40);
  }
}

export async function theOutfitProtectsLikeArmor(t) {
  const dressed = t.player("Dressed", -2);
  const plain = t.player("Plain", 2);
  await t.wait(10);
  const equippable = dressed.getComponent("minecraft:equippable");
  for (const [item, slot] of OUTFIT) t.assert(equippable?.setEquipment(slot, new ItemStack(item, 1)), `Couldn't put ${item} on`);
  for (const player of [dressed, plain]) player.applyDamage(10, { cause: EntityDamageCause.entityAttack });
  await t.wait(5);
  t.assert(health(dressed) >= health(plain) + 3, `The outfit didn't protect: dressed has ${health(dressed)} health left, without it ${health(plain)}`);
}

// ── The ship ─────────────────────────────────────────────────────────────────

const SHIP = "family:pirate_ship";
const PIRATE = "family:pirate";

/** Digs a pool 2 deep into the arena's ground, 11 wide and 15 long, and fills it with water. */
function pool(t) {
  const a = t.at(-5, -2, -7);
  const b = t.at(5, -1, 7);
  t.dimension.runCommand(`fill ${a.x} ${a.y} ${a.z} ${b.x} ${b.y} ${b.z} water`);
}

const ridingOn = (entity) => entity.getComponent("minecraft:riding")?.entityRidingOn;

export async function theShipGoesOnTheWaterYouLookAt(t) {
  pool(t);
  const player = t.player("Captain", 0, -9);
  t.hold(player, SHIP);
  await t.wait(10);
  player.lookAtBlock(t.at(0, -1, -3));
  await t.wait(5); // a simulated player's head turns a moment after lookAtBlock
  player.useItemInSlot(0);
  const ship = await t.until(() => t.entities(SHIP)[0], "Using the ship item while looking at water didn't put a ship there", 40);
  t.assert(Math.abs(ship.location.z - t.at(0, 0, -3).z) < 2, `The ship landed at z ${ship.location.z.toFixed(1)}, not on the water the captain looked at`);
  t.assert(!player.getComponent("minecraft:inventory")?.container?.getItem(0), "The ship item should be used up once the ship is on the water");
}

export async function theShipFloats(t) {
  pool(t);
  const ship = t.dimension.spawnEntity(SHIP, t.at(0.5, 1, 0.5));
  await t.wait(80);
  const surface = t.origin.y; // the water's top
  t.assert(ship.isValid, "The ship disappeared");
  t.assert(ship.location.y > surface - 1.2, `The ship sank: it's at y ${ship.location.y.toFixed(2)}, the water's top is ${surface}`);
}

// ── Pirate friends ───────────────────────────────────────────────────────────

/** A pirate brought next to `player`. */
async function pirateFor(t, player) {
  const pirate = t.dimension.spawnEntity(PIRATE, { x: player.location.x + 1.5, y: player.location.y, z: player.location.z });
  await t.until(() => pirate.getComponent("minecraft:tameable")?.tamedToPlayerId === player.id, "The pirate didn't join the player's crew", 40);
  return pirate;
}

export async function aPirateJoinsTheCrewOfWhoeverBroughtThem(t) {
  const player = t.player("Captain");
  await t.wait(5);
  const pirate = await pirateFor(t, player);
  t.assert(pirate.nameTag.length > 0, "The pirate should get a pirate name");
}

export async function theCrewSailsWithTheirCaptain(t) {
  pool(t);
  const ship = t.dimension.spawnEntity(SHIP, t.at(0.5, 0, 0.5));
  const player = t.player("Captain", 0, -9);
  await t.wait(5);
  const pirate = await pirateFor(t, player);
  const rideable = ship.getComponent("minecraft:rideable");
  t.assert(rideable?.addRider(player), "The captain couldn't get on the ship");
  await t.until(() => ridingOn(pirate)?.id === ship.id, "The pirate didn't jump aboard with the captain", 60);
  rideable?.ejectRider(player);
  await t.until(() => !ridingOn(pirate), "The pirate stayed on the ship after the captain got off", 60);
}

export async function aPirateFightsMonsters(t) {
  const player = t.player("Captain", 0, -6);
  await t.wait(5);
  const pirate = await pirateFor(t, player);
  const husk = t.dimension.spawnEntity(TARGET, t.at(4.5, 0, 0.5));
  const full = health(husk);
  await t.until(() => !husk.isValid || health(husk) < full, `${pirate.nameTag} didn't fight the husk`, 200);
}

export async function youCanStandOnTheDeck(t) {
  pool(t);
  const ship = t.dimension.spawnEntity(SHIP, t.at(0.5, 1, 0.5));
  await t.wait(60); // let it settle on the water
  // The middle, and near the front and the back: the ship is 6 blocks long.
  for (const along of [0, 2.2, -2.2]) {
    const player = t.player(`Deckhand${along}`, 0, -9);
    await t.wait(5);
    player.teleport({ x: ship.location.x, y: ship.location.y + 2, z: ship.location.z + along });
    await t.wait(30);
    const above = player.location.y - ship.location.y;
    t.assert(!player.isInWater && above > 0.2, `Jumping onto the deck ${along} blocks from the middle fell through: the player is ${above.toFixed(2)} blocks above the ship${player.isInWater ? ", in the water" : ""}`);
    player.disconnect();
    await t.wait(5);
  }
}

// ── Sailing together ─────────────────────────────────────────────────────────

/** How far forward of the ship's middle `rider` sits: the wheel seat is about 2.4 blocks back. */
function along(ship, rider) {
  const r = (ship.getRotation().y * Math.PI) / 180;
  return -Math.sin(r) * (rider.location.x - ship.location.x) + Math.cos(r) * (rider.location.z - ship.location.z);
}

/** A ship on the pool, settled on the water. */
async function shipOnPool(t) {
  pool(t);
  const ship = t.dimension.spawnEntity(SHIP, t.at(0.5, 0, 0.5));
  await t.wait(40);
  return { ship, rideable: ship.getComponent("minecraft:rideable") };
}

const atTheWheel = (ship, rider) => Math.abs(along(ship, rider) + 2.4) < 0.5;

export async function friendsCanComeAboardWhenTheCrewIsBig(t) {
  const { ship, rideable } = await shipOnPool(t);
  const captain = t.player("Captain", 0, -9);
  await t.wait(5);
  for (let i = 0; i < 7; i++) await pirateFor(t, captain);
  t.assert(rideable.addRider(captain), "The captain couldn't get on the ship");
  await t.wait(30);
  const pirates = rideable.getRiders().filter((rider) => rider.typeId === PIRATE).length;
  t.assert(pirates > 0, "No pirates jumped aboard with the captain");
  for (const name of ["Friend", "OtherFriend"]) {
    const friend = t.player(name, 2, -9);
    await t.wait(5);
    t.assert(rideable.addRider(friend), `${name} couldn't get on: the captain's ${pirates} pirates took every seat`);
  }
  t.assert(atTheWheel(ship, captain), `The captain should be at the wheel, but sits ${along(ship, captain).toFixed(1)} blocks from the middle`);
}

export async function theNextOneAboardTakesTheWheel(t) {
  const { ship, rideable } = await shipOnPool(t);
  const captain = t.player("Captain", 0, -9);
  const friend = t.player("Friend", 2, -9);
  await t.wait(5);
  t.assert(rideable.addRider(captain) && rideable.addRider(friend), "The captain and their friend couldn't both get on");
  await t.wait(10);
  t.assert(!atTheWheel(ship, friend), "The friend got on second but sits at the wheel");
  rideable.ejectRider(captain);
  await t.until(() => rideable.getRiders()[0]?.id === friend.id && atTheWheel(ship, friend), "The friend didn't move up to the wheel when the captain got off", 40);
}

export async function aPirateNeverTakesTheWheel(t) {
  const { ship, rideable } = await shipOnPool(t);
  const captain = t.player("Captain", 0, -9);
  await t.wait(5);
  const pirate = await pirateFor(t, captain);
  t.assert(rideable.addRider(pirate), "The pirate couldn't get on the ship");
  t.assert(rideable.addRider(captain), "The captain couldn't get on after the pirate");
  await t.until(() => rideable.getRiders()[0]?.id === captain.id && atTheWheel(ship, captain), `${pirate.nameTag} got on first and kept the wheel`, 40);
}
