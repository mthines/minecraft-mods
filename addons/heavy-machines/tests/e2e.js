// Played by simulated players on the test server: mc test heavy-machines
import { Direction, ItemStack } from "@minecraft/server";

const RIG = "family:drill_rig";
const CUTTER = "family:tree_cutter";

const ridingOn = (player) => player.getComponent("minecraft:riding")?.entityRidingOn;
const typeAt = (t, dx, dy, dz) => t.dimension.getBlock(t.at(dx, dy, dz))?.typeId;
const inventory = (player) => {
  const container = player.getComponent("minecraft:inventory")?.container;
  return [...Array(container?.size ?? 0).keys()].map((i) => container?.getItem(i)).filter(Boolean);
};
const has = (player, type) => inventory(player).some((item) => item.typeId === type);

/** Fills a box of blocks, `dx, dy, dz` from the arena's middle. */
function fill(t, type, [x1, y1, z1], [x2, y2, z2]) {
  const a = t.at(x1, y1, z1);
  const b = t.at(x2, y2, z2);
  t.dimension.runCommand(`fill ${a.x} ${a.y} ${a.z} ${b.x} ${b.y} ${b.z} ${type}`);
}

/**
 * A machine with a driver on it, looking at `look` and holding W. A drill rig's drill is switched on.
 * The machine stands in the middle of block 0, 0 with its front edge at z 2, against whatever is at z 2.
 */
async function drive(t, type, look, { switchOn = true } = {}) {
  const machine = t.dimension.spawnEntity(type, t.at(0.5, 0, 1));
  const driver = t.player("Driver", 0, -3);
  await t.wait(5);
  t.assert(machine.getComponent("minecraft:rideable")?.addRider(driver), `The driver couldn't get on the ${type}`);
  await t.until(() => ridingOn(driver)?.id === machine.id, "The driver isn't on the machine", 20);
  driver.lookAtBlock(t.at(...look));
  await t.wait(5); // a simulated player's head turns a moment after lookAtBlock
  if (type === RIG && switchOn) driver.runCommand("scriptevent family:machine_jump"); // jump: simulated players can't jump while riding
  driver.runCommand("scriptevent family:machine_input 1");
  return { machine, driver };
}

/** Every block in the box is `type`, or a message saying which isn't. */
function allAre(t, type, [x1, y1, z1], [x2, y2, z2]) {
  for (let x = x1; x <= x2; x++) for (let y = y1; y <= y2; y++) for (let z = z1; z <= z2; z++) {
    const found = typeAt(t, x, y, z);
    if (found !== type) return `${x}, ${y}, ${z} is ${found}, not ${type}`;
  }
  return true;
}
const check = (result) => (result === true ? true : undefined);

export async function placingTheItemPutsADrillRigDown(t) {
  const player = t.player();
  t.hold(player, RIG);
  player.useItemInSlotOnBlock(0, t.at(0, -1, 3), Direction.Up);
  await t.until(() => t.entities(RIG).length === 1, "No drill rig appeared after using the item on the ground");
}

export async function theDrillCutsA3x3TunnelAhead(t) {
  fill(t, "stone", [-3, 0, 2], [3, 4, 4]);
  const { driver } = await drive(t, RIG, [0, 1, 3]);
  await t.until(() => check(allAre(t, "minecraft:air", [-1, 0, 2], [1, 2, 2])), () => `The drill didn't cut a 3×3 hole: ${allAre(t, "minecraft:air", [-1, 0, 2], [1, 2, 2])}`, 60);
  t.assert(allAre(t, "minecraft:stone", [-3, 0, 2], [-2, 4, 2]) === true && allAre(t, "minecraft:stone", [-1, 3, 2], [1, 4, 2]) === true, "The drill cut more than 3×3");
  t.assert(allAre(t, "minecraft:stone", [-1, 0, 3], [1, 2, 3]) === true, "The drill cut deeper than one layer while it stood still");
  await t.until(() => has(driver, "minecraft:cobblestone"), () => `The cobblestone didn't go into the driver's inventory: ${inventory(driver).map((i) => i.typeId).join(", ") || "empty"}`, 20);
}

