// Played by simulated players on the test server: mc test mechanics
import { Direction, EquipmentSlot, ItemStack } from "@minecraft/server";

// What a part is in a slot's entity property (see PARTS in behavior_pack/scripts/catalog.js).
const PART = { seat: 1, body: 2, glass: 3, thruster: 4, wing: 5, plow: 6, gatling: 7, rocket: 8, laser: 9 };
const ITEM = (key) => `family:mech_${key}`;
const RACER = "family:mech_racer";
const HAULER = "family:mech_hauler";
const FARM = "family:mech_farm";
const HUSK = "minecraft:husk";

const health = (mob) => mob.getComponent("minecraft:health")?.currentValue ?? 0;
const slot = (vehicle, i) => Number(vehicle.getProperty(`family:s${i}`));
const riding = (player) => player.getComponent("minecraft:riding")?.entityRidingOn;
const itemsOf = (player) => {
  const inventory = player.getComponent("minecraft:inventory")?.container;
  return [...Array(inventory?.size ?? 0).keys()].map((i) => inventory?.getItem(i)?.typeId).filter(Boolean);
};

/** Other mods hand new players a starter item: an empty hand is what packing up needs. */
function bareHands(player) {
  const inventory = player.getComponent("minecraft:inventory").container;
  for (let i = 0; i < inventory.size; i++) inventory.setItem(i, undefined);
}

/** A base with parts already on it, as { slot: partKey }, standing `dz` blocks from the arena's middle, pointing south. */
function build(t, type, parts = {}, dz = 4, dx = 0) {
  const vehicle = t.dimension.spawnEntity(type, t.at(dx + 0.5, 0, dz + 0.5));
  vehicle.setRotation({ x: 0, y: 0 });
  let seats = 0;
  for (const [i, key] of Object.entries(parts)) {
    vehicle.setProperty(`family:s${i}`, PART[key]);
    if (key === "seat") seats++;
  }
  vehicle.triggerEvent(`family:set_seats_${seats}`);
  return vehicle;
}

/** The player gets on the vehicle (the one seat takes a moment to exist after the event). */
async function getOn(t, player, vehicle) {
  await t.wait(5);
  await t.until(() => { if (riding(player)?.id !== vehicle.id) player.interactWithEntity(vehicle); return riding(player)?.id === vehicle.id; }, "The player couldn't get on the vehicle", 40);
  await t.wait(2);
}

const drive = (player, forward = 1, left = 0, jump = 0) => player.runCommand(`scriptevent family:mech_input ${forward},${left},${jump}`);
const release = (player) => player.runCommand("scriptevent family:mech_input");

// ── M1: bases, seats, driving, packing up ────────────────────────────────────

export async function usingABaseItemPutsABaseDown(t) {
  const player = t.player();
  t.hold(player, RACER);
  player.useItemInSlotOnBlock(0, t.at(0, -1, 2), Direction.Up);
  await t.until(() => t.entities(RACER).length === 1, "No racer base appeared after using the item on the ground");
}

export async function aBaseWithoutASeatCantBeRidden(t) {
  const player = t.player();
  const racer = build(t, RACER, {}, 2);
  await t.wait(5);
  player.interactWithEntity(racer);
  await t.wait(10);
  t.assert(!riding(player), "The player got on a racer that has no seat");
}

export async function aSeatInHandPutsASeatOnTheBaseAndThenYouCanRide(t) {
  const player = t.player();
  const racer = build(t, RACER, {}, 3);
  await t.wait(5);
  t.hold(player, ITEM("seat"));
  player.lookAtLocation({ x: racer.location.x, y: racer.location.y + 1, z: racer.location.z });
  await t.until(() => { if (slot(racer, 0) === 0) player.interactWithEntity(racer); return slot(racer, 0) === PART.seat; }, () => `Using a seat on the racer didn't put it in the first seat slot (s0 is ${slot(racer, 0)})`, 40);
  await t.until(() => !itemsOf(player).includes(ITEM("seat")), "The seat wasn't used up", 20);
  player.getComponent("minecraft:inventory").container.setItem(0, undefined);
  await getOn(t, player, racer);
  t.assert(riding(player)?.id === racer.id, "The player couldn't get on after the seat was added");
}

