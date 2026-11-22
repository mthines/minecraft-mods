import { BlockVolume, system, world } from "@minecraft/server";

const REACH = 120; // how far away you can aim it

const SECONDS = 20; // Minecraft counts time in ticks: 20 ticks = 1 second.
const NUKE = "family:nuke";

// The sizes: each its own item and kit (mc kit nuke, nuke-big, nuke-huge, nuke-mega). The crater is a ball this wide, cut off
// above and below `up` and `down` blocks so the big ones dig a bowl and not a pit to the bottom of the world.
// `perTick` is how many blocks one of its craters may clear each tick: the bigger ones are only bigger, never heavier per tick.
const SIZES = {
  "family:nuke": { radius: 24, up: 24, down: 24, countdown: 3, perTick: 1500 },
  "family:big_nuke": { radius: 72, up: 40, down: 72, countdown: 5, perTick: 3000 },
  "family:huge_nuke": { radius: 120, up: 48, down: 60, countdown: 8, perTick: 4000 },
  "family:mega_nuke": { radius: 240, up: 48, down: 60, countdown: 12, perTick: 5000 }, // 10 times the nuke
};
const MAX_PER_TICK = 6000; // all craters together clear at most this many blocks a tick, however many nukes go off at once
// What the blast leaves alone: the bottom of the world, and water and lava (clearing those makes them flow, which lags).
const KEEP = { blockFilter: { excludeTypes: ["minecraft:bedrock", "minecraft:water", "minecraft:flowing_water", "minecraft:lava", "minecraft:flowing_lava"] } };

/** @type {Map<string, { dx: Int16Array, dz: Int16Array, half: Int16Array }>} */
const columnsOf = new Map();

/**
 * Every column (x, z offset) of a crater, nearest the middle first, with how far it reaches up and down there. One fill per
 * column instead of one command per block, and nearest first makes the crater open outwards like a shockwave. Built when
 * the nuke is fired, in the countdown, and sorted by whole blocks of distance without a real sort (the biggest has 180,000 columns).
 */
function columns(size, id) {
  const cached = columnsOf.get(id);
  if (cached) return cached;
  const { radius } = size;
  const rings = Array.from({ length: radius + 2 }, () => 0);
  for (let dx = -radius; dx <= radius; dx++) for (let dz = -radius; dz <= radius; dz++) if (Math.hypot(dx, dz) <= radius) rings[Math.floor(Math.hypot(dx, dz)) + 1]++;
  for (let i = 1; i < rings.length; i++) rings[i] += rings[i - 1]; // where each ring starts
  const total = rings[rings.length - 1];
  const result = { dx: new Int16Array(total), dz: new Int16Array(total), half: new Int16Array(total) };
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dz = -radius; dz <= radius; dz++) {
      const flat = Math.hypot(dx, dz);
      if (flat > radius) continue;
      const at = rings[Math.floor(flat)]++;
      result.dx[at] = dx;
      result.dz[at] = dz;
      result.half[at] = Math.floor(Math.sqrt(radius * radius - flat * flat));
    }
  }
  columnsOf.set(id, result);
  return result;
}

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

/** The craters being cleared right now. Several nukes can go off together: they share the budget per tick, so they just take longer. */
const blasts = [];
let clearing; // the interval that clears them: it only runs while there is something to clear

