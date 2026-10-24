// Played by simulated players on the test server: mc test weapons
import { ItemStack } from "@minecraft/server";

// Husks are zombies that don't burn in daylight, so they're a steady target.
const TARGET = "minecraft:husk";
const health = (mob) => mob.getComponent("minecraft:health")?.currentValue ?? 0;

/** A player holding `weapon` (with bullets in the next slot), facing a husk `distance` blocks away. */
async function setUp(t, weapon, { bullets = 64, distance = 6 } = {}) {
  const player = t.player("Shooter");
  player.setItem(new ItemStack(weapon, 1), 0, true);
  if (bullets) player.setItem(new ItemStack("family:bullet", bullets), 1);
  const mob = t.dimension.spawnEntity(TARGET, t.at(0.5, 0, distance + 0.5));
  await t.wait(10);
  await aim(t, player, mob);
  return { player, mob, full: health(mob) };
}

const bulletsLeft = (player) => player.getComponent("minecraft:inventory")?.container?.getItem(1)?.amount ?? 0;

export async function aPistolShotHurtsAMob(t) {
  const { player, mob, full } = await setUp(t, "family:pistol");
  player.attack();
  await t.until(() => health(mob) < full, `The husk still has full health (${full}) after a pistol shot`);
  t.assert(health(mob) <= full - 10, `A pistol shot should take about 12 health (armour soaks a little), but the husk has ${health(mob)} of ${full}`);
  t.assert(bulletsLeft(player) === 63, `Shooting should use one bullet, but ${bulletsLeft(player)} are left`);
}

export async function noBulletsMeansNoShot(t) {
  const { player, mob, full } = await setUp(t, "family:pistol", { bullets: 0 });
  player.attack();
  await t.wait(20);
  t.assert(health(mob) === full, "The husk got hurt by a pistol with no bullets");
}

export async function theRifleShootsAgainAndAgainWhileScoped(t) {
  const { player, mob, full } = await setUp(t, "family:rifle", { distance: 12 });
  const second = t.dimension.spawnEntity(TARGET, t.at(4.5, 0, 12.5));
  await useOnce(t, player); // into the scope
  t.assert(bulletsLeft(player) === 64 && health(mob) === full, "Right-click should only look through the scope, but it shot");
  await aim(t, player, mob);
  player.attack(); // left-click: fire
  await t.until(() => !mob.isValid || health(mob) <= 0, () => `One rifle shot should kill a husk, but it has ${health(mob)} of ${full} health left`);
  await t.wait(10); // the rifle reloads fast
  await aim(t, player, second);
  player.attack(); // still in the scope: fire again
  await t.until(() => !second.isValid || health(second) <= 0, "A second shot without leaving the scope didn't kill the other husk");
  t.assert(bulletsLeft(player) === 62, `Two shots should use two bullets, but ${bulletsLeft(player)} are left`);
  await t.wait(20); // a simulated player can't use an item again for a moment after attacking
  await useOnce(t, player); // out of the scope
  t.assert(bulletsLeft(player) === 62, "Right-click to leave the scope shot the rifle");
}

/** Presses Use once, like a quick right-click. */
async function useOnce(t, player) {
  t.assert(player.useItemInSlot(0), "Couldn't press Use");
  await t.wait(2);
  player.stopUsingItem();
  await t.wait(8);
}

/** Holds Use for `ticks`, lets go, and returns where the grenade landed. */
async function throwGrenade(t, player, ticks) {
  player.useItemInSlot(0);
  await t.wait(ticks);
  player.stopUsingItem();
  let landed;
  await t.until(() => {
    const [grenade] = t.entities("family:grenade");
    if (grenade) landed = { ...grenade.location };
    return landed && !grenade;
  }, "The grenade never landed");
  return landed;
}

export async function aGrenadeBlowsUpBlocksAndHurts(t) {
  const player = t.player("Thrower");
  player.setItem(new ItemStack("family:grenade", 4), 0, true);
  t.place("minecraft:stone", 0, 0, 5);
  const mob = t.dimension.spawnEntity(TARGET, t.at(1.5, 0, 5.5));
  await t.wait(10);
  const full = health(mob);
  player.lookAtLocation(t.at(0.5, 1, 5.5));
  await throwGrenade(t, player, 4);
  await t.until(() => !mob.isValid || health(mob) < full, "The husk next to where the grenade landed wasn't hurt");
  t.assert(t.dimension.getBlock(t.at(0, 0, 5))?.typeId !== "minecraft:stone", "The stone block next to the blast is still there");
}