export async function theDrillStaysOffUntilTheDriverJumps(t) {
  fill(t, "stone", [-3, 0, 2], [3, 4, 4]);
  const { driver } = await drive(t, RIG, [0, 1, 3], { switchOn: false });
  await t.wait(30);
  t.assert(allAre(t, "minecraft:stone", [-1, 0, 2], [1, 2, 2]) === true, "The drill cut before the driver switched it on: getting on and holding W should only drive");
  driver.runCommand("scriptevent family:machine_jump");
  await t.until(() => check(allAre(t, "minecraft:air", [-1, 0, 2], [1, 2, 2])), "The drill didn't cut after the driver jumped to switch it on", 60);
  driver.runCommand("scriptevent family:machine_jump");
  await t.wait(10);
  t.assert(typeAt(t, 0, 1, 3) === "minecraft:stone", "The drill kept cutting after the driver jumped again to switch it off");
}

export async function lookingDownSlopesTheTunnelDown(t) {
  fill(t, "stone", [-3, -3, 2], [3, 4, 6]); // not deeper: the test world's bottom is a few blocks down
  const { machine, driver } = await drive(t, RIG, [0, -9, 14]); // about 40° down: a block down for every block ahead
  await t.until(() => check(allAre(t, "minecraft:air", [-1, -1, 2], [1, 2, 2])), () => `The drill didn't cut the first layer a block deeper: ${allAre(t, "minecraft:air", [-1, -1, 2], [1, 2, 2])}`, 60);
  t.assert(typeAt(t, 0, -2, 2) === "minecraft:stone" && typeAt(t, 0, 3, 2) === "minecraft:stone", `The first layer of the slope cut more than a block deeper than the floor and 3 high: below ${typeAt(t, 0, -2, 2)}, above ${typeAt(t, 0, 3, 2)}`);
  machine.teleport(t.at(0.5, 0, 2)); // the rig drives a block on, still on the floor behind the step (a simulated player can't steer it)
  driver.lookAtBlock(t.at(0, -9, 15)); // a simulated player's head doesn't stay put when what it rides moves
  await t.wait(5);
  t.assert(Math.abs(driver.getRotation().x - 40) < 8, `The driver should look about 40° down, not ${driver.getRotation().x.toFixed(0)}°`);
  await t.until(() => check(allAre(t, "minecraft:air", [-1, -2, 3], [1, 1, 3])), () => `The next layer didn't step down again: ${allAre(t, "minecraft:air", [-1, -2, 3], [1, 1, 3])}; at z 3 from y -3 up: ${[-3, -2, -1, 0, 1, 2, 3].map((y) => typeAt(t, 0, y, 3)?.replace("minecraft:", "")).join(" ")}; the rig at ${["x", "y", "z"].map((k) => (machine.location[k] - t.origin[k]).toFixed(2)).join(", ")}, ${machine.getProperty("family:tilt")}°`, 60);
}

export async function lookingUpSlopesTheTunnelUp(t) {
  fill(t, "stone", [-3, 0, 2], [3, 6, 4]);
  await drive(t, RIG, [0, 12, 12]); // about 45° up
  await t.until(() => check(allAre(t, "minecraft:air", [-1, 1, 2], [1, 3, 2])), () => `The drill didn't cut the first layer a block higher: ${allAre(t, "minecraft:air", [-1, 1, 2], [1, 3, 2])}`, 60);
  t.assert(allAre(t, "minecraft:stone", [-1, 0, 2], [1, 0, 2]) === true, "Sloping up, the drill cut the step the rig drives up onto");
}