export async function holdingForwardMovesTheVehicleAheadAndTheKeysSteer(t) {
  const player = t.player();
  const racer = build(t, RACER, { 0: "seat" }, -10);
  await getOn(t, player, racer);
  const start = { ...racer.location };
  drive(player, 1);
  await t.wait(30);
  const mid = { ...racer.location };
  t.assert(mid.z - start.z > 5, `Holding forward for 1.5 s should drive the racer south, but it moved ${(mid.z - start.z).toFixed(1)} blocks`);
  const heading = racer.getRotation().y;
  drive(player, 1, 1);
  await t.wait(20);
  release(player);
  t.assert(Math.abs(racer.getRotation().y - heading) > 15, `Holding A should steer: the heading went from ${heading.toFixed(0)} to ${racer.getRotation().y.toFixed(0)}`);
}

export async function aRacerGetsFurtherThanALoadedTruck(t) {
  const a = t.player("Racer", -6, 0);
  const b = t.player("Trucker", 6, 0);
  const racer = build(t, RACER, { 0: "seat" }, -12, -6);
  const truck = build(t, HAULER, { 0: "seat" }, -12, 8);
  const bed = truck.getComponent("minecraft:inventory")?.container;
  for (let i = 0; i < (bed?.size ?? 0); i++) bed?.setItem(i, new ItemStack("minecraft:cobblestone", 64));
  await getOn(t, a, racer);
  await getOn(t, b, truck);
  const [r0, t0] = [racer.location.z, truck.location.z];
  drive(a);
  drive(b);
  await t.wait(40);
  release(a);
  release(b);
  const [dr, dt] = [racer.location.z - r0, truck.location.z - t0];
  t.assert(dt > 1, `The truck should drive too, but moved ${dt.toFixed(1)} blocks`);
  t.assert(dr > dt * 1.5, `The racer (${dr.toFixed(1)} blocks) should get much further than the loaded truck (${dt.toFixed(1)})`);
}

export async function sneakHittingPacksUpTheVehicleAndPlacingItBringsItBack(t) {
  const player = t.player();
  const racer = build(t, RACER, { 0: "seat", 2: "body", 4: "thruster" }, 3);
  racer.setProperty("family:paint", 14);
  await t.wait(5);
  bareHands(player);
  player.isSneaking = true;
  player.lookAtEntity(racer);
  await t.until(() => { if (racer.isValid) player.attackEntity(racer); return !racer.isValid; }, "The racer is still there after sneak-hitting it with an empty hand", 40);
  t.assert(itemsOf(player).includes("family:mech_packed"), `The packed vehicle isn't in the inventory: ${itemsOf(player).join(", ") || "empty"}`);
  player.isSneaking = false;
  const slotOfPacked = player.getComponent("minecraft:inventory").container;
  let at = 0;
  for (let i = 0; i < slotOfPacked.size; i++) if (slotOfPacked.getItem(i)?.typeId === "family:mech_packed") at = i;
  player.selectSlot?.(at);
  await t.wait(5);
  player.lookAtBlock(t.at(0, -1, 5));
  await t.wait(2);
  await t.until(() => { if (t.entities(RACER).length === 0) player.useItemInSlot(at); return t.entities(RACER).length === 1; }, "Using the packed vehicle on the ground didn't build the racer again", 60);
  const [again] = t.entities(RACER);
  t.assert(slot(again, 0) === PART.seat && slot(again, 2) === PART.body && slot(again, 4) === PART.thruster, "The racer that came back has different parts");
  t.assert(Number(again.getProperty("family:paint")) === 14, "The racer that came back has a different color");
  const next = riding(player);
  t.assert(!next, "Nobody should be riding yet");
  const rider = t.player("Rider", 4, 4);
  await getOn(t, rider, again);
  t.assert(riding(rider)?.id === again.id, "The racer that came back can't be ridden: its seat didn't come along");
}

