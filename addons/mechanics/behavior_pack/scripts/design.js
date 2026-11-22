// A design is which part sits in each slot of a base, and its paint. No Minecraft imports here, so the tests can run it.
import { allowed, BASES, PART_BY_ID, PART_BY_KEY, PRESETS, seatKey, seatSlotsOf, slotIndex, slotsOf } from "./catalog.js";

/** @typedef {{ base: keyof typeof BASES, slots: number[], paint: number }} Design  slots: a part id per slot, 0 is empty */

export const PICK_CELLS = 0.65; // how far from where you aim a cell is still the one you mean, in cells
export const PICK_FAR = 0.9; // the same in blocks for the wing and rear slots
export const SLOTS_PER_PROPERTY = 5; // slots packed into one entity property, a base-16 digit each (a part id is below 16)
export const PROPERTY_MAX = 16 ** SLOTS_PER_PROPERTY - 1;

export function emptyDesign(/** @type {keyof typeof BASES} */ base) {
  return /** @type {Design} */ ({ base, slots: slotsOf(base).map(() => 0), paint: 0 });
}

/** A preset as a design. @param {keyof typeof PRESETS} name */
export function presetDesign(name) {
  const preset = PRESETS[name];
  const base = /** @type {keyof typeof BASES} */ (preset.base);
  const design = emptyDesign(base);
  const places = slotsOf(base);
  for (const entry of preset.parts) {
    const [first, ...rest] = entry;
    const i = typeof first === "number" ? slotIndex(base, first, /** @type {number} */ (rest[0]), /** @type {number} */ (rest[1])) : places.findIndex((slot) => (first === "rear" ? slot.kind === "rear" : slot.kind === "side" && (first === "left" ? slot.x > 0 : slot.x < 0)));
    const key = /** @type {string} */ (rest.at(-1));
    design.slots[i] = PART_BY_KEY[key].id;
  }
  design.paint = preset.paint;
  return design;
}

/** The slots as entity property values: SLOTS_PER_PROPERTY part ids to a number, a base-16 digit each. */
export function pack(/** @type {number[]} */ slots) {
  const out = [];
  for (let g = 0; g * SLOTS_PER_PROPERTY < slots.length; g++) {
    let value = 0;
    for (let d = 0; d < SLOTS_PER_PROPERTY; d++) value += (slots[g * SLOTS_PER_PROPERTY + d] ?? 0) * 16 ** d;
    out.push(value);
  }
  return out;
}

/** The other way: `count` part ids from the property values. */
export function unpack(/** @type {number[]} */ values, /** @type {number} */ count) {
  return Array.from({ length: count }, (_, i) => Math.floor((values[Math.floor(i / SLOTS_PER_PROPERTY)] ?? 0) / 16 ** (i % SLOTS_PER_PROPERTY)) % 16);
}

export const propertiesOf = (/** @type {keyof typeof BASES} */ base) => Math.ceil(slotsOf(base).length / SLOTS_PER_PROPERTY);

/** One short line for an item's dynamic property and the server log: "2|racer|1,1,2,0,...|14". */
export function encode(/** @type {Design} */ design) {
  return `2|${design.base}|${design.slots.join(",")}|${design.paint}`;
}

