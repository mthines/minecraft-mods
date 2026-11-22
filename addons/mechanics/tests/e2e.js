// Played by simulated players on the test server: mc test mechanics
import { Direction, EquipmentSlot, ItemStack } from "@minecraft/server";

// What a part is in a slot's entity property (see PARTS in behavior_pack/scripts/catalog.js).
const PART = { seat: 1, body: 2, glass: 3, thruster: 4, wing: 5, plow: 6, gatling: 7, rocket: 8, laser: 9, slab: 10, ramp: 11, ramp_back: 12, light: 13, spoiler: 14 };
const ITEM = (key) => `family:mech_${key}`;
const RACER = "family:mech_racer";
const HAULER = "family:mech_hauler";
const FARM = "family:mech_farm";
const HUSK = "minecraft:husk";

const health = (mob) => mob.getComponent("minecraft:health")?.currentValue ?? 0;

// The deck is a grid of cells (see BASES in behavior_pack/scripts/catalog.js); five slots share one property, a base-16 digit each.
const GRID = {
  [RACER]: { cols: 4, rows: 6, layers: 3, cell: 0.5, deckTop: 0.4 },
  [HAULER]: { cols: 3, rows: 6, layers: 3, cell: 1, deckTop: 0.7 },
  [FARM]: { cols: 4, rows: 6, layers: 3, cell: 0.5, deckTop: 0.9 },
};
const cell = (type, layer, col, row) => (layer * GRID[type].rows + row) * GRID[type].cols + col;
const sideSlot = (type, n) => GRID[type].cols * GRID[type].rows * GRID[type].layers + n;
const slotCount = (type) => sideSlot(type, 3);
const SEAT = { [RACER]: cell(RACER, 0, 0, 1), [HAULER]: cell(HAULER, 0, 0, 0), [FARM]: cell(FARM, 0, 1, 2) };
const slot = (vehicle, i) => Math.floor(Number(vehicle.getProperty(`family:g${Math.floor(i / 5)}`)) / 16 ** (i % 5)) % 16;
const setSlot = (vehicle, i, id) => {
  const name = `family:g${Math.floor(i / 5)}`;
  vehicle.setProperty(name, Number(vehicle.getProperty(name)) + (id - slot(vehicle, i)) * 16 ** (i % 5));
};
const filled = (vehicle) => [...Array(slotCount(vehicle.typeId)).keys()].filter((i) => slot(vehicle, i) !== 0);
const seatsOn = (vehicle) => filled(vehicle).filter((i) => slot(vehicle, i) === PART.seat);
/** Where a slot's middle is in the world, for a vehicle pointing south (its left is +x, its back is -z). */
function slotCenter(vehicle, i) {
  const g = GRID[vehicle.typeId];
  const layer = Math.floor(i / (g.cols * g.rows));
  const row = Math.floor((i % (g.cols * g.rows)) / g.cols);
  const col = i % g.cols;
  return { x: vehicle.location.x + ((g.cols - 1) / 2 - col) * g.cell, y: vehicle.location.y + g.deckTop + layer * g.cell + g.cell / 2, z: vehicle.location.z - (row - (g.rows - 1) / 2) * g.cell };
}
const lookAtSlot = async (t, player, vehicle, i) => {
  player.lookAtLocation(slotCenter(vehicle, i));
  await t.wait(3); // the aim takes a moment to arrive
};
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
  const seats = [];
  const ids = Array(slotCount(type)).fill(0);
  for (const [i, key] of Object.entries(parts)) {
    ids[Number(i)] = PART[key];
    if (key === "seat") seats.push(Number(i));
  }
  // Written in one go: a property read straight after a write may still show the old value.
  for (let g = 0; g * 5 < ids.length; g++) vehicle.setProperty(`family:g${g}`, ids.slice(g * 5, g * 5 + 5).reduce((sum, id, d) => sum + id * 16 ** d, 0));
  vehicle.triggerEvent(`family:set_seats_${seats.length ? seats.sort((a, b) => a - b).join("_") : "none"}`);
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
  await lookAtSlot(t, player, racer, SEAT[RACER]);
  await t.until(() => { if (!seatsOn(racer).length) player.interactWithEntity(racer); return seatsOn(racer).length === 1; }, () => `Using a seat on the racer didn't put a seat on it (slots with parts: ${filled(racer).join(",")})`, 40);
  await t.until(() => !itemsOf(player).includes(ITEM("seat")), "The seat wasn't used up", 20);
  player.getComponent("minecraft:inventory").container.setItem(0, undefined);
  await getOn(t, player, racer);
  t.assert(riding(player)?.id === racer.id, "The player couldn't get on after the seat was added");
}

