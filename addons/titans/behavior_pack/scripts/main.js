import { GameMode, system, world } from "@minecraft/server";

// Titans: huge enemies that rip up a tree nearby for a club, throw boulders at players,
// and get fiery hair (and burning boulders) once they're down to half health.

const TITAN = "family:titan";
const BOULDER = "family:boulder";
const DIMENSIONS = ["overworld", "nether", "the_end"];

const LOGS = new Set(["oak", "spruce", "birch", "jungle", "acacia", "dark_oak", "mangrove", "cherry", "pale_oak"].map((wood) => `minecraft:${wood}_log`));
/** How far a titan reaches for a tree: sideways, and up from its feet. */
const TREE_REACH = 4;
const TREE_HEIGHT = 8;
/** At most this many logs come out with a tree, so a giant jungle tree doesn't freeze the server. */
const MAX_LOGS = 40;

/** Players closer than this get punched, further than THROW_MAX are too far to throw at. */
const THROW_MIN = 5;
const THROW_MAX = 24;
const THROW_EVERY = 60;
const FIERY_THROW_EVERY = 40;
const HEAD_HEIGHT = 6.5;

/** Ticks until each titan can throw again, by id. */
const nextThrow = new Map();
/** Tick (the titans' own count) each titan looks for a tree again, by id: a scan is 729 block lookups, so a miss waits. */
const nextGrab = new Map();
const GRAB_RETRY = 100; // ticks to wait after finding no tree
const GRAB_AGAIN = 20; // ticks to wait after getting one, in case the grab failed
/** Boulders thrown by a fiery titan, by id. */
const fieryBoulders = new Set();

const fiery = (titan) => titan.getProperty("family:fiery") === true;
const hasTree = (titan) => titan.getProperty("family:has_tree") === true;

/** The log of a tree within reach of the titan, or undefined. */
function treeNear(titan) {
  const { dimension } = titan;
  const base = { x: Math.floor(titan.location.x), y: Math.floor(titan.location.y), z: Math.floor(titan.location.z) };
  for (let dy = 0; dy <= TREE_HEIGHT; dy++) {
    for (let dx = -TREE_REACH; dx <= TREE_REACH; dx++) {
      for (let dz = -TREE_REACH; dz <= TREE_REACH; dz++) {
        let block;
        try {
          block = dimension.getBlock({ x: base.x + dx, y: base.y + dy, z: base.z + dz });
        } catch {
          continue; // outside the world
        }
        if (block && LOGS.has(block.typeId)) return block;
      }
    }
  }
}

/** Removes the logs connected to `start` (the trunk and branches), up to MAX_LOGS. */
function ripOut(start) {
  const { dimension } = start;
  const seen = new Set();
  const todo = [start.location];
  let removed = 0;
  while (todo.length && removed < MAX_LOGS) {
    const at = todo.pop();
    const key = `${at.x},${at.y},${at.z}`;
    if (seen.has(key)) continue;
    seen.add(key);
    let block;
    try {
      block = dimension.getBlock(at);
    } catch {
      continue;
    }
    if (!block || !LOGS.has(block.typeId)) continue;
    block.setType("minecraft:air");
    removed++;
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dz = -1; dz <= 1; dz++) if (dx || dy || dz) todo.push({ x: at.x + dx, y: at.y + dy, z: at.z + dz });
  }
  return removed;
}

function grabTree(titan) {
  const log = treeNear(titan);
  if (!log) return false;
  ripOut(log);
  titan.triggerEvent("family:grab_tree");
  titan.dimension.playSound("dig.wood", titan.location, { volume: 4, pitch: 0.5 });
  return true;
}

/** The nearest player the titan can throw at, or undefined. NPCs come through as undefined on the family server. */
function throwTarget(titan) {
  const players = titan.dimension.getPlayers({ location: titan.location, maxDistance: THROW_MAX, excludeGameModes: [GameMode.Creative, GameMode.Spectator] });
  let best;
  let bestDistance = Infinity;
  for (const player of players) {
    if (!player?.isValid) continue;
    const distance = Math.hypot(player.location.x - titan.location.x, player.location.z - titan.location.z);
    if (distance >= THROW_MIN && distance < bestDistance) {
      best = player;
      bestDistance = distance;
    }
  }
  return best;
}

