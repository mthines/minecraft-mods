import { system, world } from "@minecraft/server";

const HOOK = "family:grappling_hook";
const RANGE = 40; // blocks the hook reaches
const SPEED = 1; // blocks a tick you fly along the rope (20 blocks a second)
const ARRIVED = 1.5; // this close to the hook and you've arrived
const MAX_TICKS = 100; // let go after 5 seconds, even if you never got there
const STUCK_TICKS = 10; // let go if you barely moved for this long (something's in the way)
const MOB_PULL = 0.15; // how hard a hooked mob is yanked, per block it's away
const ROPE = "minecraft:endrod";
// Knockback sets a player's speed each tick, but not 1:1 (measured in game, see double-jump):
const KNOCKBACK_KEEPS = 0.73; // a player keeps about this much of a sideways knockback after air drag
const KNOCKED_SINK = 0.077; // knocked along with no push up, a player sinks this much a tick
const PUSH_LIFT = 2.35; // each 0.01 of push up rises 0.0235 blocks a tick

/** @typedef {import("@minecraft/server").Player} Player */
/** @typedef {{ x: number, y: number, z: number }} Vec */

/** @type {Map<string, { player: Player, hook: Vec, feet: Vec, ticks: number, last: Vec, still: number }>} player id → the pull they're in */
const pulls = new Map();
/** @type {Map<string, Player>} player id → players let go of the rope, floating down slowly until they land */
const landing = new Map();

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** Where your feet go to hang on the block face you hooked: a bit out from the face, and below the hook unless it's a floor. */
function standingSpot(hook, face) {
  const out = { Up: [0, 0.1, 0], Down: [0, -2, 0], North: [0, 0, -0.7], South: [0, 0, 0.7], West: [-0.7, 0, 0], East: [0.7, 0, 0] }[face] ?? [0, 0, 0];
  const below = face === "Up" || face === "Down" ? 0 : -1;
  return { x: hook.x + out[0], y: hook.y + out[1] + below, z: hook.z + out[2] };
}

/** @param {Player} player @param {Vec} to */
function drawRope(player, to) {
  const from = player.getHeadLocation();
  from.y -= 0.4; // from the hand, not the eyes
  const length = distance(from, to);
  try {
    for (let d = 1; d < length; d += 0.7) {
      const f = d / length;
      player.dimension.spawnParticle(ROPE, { x: from.x + (to.x - from.x) * f, y: from.y + (to.y - from.y) * f, z: from.z + (to.z - from.z) * f });
    }
  } catch {
    // the rope stops where the loaded world ends
  }
}

/** @param {Player} player */
function letGo(player) {
  pulls.delete(player.id);
  landing.set(player.id, player);
}

/** @param {Player} player */
function fire(player) {
  if (pulls.has(player.id)) return letGo(player); // right-click again lets go
  const head = player.getHeadLocation();
  const wall = player.getBlockFromViewDirection({ maxDistance: RANGE });
  const wallDistance = wall
    ? distance(head, { x: wall.block.x + wall.faceLocation.x, y: wall.block.y + wall.faceLocation.y, z: wall.block.z + wall.faceLocation.z })
    : RANGE;
  const mob = player
    .getEntitiesFromViewDirection({ maxDistance: wallDistance, excludeTypes: ["minecraft:item", "minecraft:xp_orb"] })
    .find(({ entity }) => entity?.id !== player.id)?.entity;
  player.dimension.playSound("random.bow", head, { pitch: 0.7 });

  if (mob?.isValid) {
    // Yank the mob over to you.
    const at = mob.location;
    drawRope(player, { x: at.x, y: at.y + 1, z: at.z });
    const away = { x: player.location.x - at.x, z: player.location.z - at.z };
    const pull = Math.min(MOB_PULL * Math.hypot(away.x, away.z), 3);
    const flat = Math.hypot(away.x, away.z) || 1;
    try {
      mob.applyKnockback({ x: (away.x / flat) * pull, z: (away.z / flat) * pull }, 0.5);
    } catch {
      // some entities can't be knocked back
    }
    player.dimension.playSound("random.bowhit", at);
    return;
  }
  if (!wall) {
    // Missed: the rope flies out and falls short.
    const look = player.getViewDirection();
    drawRope(player, { x: head.x + look.x * 8, y: head.y + look.y * 8, z: head.z + look.z * 8 });
    return;
  }
  const hook = { x: wall.block.x + wall.faceLocation.x, y: wall.block.y + wall.faceLocation.y, z: wall.block.z + wall.faceLocation.z };
  landing.delete(player.id);
  pulls.set(player.id, { player, hook, feet: standingSpot(hook, wall.face), ticks: 0, last: player.location, still: 0 });
  player.dimension.playSound("random.bowhit", hook);
  try {
    player.dimension.spawnParticle("minecraft:critical_hit_emitter", hook);
  } catch {
    // not loaded
  }
}

world.afterEvents.itemUse.subscribe(({ source: player, itemStack }) => {
  if (!player || itemStack?.typeId !== HOOK) return; // NPCs come through as undefined in other mods
  fire(player);
});

system.runInterval(() => {
  for (const [id, pull] of pulls) {
    const { player } = pull;
    if (!player?.isValid) {
      pulls.delete(id);
      continue;
    }
    const at = player.location;
    const left = distance(at, pull.feet);
    pull.ticks++;
    pull.still = distance(at, pull.last) < 0.05 ? pull.still + 1 : 0;
    pull.last = at;
    if (left < ARRIVED || player.isSneaking || pull.ticks > MAX_TICKS || pull.still > STUCK_TICKS) {
      letGo(player);
      continue;
    }
    // Straight along the rope, like a zipline, slowing down for the last few blocks so you don't slam in.
    const speed = Math.min(SPEED, left * 0.4 + 0.2);
    const v = { x: ((pull.feet.x - at.x) / left) * speed, y: ((pull.feet.y - at.y) / left) * speed, z: ((pull.feet.z - at.z) / left) * speed };
    player.applyKnockback({ x: v.x / KNOCKBACK_KEEPS, z: v.z / KNOCKBACK_KEEPS }, (v.y + KNOCKED_SINK) / PUSH_LIFT);
    if (pull.ticks % 2 === 0) drawRope(player, pull.hook);
  }
  // After letting go you float down slowly until you land: no fall damage, even from a high ceiling.
  for (const [id, player] of landing) {
    if (!player?.isValid || player.isOnGround || player.isInWater) {
      landing.delete(id);
      continue;
    }
    player.addEffect("slow_falling", 10, { showParticles: false });
  }
}, 1);

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  pulls.delete(playerId);
  landing.delete(playerId);
});
