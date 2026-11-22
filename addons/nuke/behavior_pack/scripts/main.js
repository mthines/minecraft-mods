import { BlockVolume, system, world } from "@minecraft/server";
import { buildColumns, depths, loadedReach } from "./crater.js";

const REACH = 120; // how far away you can aim it

const SECONDS = 20; // Minecraft counts time in ticks: 20 ticks = 1 second.
const NUKE = "family:nuke";

// The sizes: each its own item and kit (mc kit nuke, nuke-big, nuke-huge, nuke-mega). The crater is a ball `radius` wide and
// squashed to be only `up` blocks high above the middle and `down` deep below it (a ball for the plain nuke, where all three are
// the same): so the big ones dig a round bowl, not a pit to the bottom of the world, and the floor curves instead of going flat.
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

/** @type {Map<string, { dx: Int16Array, dz: Int16Array }>} */
const columnsOf = new Map();

/** A size's columns, built once (the biggest has 180,000), and in the countdown, not in the tick it goes off. */
function columns(size, id) {
  let cols = columnsOf.get(id);
  if (!cols) columnsOf.set(id, (cols = buildColumns(size.radius)));
  return cols;
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
    const { dimension, center, size, cols, reach } = blast;
    const budget = Math.min(size.perTick, perBlast);
    let spent = 0;
    let front = 0;
    while (blast.next < cols.dx.length && spent < budget) {
      const i = blast.next++;
      front = Math.hypot(cols.dx[i], cols.dz[i]);
      if (front > reach) {
        blast.next = cols.dx.length; // the columns go outwards, so the rest are outside the crater too
        break;
      }
      const x = center.x + cols.dx[i];
      const z = center.z + cols.dz[i];
      const { up, down } = depths(size, reach, front);
      const bottom = Math.max(center.y - down, -63);
      const top = Math.min(center.y + up, 319);
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
    if (blast.next >= cols.dx.length) {
      console.log(JSON.stringify({ "event.name": "minecraft.nuke.detonated", "minecraft.player.name": blast.player, "minecraft.nuke.type": blast.type, "minecraft.nuke.radius": reach }));
    }
  }
  for (let i = blasts.length - 1; i >= 0; i--) if (blasts[i].next >= blasts[i].cols.dx.length) blasts.splice(i, 1);
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
  // Only loaded chunks can be cleared, so the crater shrinks to fit them and stays round (see loadedReach in crater.js).
  const loaded = (dx, dz) => {
    try {
      return dimension.getBlock({ x: center.x + dx, y: center.y, z: center.z + dz }) !== undefined;
    } catch {
      return false;
    }
  };
  const reach = loadedReach(loaded, size.radius);
  if (reach < size.radius) {
    for (const near of dimension.getPlayers({ location: center, maxDistance: size.radius * 2 })) {
      near?.sendMessage(`§eThe crater is ${reach * 2} blocks across, not ${size.radius * 2}: the rest of the world isn't loaded. Stand in the middle of what you want cleared.`);
    }
  }
  blasts.push({ dimension, center, size, cols: columns(size, type), reach, next: 0, rings: 0, player, type });
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
