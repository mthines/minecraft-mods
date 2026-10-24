import { EntityDamageCause, EntitySwingSource, EquipmentSlot, GameMode, Player, system, world } from "@minecraft/server";
import { emit } from "./telemetry.js";
import { throwSpeed } from "./throw.js";

const AMMO = "family:bullet";
const GRENADE = "family:grenade";
const BLAST = 7; // grenade explosion power: TNT is 4, a charged creeper 6
const SPRAY_TICKS = 5; // holding right-click this long sprays the machine gun; a shorter tap toggles its scope (20 ticks = 1 second)

/** Each gun: how hard it hits, how far it reaches (blocks), ticks between shots, and its scope's view (degrees; normal is about 70). */
const GUNS = {
  "family:pistol": { damage: 12, range: 40, cooldown: 8, pitch: 1.8, zoom: 55 },
  "family:rifle": { damage: 40, range: 120, cooldown: 6, pitch: 1.1, zoom: 30 },
  "family:machine_gun": { damage: 7, range: 60, cooldown: 3, pitch: 1.5, zoom: 50 },
};
const MACHINE_GUN = "family:machine_gun";
/** @param {string | undefined} typeId @returns {typeId is keyof typeof GUNS} */
const isGun = (typeId) => typeId !== undefined && typeId in GUNS;
/** @type {Map<string, number>} player id → tick they may shoot again */
const nextShot = new Map();
/** @type {Map<string, number>} player id → tick they started holding right-click with the machine gun or a grenade */
const holdingSince = new Map();
/** @type {Map<string, string>} player id → the gun they're looking through the scope of */
const scoped = new Map();

/** Takes one bullet from the player's inventory. Creative players never run out. @param {Player} player */
function takeAmmo(player) {
  if (player.getGameMode() === GameMode.Creative) return true;
  const inventory = player.getComponent("minecraft:inventory")?.container;
  if (!inventory) return false;
  for (let slot = 0; slot < inventory.size; slot++) {
    const item = inventory.getItem(slot);
    if (item?.typeId !== AMMO) continue;
    if (item.amount > 1) {
      item.amount -= 1;
      inventory.setItem(slot, item);
    } else {
      inventory.setItem(slot, undefined);
    }
    return true;
  }
  return false;
}

/** Shoots if the gun is ready. False when out of bullets. @param {Player} player @param {keyof typeof GUNS} gun */
function fire(player, gun) {
  const { damage, range, cooldown, pitch } = GUNS[gun];
  if (system.currentTick < (nextShot.get(player.id) ?? 0)) return true;
  if (!takeAmmo(player)) {
    player.onScreenDisplay.setActionBar("§cOut of bullets! §fCraft more: iron nugget + gunpowder.");
    player.playSound("random.click");
    return false;
  }
  nextShot.set(player.id, system.currentTick + cooldown);

  // Shots are instant, like real guns: the first mob or player along the aim, unless a wall is closer.
  // (A flying bullet this fast can pass right through a mob between two ticks.)
  const head = player.getHeadLocation();
  const look = player.getViewDirection();
  const wall = player.getBlockFromViewDirection({ maxDistance: range });
  const wallDistance = wall
    ? Math.hypot(wall.block.x + wall.faceLocation.x - head.x, wall.block.y + wall.faceLocation.y - head.y, wall.block.z + wall.faceLocation.z - head.z)
    : range;
  const hit = player
    .getEntitiesFromViewDirection({ maxDistance: wallDistance, excludeTypes: ["minecraft:item", "minecraft:xp_orb"] })
    .find(({ entity }) => entity.id !== player.id);
  if (hit) hurt(hit.entity, damage, player);

  // A trail of sparks so you can see the shot. It starts from where the player's head will be when the sparks
  // show up (a couple of ticks on), or it seems to fly off sideways while they walk.
  const v = player.getVelocity();
  const eye = { x: head.x + v.x * 2, y: head.y + v.y * 2, z: head.z + v.z * 2 };
  const reach = hit?.distance ?? wallDistance;
  try {
    for (let d = 2; d < reach; d += 1.5) {
      player.dimension.spawnParticle("minecraft:basic_crit_particle", { x: eye.x + look.x * d, y: eye.y + look.y * d, z: eye.z + look.z * d });
    }
  } catch {
    // a long shot into the distance: the trail stops where the loaded world ends
  }
  player.dimension.playSound("firework.blast", head, { pitch, volume: 0.8 });
  emit("weapon.fired", { "minecraft.player.name": player.name, "minecraft.weapon.type": gun.replace("family:", ""), "minecraft.weapon.hit": hit?.entity.typeId.replace("minecraft:", "") ?? "nothing" });
  return true;
}

