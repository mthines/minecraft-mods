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
  { id: 10, key: "slab", name: "Slab", weight: 0.25, about: "A half-height body piece: floors, bumpers and thin roofs." },
  { id: 11, key: "ramp", name: "Ramp", weight: 0.25, about: "A slope that rises towards the back: a hood or a windshield." },
  { id: 12, key: "ramp_back", name: "Back ramp", weight: 0.25, about: "A slope that rises towards the front: a fastback or a rear window." },
  { id: 13, key: "light", name: "Light", weight: 0.25, about: "A headlight or a tail light." },
  { id: 14, key: "spoiler", name: "Spoiler", weight: 0.25, about: "A wing on posts for the back of a sports car." },
];
export const PART_BY_ID = Object.fromEntries(PARTS.map((part) => [part.id, part]));
export const PART_BY_KEY = Object.fromEntries(PARTS.map((part) => [part.key, part]));
/** Body pieces are as big as a cell, so on a base with small cells they weigh less. */
const BODY_PIECES = ["body", "glass", "slab", "ramp", "ramp_back", "light", "spoiler"];
export const weightOf = (/** @type {number} */ id, /** @type {keyof typeof BASES} */ baseKey) => {
  const part = PART_BY_ID[id];
  return part ? part.weight * (BODY_PIECES.includes(part.key) ? BASES[baseKey].cell ** 2 : 1) : 0;
};
export const partItem = (/** @type {string} */ key) => `family:mech_${key}`;

/** What each kind of slot can hold. */
export const ALLOWED = {
  deck: ["seat", "body", "glass", "thruster", "gatling", "rocket", "laser", "slab", "ramp", "ramp_back", "light", "spoiler"],
  side: ["wing", "thruster"],
  rear: ["body", "thruster", "plow", "gatling", "rocket", "laser", "slab", "light", "spoiler"],
};

export const DYES = ["white", "orange", "magenta", "light_blue", "yellow", "lime", "pink", "gray", "light_gray", "cyan", "purple", "blue", "brown", "green", "red", "black"];
/** Paint colors as the dye's color, one per entry in DYES. */
export const PAINT_COLORS = ["#f0f0f0", "#f07613", "#bd44b3", "#3aafd9", "#f8c627", "#70b919", "#ed8dac", "#4a5256", "#9d9d97", "#158991", "#792aac", "#35399d", "#724728", "#546d1b", "#c8302a", "#1b1b20"];

/**
 * The three bases. `top` is blocks per tick on the ground (20 ticks a second), `accel` how fast it gets there,
 * `turn` degrees per tick, `weight` what thrusters have to lift, `air` its top speed when it flies.
 * The deck is a grid of `cols` × `rows` cells, each `cell` blocks wide, `layers` cells high. `seatCells` are the
 * [col, row] cells on the bottom layer where a seat can go (a rider sits there), `seatMax` how many seats it takes.
 */
export const BASES = {
  racer: {
    key: "racer", item: "family:mech_racer", name: "Racer base", about: "Low and fast with small wheels. Add a seat and go.",
    cell: 0.5, cols: 4, rows: 6, layers: 3, seatCells: [[0, 1], [3, 1], [0, 2], [3, 2], [0, 3], [3, 3]], seatMax: 2, width: 2.0,
    top: 0.9, back: 0.25, accel: 0.05, turn: 6, weight: 3, air: 1.0, deckTop: 0.4,
    wheels: [{ x: 1.0, z: -0.9, r: 0.3 }, { x: -1.0, z: -0.9, r: 0.3 }, { x: 1.0, z: 0.9, r: 0.3 }, { x: -1.0, z: 0.9, r: 0.3 }],
  },
  hauler: {
    key: "hauler", item: "family:mech_hauler", name: "Hauler base", about: "A big truck frame with a cargo bed. Slow, strong, and it turns wide.",
    cell: 1, cols: 3, rows: 6, layers: 3, seatCells: [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]], seatMax: 3, width: 3.0, cargo: 27,
    top: 0.5, back: 0.2, accel: 0.015, turn: 2.5, weight: 8, air: 0.7, deckTop: 0.7,
    wheels: [{ x: 1.5, z: -2.0, r: 0.5 }, { x: -1.5, z: -2.0, r: 0.5 }, { x: 1.5, z: 2.0, r: 0.5 }, { x: -1.5, z: 2.0, r: 0.5 }, { x: 1.5, z: 0.2, r: 0.5 }, { x: -1.5, z: 0.2, r: 0.5 }],
  },
  farm: {
    key: "farm", item: "family:mech_farm", name: "Farm base", about: "A tractor frame with big back wheels. Slow and steady, and it climbs. Add a plow.",
    cell: 0.5, cols: 4, rows: 6, layers: 3, seatCells: [[1, 2], [2, 2], [1, 3], [2, 3]], seatMax: 1, width: 2.0,
    top: 0.3, back: 0.15, accel: 0.03, turn: 4.5, weight: 6, air: 0.5, deckTop: 0.9,
    plowTop: 0.2,
    wheels: [{ x: 1.0, z: -0.9, r: 0.35 }, { x: -1.0, z: -0.9, r: 0.35 }, { x: 1.15, z: 0.9, r: 0.7 }, { x: -1.15, z: 0.9, r: 0.7 }],
  },
};
export const BASE_KEYS = Object.keys(BASES);

