import { system, world } from "@minecraft/server";

const GUN = "family:portal_gun";
const RANGE = 50; // blocks the gun reaches
const SAVED = "family:portals"; // each player's pair, on the player, so it survives /reload
const COOLDOWN = 30; // ticks before something that came through a portal can go through again (20 ticks = 1 second)
const SHOT_COOLDOWN = 5;
const COLORS = { blue: "minecraft:blue_flame_particle", orange: "minecraft:basic_flame_particle" };

/** @typedef {"blue" | "orange"} Color */
/** @typedef {{ x: number, y: number, z: number, face: string, dimension: string }} Portal the air block in front of the face (for a wall, the lower of two) */
/** @typedef {Partial<Record<Color, Portal>>} Pair */

/** Which way each face points, out of the block it's on. */
const NORMALS = {
  Up: { x: 0, y: 1, z: 0 },
  Down: { x: 0, y: -1, z: 0 },
  North: { x: 0, y: 0, z: -1 },
  South: { x: 0, y: 0, z: 1 },
  East: { x: 1, y: 0, z: 0 },
  West: { x: -1, y: 0, z: 0 },
};
const isWall = (/** @type {Portal} */ portal) => portal.face !== "Up" && portal.face !== "Down";

/** @type {Map<string, Pair>} player id → their portals */
const pairs = new Map();
/** @type {Map<string, number>} entity id → tick it may go through a portal again */
const cooldowns = new Map();
/** @type {Map<string, number>} player id → tick they may shoot again */
const nextShot = new Map();

/** @param {import("@minecraft/server").Player} player @returns {Pair} */
function pairOf(player) {
  let pair = pairs.get(player.id);
  if (!pair) {
    const saved = player.getDynamicProperty(SAVED);
    try {
      pair = typeof saved === "string" ? JSON.parse(saved) : {};
    } catch {
      pair = {};
    }
    pairs.set(player.id, pair ?? {});
  }
  return pair ?? {};
}

/** @param {import("@minecraft/server").Player} player @param {Color} color */
function shoot(player, color) {
  if (system.currentTick < (nextShot.get(player.id) ?? 0)) return;
  nextShot.set(player.id, system.currentTick + SHOT_COOLDOWN);
  const head = player.getHeadLocation();
  const hit = player.getBlockFromViewDirection({ maxDistance: RANGE });
  const normal = hit && NORMALS[hit.face];
  const dimension = player.dimension;
  if (!hit || !normal) {
    player.dimension.playSound("note.bass", head, { pitch: 0.5 });
    return;
  }
  const front = { x: hit.block.x + normal.x, y: hit.block.y + normal.y, z: hit.block.z + normal.z };
  if (!dimension.getBlock(front)?.isAir) {
    player.dimension.playSound("note.bass", head, { pitch: 0.5 });
    return;
  }
  // A wall portal is two blocks tall: if it hit the top of a wall at eye height, it reaches down to the floor.
  if (normal.y === 0 && dimension.getBlock({ ...front, y: front.y - 1 })?.isAir && !dimension.getBlock(hit.block.below() ?? hit.block)?.isAir) front.y--;

  const portal = { ...front, face: hit.face, dimension: dimension.id };
  const pair = pairOf(player);
  pair[color] = portal;
  player.setDynamicProperty(SAVED, JSON.stringify(pair));

  // A trail of sparks from the gun to the new portal.
  const to = centerOf(portal);
  const length = Math.hypot(to.x - head.x, to.y - head.y, to.z - head.z);
  try {
    for (let d = 1; d < length; d += 0.6) {
      const f = d / length;
      dimension.spawnParticle(COLORS[color], { x: head.x + (to.x - head.x) * f, y: head.y - 0.2 + (to.y - head.y) * f, z: head.z + (to.z - head.z) * f });
    }
  } catch {
    // the trail stops where the loaded world ends
  }
  dimension.playSound("mob.shulker.shoot", head, { pitch: color === "blue" ? 1.4 : 1.1 });
  dimension.playSound("beacon.activate", to, { pitch: color === "blue" ? 1.8 : 1.5, volume: 0.6 });
  player.onScreenDisplay.setActionBar(color === "blue" ? "§9Blue portal!§r  Sneak to shoot orange" : "§6Orange portal!");
}

/** The middle of the portal, on its face. @param {Portal} portal */
function centerOf(portal) {
  const n = NORMALS[portal.face];
  return {
    x: portal.x + 0.5 - n.x * 0.5,
    y: isWall(portal) ? portal.y + 1 : portal.y + 0.5 - n.y * 0.5,
    z: portal.z + 0.5 - n.z * 0.5,
  };
}

/** Whether an entity with its feet at `at` and this tall is in the portal. @param {Portal} portal @param {import("@minecraft/server").Vector3} at @param {number} height */
function touches(portal, at, height) {
  const n = NORMALS[portal.face];
  const c = centerOf(portal);
  if (portal.face === "Up") return Math.abs(at.x - c.x) < 0.6 && Math.abs(at.z - c.z) < 0.6 && at.y - c.y > -0.2 && at.y - c.y < 0.4;
  if (portal.face === "Down") return Math.abs(at.x - c.x) < 0.6 && Math.abs(at.z - c.z) < 0.6 && c.y - (at.y + height) > -0.2 && c.y - (at.y + height) < 0.5;
  // A wall: close to its face, in front of it, and not past its sides, top, or bottom.
  const out = (at.x - c.x) * n.x + (at.z - c.z) * n.z;
  const side = Math.abs((at.x - c.x) * n.z - (at.z - c.z) * n.x);
  return out > -0.1 && out < 0.45 && side < 0.6 && at.y > portal.y - 0.3 && at.y < portal.y + 1.3;
}

