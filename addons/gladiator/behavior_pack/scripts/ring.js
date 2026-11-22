// The gladiator ring: a circle of sandstone around a gold block, all on one level. Pure functions, no @minecraft/server,
// so they can be unit tested (tests/ring.test.mjs).

export const GOLD = "minecraft:gold_block";
export const MIN_RADIUS = 4; // blocks from the gold block's middle to the middle of the ring's blocks
export const MAX_RADIUS = 10;
/** At least this share of the ring must be sandstone: a few gaps (a gate, a missing block) are fine. */
export const MIN_FILL = 0.8;
const BUTTON_NEAR = { inside: 1.5, outside: 2.5 }; // the button sits on or next to the ring, this far in or out from its blocks

/** @typedef {(x: number, y: number, z: number) => string | undefined} GetType */
/** @typedef {{ x: number, y: number, z: number, radius: number }} Ring  `x, y, z` is the gold block */

/** Every kind of sandstone, red or not, smooth, cut or chiseled, plus its stairs, slabs and walls. @param {string | undefined} id */
export const isSandstone = (id) => id !== undefined && id.startsWith("minecraft:") && id.includes("sandstone");

/** @param {string | undefined} id */
export const isButton = (id) => id !== undefined && id.startsWith("minecraft:") && id.endsWith("_button");

/**
 * How much of a circle of `radius` around the gold block at `cx, cy, cz` is sandstone (0 to 1).
 * Each sample looks half a block in and out too, so a ring drawn slightly differently from ours still counts.
 * @param {GetType} getType
 */
export function fillAt(getType, cx, cy, cz, radius) {
  const samples = Math.ceil(2 * Math.PI * radius * 1.5);
  let hits = 0;
  for (let i = 0; i < samples; i++) {
    const a = (2 * Math.PI * i) / samples;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    for (const r of [radius, radius - 0.5, radius + 0.5]) {
      if (isSandstone(getType(cx + Math.round(r * cos), cy, cz + Math.round(r * sin)))) {
        hits++;
        break;
      }
    }
  }
  return hits / samples;
}

/**
 * The ring a button belongs to, or undefined. The button is on top of the ring's blocks or beside them, so the ring is
 * at the button's level or one below. Looks for gold blocks in a ring-shaped area around the button (about 400 lookups
 * per level), then tries 3 radii around the distance to each (at most about 300 lookups each): never more than
 * about 2500 `getType` calls, and only when a player presses a button.
 * @param {GetType} getType
 * @returns {Ring | undefined}
 */
export function findRing(getType, bx, by, bz) {
  const reach = MAX_RADIUS + 3;
  let best;
  let golds = 0;
  for (const y of [by, by - 1]) {
    for (let dx = -reach; dx <= reach; dx++) {
      for (let dz = -reach; dz <= reach; dz++) {
        const away = Math.hypot(dx, dz);
        if (away < MIN_RADIUS - BUTTON_NEAR || away > MAX_RADIUS + BUTTON_NEAR + 1) continue;
        if (getType(bx + dx, y, bz + dz) !== GOLD || ++golds > 4) continue;
        const cx = bx + dx;
        const cz = bz + dz;
        const guess = Math.round(away);
        for (let radius = Math.max(MIN_RADIUS, guess - 1); radius <= Math.min(MAX_RADIUS, guess + 1); radius++) {
          if (away < radius - BUTTON_NEAR || away > radius + BUTTON_NEAR) continue;
          const fill = fillAt(getType, cx, y, cz, radius);
          if (fill >= MIN_FILL && (!best || fill > best.fill)) best = { fill, ring: { x: cx, y, z: cz, radius } };
        }
      }
    }
    if (best) break;
  }
  return best?.ring;
}

/** The middle of the ring's gold block. @param {Ring} ring */
export const middleOf = (ring) => ({ x: ring.x + 0.5, y: ring.y, z: ring.z + 0.5 });

const flat = (/** @type {{x: number, z: number}} */ pos, /** @type {Ring} */ ring) => Math.hypot(pos.x - (ring.x + 0.5), pos.z - (ring.z + 0.5));

/** Within the ring's wall, and not far above or below its level. `margin` blocks of slack (negative: further in). @param {Ring} ring @param {{x: number, y: number, z: number}} pos */
export function isInside(ring, pos, margin = 0) {
  const dy = pos.y - ring.y;
  return flat(pos, ring) <= ring.radius + margin && dy > -3 && dy < 8;
}

/** Where a fighter who left the ring goes back to: a bit inside the wall, on the side they were on. @param {Ring} ring @param {{x: number, y: number, z: number}} pos */
export function backInside(ring, pos) {
  const d = flat(pos, ring) || 1;
  const k = (ring.radius - 1.5) / d;
  return { x: ring.x + 0.5 + (pos.x - ring.x - 0.5) * Math.min(k, 1), y: ring.y + 1, z: ring.z + 0.5 + (pos.z - ring.z - 0.5) * Math.min(k, 1) };
}

/** A spot on the circle `distance` blocks from the middle, at `angle` radians. @param {Ring} ring */
export function spotAt(ring, angle, distance) {
  return { x: ring.x + 0.5 + Math.cos(angle) * distance, z: ring.z + 0.5 + Math.sin(angle) * distance };
}

/** Yaw (degrees, 0 faces +z) for looking from a spot toward the middle of the ring. @param {Ring} ring @param {{x: number, z: number}} spot */
export const yawToMiddle = (ring, spot) => (Math.atan2(-(ring.x + 0.5 - spot.x), ring.z + 0.5 - spot.z) * 180) / Math.PI;

export const MAX_CROWD = 12;
export const MIN_CROWD = 8;
export const CROWD_GAP = 2.2; // blocks outside the ring's blocks

/** How many fans fill a ring's edge: 8 for a small ring up to 12 (the cap) for a big one. @param {Ring} ring */
export const crowdSize = (ring) => Math.max(MIN_CROWD, Math.min(MAX_CROWD, Math.round(ring.radius * 1.5)));

/** The fans' spots just outside the ring, evenly spread, each facing the middle. @param {Ring} ring */
export function crowdSpots(ring) {
  const n = crowdSize(ring);
  return Array.from({ length: n }, (_, i) => {
    const spot = spotAt(ring, (2 * Math.PI * i) / n + 0.3, ring.radius + CROWD_GAP);
    return { ...spot, yaw: yawToMiddle(ring, spot) };
  });
}

/** Where a knocked-out fighter goes: beyond the fans, on the side they were on (or `fallbackAngle`). @param {Ring} ring @param {{x: number, z: number}} pos */
export function exitSpot(ring, pos, fallbackAngle = 0) {
  const dx = pos.x - (ring.x + 0.5);
  const dz = pos.z - (ring.z + 0.5);
  const angle = Math.hypot(dx, dz) < 0.5 ? fallbackAngle : Math.atan2(dz, dx);
  return spotAt(ring, angle, ring.radius + CROWD_GAP + 2.3);
}