/** Cells per layer, and the slot of a cell on the deck: layer 0 is the bottom, rows count from the front, columns from the left. */
export const slotIndex = (/** @type {keyof typeof BASES} */ baseKey, /** @type {number} */ layer, /** @type {number} */ col, /** @type {number} */ row) => (layer * BASES[baseKey].rows + row) * BASES[baseKey].cols + col;

/** @type {Map<string, ReturnType<typeof buildSlots>>} */
const slotCache = new Map();
/**
 * Every slot of a base, in the order of the design: the deck (layer by layer, row by row from the front, left to right),
 * then the two wing slots, then the rear one.
 * @param {keyof typeof BASES} baseKey
 */
export function slotsOf(baseKey) {
  let slots = slotCache.get(baseKey);
  if (!slots) slotCache.set(baseKey, (slots = buildSlots(baseKey)));
  return slots;
}

/** @param {keyof typeof BASES} baseKey @returns {{ i: number, kind: "deck" | "side" | "rear", layer: number, col: number, row: number, x: number, y: number, z: number, cell: number, seat: boolean }[]} */
function buildSlots(baseKey) {
  const base = BASES[baseKey];
  const slots = [];
  for (let layer = 0; layer < base.layers; layer++) {
    for (let r = 0; r < base.rows; r++) {
      for (let c = 0; c < base.cols; c++) {
        slots.push({
          i: slots.length, kind: /** @type {"deck"} */ ("deck"), layer, col: c, row: r,
          x: ((base.cols - 1) / 2 - c) * base.cell, y: layer * base.cell, z: (r - (base.rows - 1) / 2) * base.cell, cell: base.cell,
          seat: layer === 0 && base.seatCells.some(([sc, sr]) => sc === c && sr === r),
        });
      }
    }
  }
  const sideX = (base.cols * base.cell) / 2 + 0.75;
  slots.push({ i: slots.length, kind: "side", layer: 0, col: -1, row: -1, x: sideX, y: 0, z: 0, cell: 1, seat: false });
  slots.push({ i: slots.length, kind: "side", layer: 0, col: -1, row: -1, x: -sideX, y: 0, z: 0, cell: 1, seat: false });
  slots.push({ i: slots.length, kind: "rear", layer: 0, col: -1, row: -1, x: 0, y: 0, z: (base.rows * base.cell) / 2 + 0.5, cell: 1, seat: false });
  return slots;
}

/** The slots where a seat can go on a base. */
export const seatSlotsOf = (/** @type {keyof typeof BASES} */ baseKey) => slotsOf(baseKey).filter((slot) => slot.seat).map((slot) => slot.i);

/** Every way to choose up to `max` of the seat slots, each as a sorted list (a rider sits in the first free one). */
export function seatSets(/** @type {keyof typeof BASES} */ baseKey) {
  const spots = seatSlotsOf(baseKey);
  /** @type {number[][]} */
  const sets = [];
  const choose = (/** @type {number} */ from, /** @type {number[]} */ chosen) => {
    if (chosen.length) sets.push(chosen);
    if (chosen.length >= BASES[baseKey].seatMax) return;
    for (let k = from; k < spots.length; k++) choose(k + 1, [...chosen, spots[k]]);
  };
  choose(0, []);
  return sets;
}
export const seatKey = (/** @type {number[]} */ slots) => (slots.length ? slots.join("_") : "none");

/** Is `part` (a key) allowed in slot `slot`? Seats go only in the seat slots of the deck. */
export function allowed(/** @type {{ kind: "deck" | "side" | "rear", seat: boolean }} */ slot, /** @type {string} */ partKey) {
  if (!ALLOWED[slot.kind].includes(partKey)) return false;
  return partKey !== "seat" || slot.seat;
}

