import { EntityDamageCause, system, world } from "@minecraft/server";
import { SIZES, covers, findTrampoline, isBed, isComplete, isEdge, isOverBed } from "./trampoline.js";
import "./starter-chest.js";
import { emit } from "./telemetry.js";

const COOLDOWN_TICKS = 8; // 20 ticks = 1 second
const SAFE_LANDING_TICKS = 200; // after a bounce, falls don't hurt for 10 seconds
const SAVE_KEY = "family:trampolines";

/** @typedef {import("./trampoline.js").Trampoline & { dimension: string }} SavedTrampoline */

/** @type {SavedTrampoline[] | undefined} */
let trampolines;
/** @type {Map<string, number>} player id → tick of their last bounce */
const lastBounce = new Map();

// Trampolines are saved in the world, so they still work after the server restarts.
function all() {
  trampolines ??= JSON.parse(String(world.getDynamicProperty(SAVE_KEY) ?? "[]"));
  return /** @type {SavedTrampoline[]} */ (trampolines);
}

/** @param {SavedTrampoline[]} list */
function save(list) {
  trampolines = list;
  world.setDynamicProperty(SAVE_KEY, JSON.stringify(list));
}

/** @param {import("@minecraft/server").Dimension} dimension */
function typeAt(dimension) {
  /** @type {import("./trampoline.js").GetType} */
  return (x, y, z) => {
    try {
      return dimension.getBlock({ x, y, z })?.typeId;
    } catch {
      return undefined; // outside the world
    }
  };
}

// Placing the last slime or edge block turns the pattern into a trampoline, like lighting a portal.
world.afterEvents.playerPlaceBlock.subscribe(({ block, player }) => {
  if (!isBed(block.typeId) && !isEdge(block.typeId)) return;

  const { x, y, z } = block.location;
  const found = findTrampoline(typeAt(block.dimension), x, y, z);
  if (!found) return;

  const dimension = block.dimension.id;
  const same = (/** @type {SavedTrampoline} */ t) =>
    t.dimension === dimension && t.x === found.x && t.y === found.y && t.z === found.z && t.size === found.size;
  if (all().some(same)) return;
  save([...all(), { dimension, ...found }]);

  for (let dx = 0; dx < found.size; dx++) {
    for (let dz = 0; dz < found.size; dz++) {
      block.dimension.spawnParticle("minecraft:villager_happy", {
        x: found.x + dx + 0.5,
        y: found.y + 1.3,
        z: found.z + dz + 0.5,
      });
    }
  }
  emit("trampoline.built", {
    "minecraft.player.name": player.name,
    "minecraft.trampoline.size": found.size,
    "minecraft.trampoline.height_blocks": SIZES[found.size].blocks,
  });
  player.playSound("random.levelup");
  player.onScreenDisplay.setActionBar(
    `§aSize ${found.size} trampoline! §fBounces about ${SIZES[found.size].blocks} blocks high.`,
  );
});

// Breaking any slime or edge block of a trampoline turns it back into normal blocks.
world.afterEvents.playerBreakBlock.subscribe(({ block, player }) => {
  const { x, y, z } = block.location;
  const dimension = block.dimension.id;
  const getType = typeAt(block.dimension);
  const broken = all().filter((t) => t.dimension === dimension && covers(t, x, y, z) && !isComplete(getType, t));
  if (broken.length === 0) return;

  save(all().filter((t) => !broken.includes(t)));
  for (const t of broken) {
    emit("trampoline.broken", { "minecraft.player.name": player.name, "minecraft.trampoline.size": t.size });
  }
  player.sendMessage("§cTrampoline broken!");
});

// Every tick, launch players standing on (or landing on) a trampoline. Sneak to stop bouncing.
system.runInterval(() => {
  const now = system.currentTick;
  for (const player of world.getAllPlayers()) {
    if (player.isSneaking) continue;
    if (now - (lastBounce.get(player.id) ?? -Infinity) < COOLDOWN_TICKS) continue;

    const { x, y, z } = player.location;
    const bedY = Math.floor(y) - 1;
    const bx = Math.floor(x);
    const bz = Math.floor(z);
    const t = all().find((t) => t.dimension === player.dimension.id && t.y === bedY && isOverBed(t, bx, bz));
    if (!t) continue;

    const vy = player.getVelocity().y;
    const landing = player.isOnGround || (y - (bedY + 1) < 0.6 && vy < 0);
    if (!landing) continue;

    // Explosions or pistons can break a trampoline without a player breaking a block.
    if (!isComplete(typeAt(player.dimension), t)) {
      save(all().filter((other) => other !== t));
      emit("trampoline.broken", { "minecraft.trampoline.size": t.size, "minecraft.trampoline.cause": "damaged" });
      continue;
    }

    // Knockback adds to the current speed, so cancel out the fall first.
    player.applyKnockback({ x: 0, z: 0 }, Math.max(0, SIZES[t.size].strength - vy));
    player.playSound("mob.slime.big");
    lastBounce.set(player.id, now);
    emit("trampoline.bounce", {
      "minecraft.player.name": player.name,
      "minecraft.trampoline.size": t.size,
      "minecraft.trampoline.height_blocks": SIZES[t.size].blocks,
    });
  }
}, 1);

// No fall damage for players who just bounced, even if they drift off the edge.
world.beforeEvents.entityHurt.subscribe((event) => {
  if (event.damageSource.cause !== EntityDamageCause.fall) return;
  const last = lastBounce.get(event.hurtEntity.id);
  if (last !== undefined && system.currentTick - last < SAFE_LANDING_TICKS) event.cancel = true;
});

world.afterEvents.playerLeave.subscribe(({ playerId }) => lastBounce.delete(playerId));