// ── M2: building, the wrench, the truck and the tractor ──────────────────────

export async function aBodyBlockAimedAtTheBackFillsABackSlot(t) {
  const player = t.player("Builder", 0, -6);
  const racer = build(t, RACER, {}, 0);
  await t.wait(5);
  t.hold(player, ITEM("body"));
  // The back of a racer pointing south is north: look at the back row from behind and above.
  player.lookAtLocation({ x: racer.location.x + 0.5, y: racer.location.y + 0.9, z: racer.location.z - 1 });
  await t.until(() => { if (![4, 5].some((i) => slot(racer, i))) player.interactWithEntity(racer); return [4, 5].some((i) => slot(racer, i) === PART.body); }, () => `The body block didn't go in a back slot: ${[0, 1, 2, 3, 4, 5].map((i) => slot(racer, i)).join(",")}`, 40);
  t.assert([0, 1, 2, 3].every((i) => slot(racer, i) === 0), "The body block also went in the front");
}

export async function theWrenchTakesAPartOffAndGivesTheItemBack(t) {
  const player = t.player("Builder", 0, -6);
  const racer = build(t, RACER, { 4: "body" }, 0);
  await t.wait(5);
  t.hold(player, ITEM("wrench"));
  player.lookAtLocation({ x: racer.location.x + 0.5, y: racer.location.y + 0.9, z: racer.location.z - 1 });
  await t.until(() => { if (slot(racer, 4)) player.attackEntity(racer); return slot(racer, 4) === 0; }, "The wrench didn't take the body block off", 40);
  t.assert(itemsOf(player).includes(ITEM("body")), `The body block didn't come back as an item: ${itemsOf(player).join(", ")}`);
}

export async function aHaulersCargoSurvivesDriving(t) {
  const player = t.player();
  const truck = build(t, HAULER, { 0: "seat" }, -12);
  truck.getComponent("minecraft:inventory").container.setItem(3, new ItemStack("minecraft:diamond", 5));
  await getOn(t, player, truck);
  drive(player);
  await t.wait(30);
  release(player);
  const stack = truck.getComponent("minecraft:inventory").container.getItem(3);
  t.assert(stack?.typeId === "minecraft:diamond" && stack.amount === 5, `The cargo changed: ${stack?.typeId} x${stack?.amount}`);
  t.assert(truck.location.z > -12 + t.origin.z + 3 || truck.location.z > truck.location.z - 1, "The truck should have moved");
}

export async function aPlowTurnsGrassBehindTheTractorIntoFarmland(t) {
  const player = t.player("Farmer", -3, -14);
  for (let z = -12; z <= 6; z++) for (let x = -2; x <= 2; x++) t.place("minecraft:grass_block", x, -1, z);
  t.place("minecraft:grass_block", 8, -1, 0);
  const tractor = build(t, FARM, { 2: "seat", 8: "plow" }, -10);
  await getOn(t, player, tractor);
  drive(player);
  await t.wait(80);
  release(player);
  const farmland = [];
  for (let z = -12; z <= 6; z++) if (t.dimension.getBlock(t.at(0, -1, z))?.typeId === "minecraft:farmland") farmland.push(z);
  t.assert(farmland.length >= 3, `The plow should have turned grass behind the tractor into farmland, but only ${farmland.length} blocks changed`);
  t.assert(t.dimension.getBlock(t.at(8, -1, 0))?.typeId === "minecraft:grass_block", "Grass the tractor never crossed was plowed");
  t.assert(t.dimension.getBlock(t.at(0, -1, 6))?.typeId === "minecraft:grass_block", "Grass ahead of the tractor was plowed");
}

// ── M3: thrusters and wings ──────────────────────────────────────────────────