export async function aSecondSeatCanBeAddedToAVehicleThatAlreadyHasOne(t) {
  const player = t.player();
  const racer = build(t, RACER, { [SEAT[RACER]]: "seat" }, 3);
  await t.wait(5);
  t.hold(player, ITEM("seat"));
  await lookAtSlot(t, player, racer, cell(RACER, 0, 3, 1));
  await t.until(() => { if (seatsOn(racer).length < 2) player.interactWithEntity(racer); return seatsOn(racer).length === 2; }, () => `A second seat didn't go on the racer (slots with parts: ${filled(racer).join(",")})`, 40);
  await t.wait(5);
  t.assert(!riding(player), "Adding a seat should not leave the player sitting on the vehicle");
}

export async function aSeatDoesNotGoWhereAnotherPartStands(t) {
  const player = t.player();
  const spot = SEAT[RACER];
  const racer = build(t, RACER, { [spot]: "body" }, 3);
  await t.wait(5);
  t.hold(player, ITEM("seat"));
  await lookAtSlot(t, player, racer, spot);
  for (let i = 0; i < 6; i++) { player.interactWithEntity(racer); await t.wait(3); }
  t.assert(slot(racer, spot) === PART.body, `A seat went into the body block's cell: ${slot(racer, spot)}`);
  // Prove the use did arrive: it put the seat on another seat spot, or on this one once the body block is gone.
  setSlot(racer, spot, 0);
  await t.until(() => { if (!seatsOn(racer).length) player.interactWithEntity(racer); return seatsOn(racer).length >= 1; }, "With the cell free, the seat should have gone on the racer", 40);
}

export async function holdingForwardMovesTheVehicleAheadAndTheKeysSteer(t) {
  const player = t.player();
  const racer = build(t, RACER, { [SEAT[RACER]]: "seat" }, -10);
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
  const racer = build(t, RACER, { [SEAT[RACER]]: "seat" }, -12, -6);
  const truck = build(t, HAULER, { [SEAT[HAULER]]: "seat" }, -12, 8);
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
  const parts = { [SEAT[RACER]]: "seat", [cell(RACER, 0, 1, 3)]: "body", [cell(RACER, 0, 2, 4)]: "thruster", [cell(RACER, 1, 1, 3)]: "slab" };
  const racer = build(t, RACER, parts, 3);
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
  t.assert(Object.entries(parts).every(([i, key]) => slot(again, Number(i)) === PART[key]) && filled(again).length === Object.keys(parts).length, "The racer that came back has different parts");
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
  const target = cell(RACER, 0, 1, 4);
  await lookAtSlot(t, player, racer, target);
  await t.until(() => { if (!filled(racer).length) player.interactWithEntity(racer); return filled(racer).length > 0; }, () => `The body block didn't go on the racer: ${filled(racer).join(",")}`, 40);
  const row = Math.floor((filled(racer)[0] % 24) / 4);
  t.assert(filled(racer).length === 1 && row >= 3, `The body block should be in the back rows (3 to 5), but it is in row ${row}`);
}

