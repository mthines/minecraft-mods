// Played by simulated players on the test server: mc test bazooka
import { ItemStack } from "@minecraft/server";

const missilesLeft = (player) => player.getComponent("minecraft:inventory")?.container?.getItem(1)?.amount ?? 0;

/** A player holding the bazooka, with `missiles` in the next slot. */
async function setUp(t, missiles) {
  const player = t.player("Shooter", 0, -20);
  player.setItem(new ItemStack("family:bazooka", 1), 0, true);
  if (missiles) player.setItem(new ItemStack("family:missile", missiles), 1);
  await t.wait(10);
  return player;
}

export async function aMissileBlowsAHoleAsBigAsAHouse(t) {
  const player = await setUp(t, 4);
  player.lookAtLocation(t.at(0.5, 0, 0.5)); // the top of the ground: aimed lower, it hits the ground a few blocks short
  await t.wait(5);
  player.attack();
  await t.until(() => t.dimension.getBlock(t.at(0, -1, 0))?.isAir, "The ground where the missile was aimed is still there");
  t.assert(missilesLeft(player) === 3, `Shooting should use one missile, but ${missilesLeft(player)} are left`);
  // A house is about 5 blocks wide: the ground 4 blocks out from the blast, in four directions, should all be gone.
  const left = [[4, 0], [-4, 0], [0, 4], [0, -4]].filter(([dx, dz]) => !t.dimension.getBlock(t.at(dx, -1, dz))?.isAir);
  t.assert(left.length === 0, `The hole is too small: ground 4 blocks from the blast is still there at ${left.map((d) => d.join(",")).join(" ")}`);
}

export async function rightClickOnlyAims(t) {
  const player = await setUp(t, 4);
  player.lookAtLocation(t.at(0.5, -0.5, 0.5));
  t.assert(player.useItemInSlot(0), "Couldn't press Use");
  await t.wait(2);
  player.stopUsingItem();
  await t.wait(20);
  t.assert(missilesLeft(player) === 4, "Right-click should only look through the sight, but it fired a missile");
  t.assert(!t.dimension.getBlock(t.at(0, -1, 0))?.isAir, "Right-click blew up the ground");
}

export async function noMissilesMeansNoShot(t) {
  const player = await setUp(t, 0);
  player.lookAtLocation(t.at(0.5, -0.5, 0.5));
  await t.wait(5);
  player.attack();
  await t.wait(40);
  t.assert(!t.dimension.getBlock(t.at(0, -1, 0))?.isAir, "The bazooka fired without missiles");
}