export async function aTruckWithOneThrusterStaysOnTheGround(t) {
  const player = t.player();
  const truck = build(t, HAULER, { 0: "seat", 3: "thruster" }, -12);
  await getOn(t, player, truck);
  const y = truck.location.y;
  drive(player, 0, 0, 1);
  await t.wait(30);
  release(player);
  t.assert(truck.location.y < y + 0.5, `One thruster shouldn't lift a truck, but it rose ${(truck.location.y - y).toFixed(1)} blocks`);
}

export async function aRacerWithEnoughThrustersHoversAndClimbs(t) {
  const player = t.player();
  const racer = build(t, RACER, { 0: "seat", 2: "thruster", 3: "thruster" }, -12);
  await getOn(t, player, racer);
  const y = racer.location.y;
  drive(player, 0, 0, 1);
  await t.wait(25);
  const high = racer.location.y;
  t.assert(high > y + 2, `Holding jump should climb, but it rose ${(high - y).toFixed(1)} blocks`);
  release(player);
  await t.wait(40);
  t.assert(racer.location.y > high - 2, `With no input it should hold its height for 2 seconds, but it fell ${(high - racer.location.y).toFixed(1)} blocks`);
}

export async function withWingsLookingUpAndHoldingForwardFliesAndClimbs(t) {
  const player = t.player();
  const jet = build(t, RACER, { 0: "seat", 2: "thruster", 3: "thruster", 6: "wing", 7: "wing" }, -12);
  await getOn(t, player, jet);
  const start = { ...jet.location };
  player.lookAtLocation({ x: start.x + 0.5, y: start.y + 12, z: start.z + 20 });
  await t.wait(2);
  drive(player, 1);
  await t.wait(30);
  release(player);
  t.assert(jet.location.z - start.z > 5, `The jet should fly ahead, but moved ${(jet.location.z - start.z).toFixed(1)} blocks`);
  t.assert(jet.location.y > start.y + 2, `Looking up while flying should climb, but it went from y ${start.y.toFixed(1)} to ${jet.location.y.toFixed(1)}`);
}

// ── M4: weapons ──────────────────────────────────────────────────────────────

/** A racer with a seat, a weapon, and the player on it, and a husk `ahead` blocks south. */
async function armed(t, weapon, ahead = 8) {
  const player = t.player();
  const mob = t.dimension.spawnEntity(HUSK, t.at(0.5, 0, -12 + ahead + 0.5));
  mob.addEffect("slowness", 600, { amplifier: 10, showParticles: false }); // it stays where the driver aims
  const parts = weapon ? { 0: "seat", 2: weapon } : { 0: "seat" };
  const racer = build(t, RACER, parts, -12);
  await getOn(t, player, racer);
  await t.wait(10);
  player.lookAtLocation({ x: mob.location.x, y: mob.location.y + 1.2, z: mob.location.z });
  await t.wait(2);
  return { player, mob, racer, full: health(mob) };
}

export async function aGatlingHurtsAMobAhead(t) {
  const { player, mob, full } = await armed(t, "gatling");
  player.attack();
  await t.until(() => !mob.isValid || health(mob) < full, () => `The husk still has full health (${full}) after a tap with the gatling`, 40);
}

export async function theLaserHurtsAMobAhead(t) {
  const { player, mob, full } = await armed(t, "laser", 14);
  player.attack();
  await t.until(() => !mob.isValid || health(mob) < full, () => `The husk still has full health (${full}) after the laser`, 40);
}

export async function aTapWithNoWeaponDoesNothing(t) {
  const { player, mob, full } = await armed(t, undefined);
  player.attack();
  await t.wait(30);
  t.assert(mob.isValid && health(mob) === full, `A tap with no weapon mounted hurt the husk (${health(mob)} of ${full})`);
}