export async function theDrillKeepsGoingAsTheRigMovesForward(t) {
  fill(t, "stone", [-3, 0, 2], [3, 4, 5]);
  const { machine } = await drive(t, RIG, [0, 1, 4]);
  await t.until(() => typeAt(t, 0, 1, 2) === "minecraft:air", "The drill didn't cut the first layer", 60);
  machine.teleport(t.at(0.5, 0, 2)); // the rig drives into the hole (a simulated player can't steer it)
  await t.until(() => check(allAre(t, "minecraft:air", [-1, 0, 3], [1, 2, 3])), "The drill didn't cut the next layer after the rig moved up to it", 60);
}

export async function theDrillCutsDown(t) {
  const { machine } = await drive(t, RIG, [0, -1, 1]);
  await t.until(() => check(allAre(t, "minecraft:air", [-1, -1, 0], [1, -1, 2])), () => `The drill didn't cut 3×3 down: ${allAre(t, "minecraft:air", [-1, -1, 0], [1, -1, 2])}`, 60);
  t.assert(typeAt(t, -2, -1, 1) !== "minecraft:air" && typeAt(t, 2, -1, 1) !== "minecraft:air", "Drilling down cut wider than 3");
  await t.until(() => machine.location.y < t.origin.y - 0.5, `The rig didn't go down into its hole: it's at ${(machine.location.y - t.origin.y).toFixed(2)}`, 40);
}

export async function theDrillCutsUpAndClimbs(t) {
  fill(t, "stone", [-3, 3, -2], [3, 6, 4]); // a low ceiling, 3 blocks above the floor
  const { machine } = await drive(t, RIG, [0, 12, 1]); // straight up, high enough to still be up after climbing
  await t.until(() => machine.location.y > t.origin.y + 1.5, () => `The rig didn't climb its shaft: it's at ${(machine.location.y - t.origin.y).toFixed(2)}, the ceiling ${typeAt(t, 0, 3, 1)}`, 80);
  t.assert(typeAt(t, 0, 3, 1) === "minecraft:air", "The ceiling above the rig is still there");
  t.assert(typeAt(t, 2, 3, 1) === "minecraft:stone", "Drilling up cut wider than 3");
  // Let go of W: it holds on in its shaft instead of falling.
  machine.getComponent("minecraft:rideable")?.getRiders()[0]?.runCommand("scriptevent family:machine_input 0");
  const height = machine.location.y;
  await t.wait(30);
  t.assert(machine.location.y > height - 0.3, `The rig fell down its shaft when the driver let go of W: ${(height - t.origin.y).toFixed(2)} → ${(machine.location.y - t.origin.y).toFixed(2)}`);
}

export async function theDrillWontWorkNextToWaterOrLava(t) {
  for (const liquid of ["water", "lava"]) {
    fill(t, "stone", [-3, 0, 2], [3, 4, 4]);
    fill(t, liquid, [0, 1, 3], [0, 1, 3]); // a pocket right behind the face
    const { machine, driver } = await drive(t, RIG, [0, 1, 3]);
    await t.wait(40);
    t.assert(allAre(t, "minecraft:stone", [-1, 0, 2], [1, 2, 2]) === true, `The drill cut into the rock in front of ${liquid}`);
    machine.getComponent("minecraft:rideable")?.ejectRider(driver);
    machine.remove();
    driver.disconnect();
    await t.wait(5);
  }
}