/** Where an entity this tall comes out of a portal, and which way it then faces. @param {Portal} portal @param {number} height */
function exitOf(portal, height) {
  const n = NORMALS[portal.face];
  const c = centerOf(portal);
  if (portal.face === "Up") return { location: { x: c.x, y: c.y + 1, z: c.z } };
  if (portal.face === "Down") return { location: { x: c.x, y: c.y - 0.6 - height, z: c.z } };
  return { location: { x: c.x + n.x, y: portal.y, z: c.z + n.z }, yaw: (Math.atan2(-n.x, n.z) * 180) / Math.PI };
}

/** @param {import("@minecraft/server").Entity} entity */
function heightOf(entity) {
  try {
    return Math.max(0.25, entity.getHeadLocation().y - entity.location.y + 0.2);
  } catch {
    return 0.5; // items have no head
  }
}

/** Sends an entity that walked into `from` out of `to`. @param {import("@minecraft/server").Entity} entity @param {Portal} from @param {Portal} to */
function teleport(entity, from, to) {
  const dimension = world.getDimension(to.dimension);
  const height = heightOf(entity);
  const { location, yaw } = exitOf(to, height);
  const n = NORMALS[to.face];
  cooldowns.set(entity.id, system.currentTick + COOLDOWN);
  entity.dimension.playSound("mob.endermen.portal", centerOf(from), { pitch: 1.3 });
  entity.teleport(location, { dimension, ...(yaw === undefined ? {} : { rotation: { x: entity.getRotation().x, y: yaw } }) });
  dimension.playSound("mob.endermen.portal", location, { pitch: 1.6 });
  // A little push out of the portal, so you pop out of it.
  try {
    if (entity.typeId === "minecraft:player") entity.applyKnockback({ x: n.x * 0.6, z: n.z * 0.6 }, n.y > 0 ? 0.3 : 0);
    else entity.applyImpulse({ x: n.x * 0.3, y: n.y * 0.3, z: n.z * 0.3 });
  } catch {
    // some entities can't be pushed
  }
}

/** Draws a portal: an oval of flames flat on its face. @param {Portal} portal @param {Color} color @param {number} spin */
function draw(portal, color, spin) {
  const n = NORMALS[portal.face];
  const c = centerOf(portal);
  // Two directions along the face: across and up for a wall, x and z for a floor or ceiling.
  const across = isWall(portal) ? { x: n.z, y: 0, z: -n.x } : { x: 1, y: 0, z: 0 };
  const up = isWall(portal) ? { x: 0, y: 1, z: 0 } : { x: 0, y: 0, z: 1 };
  const [ra, ru] = isWall(portal) ? [0.45, 0.95] : [0.5, 0.5];
  const dimension = world.getDimension(portal.dimension);
  try {
    for (let i = 0; i < 14; i++) {
      const a = spin + (i / 14) * Math.PI * 2;
      const s = Math.cos(a) * ra;
      const u = Math.sin(a) * ru;
      dimension.spawnParticle(COLORS[color], {
        x: c.x + across.x * s + up.x * u + n.x * 0.08,
        y: c.y + across.y * s + up.y * u + n.y * 0.08,
        z: c.z + across.z * s + up.z * u + n.z * 0.08,
      });
    }
  } catch {
    // not loaded
  }
}

// Draw everyone's portals.
system.runInterval(() => {
  const spin = (system.currentTick / 40) * Math.PI;
  for (const player of world.getAllPlayers()) {
    if (!player) continue; // NPCs are undefined in other mods' scripts
    const pair = pairOf(player);
    if (pair.blue) draw(pair.blue, "blue", spin);
    if (pair.orange) draw(pair.orange, "orange", -spin);
  }
}, 4);

// Send whatever walks into a portal out of the other one.
system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    if (!player) continue;
    const { blue, orange } = pairOf(player);
    if (!blue || !orange || blue.dimension !== orange.dimension) continue;
    for (const [from, to] of [[blue, orange], [orange, blue]]) {
      let nearby;
      try {
        nearby = world.getDimension(from.dimension).getEntities({ location: centerOf(from), maxDistance: 2.5 });
      } catch {
        continue; // not loaded
      }
      for (const entity of nearby) {
        if (!entity?.isValid || system.currentTick < (cooldowns.get(entity.id) ?? 0)) continue;
        if (touches(from, entity.location, heightOf(entity))) teleport(entity, from, to);
      }
    }
  }
  for (const [id, until] of cooldowns) if (until < system.currentTick) cooldowns.delete(id);
}, 1);

world.afterEvents.itemUse.subscribe(({ source: player, itemStack }) => {
  if (!player || itemStack?.typeId !== GUN) return;
  shoot(player, player.isSneaking ? "orange" : "blue");
});

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  pairs.delete(playerId);
  nextShot.delete(playerId);
});
