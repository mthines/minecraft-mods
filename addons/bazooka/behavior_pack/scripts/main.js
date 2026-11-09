import { EntitySwingSource, EquipmentSlot, GameMode, Player, system, world } from "@minecraft/server";

const BAZOOKA = "family:bazooka";
const MISSILE = "family:missile";
const BLAST = 10; // explosion power: TNT is 4, a charged creeper 6. 10 blows a hole about as big as a house
const SPEED = 2.5; // blocks a tick the missile flies (20 ticks = 1 second)
const RANGE = 200; // blocks; it blows up there if it hits nothing
const COOLDOWN = 30; // ticks between shots
const ZOOM = 40; // the sight's view (degrees; normal is about 70)

/** @type {Map<string, number>} player id → tick they may shoot again */
const nextShot = new Map();
/** @type {Set<string>} ids of players looking through the sight */
const aiming = new Set();

/** Takes one missile from the player's inventory. Creative players never run out. @param {Player} player */
function takeMissile(player) {
  if (player.getGameMode() === GameMode.Creative) return true;
  const inventory = player.getComponent("minecraft:inventory")?.container;
  if (!inventory) return false;
  for (let slot = 0; slot < inventory.size; slot++) {
    const item = inventory.getItem(slot);
    if (item?.typeId !== MISSILE) continue;
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

/** @param {Player} player */
function fire(player) {
  if (system.currentTick < (nextShot.get(player.id) ?? 0)) return;
  if (!takeMissile(player)) {
    player.onScreenDisplay.setActionBar("§cNo missiles left! §fGet more from the kit menu.");
    player.playSound("random.click");
    return;
  }
  nextShot.set(player.id, system.currentTick + COOLDOWN);
  const head = player.getHeadLocation();
  const look = player.getViewDirection();
  player.dimension.playSound("firework.launch", head, { pitch: 0.5, volume: 2 });
  fly(player, player.dimension, { x: head.x + look.x, y: head.y + look.y, z: head.z + look.z }, look);
}

/**
 * Moves the missile along a bit every tick, with smoke and fire behind it, until it hits a block or a mob, or flies too far.
 * It flies by script rather than as a projectile entity: one this fast could pass right through a mob between two ticks.
 * @param {Player} shooter @param {import("@minecraft/server").Dimension} dimension
 * @param {import("@minecraft/server").Vector3} start @param {import("@minecraft/server").Vector3} direction
 */
function fly(shooter, dimension, start, direction) {
  let at = start;
  let flown = 0;
  const id = system.runInterval(() => {
    try {
      const block = dimension.getBlockFromRay(at, direction, { maxDistance: SPEED });
      const blockDistance = block
        ? Math.hypot(block.block.x + block.faceLocation.x - at.x, block.block.y + block.faceLocation.y - at.y, block.block.z + block.faceLocation.z - at.z)
        : SPEED;
      const mob = dimension
        .getEntitiesFromRay(at, direction, { maxDistance: blockDistance, excludeTypes: ["minecraft:item", "minecraft:xp_orb"] })
        .find(({ entity }) => entity.id !== shooter.id);
      const hit = mob?.distance ?? (block ? blockDistance : undefined);
      const step = hit ?? SPEED;
      for (let d = 0; d < step; d += 0.5) {
        const p = { x: at.x + direction.x * d, y: at.y + direction.y * d, z: at.z + direction.z * d };
        dimension.spawnParticle("minecraft:basic_flame_particle", p);
        dimension.spawnParticle("minecraft:large_smoke_particle", p);
      }
      at = { x: at.x + direction.x * step, y: at.y + direction.y * step, z: at.z + direction.z * step };
      flown += step;
      if (hit === undefined && flown < RANGE) return;
      system.clearRun(id);
      explode(shooter, dimension, at);
    } catch {
      system.clearRun(id); // it flew out of the loaded world
    }
  });
}

/** Blows a hole as big as a house, and shakes the screen for everyone near. */
function explode(shooter, dimension, location) {
  const options = { breaksBlocks: true, causesFire: false };
  try {
    dimension.createExplosion(location, BLAST, { ...options, source: shooter }); // the shooter gets the credit for what it hits
  } catch {
    dimension.createExplosion(location, BLAST, options); // the shooter left the game, or isn't a normal player
  }
  dimension.spawnParticle("minecraft:huge_explosion_emitter", location);
  for (const player of dimension.getPlayers({ location, maxDistance: 60 })) {
    if (!player) continue; // NPCs (simulated players from the npc mod) come through as undefined in other mods
    const near = 1 - Math.hypot(player.location.x - location.x, player.location.y - location.y, player.location.z - location.z) / 60;
    player.runCommand(`camerashake add @s ${(0.3 + near * 0.7).toFixed(2)} 1.5 positional`);
  }
}

/** Zooms the player's view in (fov) or back to normal (no fov). @param {Player} player @param {number} [fov] */
function sight(player, fov) {
  try {
    if (fov) player.camera.setFov({ fov, easeOptions: { easeTime: 0.15 } });
    else player.camera.clear();
  } catch {
    // no screen to zoom, like the test server's simulated players: still let them shoot
  }
}

// Right-click: look through the sight, or back out of it.
world.afterEvents.itemUse.subscribe(({ source: player, itemStack }) => {
  if (itemStack.typeId !== BAZOOKA) return;
  if (aiming.delete(player.id)) sight(player);
  else {
    aiming.add(player.id);
    sight(player, ZOOM);
  }
});

// Left-click: fire a missile.
world.afterEvents.playerSwingStart.subscribe(({ player, heldItemStack, swingSource }) => {
  if (heldItemStack?.typeId === BAZOOKA && swingSource === EntitySwingSource.Attack) fire(player);
});

// Left-click on a block with the bazooka shoots it, it shouldn't break it too (creative players break blocks at once).
world.beforeEvents.playerBreakBlock.subscribe((event) => {
  if (event.itemStack?.typeId === BAZOOKA) event.cancel = true;
});

// Putting the bazooka away (or leaving) ends the sight.
system.runInterval(() => {
  for (const id of aiming) {
    const player = world.getEntity(id);
    if (player instanceof Player && player.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Mainhand)?.typeId === BAZOOKA) continue;
    aiming.delete(id);
    if (player instanceof Player) sight(player);
  }
}, 5);
