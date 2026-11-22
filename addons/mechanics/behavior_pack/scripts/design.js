// A design is which part sits in each slot of a base, and its paint. No Minecraft imports here, so the tests can run it.
import { allowed, BASES, PART_BY_ID, PART_BY_KEY, PRESETS, slotsOf } from "./catalog.js";

/** @typedef {{ base: keyof typeof BASES, slots: number[], paint: number }} Design  slots: a part id per slot, 0 is empty */

export const MAX_PICK_DISTANCE = 0.9; // blocks from where you aim to the middle of a slot

export function emptyDesign(/** @type {keyof typeof BASES} */ base) {
  return /** @type {Design} */ ({ base, slots: slotsOf(base).map(() => 0), paint: 0 });
}

/** A preset as a design. @param {keyof typeof PRESETS} name */
export function presetDesign(name) {
  const preset = PRESETS[name];
  const design = emptyDesign(/** @type {keyof typeof BASES} */ (preset.base));
  for (const [i, key] of Object.entries(preset.parts)) design.slots[Number(i)] = PART_BY_KEY[key].id;
  design.paint = preset.paint;
  return design;
}

/** One short line for an item's dynamic property and the server log: "1|racer|1,1,2,0,...|14". */
export function encode(/** @type {Design} */ design) {
  return `1|${design.base}|${design.slots.join(",")}|${design.paint}`;
}

/** The design in a line, or undefined when it isn't one (wrong version, unknown base or part, a part in a slot it doesn't fit). */
export function decode(/** @type {unknown} */ line) {
  if (typeof line !== "string") return undefined;
  const [version, base, slots, paint, ...rest] = line.split("|");
  if (version !== "1" || rest.length || !Object.hasOwn(BASES, base)) return undefined;
  const places = slotsOf(/** @type {keyof typeof BASES} */ (base));
  const ids = slots.split(",").map(Number);
  const paintId = Number(paint);
  if (ids.length !== places.length || !Number.isInteger(paintId) || paintId < 0 || paintId > 15) return undefined;
  for (const [i, id] of ids.entries()) {
    if (id === 0) continue;
    const part = PART_BY_ID[id];
    if (!part || !allowed(places[i], part.key)) return undefined;
  }
  return /** @type {Design} */ ({ base: /** @type {keyof typeof BASES} */ (base), slots: ids, paint: paintId });
}

/** How many of a part are on the design. */
export const count = (/** @type {Design} */ design, /** @type {string} */ key) => design.slots.filter((id) => id === PART_BY_KEY[key].id).length;
export const partsOn = (/** @type {Design} */ design) => design.slots.filter((id) => id !== 0).length;

/** Keeps the seats in the first seat slots, in order: riders sit in the order they got on, so seat 1 is always the first seat slot. */
export function normalizeSeats(/** @type {Design} */ design) {
  const places = slotsOf(design.base);
  const seats = count(design, "seat");
  const seatId = PART_BY_KEY.seat.id;
  const seatSlots = BASES[design.base].seatSlots;
  // Whatever stands where a seat could go moves out of the way only if it is a seat; other parts stay where they are.
  const others = design.slots.map((id, i) => (id === seatId ? 0 : id));
  const slots = [...others];
  let left = seats;
  for (const i of seatSlots) {
    if (left <= 0) break;
    if (slots[i] === 0) {
      slots[i] = seatId;
      left--;
    }
  }
  // The seat slots were taken by other parts: the seats that did not fit are dropped.
  design.slots = slots;
  return { seats: count(design, "seat"), lost: seats - count(design, "seat"), places };
}

/**
 * Where the nearest point of a ray is to a point.
 * @param {{ x: number, y: number, z: number }} origin @param {{ x: number, y: number, z: number }} dir (unit length)
 * @param {{ x: number, y: number, z: number }} point
 */
export function rayDistance(origin, dir, point) {
  const to = { x: point.x - origin.x, y: point.y - origin.y, z: point.z - origin.z };
  const along = Math.max(0, to.x * dir.x + to.y * dir.y + to.z * dir.z);
  return Math.hypot(to.x - dir.x * along, to.y - dir.y * along, to.z - dir.z * along);
}

/**
 * Which slot a part goes in when you aim at the vehicle: the nearest free slot it fits. A seat just takes the next seat slot.
 * @param {Design} design @param {string} partKey
 * @param {{ origin: { x: number, y: number, z: number }, dir: { x: number, y: number, z: number } }} aim in model space, from the vehicle's middle on the ground
 * @returns {number} the slot, or -1 when nothing fits
 */
export function pickFreeSlot(design, partKey, aim) {
  const places = slotsOf(design.base);
  if (partKey === "seat") {
    if (count(design, "seat") >= BASES[design.base].seatMax) return -1;
    return BASES[design.base].seatSlots.find((i) => design.slots[i] === 0) ?? -1;
  }
  return nearest(design, aim, (slot) => design.slots[slot.i] === 0 && allowed(slot, partKey), places);
}

/** The filled slot you aim at, or -1. @param {Design} design */
export function pickFilledSlot(design, aim) {
  return nearest(design, aim, (slot) => design.slots[slot.i] !== 0, slotsOf(design.base));
}

function nearest(/** @type {Design} */ design, aim, /** @type {(slot: ReturnType<typeof slotsOf>[number]) => boolean} */ fits, places) {
  const top = BASES[design.base].deckTop;
  let best = -1;
  let bestDistance = MAX_PICK_DISTANCE;
  for (const slot of places) {
    if (!fits(slot)) continue;
    const distance = rayDistance(aim.origin, aim.dir, { x: slot.x, y: top + 0.5, z: slot.z });
    if (distance < bestDistance) {
      best = slot.i;
      bestDistance = distance;
    }
  }
  return best;
}

/** Turns a point in the world into model space, for a vehicle at `at` pointing `heading` degrees (0 is south, +z; 90 is west). */
export function toModel(/** @type {{ x: number, y: number, z: number }} */ world, /** @type {{ x: number, y: number, z: number }} */ at, /** @type {number} */ heading) {
  const r = (heading * Math.PI) / 180;
  const dx = world.x - at.x;
  const dz = world.z - at.z;
  // forward is (-sin, cos); left is (cos, sin); model z grows towards the back
  return { x: dx * Math.cos(r) + dz * Math.sin(r), y: world.y - at.y, z: -(dx * -Math.sin(r) + dz * Math.cos(r)) };
}

/** Same as toModel for a direction (no offset). */
export function dirToModel(/** @type {{ x: number, y: number, z: number }} */ dir, /** @type {number} */ heading) {
  return toModel(dir, { x: 0, y: 0, z: 0 }, heading);
}