export async function theWrenchTakesAPartOffAndGivesTheItemBack(t) {
  const player = t.player("Builder", 0, -6);
  const spot = cell(RACER, 0, 1, 4);
  const racer = build(t, RACER, { [spot]: "body" }, 0);
  await t.wait(5);
  t.hold(player, ITEM("wrench"));
  await lookAtSlot(t, player, racer, spot);
  await t.until(() => { if (slot(racer, spot)) player.attackEntity(racer); return slot(racer, spot) === 0; }, "The wrench didn't take the body block off", 40);
  t.assert(itemsOf(player).includes(ITEM("body")), `The body block didn't come back as an item: ${itemsOf(player).join(", ")}`);
}

export async function aHaulersCargoSurvivesDriving(t) {
  const player = t.player();
  const truck = build(t, HAULER, { [SEAT[HAULER]]: "seat" }, -12);
  truck.getComponent("minecraft:inventory").container.setItem(3, new ItemStack("minecraft:diamond", 5));
  await getOn(t, player, truck);
  const startZ = truck.location.z;
  drive(player);
  await t.wait(30);
  release(player);
  const stack = truck.getComponent("minecraft:inventory").container.getItem(3);
  t.assert(stack?.typeId === "minecraft:diamond" && stack.amount === 5, `The cargo changed: ${stack?.typeId} x${stack?.amount}`);
  t.assert(truck.location.z > startZ + 2, `The truck should have driven ahead while carrying the cargo, but moved ${(truck.location.z - startZ).toFixed(1)} blocks`);
}

export async function aPlowTurnsGrassBehindTheTractorIntoFarmland(t) {
  const player = t.player("Farmer", -3, -14);
  for (let z = -12; z <= 6; z++) for (let x = -2; x <= 2; x++) t.place("minecraft:grass_block", x, -1, z);
  t.place("minecraft:grass_block", 8, -1, 0);
  const tractor = build(t, FARM, { [SEAT[FARM]]: "seat", [sideSlot(FARM, 2)]: "plow" }, -10);
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
  const truck = build(t, HAULER, { [SEAT[HAULER]]: "seat", [cell(HAULER, 0, 0, 3)]: "thruster" }, -12);
  await getOn(t, player, truck);
  const y = truck.location.y;
  drive(player, 0, 0, 1);
  await t.wait(30);
  release(player);
  t.assert(truck.location.y < y + 0.5, `One thruster shouldn't lift a truck, but it rose ${(truck.location.y - y).toFixed(1)} blocks`);
}

export async function aRacerWithEnoughThrustersHoversAndClimbs(t) {
  const player = t.player();
  const racer = build(t, RACER, { [SEAT[RACER]]: "seat", [cell(RACER, 0, 1, 4)]: "thruster", [cell(RACER, 0, 2, 4)]: "thruster" }, -12);
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
  const jet = build(t, RACER, { [SEAT[RACER]]: "seat", [cell(RACER, 0, 1, 4)]: "thruster", [cell(RACER, 0, 2, 4)]: "thruster", [sideSlot(RACER, 0)]: "wing", [sideSlot(RACER, 1)]: "wing" }, -12);
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
  const parts = weapon ? { [SEAT[RACER]]: "seat", [cell(RACER, 0, 1, 3)]: weapon } : { [SEAT[RACER]]: "seat" };
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
  const racer = build(t, RACER, { [SEAT[RACER]]: "seat", [cell(RACER, 0, 1, 3)]: "rocket" }, -12);
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
  const racer = build(t, RACER, { [cell(RACER, 0, 0, 1)]: "seat", [cell(RACER, 0, 3, 1)]: "seat", [cell(RACER, 0, 1, 3)]: "laser", [cell(RACER, 0, 2, 3)]: "gatling" }, -12);
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
  const design = { [SEAT[RACER]]: "seat", [cell(RACER, 0, 1, 3)]: "body", [cell(RACER, 1, 1, 3)]: "slab", [cell(RACER, 0, 2, 4)]: "laser" };
  const racer = build(t, RACER, design, 0);
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
  t.assert(Object.entries(design).every(([i, key]) => slot(copy, Number(i)) === PART[key]) && filled(copy).length === Object.keys(design).length, "The copy has different parts than the saved design");
  t.assert(itemsOf(player).includes(ITEM("blueprint_saved")), "A saved blueprint should be kept after building from it");
}