/** Throws a boulder in an arc that lands on `target`. */
function throwBoulder(titan, target) {
  const from = titan.location;
  const to = target.location;
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const distance = Math.hypot(dx, dz) || 1;
  const start = { x: from.x + (dx / distance) * 1.5, y: from.y + HEAD_HEIGHT, z: from.z + (dz / distance) * 1.5 };
  const boulder = titan.dimension.spawnEntity(BOULDER, start);
  const projectile = boulder.getComponent("minecraft:projectile");
  if (!projectile) return boulder;
  projectile.owner = titan;
  // Sideways at 1 block a tick, so it takes `ticks` to get there, and upwards just enough to fall onto the target.
  const across = Math.hypot(to.x - start.x, to.z - start.z);
  const ticks = Math.max(across, 1);
  const rise = to.y + 1 - start.y;
  const up = (rise + 0.5 * projectile.gravity * ticks * ticks) / ticks;
  projectile.shoot({ x: (to.x - start.x) / ticks, y: up, z: (to.z - start.z) / ticks });
  if (fiery(titan)) {
    boulder.setOnFire(20, false);
    fieryBoulders.add(boulder.id);
  }
  titan.dimension.playSound("mob.ravager.roar", from, { volume: 3, pitch: 0.6 });
  return boulder;
}

function flames(titan) {
  const at = { x: titan.location.x, y: titan.location.y + 8.2, z: titan.location.z };
  try {
    titan.dimension.spawnParticle("minecraft:basic_flame_particle", at);
    titan.dimension.spawnParticle("minecraft:basic_flame_particle", { x: at.x + 0.6, y: at.y, z: at.z - 0.4 });
    titan.dimension.spawnParticle("minecraft:basic_flame_particle", { x: at.x - 0.5, y: at.y, z: at.z + 0.5 });
  } catch {
    // not loaded
  }
}

let tick = 0;
system.runInterval(() => {
  tick += 5;
  for (const id of DIMENSIONS) {
    for (const titan of world.getDimension(id).getEntities({ type: TITAN })) {
      try {
        if (fiery(titan)) flames(titan);
        if (!hasTree(titan) && (nextGrab.get(titan.id) ?? 0) <= tick) nextGrab.set(titan.id, tick + (grabTree(titan) ? GRAB_AGAIN : GRAB_RETRY));
        if ((nextThrow.get(titan.id) ?? 0) > tick) continue;
        const target = throwTarget(titan);
        if (!target) continue;
        throwBoulder(titan, target);
        nextThrow.set(titan.id, tick + (fiery(titan) ? FIERY_THROW_EVERY : THROW_EVERY));
      } catch (error) {
        console.warn(`titans: ${error}`);
      }
    }
  }
}, 5);

// Down to half health: the hair catches fire.
world.afterEvents.entityHurt.subscribe(
  ({ hurtEntity }) => {
    if (!hurtEntity?.isValid || fiery(hurtEntity)) return;
    const health = hurtEntity.getComponent("minecraft:health");
    if (!health || health.currentValue > health.effectiveMax / 2) return;
    hurtEntity.triggerEvent("family:get_angry");
    hurtEntity.dimension.playSound("mob.blaze.shoot", hurtEntity.location, { volume: 4, pitch: 0.5 });
  },
  { entityTypes: [TITAN] },
);

world.afterEvents.entityDie.subscribe(
  ({ deadEntity }) => {
    if (deadEntity?.id) {
      nextThrow.delete(deadEntity.id);
      nextGrab.delete(deadEntity.id);
    }
  },
  { entityTypes: [TITAN] },
);

/** Damage to what's next to a boulder when it lands, so a near miss still hurts. */
const SPLASH_DAMAGE = 4;
const SPLASH_RADIUS = 2.5;

/** A boulder breaks on whatever it hits and hurts what's around it; a burning one sets it on fire too. */
function smash({ projectile: boulder, location, dimension }, hit) {
  const burning = fieryBoulders.delete(boulder.id);
  try {
    dimension.spawnParticle(burning ? "minecraft:large_explosion" : "minecraft:huge_explosion_emitter", location);
  } catch {
    // not loaded
  }
  for (const entity of dimension.getEntities({ location, maxDistance: SPLASH_RADIUS, excludeTypes: [TITAN, BOULDER, "minecraft:item"] })) {
    if (!entity?.isValid) continue;
    if (burning) entity.setOnFire(5, true);
    if (entity.id !== hit?.id) entity.applyDamage(SPLASH_DAMAGE, { cause: "entityExplosion" });
  }
  system.run(() => {
    if (boulder.isValid) boulder.remove();
  });
}

world.afterEvents.projectileHitEntity.subscribe((event) => {
  const { projectile } = event;
  if (projectile?.typeId !== BOULDER) return;
  const hit = event.getEntityHit()?.entity;
  if (hit?.isValid && fieryBoulders.has(projectile.id) && hit.typeId !== TITAN) hit.setOnFire(5, true);
  smash(event, hit);
});

world.afterEvents.projectileHitBlock.subscribe((event) => {
  const { projectile } = event;
  if (projectile?.typeId !== BOULDER) return;
  smash(event);
});