/**
 * Hurts what a shot hit. A mob that was just hurt can't be hurt again for half a second, which would make
 * fast guns miss most of their shots, so then the health comes off directly.
 * @param {import("@minecraft/server").Entity} entity @param {number} damage @param {Player} shooter
 */
function hurt(entity, damage, shooter) {
  const health = entity.getComponent("minecraft:health");
  const before = health?.currentValue;
  entity.applyDamage(damage, { cause: EntityDamageCause.entityAttack, damagingEntity: shooter });
  if (!health || !entity.isValid || health.currentValue < (before ?? 0) || health.currentValue <= 0) return;
  if (entity instanceof Player && [GameMode.Creative, GameMode.Spectator].includes(entity.getGameMode())) return;
  if (health.currentValue > damage) health.setCurrentValue(health.currentValue - damage);
  else entity.kill();
}

/** Zooms the player's view in (fov) or back to normal (no fov). @param {Player} player @param {number} [fov] */
function scope(player, fov) {
  try {
    if (fov) player.camera.setFov({ fov, easeOptions: { easeTime: 0.15 } });
    else player.camera.clear();
  } catch {
    // no screen to zoom, like the test server's simulated players: still let them shoot
  }
}

/** @param {import("@minecraft/server").Entity | undefined} player */
const heldBy = (player) => (player instanceof Player ? player.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Mainhand)?.typeId : undefined);

/** Looks through the gun's scope (each zooms its own amount), or back out of it. @param {Player} player @param {keyof typeof GUNS} gun */
function toggleScope(player, gun) {
  if (scoped.delete(player.id)) {
    scope(player); // back to the normal view
  } else {
    scoped.set(player.id, gun);
    scope(player, GUNS[gun].zoom);
  }
}

// Every gun: right-click toggles the scope. (The machine gun does it when you let go of a short tap, below.)
world.afterEvents.itemUse.subscribe(({ source: player, itemStack }) => {
  if (isGun(itemStack.typeId) && itemStack.typeId !== MACHINE_GUN) toggleScope(player, itemStack.typeId);
});

// Every gun: left-click shoots once, in the scope or not. (The game only tells us about the click, not holding it.)
world.afterEvents.playerSwingStart.subscribe(({ player, heldItemStack, swingSource }) => {
  const gun = heldItemStack?.typeId;
  if (isGun(gun) && swingSource === EntitySwingSource.Attack) fire(player, gun);
});

// Machine gun: holding right-click sprays until you let go or the bullets run out.
system.runInterval(() => {
  for (const [id, since] of holdingSince) {
    const player = world.getEntity(id);
    if (heldBy(player) !== MACHINE_GUN || system.currentTick - since < SPRAY_TICKS) continue;
    if (!fire(/** @type {Player} */ (player), MACHINE_GUN)) holdingSince.delete(id); // out of bullets: stop until they press again
  }
});
// Left-click on a block with a gun shoots it, it shouldn't break it too (creative players break blocks at once).
world.beforeEvents.playerBreakBlock.subscribe((event) => {
  if (isGun(event.itemStack?.typeId)) event.cancel = true;
});
// Putting the gun away (or leaving) ends the scope.
system.runInterval(() => {
  for (const [id, gun] of scoped) {
    const player = world.getEntity(id);
    if (heldBy(player) === gun) continue;
    scoped.delete(id);
    if (player instanceof Player) scope(player);
  }
}, 5);