/** Using a ready-made vehicle's item on the ground builds it, with a seat where its driver sits. */
async function garage(t, name, base) {
  const player = t.player();
  t.hold(player, `family:mech_ready_${name}`);
  player.lookAtBlock(t.at(0, -1, 4));
  await t.wait(2);
  await t.until(() => { if (t.entities(base).length === 0) player.useItemInSlot(0); return t.entities(base).length === 1; }, `Using the ${name} item on the ground didn't build a ${base}`, 60);
  const [vehicle] = t.entities(base);
  t.assert(seatsOn(vehicle).length >= 1, `The ${name} has no seat`);
  const rider = t.player("Rider", 3, 3);
  await getOn(t, rider, vehicle);
  t.assert(riding(rider)?.id === vehicle.id, `Nobody can get on the ${name}`);
}

export const theGarageSportsCarBuildsItsVehicle = (t) => garage(t, "sports_car", RACER);
export const theGarageTruckBuildsItsVehicle = (t) => garage(t, "truck", HAULER);
export const theGarageTractorBuildsItsVehicle = (t) => garage(t, "tractor", FARM);
export const theGarageJetBuildsItsVehicle = (t) => garage(t, "jet", RACER);

// ── Building with layers, seats where you want them, and hills ───────────────

export async function aPartAimedOnTopOfAPartGoesUpALayer(t) {
  const player = t.player("Builder", 0, -6);
  const base = cell(RACER, 0, 1, 3);
  const racer = build(t, RACER, { [base]: "body" }, 0);
  await t.wait(5);
  t.hold(player, ITEM("slab"));
  const above = cell(RACER, 1, 1, 3);
  await lookAtSlot(t, player, racer, above);
  await t.until(() => { if (!slot(racer, above)) player.interactWithEntity(racer); return slot(racer, above) === PART.slab; }, () => `The slab didn't go on top of the body block (parts in slots ${filled(racer).join(",")})`, 40);
  t.assert(slot(racer, base) === PART.body, "The body block under it is gone");
}

export async function aSeatWhereYouPutItIsWhereTheRiderSits(t) {
  const player = t.player();
  const spot = cell(RACER, 0, 3, 1); // the right-hand seat of the front row: the car's left is +x, so column 3 is on its -x side
  const racer = build(t, RACER, { [spot]: "seat" }, 3);
  await getOn(t, player, racer);
  await t.wait(5);
  const offset = player.location.x - racer.location.x;
  t.assert(offset < -0.4, `The rider should sit on the seat at the car's right (x -0.75), but sits ${offset.toFixed(2)} blocks to the side`);
}

/** A racer with a seat, a stair of `steps` stone steps (a block higher every 3 blocks, all the way to z 10), and the player on it. */
async function climb(t, steps) {
  const player = t.player();
  const racer = build(t, RACER, { [SEAT[RACER]]: "seat" }, -12);
  for (let n = 0; n < steps; n++) for (let z = -4 + n * 3; z <= 10; z++) for (let x = -3; x <= 3; x++) t.place("minecraft:stone", x, n, z);
  await getOn(t, player, racer);
  const y = racer.location.y;
  let rise = 0;
  drive(player);
  for (let i = 0; i < 20; i++) { // the racer drives past the end of the stair, so how high it got is what counts
    await t.wait(5);
    rise = Math.max(rise, racer.location.y - y);
  }
  release(player);
  return { rise, racer };
}

export async function theVehicleHopsUpAStep(t) {
  const { rise } = await climb(t, 1);
  t.assert(rise > 0.8, `A one-block step should be climbed, but the vehicle only rose ${rise.toFixed(1)} blocks`);
}

export async function theVehicleDrivesUpAHillOfSteps(t) {
  const { rise } = await climb(t, 3);
  t.assert(rise > 2.5, `Three steps up should be climbed, but the vehicle only rose ${rise.toFixed(1)} blocks`);
}