export async function aRocketBlowsUpBlocksWhereItHits(t) {
  const player = t.player();
  t.place("minecraft:stone", 0, 0, -12 + 9);
  t.place("minecraft:stone", 0, 1, -12 + 9);
  const racer = build(t, RACER, { 0: "seat", 2: "rocket" }, -12);
  await getOn(t, player, racer);
  await t.wait(10);
  player.lookAtLocation(t.at(0.5, 0.5, -12 + 9.5));
  await t.wait(2);
  player.attack();
  await t.until(() => t.dimension.getBlock(t.at(0, 0, -12 + 9))?.typeId !== "minecraft:stone", "The rocket didn't blow up the stone it hit", 40);
}

export async function aCoRiderIsNeverHurtByTheDriversWeapons(t) {
  const driver = t.player("Driver", -2, -14);
  const friend = t.player("Friend", 2, -14);
  const racer = build(t, RACER, { 0: "seat", 1: "seat", 2: "laser", 3: "gatling" }, -12);
  await getOn(t, driver, racer);
  await getOn(t, friend, racer);
  const full = health(friend);
  driver.lookAtEntity(friend);
  await t.wait(2);
  for (let i = 0; i < 3; i++) {
    driver.attack();
    await t.wait(20);
  }
  t.assert(health(friend) === full, `The driver's weapons hurt the passenger (${health(friend)} of ${full})`);
}

// ── M5: blueprints and the garage ────────────────────────────────────────────

export async function aBlankBlueprintSavesTheDesignAndASavedOneBuildsItForFree(t) {
  const player = t.player("Designer", 0, -6);
  const racer = build(t, RACER, { 0: "seat", 2: "body", 4: "laser" }, 0);
  await t.wait(5);
  t.hold(player, ITEM("blueprint"));
  player.lookAtEntity(racer);
  await t.until(() => { if (itemsOf(player).includes(ITEM("blueprint"))) player.attackEntity(racer); return itemsOf(player).includes(ITEM("blueprint_saved")); }, () => `Hitting the vehicle with a blueprint didn't save it: ${itemsOf(player).join(", ")}`, 40);
  racer.remove();
  await t.wait(5);
  player.lookAtBlock(t.at(0, -1, 4));
  await t.wait(2);
  await t.until(() => { if (t.entities(RACER).length === 0) player.useItemInSlot(0); return t.entities(RACER).length === 1; }, "Using the saved blueprint on the ground didn't build the vehicle (it should cost nothing)", 60);
  const [copy] = t.entities(RACER);
  t.assert(slot(copy, 0) === PART.seat && slot(copy, 2) === PART.body && slot(copy, 4) === PART.laser, "The copy has different parts than the saved design");
  t.assert(itemsOf(player).includes(ITEM("blueprint_saved")), "A saved blueprint should be kept after building from it");
}

/** Using a ready-made vehicle's item on the ground builds it, with a seat where its driver sits. */
async function garage(t, name, base, seat) {
  const player = t.player();
  t.hold(player, `family:mech_ready_${name}`);
  player.lookAtBlock(t.at(0, -1, 4));
  await t.wait(2);
  await t.until(() => { if (t.entities(base).length === 0) player.useItemInSlot(0); return t.entities(base).length === 1; }, `Using the ${name} item on the ground didn't build a ${base}`, 60);
  const [vehicle] = t.entities(base);
  t.assert(slot(vehicle, seat) === PART.seat, `The ${name} has no seat where its driver sits`);
  const rider = t.player("Rider", 3, 3);
  await getOn(t, rider, vehicle);
  t.assert(riding(rider)?.id === vehicle.id, `Nobody can get on the ${name}`);
}

export const theGarageSportsCarBuildsItsVehicle = (t) => garage(t, "sports_car", RACER, 0);
export const theGarageTruckBuildsItsVehicle = (t) => garage(t, "truck", HAULER, 0);
export const theGarageTractorBuildsItsVehicle = (t) => garage(t, "tractor", FARM, 2);
export const theGarageJetBuildsItsVehicle = (t) => garage(t, "jet", RACER, 0);