export async function aBigDrillHeadCuts5x5(t) {
  const rig = t.dimension.spawnEntity(RIG, t.at(0.5, 0, 1));
  const fitter = t.player("Fitter", 3, 0);
  fitter.setItem(new ItemStack("family:big_drill_head", 1), 0, true);
  await t.wait(5);
  fitter.interactWithEntity(rig);
  await t.until(() => rig.getProperty("family:drill_size") === 5, "Using the big drill head on the rig didn't put it on", 20);
  t.assert(!ridingOn(fitter), "Fitting a drill head shouldn't get you on the rig");
  await t.until(() => t.dimension.getEntities({ type: "minecraft:item", location: rig.location, maxDistance: 4 }).some((i) => i.getComponent("minecraft:item")?.itemStack.typeId === "family:drill_head"), "The old 3×3 drill head didn't drop next to the rig", 20);
  rig.remove();
  fill(t, "stone", [-4, 0, 2], [4, 6, 4]);
  const { machine } = await drive(t, RIG, [0, 2, 3]);
  machine.triggerEvent("family:fit_big_drill_head");
  await t.until(() => check(allAre(t, "minecraft:air", [-2, 0, 2], [2, 4, 2])), () => `The big drill didn't cut 5×5: ${allAre(t, "minecraft:air", [-2, 0, 2], [2, 4, 2])}`, 60);
  t.assert(typeAt(t, -3, 2, 2) === "minecraft:stone" && typeAt(t, 0, 5, 2) === "minecraft:stone", "The big drill cut more than 5×5");
}

export async function sneakingAndHittingPicksUpTheRigWithItsHead(t) {
  const rig = t.dimension.spawnEntity(RIG, t.at(0.5, 0, 2));
  await t.wait(2);
  rig.triggerEvent("family:fit_giant_drill_head");
  await t.wait(2);
  const player = t.player();
  await t.wait(5);
  player.isSneaking = true;
  player.attackEntity(rig);
  await t.until(() => !rig.isValid, "The rig is still there after sneak-hitting it");
  t.assert(has(player, RIG), "The drill rig isn't in the player's inventory");
  t.assert(has(player, "family:giant_drill_head"), "The giant drill head on it didn't come back with the rig");
}

/** An oak tree at 0, z: a trunk 6 high, a branch going sideways and diagonally up, and leaves. */
function tree(t, z) {
  fill(t, "oak_log", [0, 0, z], [0, 5, z]);
  fill(t, "oak_log", [1, 4, z], [2, 4, z]);
  fill(t, "oak_log", [3, 5, z + 1], [3, 5, z + 1]);
  fill(t, "oak_leaves", [-1, 6, z - 1], [1, 7, z + 1]);
  fill(t, "oak_leaves", [3, 6, z + 1], [3, 6, z + 1]);
}

export async function theTreeCutterCutsDownTheWholeTree(t) {
  tree(t, 2);
  const { driver } = await drive(t, CUTTER, [0, 1, 2]);
  await t.until(() => check(allAre(t, "minecraft:air", [0, 0, 2], [0, 5, 2])), () => `The trunk is still there: ${allAre(t, "minecraft:air", [0, 0, 2], [0, 5, 2])}`, 60);
  t.assert(allAre(t, "minecraft:air", [1, 4, 2], [2, 4, 2]) === true && typeAt(t, 3, 5, 3) === "minecraft:air", "The branch is still there: the cutter only cut straight up");
  await t.until(() => check(allAre(t, "minecraft:air", [-1, 6, 1], [1, 7, 3])), "The tree's leaves are still there", 20);
  await t.until(() => inventory(driver).some((i) => i.typeId === "minecraft:oak_log" && i.amount >= 9), () => `The logs didn't go into the driver's inventory: ${inventory(driver).map((i) => `${i.amount} ${i.typeId}`).join(", ") || "empty"}`, 20);
}

export async function theTreeCutterLeavesBuildingsAlone(t) {
  fill(t, "oak_log", [-1, 0, 2], [1, 3, 2]); // a log wall, no leaves
  await drive(t, CUTTER, [0, 1, 2]);
  await t.wait(30);
  t.assert(allAre(t, "minecraft:oak_log", [-1, 0, 2], [1, 3, 2]) === true, "The tree cutter cut down a log wall with no leaves: it isn't a tree");
}

export async function theTreeCutterDoesNothingWithoutATree(t) {
  fill(t, "stone", [-1, 0, 2], [1, 2, 2]);
  await drive(t, CUTTER, [0, 1, 2]);
  await t.wait(20);
  t.assert(allAre(t, "minecraft:stone", [-1, 0, 2], [1, 2, 2]) === true, "The tree cutter cut stone");
}
