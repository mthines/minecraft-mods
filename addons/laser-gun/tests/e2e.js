// Played by simulated players on the test server: mc test laser-gun
import { ItemStack } from "@minecraft/server";

// Husks are zombies that don't burn in daylight, so they're a steady target.
const TARGET = "minecraft:husk";
const health = (mob) => mob.getComponent("minecraft:health")?.currentValue ?? 0;

/** Turns the player to the mob's head, until it really does. */
async function aim(t, player, mob) {
  await t.until(() => {
    player.lookAtLocation(mob.getHeadLocation());
    const from = player.getHeadLocation();
    const to = mob.getHeadLocation();
    const d = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
    const look = player.getViewDirection();
    return (look.x * d.x + look.y * d.y + look.z * d.z) / Math.hypot(d.x, d.y, d.z) > 0.9995;
  }, "The test player never turned to the husk", 20);
}

export async function theLaserHurtsAMobFarAway(t) {
  const player = t.player("Laser");
  player.setItem(new ItemStack("family:laser_gun", 1), 0, true);
  const mob = t.dimension.spawnEntity(TARGET, t.at(0.5, 0, 10.5));
  await t.wait(10);
  await aim(t, player, mob);
  const full = health(mob);
  t.assert(player.useItemInSlot(0), "Couldn't press Use");
  await t.wait(2);
  player.stopUsingItem();
  await t.until(() => !mob.isValid || health(mob) < full, `The husk still has full health (${full}) after the laser`);
}
