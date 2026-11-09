// Played by simulated players on the test server: mc test planes
import { Direction } from "@minecraft/server";

const FIGHTER = "family:fighter";
const BOMBER = "family:bomber";
const TARGET = "minecraft:husk";

/** @param {import("@minecraft/server").Entity} plane */
const ammo = (plane) => plane.getProperty("family:ammo");
/** @param {import("@minecraft/server").Entity} mob */
const health = (mob) => mob.getComponent("minecraft:health")?.currentValue ?? 0;

/** Puts the player in a plane spawned `dy` above the ground. */
async function pilot(t, type, player, dy = 0) {
  const plane = t.dimension.spawnEntity(type, t.at(0.5, dy, 0.5));
  plane.getComponent("minecraft:rideable")?.addRider(player);
  await t.until(() => player.getComponent("minecraft:riding")?.entityRidingOn?.id === plane.id, `The player didn't get in the ${type}`);
  return plane;
}

export async function placedPlanesStartFull(t) {
  const player = t.player();
  t.hold(player, FIGHTER);
  player.useItemInSlotOnBlock(0, t.at(0, -1, 3), Direction.Up);
  await t.until(() => t.entities(FIGHTER).length === 1, "No fighter plane appeared after using the item on the ground");
  const [fighter] = t.entities(FIGHTER);
  await t.until(() => ammo(fighter) !== undefined, "The new fighter has no bullets count");
  t.assert(ammo(fighter) === 10000, `A new fighter should have 10000 bullets, but has ${ammo(fighter)}`);

  await t.wait(20); // a simulated player can't use an item again for a moment
  t.hold(player, BOMBER);
  player.useItemInSlotOnBlock(0, t.at(4, -1, 3), Direction.Up);
  await t.until(() => t.entities(BOMBER).length === 1, "No bomber plane appeared after using the item on the ground");
  const [bomber] = t.entities(BOMBER);
  await t.until(() => ammo(bomber) !== undefined, "The new bomber has no grenades count");
  t.assert(ammo(bomber) === 500, `A new bomber should have 500 grenades, but has ${ammo(bomber)}`);
}

export async function aPlaneHoversWithItsPilot(t) {
  const player = t.player();
  const plane = await pilot(t, FIGHTER, player, 5);
  const start = plane.location.y;
  await t.wait(40);
  t.assert(plane.location.y > start - 1, `With no speed the plane should hover, but it went from y ${start.toFixed(1)} to ${plane.location.y.toFixed(1)}`);
}

export async function forwardFliesWhereThePilotLooks(t) {
  const player = t.player();
  const plane = await pilot(t, FIGHTER, player, 3);
  player.lookAtLocation(t.at(0.5, 8, 20.5)); // ahead and a little up
  await t.wait(2);
  const start = { ...plane.location };
  player.runCommand("scriptevent family:plane_input 1"); // hold W: a simulated player's keys don't reach scripts while riding
  await t.wait(30);
  player.runCommand("scriptevent family:plane_input 0");
  const { x, y, z } = plane.location;
  t.assert(z - start.z > 5, `Holding forward for 1.5 s should fly the plane ahead, but it moved ${(z - start.z).toFixed(1)} blocks`);
  t.assert(y > start.y + 1, `Looking up while flying should climb, but the plane went from y ${start.y.toFixed(1)} to ${y.toFixed(1)}`);
  t.assert(Math.abs(x - start.x) < 3, `The plane drifted ${(x - start.x).toFixed(1)} blocks sideways`);
}

export async function theFighterShootsWhereThePilotLooks(t) {
  const player = t.player();
  const mob = t.dimension.spawnEntity(TARGET, t.at(0.5, 0, 10.5));
  const plane = await pilot(t, FIGHTER, player);
  await t.wait(10);
  const full = health(mob);
  player.lookAtLocation(t.at(0.5, 1.2, 10.5));
  await t.wait(2);
  player.attack();
  await t.until(() => !mob.isValid || health(mob) < full, () => {
    const v = player.getViewDirection();
    return `The husk still has full health (${full}) after the fighter fired ${10000 - Number(ammo(plane))} bullets, looking ${v.x.toFixed(2)} ${v.y.toFixed(2)} ${v.z.toFixed(2)}`;
  });
  await t.until(() => !mob.isValid || health(mob) <= 0, () => `A burst of strong bullets should kill a husk, but it has ${health(mob)} of ${full} health left`, 40);
  await t.wait(20);
  const left = ammo(plane);
  t.assert(typeof left === "number" && left < 10000 && left >= 9995, `One tap should fire a short burst (up to 5 bullets), but ${10000 - Number(left)} are gone`);
}

export async function theBomberDropsAGrenade(t) {
  const player = t.player();
  const plane = await pilot(t, BOMBER, player, 6);
  await t.wait(5);
  player.attack();
  await t.until(() => ammo(plane) === 499, () => `One tap should drop one grenade (499 left), but the bomber has ${ammo(plane)}`);
  await t.until(
    () => t.dimension.getBlock(t.at(0, -1, 0))?.typeId === "minecraft:air",
    "The grenade didn't blow a hole in the ground under the bomber",
  );
}
