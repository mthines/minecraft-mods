// Everything the mechanics mod knows about its vehicles, as plain data. No Minecraft imports here: the scripts, the
// generator (gen/build.mjs) and the tests all read this one file, so a part or base added here shows up everywhere.
//
// Space: every position is in "model space", in blocks, from the middle of the vehicle on the ground:
// x grows to the vehicle's left, y up, z towards the back (the model's front is -z, like every Bedrock model).

/** Parts a kid can add. `id` is what a slot's entity property holds (0 is empty). `weight` adds to the vehicle's weight. */
export const PARTS = [
  { id: 1, key: "seat", name: "Seat", weight: 0.25, about: "Put one in the front and you can drive." },
  { id: 2, key: "body", name: "Body block", weight: 0.25, about: "A solid piece of car. Dye it any color." },
  { id: 3, key: "glass", name: "Window", weight: 0.25, about: "A see-through window." },
  { id: 4, key: "thruster", name: "Thruster", weight: 0.25, about: "Three thrusters lift a block of car. Enough of them and it flies." },
  { id: 5, key: "wing", name: "Wing", weight: 0.25, about: "A pair of wings on the sides turns a flying car into a plane." },
  { id: 6, key: "plow", name: "Plow", weight: 0.25, about: "Mount it on the back and it turns grass into farmland." },
  { id: 7, key: "gatling", name: "Gatling gun", weight: 0.25, about: "Tap attack to fire a burst. Two guns hurt twice as much.", weapon: true },
  { id: 8, key: "rocket", name: "Rocket pod", weight: 0.25, about: "Tap attack to fire a rocket that blows up blocks.", weapon: true },
  { id: 9, key: "laser", name: "Laser", weight: 0.25, about: "Tap attack to fire a long, strong beam.", weapon: true },
];
export const PART_BY_ID = Object.fromEntries(PARTS.map((part) => [part.id, part]));
export const PART_BY_KEY = Object.fromEntries(PARTS.map((part) => [part.key, part]));
export const partItem = (/** @type {string} */ key) => `family:mech_${key}`;

/** What each kind of slot can hold. */
export const ALLOWED = {
  deck: ["seat", "body", "glass", "thruster", "gatling", "rocket", "laser"],
  side: ["wing", "thruster"],
  rear: ["body", "thruster", "plow", "gatling", "rocket", "laser"],
};

export const DYES = ["white", "orange", "magenta", "light_blue", "yellow", "lime", "pink", "gray", "light_gray", "cyan", "purple", "blue", "brown", "green", "red", "black"];
/** Paint colors as the dye's color, one per entry in DYES. */
export const PAINT_COLORS = ["#f0f0f0", "#f07613", "#bd44b3", "#3aafd9", "#f8c627", "#70b919", "#ed8dac", "#4a5256", "#9d9d97", "#158991", "#792aac", "#35399d", "#724728", "#546d1b", "#c8302a", "#1b1b20"];

/**
 * The three bases. `top` is blocks per tick on the ground (20 ticks a second), `accel` how fast it gets there,
 * `turn` degrees per tick, `weight` what thrusters have to lift, `air` its top speed when it flies.
 */
export const BASES = {
  racer: {
    key: "racer", item: "family:mech_racer", name: "Racer base", about: "Low and fast with small wheels. Add a seat and go.",
    cols: 2, rows: 3, seatSlots: [0, 1], seatMax: 2, width: 2.0,
    top: 0.9, back: 0.25, accel: 0.05, turn: 6, weight: 3, air: 1.0, deckTop: 0.4,
    wheels: [{ x: 1.0, z: -0.9, r: 0.3 }, { x: -1.0, z: -0.9, r: 0.3 }, { x: 1.0, z: 0.9, r: 0.3 }, { x: -1.0, z: 0.9, r: 0.3 }],
  },
  hauler: {
    key: "hauler", item: "family:mech_hauler", name: "Hauler base", about: "A big truck frame with a cargo bed. Slow, strong, and it turns wide.",
    cols: 3, rows: 6, seatSlots: [0, 1, 2], seatMax: 3, width: 3.0, cargo: 27,
    top: 0.5, back: 0.2, accel: 0.015, turn: 2.5, weight: 8, air: 0.7, deckTop: 0.7,
    wheels: [{ x: 1.5, z: -2.0, r: 0.5 }, { x: -1.5, z: -2.0, r: 0.5 }, { x: 1.5, z: 2.0, r: 0.5 }, { x: -1.5, z: 2.0, r: 0.5 }, { x: 1.5, z: 0.2, r: 0.5 }, { x: -1.5, z: 0.2, r: 0.5 }],
  },
  farm: {
    key: "farm", item: "family:mech_farm", name: "Farm base", about: "A tractor frame with big back wheels. Slow and steady, and it climbs. Add a plow.",
    cols: 2, rows: 3, seatSlots: [2, 3], seatMax: 1, width: 2.0,
    top: 0.3, back: 0.15, accel: 0.03, turn: 4.5, weight: 6, air: 0.5, deckTop: 0.9,
    plowTop: 0.2,
    wheels: [{ x: 1.0, z: -0.9, r: 0.35 }, { x: -1.0, z: -0.9, r: 0.35 }, { x: 1.15, z: 0.9, r: 0.7 }, { x: -1.15, z: 0.9, r: 0.7 }],
  },
};
export const BASE_KEYS = Object.keys(BASES);

