// Played by simulated players on the test server: mc test cloud-boots
import { EquipmentSlot, ItemStack } from "@minecraft/server";

const CLOUD_TOP = 193;
const FLOOR = "minecraft:barrier";

/** A player standing in the sky `above` blocks over the clouds, with or without cloud boots on. */
async function skyWalker(t, name, dx, boots, above = 3) {
  const player = t.player(name, dx, 0);
  await t.wait(5);
  if (boots) t.assert(player.getComponent("minecraft:equippable").setEquipment(EquipmentSlot.Feet, new ItemStack("family:cloud_boots", 1)), "Couldn't put the cloud boots on");
  player.teleport({ x: t.origin.x + dx + 0.5, y: CLOUD_TOP + above, z: t.origin.z + 0.5 });
  return player;
}

const onClouds = (player) => player.isOnGround && Math.abs(player.location.y - CLOUD_TOP) < 0.1;

const floorAround = (t, player, reach = 3) => {
  let count = 0;
  const { x, z } = player.location;
  for (let dx = -reach; dx <= reach; dx++)
    for (let dz = -reach; dz <= reach; dz++) if (t.dimension.getBlock({ x: Math.floor(x) + dx, y: CLOUD_TOP - 1, z: Math.floor(z) + dz })?.typeId === FLOOR) count++;
  return count;
};

export async function bootsStandOnTheClouds(t) {
  const player = await skyWalker(t, "Cloudy", 0, true);
  await t.until(() => onClouds(player), () => `With cloud boots the player should land on the clouds at ${CLOUD_TOP}, but is at ${player.location.y.toFixed(1)}`, 60);
  await t.wait(20);
  t.assert(onClouds(player), `The player didn't stay on the clouds: at ${player.location.y.toFixed(1)}`);
}

export async function noBootsFallsThrough(t) {
  const player = await skyWalker(t, "Plain", 4, false);
  await t.wait(30);
  t.assert(player.location.y < CLOUD_TOP - 3, `Without cloud boots the player should fall through the clouds, but is at ${player.location.y.toFixed(1)}`);
}

export async function walkingAndRunningOnTheClouds(t) {
  const player = await skyWalker(t, "Runner", 8, true);
  await t.until(() => onClouds(player), "The player never landed on the clouds", 60);
  const start = { ...player.location };
  player.isSprinting = true;
  for (let i = 0; i < 40; i++) {
    player.moveRelative(0, 1);
    await t.wait(1);
    t.assert(player.location.y > CLOUD_TOP - 0.5, `Walking on the clouds, the player fell through at ${player.location.y.toFixed(1)}`);
  }
  player.stopMoving();
  const far = Math.hypot(player.location.x - start.x, player.location.z - start.z);
  t.assert(far > 5, `Walking for 2 seconds on the clouds only went ${far.toFixed(1)} blocks`);
  await t.wait(5);
  t.assert(onClouds(player), `After walking the player isn't on the clouds: at ${player.location.y.toFixed(1)}`);
  t.assert(floorAround(t, player, 12) <= 9, `The floor behind the player wasn't taken away: ${floorAround(t, player, 12)} barriers`);
}

export async function crouchingFallsThrough(t) {
  const player = await skyWalker(t, "Diver", 12, true);
  await t.until(() => onClouds(player), "The player never landed on the clouds", 60);
  player.isSneaking = true;
  await t.wait(30);
  t.assert(player.location.y < CLOUD_TOP - 3, `Crouching should fall through the clouds, but the player is at ${player.location.y.toFixed(1)}`);
  player.isSneaking = false;
}

export async function takingBootsOffFallsThroughAndClearsTheFloor(t) {
  const player = await skyWalker(t, "Barefoot", 16, true);
  await t.until(() => onClouds(player), "The player never landed on the clouds", 60);
  const spot = { ...player.location };
  t.assert(floorAround(t, player) > 0, "No floor under the player standing on the clouds");
  player.getComponent("minecraft:equippable").setEquipment(EquipmentSlot.Feet, undefined);
  await t.wait(30);
  t.assert(player.location.y < CLOUD_TOP - 3, `Without boots the player should fall, but is at ${player.location.y.toFixed(1)}`);
  let left = 0;
  for (let dx = -2; dx <= 2; dx++)
    for (let dz = -2; dz <= 2; dz++) if (t.dimension.getBlock({ x: Math.floor(spot.x) + dx, y: CLOUD_TOP - 1, z: Math.floor(spot.z) + dz })?.typeId === FLOOR) left++;
  t.assert(left === 0, `${left} barriers were left in the sky`);
}

export async function fallingOntoTheCloudsDoesNotHurt(t) {
  const player = await skyWalker(t, "Skydiver", 20, true, 40);
  const health = () => player.getComponent("minecraft:health")?.currentValue ?? 0;
  const full = health();
  await t.until(() => onClouds(player), () => `Falling from high up the player should land on the clouds, but is at ${player.location.y.toFixed(1)}`, 100);
  await t.wait(5);
  t.assert(health() === full, `Landing on the clouds hurt: health ${health()} of ${full}`);
}