/**
 * Ready-made designs: each is an item (family:mech_ready_<name>) and a type of the garage kit (mc kit mechanics-garage-<name>).
 * `parts` are [layer, col, row, part] on the deck (layer 0 is the bottom, row 0 the front, col 0 the left), or ["left" | "right" | "rear", part].
 */
export const PRESETS = {
  "sports-car": {
    base: "racer", paint: 14, name: "Sports car", about: "A red open racer with two seats, a low hood, a windshield and a spoiler.",
    parts: [
      [0, 0, 1, "seat"], [0, 3, 1, "seat"],
      [0, 0, 0, "light"], [0, 3, 0, "light"], [0, 1, 0, "slab"], [0, 2, 0, "slab"],
      [1, 0, 0, "glass"], [1, 1, 0, "glass"], [1, 2, 0, "glass"], [1, 3, 0, "glass"],
      [0, 1, 1, "body"], [0, 2, 1, "body"], [0, 1, 2, "body"], [0, 2, 2, "body"],
      [0, 0, 3, "body"], [0, 1, 3, "body"], [0, 2, 3, "body"], [0, 3, 3, "body"],
      [0, 0, 4, "body"], [0, 1, 4, "body"], [0, 2, 4, "body"], [0, 3, 4, "body"],
      [1, 0, 3, "ramp_back"], [1, 3, 3, "ramp_back"],
      [0, 0, 5, "light"], [0, 3, 5, "light"], [0, 1, 5, "body"], [0, 2, 5, "body"],
      [1, 1, 5, "spoiler"], [1, 2, 5, "spoiler"],
    ],
  },
  truck: {
    base: "hauler", paint: 11, name: "Truck", about: "A blue hauler with a cab for three and an open bed.",
    parts: [
      [0, 0, 1, "seat"], [0, 1, 1, "seat"], [0, 2, 1, "seat"],
      [0, 0, 0, "body"], [0, 1, 0, "light"], [0, 2, 0, "body"],
      [1, 0, 0, "ramp"], [1, 1, 0, "glass"], [1, 2, 0, "ramp"],
      [1, 0, 1, "glass"], [1, 2, 1, "glass"],
      [0, 0, 2, "body"], [0, 1, 2, "body"], [0, 2, 2, "body"],
      [1, 0, 2, "body"], [1, 1, 2, "glass"], [1, 2, 2, "body"],
      [2, 0, 1, "slab"], [2, 1, 1, "slab"], [2, 2, 1, "slab"], [2, 0, 2, "slab"], [2, 1, 2, "slab"], [2, 2, 2, "slab"], [2, 0, 0, "slab"], [2, 1, 0, "slab"], [2, 2, 0, "slab"],
      [0, 0, 3, "slab"], [0, 2, 3, "slab"], [0, 0, 4, "slab"], [0, 2, 4, "slab"], [0, 0, 5, "slab"], [0, 1, 5, "slab"], [0, 2, 5, "slab"],
    ],
  },
  tractor: {
    base: "farm", paint: 5, name: "Tractor", about: "A green tractor with a seat, a hood and a plow on the back.",
    parts: [
      [0, 1, 2, "seat"],
      [0, 1, 0, "body"], [0, 2, 0, "body"], [0, 1, 1, "body"], [0, 2, 1, "body"], [1, 1, 0, "body"], [1, 2, 0, "body"], [1, 1, 1, "slab"], [1, 2, 1, "slab"],
      [0, 0, 3, "body"], [0, 3, 3, "body"], [1, 0, 3, "slab"], [1, 3, 3, "slab"],
      [0, 1, 5, "body"], [0, 2, 5, "body"], ["rear", "plow"],
    ],
  },
  jet: {
    base: "racer", paint: 0, name: "Jet", about: "A racer with two seats, thrusters, wings and a laser.",
    parts: [
      [0, 0, 1, "seat"], [0, 3, 1, "seat"],
      [0, 1, 0, "laser"], [0, 2, 0, "ramp"],
      [0, 1, 4, "thruster"], [0, 2, 4, "thruster"], [0, 1, 5, "thruster"], [0, 1, 1, "body"], [0, 2, 1, "body"], [0, 1, 2, "body"], [0, 2, 2, "body"], [0, 1, 3, "body"], [0, 2, 3, "body"],
      [1, 0, 1, "glass"], [1, 3, 1, "glass"], [1, 1, 1, "slab"], [1, 2, 1, "slab"],
      ["left", "wing"], ["right", "wing"],
    ],
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
