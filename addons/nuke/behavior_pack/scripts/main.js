import { BlockVolume, system, world } from "@minecraft/server";

const NUKE = "family:nuke";
const RADIUS = 24; // blocks. The crater is a sphere this wide: change it here to make it bigger or smaller.
const COUNTDOWN = 10; // seconds from use to the blast, to run away
const COLUMNS_PER_TICK = 30; // the budget: at most this many columns cleared per tick, whatever the radius
const REACH = 120; // how far away you can aim it

const SECONDS = 20; // Minecraft counts time in ticks: 20 ticks = 1 second.
// What the blast leaves alone: the bottom of the world, and water and lava (clearing those makes them flow, which lags).
const KEEP = { blockFilter: { excludeTypes: ["minecraft:bedrock", "minecraft:water", "minecraft:flowing_water", "minecraft:lava", "minecraft:flowing_lava"] } };

/**
 * Every column (x, z offset) of the crater, nearest the middle first, with how far it reaches up and down there.
 * One fill per column instead of one command per block, and the nearest first makes the crater open outwards like a shockwave.
 */
const COLUMNS = [];
for (let dx = -RADIUS; dx <= RADIUS; dx++) {
  for (let dz = -RADIUS; dz <= RADIUS; dz++) {
    const flat = Math.hypot(dx, dz);
    if (flat > RADIUS) continue;
    COLUMNS.push({ dx, dz, flat, half: Math.floor(Math.sqrt(RADIUS * RADIUS - flat * flat)) });
  }
}
COLUMNS.sort((a, b) => a.flat - b.flat);

let busy = false; // one nuke at a time

function sound(dimension, id, location, volume, pitch = 1) {
  try {
    dimension.playSound(id, location, { volume, pitch });
  } catch {
    // the chunk may not be loaded
  }
}

function particle(dimension, id, location) {
  try {
    dimension.spawnParticle(id, location);
  } catch {
    // the chunk may not be loaded
  }
}

function detonate(dimension, center, player) {
  sound(dimension, "random.explode", center, 8, 0.5);
  particle(dimension, "minecraft:huge_explosion_emitter", center);
  for (const mob of dimension.getEntities({ location: center, maxDistance: RADIUS, excludeFamilies: ["player", "inanimate"], excludeTypes: ["minecraft:item", "minecraft:xp_orb"] })) {
    try {
      mob.kill();
    } catch {
      // already gone
    }
  }

  let next = 0;
  const run = system.runInterval(() => {
    const until = Math.min(next + COLUMNS_PER_TICK, COLUMNS.length);
    let front = 0;
    for (; next < until; next++) {
      const { dx, dz, flat, half } = COLUMNS[next];
      front = flat;
      const from = { x: center.x + dx, y: Math.max(center.y - half, -63), z: center.z + dz };
      const to = { x: from.x, y: Math.min(center.y + half, 319), z: from.z };
      try {
        dimension.fillBlocks(new BlockVolume(from, to), "minecraft:air", KEEP);
      } catch {
        // that part of the world isn't loaded: leave it
      }
    }
    // The shockwave ring, now and then: 8 particles at the edge of what's been cleared.
    if (next % (COLUMNS_PER_TICK * 4) < COLUMNS_PER_TICK) {
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        particle(dimension, "minecraft:large_explosion", { x: center.x + Math.cos(angle) * front, y: center.y, z: center.z + Math.sin(angle) * front });
      }
      sound(dimension, "random.explode", center, 2, 0.7);
    }
    if (next >= COLUMNS.length) {
      system.clearRun(run);
      busy = false;
      console.log(JSON.stringify({ "event.name": "minecraft.nuke.detonated", "minecraft.player.name": player?.name ?? "", "minecraft.nuke.radius": RADIUS }));
    }
  }, 1);
}

world.afterEvents.itemUse.subscribe(({ source: player, itemStack }) => {
  if (itemStack?.typeId !== NUKE || !player?.isValid) return;
  if (busy) {
    player.onScreenDisplay.setActionBar("§cOne nuke at a time");
    return;
  }
  const hit = player.getBlockFromViewDirection({ maxDistance: REACH });
  if (!hit) {
    player.onScreenDisplay.setActionBar("§cAim at the ground");
    return;
  }
  busy = true;
  const dimension = player.dimension;
  const center = { x: hit.block.x + 0.5, y: hit.block.y + 0.5, z: hit.block.z + 0.5 };
  const container = player.getComponent("minecraft:inventory")?.container;
  if (container) container.setItem(player.selectedSlotIndex, undefined); // it's used up

  // Countdown: a beep each second, and the number to everyone close enough to run.
  for (let left = COUNTDOWN; left > 0; left--) {
    system.runTimeout(() => {
      sound(dimension, "note.pling", center, 3, left <= 3 ? 2 : 1);
      for (const near of world.getAllPlayers()) {
        if (!near?.isValid || near.dimension.id !== dimension.id) continue; // NPCs are undefined here
        const away = Math.hypot(near.location.x - center.x, near.location.z - center.z);
        if (away < RADIUS * 3) near.onScreenDisplay.setActionBar(`§c§lNUKE in ${left}§r§c — run! (${Math.round(away)} blocks away, the crater is ${RADIUS} wide)`);
      }
    }, (COUNTDOWN - left) * SECONDS);
  }
  system.runTimeout(() => detonate(dimension, center, player), COUNTDOWN * SECONDS);
});