// Grenade: hold right-click to wind up, let go to throw. The longer you hold, the further it flies.
world.afterEvents.itemStartUse.subscribe(({ source: player, itemStack }) => {
  if (itemStack?.typeId === GRENADE || itemStack?.typeId === MACHINE_GUN) holdingSince.set(player.id, system.currentTick);
});

/** @param {{ source: Player, itemStack?: import("@minecraft/server").ItemStack }} event */
function letGo({ source: player, itemStack }) {
  const since = holdingSince.get(player.id);
  if (since === undefined) return; // let go once, but both events below fire
  holdingSince.delete(player.id);
  const held = system.currentTick - since;
  if (itemStack?.typeId === GRENADE) throwGrenade(player, held);
  else if (itemStack?.typeId === MACHINE_GUN && held < SPRAY_TICKS) toggleScope(player, MACHINE_GUN);
}
world.afterEvents.itemReleaseUse.subscribe(letGo);
world.afterEvents.itemStopUse.subscribe(letGo);

/** @param {Player} player @param {number} heldTicks */
function throwGrenade(player, heldTicks) {
  const inventory = player.getComponent("minecraft:inventory")?.container;
  const slot = player.selectedSlotIndex;
  const item = inventory?.getItem(slot);
  if (item?.typeId !== GRENADE) return;
  if (player.getGameMode() !== GameMode.Creative) {
    if (item.amount > 1) {
      item.amount -= 1;
      inventory?.setItem(slot, item);
    } else {
      inventory?.setItem(slot, undefined);
    }
  }
  const head = player.getHeadLocation();
  const look = player.getViewDirection();
  const speed = throwSpeed(heldTicks);
  const grenade = player.dimension.spawnEntity(GRENADE, { x: head.x + look.x * 0.6, y: head.y + look.y * 0.6, z: head.z + look.z * 0.6 });
  const projectile = grenade.getComponent("minecraft:projectile");
  if (projectile) {
    projectile.owner = player;
    projectile.shoot({ x: look.x * speed, y: look.y * speed, z: look.z * speed });
  }
  player.playSound("random.bow", { pitch: 0.6 });
}

world.afterEvents.projectileHitEntity.subscribe((event) => {
  if (event.projectile.typeId === GRENADE) explode(event);
});
world.afterEvents.projectileHitBlock.subscribe((event) => {
  if (event.projectile.typeId === GRENADE) explode(event);
});

/** Grenades blow up where they land, breaking blocks and hurting mobs and players nearby. */
function explode({ projectile, source, dimension, location }) {
  if (projectile.isValid) projectile.remove();
  const options = { breaksBlocks: true, causesFire: false };
  try {
    dimension.createExplosion(location, BLAST, { ...options, source }); // the thrower gets the credit for what it hits
  } catch {
    dimension.createExplosion(location, BLAST, options); // the thrower left the game, or isn't a normal player
  }
  // Make it felt: a big fireball, and the screen shakes for everyone near, more the closer they are.
  dimension.spawnParticle("minecraft:huge_explosion_emitter", location);
  for (const player of dimension.getPlayers({ location, maxDistance: 40 })) {
    if (!player) continue; // NPCs (simulated players from the npc mod) come through as undefined in other mods
    const near = 1 - Math.hypot(player.location.x - location.x, player.location.y - location.y, player.location.z - location.z) / 40;
    player.runCommand(`camerashake add @s ${(0.2 + near * 0.8).toFixed(2)} 1.2 positional`);
  }
  emit("weapon.grenade_exploded", { "minecraft.player.name": source instanceof Player ? source.name : "nobody" });
}
