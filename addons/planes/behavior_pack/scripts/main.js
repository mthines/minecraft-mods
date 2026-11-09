import { ButtonState, EntityDamageCause, EntitySwingSource, InputButton, ItemStack, Player, system, world } from "@minecraft/server";

// Two planes. Get in, W flies faster, S slower (all the way down to hovering), and the plane flies where you look.
// Tap (left-click) or hold jump to fire: the fighter shoots bullets, the bomber drops grenades.
const FIGHTER = "family:fighter"; // the entities and the items that place them share their names
const BOMBER = "family:bomber";
const GRENADE = "family:plane_grenade";

const PLANES = {
  [FIGHTER]: { name: "§9§lFighter", ammoName: "Bullets", top: 1.4, cooldown: 2, burst: 5 },
  [BOMBER]: { name: "§e§lBomber", ammoName: "Grenades", top: 0.9, cooldown: 8, burst: 1 },
};
const ACCEL = 0.04; // blocks per tick, per tick of W or S
const BULLET_DAMAGE = 15; // a zombie has 20 health
const BULLET_RANGE = 64;
const BLAST = 4; // grenade explosion power: TNT is 4
// What a plane has left is an entity property (family:ammo in its entity file), which starts full.
const AMMO = "family:ammo";

/** @type {Map<string, number>} plane id → speed in blocks per tick */
const speeds = new Map();
/** @type {Map<string, number>} plane id → the tick it can fire again */
const nextShot = new Map();
/** @type {Map<string, number>} plane id → shots left from a tap */
const bursts = new Map();

/** @param {import("@minecraft/server").Entity} plane */
const ammoOf = (plane) => Number(plane.getProperty(AMMO) ?? 0);

/** The player flying this plane: whoever sits in it. @param {Player} player */
function planeOf(player) {
  const plane = player.getComponent("minecraft:riding")?.entityRidingOn;
  return plane && PLANES[plane.typeId] ? plane : undefined;
}

// Simulated players' movement keys don't reach scripts while riding, so the tests hold W with
// /scriptevent family:plane_input 1 (and let go with 0, back to the keys with "").
/** @type {Map<string, number>} player id → forward input */
const testInput = new Map();
system.afterEvents.scriptEventReceive.subscribe(({ id, message, sourceEntity }) => {
  if (id !== "family:plane_input" || !sourceEntity) return;
  if (message === "") testInput.delete(sourceEntity.id);
  else testInput.set(sourceEntity.id, Number(message));
});

// Tell whoever just put a plane down how it works.
world.afterEvents.entitySpawn.subscribe(({ entity }) => {
  if (!entity.isValid || !PLANES[entity.typeId]) return;
  for (const player of entity.dimension.getPlayers({ location: entity.location, maxDistance: 8 })) {
    if (!player) continue; // NPCs (simulated players from the npc mod) come through as undefined in other mods
    player.sendMessage("§9Plane!§r Use it to get in. W faster, S slower, look where to fly. Tap or hold jump to fire. Sneak to get out, sneak and hit it to pick it up.");
  }
});

// Flying and firing, every tick, for each pilot (only a few players, so this stays small).
system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    if (!player) continue; // NPCs come through as undefined in other mods
    const plane = planeOf(player);
    if (!plane) continue;
    const kind = PLANES[plane.typeId];

    const forward = testInput.get(player.id) ?? player.inputInfo.getMovementVector().y;
    let speed = speeds.get(plane.id) ?? 0;
    if (forward > 0.3) speed = Math.min(kind.top, speed + ACCEL);
    else if (forward < -0.3) speed = Math.max(0, speed - ACCEL);
    speeds.set(plane.id, speed);

    const look = player.getViewDirection();
    plane.setRotation({ x: 0, y: player.getRotation().y });
    plane.clearVelocity();
    plane.applyImpulse({ x: look.x * speed, y: look.y * speed, z: look.z * speed }); // no speed: it hovers

    let jump = false;
    try {
      jump = player.inputInfo.getButtonState(InputButton.Jump) === ButtonState.Pressed;
    } catch {
      // no buttons to read
    }
    const burst = bursts.get(plane.id) ?? 0;
    if ((jump || burst > 0) && system.currentTick >= (nextShot.get(plane.id) ?? 0)) {
      if (burst > 0) bursts.set(plane.id, burst - 1);
      fire(player, plane);
    }

    if (system.currentTick % 5 === 0) {
      const ammo = ammoOf(plane);
      const kmh = Math.round(speed * 20 * 3.6);
      player.onScreenDisplay.setActionBar(`${kind.name}§r  ${kind.ammoName}: §l${ammo}§r  ${kmh} km/h · W/S speed · tap or jump: fire`);
    }
  }
});

// Tap (left-click) while flying: a burst of bullets, or one grenade.
world.afterEvents.playerSwingStart.subscribe(({ player, swingSource }) => {
  if (!player || swingSource !== EntitySwingSource.Attack) return;
  const plane = planeOf(player);
  if (plane) bursts.set(plane.id, PLANES[plane.typeId].burst);
});