/** The design in a line, or undefined when it isn't one (wrong version, unknown base or part, a part in a slot it doesn't fit). */
export function decode(/** @type {unknown} */ line) {
  if (typeof line !== "string") return undefined;
  const [version, base, slots, paint, ...rest] = line.split("|");
  if (version !== "2" || rest.length || !Object.hasOwn(BASES, base)) return undefined;
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

/** The slots with a seat on them, front to back (a rider sits in the first, so the driver is in the first), and the key of that choice. */
export function seatsOf(/** @type {Design} */ design) {
  const seatId = PART_BY_KEY.seat.id;
  const slots = seatSlotsOf(design.base).filter((i) => design.slots[i] === seatId);
  return { slots, key: seatKey(slots) };
}

/**
 * Where the nearest point of a ray is to a point, and how far along the ray that is.
 * @param {{ x: number, y: number, z: number }} origin @param {{ x: number, y: number, z: number }} dir (unit length)
 * @param {{ x: number, y: number, z: number }} point
 */
export function rayDistance(origin, dir, point) {
  return rayHit(origin, dir, point).distance;
}

function rayHit(/** @type {{ x: number, y: number, z: number }} */ origin, /** @type {{ x: number, y: number, z: number }} */ dir, /** @type {{ x: number, y: number, z: number }} */ point) {
  const to = { x: point.x - origin.x, y: point.y - origin.y, z: point.z - origin.z };
  const along = Math.max(0, to.x * dir.x + to.y * dir.y + to.z * dir.z);
  return { distance: Math.hypot(to.x - dir.x * along, to.y - dir.y * along, to.z - dir.z * along), along };
}

const SEAT_APART = 0.7; // blocks between two seats, so two riders don't sit in each other

/** Is there a part next to this cell (beside it, below it or above it)? Cells above the deck need one to hold on to. */
function attached(/** @type {Design} */ design, /** @type {ReturnType<typeof slotsOf>[number]} */ slot) {
  const base = BASES[design.base];
  const at = (/** @type {number} */ layer, /** @type {number} */ col, /** @type {number} */ row) => layer >= 0 && layer < base.layers && col >= 0 && col < base.cols && row >= 0 && row < base.rows && design.slots[slotIndex(design.base, layer, col, row)] !== 0;
  return at(slot.layer - 1, slot.col, slot.row) || at(slot.layer + 1, slot.col, slot.row) || at(slot.layer, slot.col - 1, slot.row) || at(slot.layer, slot.col + 1, slot.row) || at(slot.layer, slot.col, slot.row - 1) || at(slot.layer, slot.col, slot.row + 1);
}

/**
 * Which slot a part goes in when you aim at the vehicle: the first free slot along your aim that it fits (the
 * bottom layer always, higher cells only next to another part). A seat goes in a free seat spot, not too near another seat.
 * @param {Design} design @param {string} partKey
 * @param {{ origin: { x: number, y: number, z: number }, dir: { x: number, y: number, z: number } }} aim in model space, from the vehicle's middle on the ground
 * @returns {number} the slot, or -1 when nothing fits
 */
export function pickFreeSlot(design, partKey, aim) {
  const places = slotsOf(design.base);
  if (partKey === "seat" && count(design, "seat") >= BASES[design.base].seatMax) return -1;
  const seats = seatsOf(design).slots.map((i) => places[i]);
  return nearest(design, aim, (slot) => {
    if (design.slots[slot.i] !== 0 || !allowed(slot, partKey)) return false;
    if (partKey === "seat") return seats.every((seat) => Math.hypot(seat.x - slot.x, seat.z - slot.z) >= SEAT_APART);
    return slot.kind !== "deck" || slot.layer === 0 || attached(design, slot);
  }, places);
}

/** The filled slot you aim at (the first one along your aim), or -1. @param {Design} design */
export function pickFilledSlot(design, aim) {
  return nearest(design, aim, (slot) => design.slots[slot.i] !== 0, slotsOf(design.base));
}

function nearest(/** @type {Design} */ design, aim, /** @type {(slot: ReturnType<typeof slotsOf>[number]) => boolean} */ fits, places) {
  const top = BASES[design.base].deckTop;
  // The deck first: aimed at the car, the cells on it are what you mean. The wing and rear slots stand outside it, so they only count when no deck cell is near your aim.
  for (const kind of /** @type {const} */ (["deck", "other"])) {
    let best = -1;
    let bestAlong = Infinity;
    for (const slot of places) {
      if ((slot.kind === "deck") !== (kind === "deck") || !fits(slot)) continue;
      const { distance, along } = rayHit(aim.origin, aim.dir, { x: slot.x, y: top + slot.y + slot.cell / 2, z: slot.z });
      const reach = slot.kind === "deck" ? slot.cell * PICK_CELLS : PICK_FAR;
      if (distance < reach && along < bestAlong) {
        best = slot.i;
        bestAlong = along;
      }
    }
    if (best >= 0) return best;
  }
  return -1;
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