export async function holdingLongerThrowsFurther(t) {
  const short = t.player("Lob", -8, -12);
  const long = t.player("Throw", 8, -12);
  for (const player of [short, long]) player.setItem(new ItemStack("family:grenade", 1), 0, true);
  await t.wait(10);
  short.lookAtLocation(t.at(-8, 3, 0));
  long.lookAtLocation(t.at(8, 3, 0));
  const near = await throwGrenade(t, short, 1);
  const far = await throwGrenade(t, long, 20);
  const distance = (spot, from) => Math.hypot(spot.x - from.x, spot.z - from.z);
  const lob = distance(near, t.at(-8, 0, -12));
  const thrown = distance(far, t.at(8, 0, -12));
  t.assert(thrown > lob + 5, `A 1 second hold flew ${thrown.toFixed(1)} blocks, a tap ${lob.toFixed(1)}: it should be much further`);
}

export async function aPistolShotHitsWhileWalkingSideways(t) {
  const { player, mob, full } = await setUp(t, "family:pistol", { distance: 10 });
  player.moveRelative(1, 0, 1); // strafe right at full speed
  await t.wait(8);
  await aim(t, player, mob);
  player.attack();
  await t.until(() => health(mob) < full, "A shot while walking sideways missed the husk it was aimed at");
  player.stopMoving();
}

/** Turns the player to the mob's head. A simulated player doesn't always take a new look on the first try, so until it does. */
async function aim(t, player, mob) {
  await t.until(() => {
    player.lookAtLocation(mob.getHeadLocation());
    return aimsAt(player, mob);
  }, "The test player never turned to the husk", 20);
}

/** True when the player looks within 2 degrees of the mob's head: less than a third of a block off at 10 blocks. */
function aimsAt(player, mob) {
  const from = player.getHeadLocation();
  const to = mob.getHeadLocation();
  const d = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
  const length = Math.hypot(d.x, d.y, d.z);
  const look = player.getViewDirection();
  return (look.x * d.x + look.y * d.y + look.z * d.z) / length > 0.9995;
}

export async function aMachineGunClickShootsOnce(t) {
  const { player } = await setUp(t, "family:machine_gun", { distance: 30 });
  player.attack();
  await t.wait(20);
  t.assert(bulletsLeft(player) === 63, `One left-click should fire one bullet, but it used ${64 - bulletsLeft(player)}`);
  await t.wait(10);
  await useOnce(t, player); // a quick right-click only scopes
  t.assert(bulletsLeft(player) === 63, "A quick right-click on the machine gun shot instead of only scoping");
}

export async function theMachineGunSpraysWhileRightClickIsHeld(t) {
  const { player, mob, full } = await setUp(t, "family:machine_gun", { distance: 8 });
  player.useItemInSlot(0); // hold the trigger
  await t.wait(20);
  player.lookAtLocation(mob.getHeadLocation());
  await t.until(() => !mob.isValid || health(mob) <= 0, () => `A second of machine gun fire should kill a husk, but it has ${health(mob)} of ${full} health left`, 40);
  player.stopUsingItem();
  const used = 64 - bulletsLeft(player);
  t.assert(used >= 5, `The machine gun fired ${used} bullets in about a second; it should keep shooting`);
  await t.wait(10);
  t.assert(64 - bulletsLeft(player) <= used + 1, "The machine gun kept shooting after letting go");
}

export async function theMachineGunStopsWhenTheBulletsRunOut(t) {
  const { player } = await setUp(t, "family:machine_gun", { bullets: 3 });
  player.useItemInSlot(0);
  await t.wait(30);
  t.assert(bulletsLeft(player) === 0, `${bulletsLeft(player)} bullets left after holding the trigger`);
  player.stopUsingItem();
}

export async function aGrenadeBlowsABigHole(t) {
  const player = t.player("Thrower", 0, -14);
  player.setItem(new ItemStack("family:grenade", 1), 0, true);
  await t.wait(10);
  player.lookAtLocation(t.at(0.5, 3, 0.5));
  const landed = await throwGrenade(t, player, 10);
  await t.wait(5);
  // The ground three blocks out from where it landed, in four directions, should all be gone.
  const ground = Math.floor(landed.y) - 1;
  const left = [[3, 0], [-3, 0], [0, 3], [0, -3]].filter(([dx, dz]) => !t.dimension.getBlock({ x: Math.floor(landed.x) + dx, y: ground, z: Math.floor(landed.z) + dz })?.isAir);
  t.assert(left.length === 0, `The hole is too small: ground 3 blocks from the blast is still there at ${left.map((d) => d.join(",")).join(" ")}`);
}

