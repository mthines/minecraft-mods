import { ItemStack, Player, system, world } from "@minecraft/server";

const TOILET = "family:toilet"; // each entity and the item that places it share the name
const SINK = "family:sink";
const SHOWER = "family:shower";
const FURNITURE = [TOILET, SINK, SHOWER];

const SECONDS = 20; // Minecraft counts time in ticks: 20 ticks = 1 second.
const MIN_SIT = 3 * SECONDS; // sit this long for the speed; a shorter visit still flushes
const SHOWER_TIME = 8 * SECONDS;
const CHECK_EVERY = 5; // ticks between looking at who sits where

function sound(dimension, id, location, volume, pitch = 1) {
  try {
    dimension.playSound(id, location, { volume, pitch });
  } catch {
    // the chunk may not be loaded
  }
}

function splash(dimension, location, count, spread) {
  for (let i = 0; i < count; i++) {
    try {
      dimension.spawnParticle("minecraft:water_splash_particle", { x: location.x + (Math.random() - 0.5) * spread, y: location.y, z: location.z + (Math.random() - 0.5) * spread });
    } catch {
      return;
    }
  }
}

// --- Toilet: sit for a while, get up (it flushes), and you're fast.
/** @type {Map<string, number>} player id -> the tick they sat down */
const sitting = new Map();

function flush(dimension, at) {
  sound(dimension, "bucket.empty_water", at, 0.35, 0.6);
  for (const delay of [10, 25, 40]) system.runTimeout(() => sound(dimension, "liquid.water", at, 0.2, 0.9), delay);
  system.runTimeout(() => sound(dimension, "bucket.fill_water", at, 0.15, 0.8), 55);
}

system.runInterval(() => {
  const seen = new Set();
  for (const player of world.getAllPlayers()) {
    if (!player?.isValid) continue; // NPCs (simulated players from the npc mod) come through as undefined in other mods
    seen.add(player.id);
    const seat = player.getComponent("minecraft:riding")?.entityRidingOn;
    const onToilet = seat?.typeId === TOILET;
    const since = sitting.get(player.id);
    if (onToilet && since === undefined) {
      sitting.set(player.id, system.currentTick);
      sound(player.dimension, "armor.equip_leather", player.location, 0.3);
    } else if (!onToilet && since !== undefined) {
      sitting.delete(player.id);
      flush(player.dimension, player.location);
      if (system.currentTick - since >= MIN_SIT) {
        player.addEffect("speed", 30 * SECONDS, { amplifier: 1 });
        player.onScreenDisplay.setActionBar("§bAhh, so refreshing! You feel fast.");
      }
    }
  }
  for (const id of sitting.keys()) if (!seen.has(id)) sitting.delete(id); // they left
}, CHECK_EVERY);

// --- Sink and shower: use them (right-click, or the button on a touch screen).
const lastUsed = new Map(); // sink or shower id -> tick, so one click doesn't count twice
/** @type {Map<string, number>} shower id -> the tick it turns off */
const running = new Map();

world.afterEvents.dataDrivenEntityTrigger.subscribe(
  ({ entity }) => {
    if (!entity.isValid) return;
    if (system.currentTick - (lastUsed.get(entity.id) ?? -100) < 10) return;
    lastUsed.set(entity.id, system.currentTick);
    const at = entity.location;
    if (entity.typeId === SINK) {
      const tap = { x: at.x, y: at.y + 1, z: at.z };
      sound(entity.dimension, "random.click", at, 0.2, 1.6);
      for (const delay of [0, 12, 24]) {
        system.runTimeout(() => {
          if (!entity.isValid) return;
          sound(entity.dimension, "liquid.water", at, 0.25, 1.2);
          splash(entity.dimension, tap, 2, 0.2);
        }, delay);
      }
      const [player] = entity.dimension.getPlayers({ location: at, maxDistance: 4, closest: 1 });
      player?.onScreenDisplay.setActionBar("§bHands washed");
    } else if (running.has(entity.id)) {
      running.delete(entity.id);
      sound(entity.dimension, "random.click", at, 0.2, 1.3);
    } else {
      running.set(entity.id, system.currentTick + SHOWER_TIME);
      sound(entity.dimension, "random.click", at, 0.2, 1.3);
    }
  },
  { entityTypes: [SINK, SHOWER], eventTypes: ["family:used"] },
);

// Running showers: soft water, drops, and it puts out anyone on fire. Nothing runs when no shower is on.
system.runInterval(() => {
  for (const [id, until] of running) {
    const shower = world.getEntity(id);
    if (!shower?.isValid || system.currentTick >= until) {
      running.delete(id);
      continue;
    }
    const at = shower.location;
    sound(shower.dimension, "liquid.water", at, 0.2, 1.1);
    splash(shower.dimension, { x: at.x, y: at.y + 1.7, z: at.z }, 3, 0.4);
    splash(shower.dimension, { x: at.x, y: at.y + 0.1, z: at.z }, 3, 0.6);
    for (const player of shower.dimension.getPlayers({ location: at, maxDistance: 1.5 })) {
      if (player?.isValid) player.extinguishFire();
    }
  }
  for (const id of lastUsed.keys()) if (!world.getEntity(id)) lastUsed.delete(id); // removed sinks and showers
}, 10);

// --- Putting them down and picking them up again.
// Face the one who put it down, so the front is toward them.
world.afterEvents.entitySpawn.subscribe(({ entity }) => {
  if (!entity.isValid || !FURNITURE.includes(entity.typeId)) return;
  const [player] = entity.dimension.getPlayers({ location: entity.location, maxDistance: 8, closest: 1 });
  if (!player) return;
  const dx = player.location.x - entity.location.x;
  const dz = player.location.z - entity.location.z;
  entity.setRotation({ x: 0, y: (Math.atan2(-dx, dz) * 180) / Math.PI });
});

// Sneak and hit one to put it back in your inventory.
world.afterEvents.entityHitEntity.subscribe(({ damagingEntity: player, hitEntity: thing }) => {
  if (!thing || !FURNITURE.includes(thing.typeId) || !(player instanceof Player) || !player.isSneaking) return;
  if (thing.getComponent("minecraft:rideable")?.getRiders().length) return; // not while someone sits on it
  const left = player.getComponent("minecraft:inventory")?.container?.addItem(new ItemStack(thing.typeId));
  if (left) thing.dimension.spawnItem(left, thing.location); // inventory full: drop it instead
  running.delete(thing.id);
  thing.remove();
});