function clearSome() {
  const perBlast = Math.max(1, Math.floor(MAX_PER_TICK / blasts.length));
  for (const blast of blasts) {
    const { dimension, center, size, cols } = blast;
    const budget = Math.min(size.perTick, perBlast);
    let spent = 0;
    let front = 0;
    while (blast.next < cols.half.length && spent < budget) {
      const i = blast.next++;
      const half = cols.half[i];
      const x = center.x + cols.dx[i];
      const z = center.z + cols.dz[i];
      const bottom = Math.max(center.y - Math.min(half, size.down), -63);
      const top = Math.min(center.y + Math.min(half, size.up), 319);
      front = Math.hypot(cols.dx[i], cols.dz[i]);
      spent += top - bottom + 1;
      try {
        dimension.fillBlocks(new BlockVolume({ x, y: bottom, z }, { x, y: top, z }), "minecraft:air", KEEP);
      } catch {
        // that part of the world isn't loaded: leave it
      }
    }
    // The shockwave ring, now and then: 8 particles at the edge of what's been cleared.
    if (blast.rings++ % 4 === 0) {
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        particle(dimension, "minecraft:large_explosion", { x: center.x + Math.cos(angle) * front, y: center.y, z: center.z + Math.sin(angle) * front });
      }
      sound(dimension, "random.explode", center, 2, 0.7);
    }
    if (blast.next >= cols.half.length) {
      console.log(JSON.stringify({ "event.name": "minecraft.nuke.detonated", "minecraft.player.name": blast.player, "minecraft.nuke.type": blast.type, "minecraft.nuke.radius": size.radius }));
    }
  }
  for (let i = blasts.length - 1; i >= 0; i--) if (blasts[i].next >= blasts[i].cols.half.length) blasts.splice(i, 1);
  if (blasts.length === 0 && clearing !== undefined) {
    system.clearRun(clearing);
    clearing = undefined;
  }
}

function detonate(dimension, center, player, type) {
  const size = SIZES[type];
  sound(dimension, "random.explode", center, 8, 0.5);
  particle(dimension, "minecraft:huge_explosion_emitter", center);
  for (const mob of dimension.getEntities({ location: center, maxDistance: size.radius, excludeFamilies: ["player", "inanimate"], excludeTypes: ["minecraft:item", "minecraft:xp_orb"] })) {
    try {
      mob.kill();
    } catch {
      // already gone
    }
  }
  blasts.push({ dimension, center, size, cols: columns(size, type), next: 0, rings: 0, player, type });
  clearing ??= system.runInterval(clearSome, 1);
}

world.afterEvents.itemUse.subscribe(({ source: player, itemStack }) => {
  const type = itemStack?.typeId;
  const size = SIZES[type];
  if (!size || !player?.isValid) return;
  const hit = player.getBlockFromViewDirection({ maxDistance: REACH });
  if (!hit) {
    player.onScreenDisplay.setActionBar("§cAim at the ground");
    return;
  }
  const dimension = player.dimension;
  const who = player.name; // read now: they may have left by the time it goes off
  const center = { x: hit.block.x + 0.5, y: hit.block.y + 0.5, z: hit.block.z + 0.5 };
  const container = player.getComponent("minecraft:inventory")?.container;
  const stack = container?.getItem(player.selectedSlotIndex);
  if (stack?.typeId === type) {
    if (stack.amount > 1) {
      stack.amount -= 1;
      container.setItem(player.selectedSlotIndex, stack);
    } else container.setItem(player.selectedSlotIndex, undefined); // that was the last one
  }

  system.runTimeout(() => columns(size, type), 1); // build the crater's columns in the countdown, not in the tick it goes off

  // Countdown: a beep each second, and the number to everyone close enough to run.
  for (let left = size.countdown; left > 0; left--) {
    system.runTimeout(() => {
      sound(dimension, "note.pling", center, 3, left <= 3 ? 2 : 1);
      for (const near of world.getAllPlayers()) {
        if (!near?.isValid || near.dimension.id !== dimension.id) continue; // NPCs are undefined here
        const away = Math.hypot(near.location.x - center.x, near.location.z - center.z);
        if (away < size.radius * 3) near.onScreenDisplay.setActionBar(`§c§lNUKE in ${left}§r§c — run! (${Math.round(away)} blocks away, the crater is ${size.radius * 2} blocks across)`);
      }
    }, (size.countdown - left) * SECONDS);
  }
  system.runTimeout(() => detonate(dimension, center, who, type), size.countdown * SECONDS);
});