/**
 * Every slot of a base, in the order of its entity properties (family:s0, family:s1, ...):
 * the deck first (row by row from the front), then the two wing slots, then the rear one.
 * @param {keyof typeof BASES} baseKey
 * @returns {{ i: number, kind: "deck" | "side" | "rear", x: number, z: number, seat: boolean }[]}
 */
export function slotsOf(baseKey) {
  const base = BASES[baseKey];
  const slots = [];
  for (let r = 0; r < base.rows; r++) {
    for (let c = 0; c < base.cols; c++) {
      const i = slots.length;
      slots.push({ i, kind: /** @type {"deck"} */ ("deck"), x: ((base.cols - 1) / 2 - c), z: r - (base.rows - 1) / 2, seat: base.seatSlots.includes(i) });
    }
  }
  const sideX = base.cols / 2 + 0.75;
  slots.push({ i: slots.length, kind: "side", x: sideX, z: 0, seat: false });
  slots.push({ i: slots.length, kind: "side", x: -sideX, z: 0, seat: false });
  slots.push({ i: slots.length, kind: "rear", x: 0, z: base.rows / 2 + 0.5, seat: false });
  return slots;
}

/** Is `part` (a key) allowed in slot `slot`? Seats go only in the seat slots of the deck. */
export function allowed(slot, partKey) {
  if (!ALLOWED[slot.kind].includes(partKey)) return false;
  return partKey !== "seat" || slot.seat;
}

/** Ready-made designs: each is an item (family:mech_ready_<name>) and a type of the garage kit (mc kit mechanics-garage-<name>). */
export const PRESETS = {
  "sports-car": {
    base: "racer", paint: 14, name: "Sports car", about: "A red racer with two seats, a roof and windows.",
    parts: { 0: "seat", 1: "seat", 2: "body", 3: "body", 4: "glass", 5: "glass" },
  },
  truck: {
    base: "hauler", paint: 11, name: "Truck", about: "A blue hauler with a cab for three and an open bed.",
    parts: { 0: "seat", 1: "seat", 2: "seat", 3: "glass", 4: "body", 5: "glass", 6: "body", 8: "body", 9: "body", 11: "body" },
  },
  tractor: {
    base: "farm", paint: 5, name: "Tractor", about: "A green tractor with a seat and a plow on the back.",
    parts: { 2: "seat", 3: "body", 8: "plow" },
  },
  jet: {
    base: "racer", paint: 0, name: "Jet", about: "A racer with two seats, thrusters, wings and a laser.",
    parts: { 0: "seat", 1: "seat", 2: "thruster", 3: "thruster", 4: "laser", 6: "wing", 7: "wing" },
  },
};
export const presetItem = (/** @type {string} */ name) => `family:mech_ready_${name.replace(/-/g, "_")}`;

/** Tools: not parts, but items too. */
export const TOOLS = [
  { key: "wrench", name: "Wrench", about: "Hit a vehicle with it to take the part you aim at off." },
  { key: "wheel", name: "Wheel", about: "What a base is made from." },
  { key: "blueprint", name: "Blueprint", about: "Hit a vehicle with it to save its design on the blueprint." },
  { key: "blueprint_saved", name: "Saved blueprint", about: "Use it on the ground and the vehicle it remembers is built again.", dynamic: true },
  { key: "packed", name: "Packed vehicle", about: "A vehicle folded up. Use it on the ground to unfold it.", dynamic: true },
];