/** One bullet or one grenade, if there's any left. @param {Player} player @param {import("@minecraft/server").Entity} plane */
function fire(player, plane) {
  const kind = PLANES[plane.typeId];
  nextShot.set(plane.id, system.currentTick + kind.cooldown);
  const ammo = ammoOf(plane);
  if (ammo <= 0) {
    bursts.delete(plane.id);
    if (system.currentTick % 10 === 0) player.playSound("random.click");
    player.onScreenDisplay.setActionBar(`§cNo ${kind.ammoName.toLowerCase()} left! §fPick the plane up and put it down for a full one.`);
    return;
  }
  plane.setProperty(AMMO, ammo - 1);
  if (plane.typeId === FIGHTER) shoot(player, plane);
  else dropGrenade(player, plane);
}

/** A bullet is instant: the first mob or player along the aim, unless a wall is closer. */
function shoot(/** @type {Player} */ player, /** @type {import("@minecraft/server").Entity} */ plane) {
  const head = player.getHeadLocation();
  const look = player.getViewDirection();
  const wall = player.getBlockFromViewDirection({ maxDistance: BULLET_RANGE });
  const wallDistance = wall
    ? Math.hypot(wall.block.x + wall.faceLocation.x - head.x, wall.block.y + wall.faceLocation.y - head.y, wall.block.z + wall.faceLocation.z - head.z)
    : BULLET_RANGE;
  const hit = player
    .getEntitiesFromViewDirection({ maxDistance: wallDistance, excludeTypes: ["minecraft:item", "minecraft:xp_orb"] })
    .find(({ entity }) => entity && entity.id !== player.id && entity.id !== plane.id);
  if (hit) hurt(hit.entity, player);

  // A short trail of sparks so you can see where it goes (capped, it's decoration).
  const reach = Math.min(hit?.distance ?? wallDistance, 30);
  const v = plane.getVelocity();
  try {
    for (let d = 3; d < reach; d += 3) {
      player.dimension.spawnParticle("minecraft:basic_crit_particle", { x: head.x + v.x * 2 + look.x * d, y: head.y + v.y * 2 + look.y * d, z: head.z + v.z * 2 + look.z * d });
    }
    if (system.currentTick % 4 === 0) player.dimension.playSound("firework.blast", head, { pitch: 1.6, volume: 0.6 });
  } catch {
    // the trail stops where the loaded world ends
  }
}

/** A mob that was just hurt can't be hurt again for a moment, which would waste fast bullets: then take the health directly. */
function hurt(/** @type {import("@minecraft/server").Entity} */ entity, /** @type {Player} */ shooter) {
  const health = entity.getComponent("minecraft:health");
  const before = health?.currentValue ?? 0;
  try {
    entity.applyDamage(BULLET_DAMAGE, { cause: EntityDamageCause.entityAttack, damagingEntity: shooter });
  } catch {
    return;
  }
  if (!health || !entity.isValid || health.currentValue < before || health.currentValue <= 0) return;
  if (entity instanceof Player) return; // players get their normal hurt time (and creative players aren't hurt)
  if (health.currentValue > BULLET_DAMAGE) health.setCurrentValue(health.currentValue - BULLET_DAMAGE);
  else entity.kill();
}

/** Drops a grenade from under the plane. It keeps the plane's speed, so aim a little ahead. */
function dropGrenade(/** @type {Player} */ player, /** @type {import("@minecraft/server").Entity} */ plane) {
  const at = plane.location;
  const v = plane.getVelocity();
  const grenade = plane.dimension.spawnEntity(GRENADE, { x: at.x, y: at.y - 0.8, z: at.z });
  const projectile = grenade.getComponent("minecraft:projectile");
  if (projectile) {
    projectile.owner = player;
    projectile.shoot({ x: v.x, y: Math.min(v.y, -0.2), z: v.z });
  }
  try {
    player.playSound("random.bow", { pitch: 0.5 });
  } catch {
    // only decoration
  }
}

world.afterEvents.projectileHitEntity.subscribe((event) => {
  if (event.projectile?.typeId === GRENADE) explode(event);
});
world.afterEvents.projectileHitBlock.subscribe((event) => {
  if (event.projectile?.typeId === GRENADE) explode(event);
});

/** Grenades blow up where they land, like TNT. */
function explode({ projectile, source, dimension, location }) {
  if (projectile.isValid) projectile.remove();
  const options = { breaksBlocks: true, causesFire: false };
  try {
    dimension.createExplosion(location, BLAST, { ...options, source }); // the pilot gets the credit
  } catch {
    try {
      dimension.createExplosion(location, BLAST, options); // the pilot left, or isn't a normal player
    } catch {
      // the chunk isn't loaded any more
    }
  }
}

// Sneak and hit an empty plane to put it back in your inventory. Put it down again and it's full.
world.afterEvents.entityHitEntity.subscribe(({ damagingEntity: player, hitEntity: plane }) => {
  if (!plane || !PLANES[plane.typeId] || !(player instanceof Player) || !player.isSneaking) return;
  if (plane.getComponent("minecraft:rideable")?.getRiders().length) return; // not while someone is in it
  const left = player.getComponent("minecraft:inventory")?.container?.addItem(new ItemStack(plane.typeId));
  if (left) plane.dimension.spawnItem(left, plane.location); // inventory full: drop it instead
  for (const map of [speeds, nextShot, bursts]) map.delete(plane.id);
  plane.remove();
});

// Forget planes that are gone (picked up another way, killed with /kill, unloaded).
system.runInterval(() => {
  for (const map of [speeds, nextShot, bursts]) {
    for (const id of map.keys()) if (!world.getEntity(id)) map.delete(id);
  }
}, 200);
