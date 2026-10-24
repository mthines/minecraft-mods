import { EntityDamageCause, system, world } from "@minecraft/server";

const GUN = "family:laser_gun";
const RANGE = 40; // blocks the laser reaches
const DAMAGE = 8;
const COOLDOWN = 8; // ticks between shots (20 ticks = 1 second)
const BEAM = "minecraft:blue_flame_particle";

/** @type {Map<string, number>} player id → tick they may shoot again */
const nextShot = new Map();

/** The first mob along the player's aim, unless a wall is closer. @param {import("@minecraft/server").Player} player */
function aimedAt(player) {
  const head = player.getHeadLocation();
  const wall = player.getBlockFromViewDirection({ maxDistance: RANGE });
  const wallDistance = wall
    ? Math.hypot(wall.block.x + wall.faceLocation.x - head.x, wall.block.y + wall.faceLocation.y - head.y, wall.block.z + wall.faceLocation.z - head.z)
    : RANGE;
  const hit = player
    .getEntitiesFromViewDirection({ maxDistance: wallDistance, excludeTypes: ["minecraft:item", "minecraft:xp_orb"] })
    .find(({ entity }) => entity.id !== player.id);
  return { hit, reach: hit?.distance ?? wallDistance };
}

/** @param {import("@minecraft/server").Player} player */
function shoot(player) {
  if (system.currentTick < (nextShot.get(player.id) ?? 0)) return;
  nextShot.set(player.id, system.currentTick + COOLDOWN);
  const { hit, reach } = aimedAt(player);

  // A glowing blue beam from the gun to whatever it hits.
  const head = player.getHeadLocation();
  const look = player.getViewDirection();
  try {
    for (let d = 1; d < reach; d += 0.4) {
      player.dimension.spawnParticle(BEAM, { x: head.x + look.x * d, y: head.y - 0.2 + look.y * d, z: head.z + look.z * d });
    }
  } catch {
    // the beam stops where the loaded world ends
  }
  player.dimension.playSound("mob.shulker.shoot", head, { pitch: 1.6 });
  if (hit?.entity.isValid) hit.entity.applyDamage(DAMAGE, { cause: EntityDamageCause.entityAttack, damagingEntity: player });
}

world.afterEvents.itemUse.subscribe(({ source: player, itemStack }) => {
  if (itemStack.typeId === GUN) shoot(player);
});

world.afterEvents.playerLeave.subscribe(({ playerId }) => nextShot.delete(playerId));
