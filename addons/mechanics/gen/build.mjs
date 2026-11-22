// node addons/mechanics/gen/build.mjs: writes the mod's generated files from the data in catalog.js:
// the vehicle entities, models, render controllers, textures, item pictures, items, recipes and texts.
// The files are committed, and tests/generated.test.mjs fails when they no longer match catalog.js.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, deflateSync } from "node:zlib";
import { ALLOWED, BASES, DYES, PAINT_COLORS, PARTS, PRESETS, TOOLS, partItem, presetItem, slotsOf } from "../behavior_pack/scripts/catalog.js";
import { LOOK, pixels } from "./icons.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PACK_VERSION = [1, 0, 0]; // the resource pack's version; raise it in its manifest and in the behavior pack's dependency when a picture changes
const json = (/** @type {unknown} */ value) => JSON.stringify(value, null, 2) + "\n";

// ── Pictures ─────────────────────────────────────────────────────────────────

function png(/** @type {number} */ width, /** @type {number} */ height, /** @type {Buffer} */ rgba) {
  const chunk = (/** @type {string} */ type, /** @type {Buffer} */ data) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length);
    head.write(type, 4, "latin1");
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])));
    return Buffer.concat([head, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

// The model's texture is a palette: pixel k of the top row is color k, and every cube face points at one pixel.
const PALETTE = [null, "#a8dcff", "#3c4044", "#6b3a2a", "#b8bcc2", "#ff9a1f", "#15161a", "#e8c020", "#4b5a3a", "#d02020"];
function paletteTexture(/** @type {string} */ paint) {
  const rgba = Buffer.alloc(16 * 16 * 4);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const hex = x === 0 ? paint : PALETTE[x] ?? "#ff00ff";
      rgba.set([parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), 255], (y * 16 + x) * 4);
    }
  }
  return png(16, 16, rgba);
}

// ── The model ────────────────────────────────────────────────────────────────

const px = 16; // pixels per block
/** @typedef {{ o: [number, number, number], s: [number, number, number], c: number }} Box */

function cube(/** @type {Box} */ { o, s, c }) {
  const face = { uv: [c, 0], uv_size: [1, 1] };
  return { origin: o, size: s, uv: { north: face, south: face, east: face, west: face, up: face, down: face } };
}

/** The boxes a part is drawn with, in the slot at (sx, sz) blocks, standing on `y0` pixels. */
function partBoxes(/** @type {string} */ key, /** @type {"deck" | "side" | "rear"} */ kind, /** @type {number} */ sx, /** @type {number} */ sz, /** @type {number} */ y0, /** @type {number} */ cols) {
  const cx = sx * px;
  const cz = sz * px;
  switch (key) {
    case "seat":
      return [{ o: [cx - 5, y0, cz - 5], s: [10, 4, 10], c: 3 }, { o: [cx - 5, y0 + 4, cz + 3], s: [10, 9, 2], c: 3 }];
    case "body":
      return [{ o: [cx - 8, y0, cz - 8], s: [16, 10, 16], c: 0 }];
    case "glass":
      return [{ o: [cx - 7.5, y0, cz - 7.5], s: [15, 9, 15], c: 1 }];
    case "thruster":
      return [{ o: [cx - 3, y0 + 1, cz - 6], s: [6, 6, 12], c: 2 }, { o: [cx - 4, y0, cz + 6], s: [8, 8, 2], c: 6 }, { o: [cx - 2, y0 + 2, cz + 8], s: [4, 4, 5], c: 5 }];
    case "wing": {
      const inner = (cols / 2) * px - 2;
      return [{ o: [sx > 0 ? inner : -(inner + 26), y0 + 3, -8], s: [26, 2, 20], c: 0 }];
    }
    case "plow":
      return [{ o: [cx - 14, 2, cz - 2], s: [28, 3, 4], c: 7 }, { o: [cx - 12, 0, cz - 1], s: [4, 6, 2], c: 4 }, { o: [cx - 2, 0, cz - 1], s: [4, 6, 2], c: 4 }, { o: [cx + 8, 0, cz - 1], s: [4, 6, 2], c: 4 }, { o: [cx - 1, 4, cz - 8], s: [2, 2, 8], c: 4 }];
    case "gatling":
      return [{ o: [cx - 4, y0 + 3, cz - 3], s: [8, 4, 6], c: 8 }, { o: [cx - 3, y0, cz - 3], s: [6, 3, 6], c: 2 }, ...[-3, -1, 1].map((x) => ({ o: /** @type {[number, number, number]} */ ([cx + x, y0 + 4, cz - 10]), s: /** @type {[number, number, number]} */ ([2, 2, 12]), c: 4 }))];
    case "rocket":
      return [{ o: [cx - 3, y0, cz - 3], s: [6, 2, 6], c: 2 }, { o: [cx - 5, y0 + 2, cz - 6], s: [10, 8, 12], c: 8 }, ...[[-4, 3], [1, 3], [-4, 6], [1, 6]].map(([x, y]) => ({ o: /** @type {[number, number, number]} */ ([cx + x, y0 + y, cz - 7]), s: /** @type {[number, number, number]} */ ([3, 3, 1]), c: 6 }))];
    case "laser":
      return [{ o: [cx - 3, y0, cz - 3], s: [6, 3, 6], c: 2 }, { o: [cx - 2, y0 + 3, cz - 10], s: [4, 4, 14], c: 4 }, { o: [cx - 1, y0 + 4, cz - 11], s: [2, 2, 1], c: 9 }];
    default:
      throw new Error(`no picture for the part ${key} (${kind})`);
  }
}

function geometry(/** @type {keyof typeof BASES} */ key) {
  const base = BASES[key];
  const y0 = base.deckTop * px;
  const body = [{ o: [-base.cols * 8, y0 - 6, -base.rows * 8], s: [base.cols * px, 6, base.rows * px], c: 0 }];
  const wheels = base.wheels.map(({ x, z, r }) => ({ o: /** @type {[number, number, number]} */ ([x * px - 2, 0, z * px - r * px]), s: /** @type {[number, number, number]} */ ([4, r * 2 * px, r * 2 * px]), c: 6 }));
  const bones = [{ name: "chassis", pivot: [0, 0, 0], cubes: [...body, ...wheels].map(cube) }];
  for (const slot of slotsOf(key)) {
    for (const part of PARTS) {
      if (!ALLOWED[slot.kind].includes(part.key) || (part.key === "seat" && !slot.seat)) continue;
      bones.push({ name: `s${slot.i}_${part.id}`, pivot: [slot.x * px, y0, slot.z * px], cubes: partBoxes(part.key, slot.kind, slot.x, slot.z, y0, base.cols).map(cube) });
    }
  }
  return {
    format_version: "1.12.0",
    "minecraft:geometry": [{
      description: { identifier: `geometry.mech_${key}`, texture_width: 16, texture_height: 16, visible_bounds_width: base.cols + 8, visible_bounds_height: 4, visible_bounds_offset: [0, 1, 0] },
      bones,
    }],
  };
}

function renderController(/** @type {keyof typeof BASES} */ key) {
  const visibility = [{ "*": false }, { chassis: true }];
  for (const slot of slotsOf(key)) {
    for (const part of PARTS) {
      if (!ALLOWED[slot.kind].includes(part.key) || (part.key === "seat" && !slot.seat)) continue;
      visibility.push({ [`s${slot.i}_${part.id}`]: `query.property('family:s${slot.i}') == ${part.id}` });
    }
  }
  return {
    arrays: { textures: { "Array.paint": DYES.map((_, n) => `Texture.p${n}`) } },
    geometry: "Geometry.default",
    materials: [{ "*": "Material.default" }],
    textures: ["Array.paint[query.property('family:paint')]"],
    part_visibility: visibility,
  };
}

// ── The behavior pack ────────────────────────────────────────────────────────

const NOOP = (/** @type {string} */ property) => ({ set_property: { [property]: `query.property('${property}')` } });

function entity(/** @type {keyof typeof BASES} */ key) {
  const base = BASES[key];
  const slots = slotsOf(key);
  const properties = Object.fromEntries([
    ...slots.map(({ i }) => [`family:s${i}`, { type: "int", range: [0, PARTS.length], default: 0, client_sync: true }]),
    ["family:paint", { type: "int", range: [0, 15], default: 0, client_sync: true }],
  ]);
  const seatPlaces = base.seatSlots.map((i) => slots[i]);
  const groups = Object.fromEntries(Array.from({ length: base.seatMax }, (_, k) => [`family:seats_${k + 1}`, {
    "minecraft:rideable": {
      seat_count: k + 1,
      family_types: ["player"],
      interact_text: "action.interact.ride.horse",
      pull_in_entities: false,
      seats: seatPlaces.slice(0, k + 1).map(({ x, z }) => ({ position: [x, base.deckTop + 0.1, -z] })),
    },
  }]));
  const seatEvents = Object.fromEntries(Array.from({ length: base.seatMax + 1 }, (_, n) => [`family:set_seats_${n}`, {
    remove: { component_groups: Object.keys(groups) },
    ...(n > 0 ? { add: { component_groups: [`family:seats_${n}`] } } : {}),
  }]));
  const hand = (/** @type {string} */ item) => ({ test: "has_equipment", subject: "other", domain: "hand", value: item });
  const interactions = [
    ...PARTS.map((part) => ({ on_interact: { filters: hand(partItem(part.key)), event: `family:part_${part.key}`, target: "self" }, swing: true, interact_text: "action.interact.mech_add" })),
    ...DYES.map((dye, n) => ({ on_interact: { filters: hand(`minecraft:${dye}_dye`), event: `family:paint_${n}`, target: "self" }, swing: true, interact_text: "action.interact.mech_paint" })),
  ];
  return {
    format_version: "1.21.40",
    "minecraft:entity": {
      description: { identifier: base.item, is_spawnable: true, is_summonable: true, properties },
      component_groups: groups,
      components: {
        "minecraft:type_family": { family: ["mechanics_vehicle", `mechanics_${key}`, "inanimate"] },
        "minecraft:collision_box": { width: base.width, height: base.deckTop },
        "minecraft:is_collidable": {},
        "minecraft:health": { value: 100, max: 100 },
        "minecraft:damage_sensor": { triggers: [{ cause: "all", deals_damage: "no" }] },
        "minecraft:knockback_resistance": { value: 1.0 },
        "minecraft:physics": {},
        "minecraft:pushable": { is_pushable: false, is_pushable_by_piston: false },
        "minecraft:persistent": {},
        "minecraft:fire_immune": {},
        ...(base.cargo ? { "minecraft:inventory": { inventory_size: base.cargo, container_type: "container", can_be_siphoned_from: false } } : {}),
        "minecraft:interact": { interactions },
      },
      events: {
        ...seatEvents,
        ...Object.fromEntries(PARTS.map((part) => [`family:part_${part.key}`, NOOP("family:paint")])),
        ...Object.fromEntries(DYES.map((_, n) => [`family:paint_${n}`, { set_property: { "family:paint": n } }])),
      },
    },
  };
}

/** Name, text, stack size and extras of every item. */
function itemList() {
  const items = [
    ...Object.values(BASES).map((b) => ({ key: b.key, id: b.item, name: b.name, stack: 16, place: b.item })),
    ...PARTS.map((p) => ({ key: p.key, id: partItem(p.key), name: p.name, stack: 64 })),
    ...TOOLS.map((t) => ({ key: t.key, id: `family:mech_${t.key}`, name: t.name, stack: t.dynamic || t.key === "wrench" ? 1 : t.key === "blueprint" ? 16 : 64 })),
    ...Object.entries(PRESETS).map(([name, p]) => ({ key: `ready_${name.replace(/-/g, "_")}`, id: presetItem(name), name: p.name, stack: 16 })),
  ];
  return items.map((item) => ({ ...item, icon: `family_mech_${item.key}` }));
}
const itemJson = (/** @type {ReturnType<typeof itemList>[number]} */ item) => ({
  format_version: "1.21.40",
  "minecraft:item": {
    description: { identifier: item.id, menu_category: { category: "items" } },
    components: {
      "minecraft:icon": item.icon,
      "minecraft:display_name": { value: item.name },
      "minecraft:max_stack_size": item.stack,
      ...(item.place ? { "minecraft:entity_placer": { entity: item.place } } : {}),
    },
  },
});

/** key → [what it is made of, how many it makes, the recipe's shape if it has one]. */
export const RECIPES = {
  wheel: [["minecraft:iron_ingot", "minecraft:coal", "minecraft:coal", "minecraft:coal", "minecraft:coal"], 4],
  racer: [["family:mech_wheel", "family:mech_wheel", "family:mech_wheel", "family:mech_wheel", "minecraft:iron_ingot", "minecraft:iron_ingot", "minecraft:iron_ingot", "minecraft:redstone"], 1],
  hauler: [["family:mech_wheel", "family:mech_wheel", "family:mech_wheel", "family:mech_wheel", "minecraft:iron_ingot", "minecraft:iron_ingot", "minecraft:iron_ingot", "minecraft:chest"], 1],
  farm: [["family:mech_wheel", "family:mech_wheel", "family:mech_wheel", "family:mech_wheel", "minecraft:iron_ingot", "minecraft:iron_ingot", "minecraft:iron_ingot", "minecraft:hay_block"], 1],
  seat: [["minecraft:white_wool", "minecraft:white_wool", "minecraft:white_wool", "minecraft:oak_slab"], 1],
  body: [["minecraft:iron_ingot", ...Array(8).fill("minecraft:white_concrete")], 8],
  glass: [[...Array(4).fill("minecraft:glass_pane"), "minecraft:iron_nugget"], 4],
  thruster: [["minecraft:iron_ingot", "minecraft:gunpowder", "minecraft:gunpowder", "minecraft:redstone"], 1],
  wing: [[...Array(3).fill("minecraft:iron_ingot"), "minecraft:white_wool", "minecraft:white_wool"], 1],
  plow: [["minecraft:iron_hoe", ...Array(3).fill("minecraft:iron_ingot")], 1],
  gatling: [[...Array(5).fill("minecraft:iron_ingot"), "minecraft:gunpowder", "minecraft:gunpowder", "minecraft:redstone"], 1],
  rocket: [[...Array(3).fill("minecraft:iron_ingot"), ...Array(3).fill("minecraft:gunpowder"), "minecraft:tnt"], 1],
  laser: [["minecraft:diamond", "minecraft:redstone", "minecraft:redstone", "minecraft:glass"], 1],
  wrench: [["minecraft:iron_ingot", "minecraft:iron_ingot", "minecraft:iron_ingot"], 1],
  blueprint: [[...Array(4).fill("minecraft:paper"), "minecraft:blue_dye"], 4],
};
const recipeJson = (/** @type {string} */ key) => {
  const [ingredients, count] = RECIPES[/** @type {keyof typeof RECIPES} */ (key)];
  const items = ingredients.map((item) => ({ item }));
  return {
    format_version: "1.20.10",
    "minecraft:recipe_shapeless": { description: { identifier: `family:mech_${key}_recipe` }, tags: ["crafting_table"], unlock: [{ item: ingredients[0] }], ingredients: items, result: { item: `family:mech_${key}`, count: count } },
  };
};
const recipeOf = (/** @type {string} */ key) => (Object.hasOwn(BASES, key) ? key : key);

// ── Everything ───────────────────────────────────────────────────────────────

/** @returns {Map<string, string | Buffer>} every generated file, by its path from the mod's folder */
export function generate() {
  /** @type {Map<string, string | Buffer>} */
  const files = new Map();
  const bp = "behavior_pack";
  const rp = "resource_pack";
  for (const key of /** @type {(keyof typeof BASES)[]} */ (Object.keys(BASES))) {
    files.set(`${bp}/entities/mech_${key}.json`, json(entity(key)));
    files.set(`${rp}/models/entity/mech_${key}.geo.json`, json(geometry(key)));
    files.set(`${rp}/entity/mech_${key}.entity.json`, json({
      format_version: "1.10.0",
      "minecraft:client_entity": {
        description: {
          identifier: BASES[key].item,
          materials: { default: "entity_alphatest" },
          textures: Object.fromEntries(DYES.map((_, n) => [`p${n}`, `textures/entity/mechanics/paint_${n}`])),
          geometry: { default: `geometry.mech_${key}` },
          render_controllers: [`controller.render.mech_${key}`],
          spawn_egg: { base_color: "#d83a34", overlay_color: "#212121" },
        },
      },
    }));
  }
  files.set(`${rp}/render_controllers/mechanics.render_controllers.json`, json({
    format_version: "1.8.0",
    render_controllers: Object.fromEntries(Object.keys(BASES).map((key) => [`controller.render.mech_${key}`, renderController(/** @type {keyof typeof BASES} */ (key))])),
  }));
  PAINT_COLORS.forEach((color, n) => files.set(`${rp}/textures/entity/mechanics/paint_${n}.png`, paletteTexture(color)));

  const items = itemList();
  const itemTextures = {};
  for (const item of items) {
    files.set(`${bp}/items/${item.id.slice(7)}.json`, json(itemJson(item)));
    files.set(`${rp}/textures/items/${item.id.slice(7)}.png`, png(16, 16, pixels(item.key)));
    itemTextures[item.icon] = { textures: `textures/items/${item.id.slice(7)}` };
  }
  files.set(`${rp}/textures/item_texture.json`, json({ resource_pack_name: "mechanics", texture_name: "atlas.items", texture_data: itemTextures }));
  for (const key of Object.keys(RECIPES)) files.set(`${bp}/recipes/mech_${key}.json`, json(recipeJson(recipeOf(key))));

  files.set(`${rp}/texts/languages.json`, json(["en_US"]));
  files.set(`${rp}/texts/en_US.lang`, [
    ...Object.values(BASES).map((b) => `entity.${b.item}.name=${b.name}`),
    ...items.map((item) => `item.${item.id}=${item.name}`),
    "action.interact.mech_add=Add part",
    "action.interact.mech_paint=Paint",
    "",
  ].join("\n"));
  return files;
}

export { LOOK, PACK_VERSION };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = generate();
  for (const [path, content] of files) {
    mkdirSync(dirname(join(ROOT, path)), { recursive: true });
    writeFileSync(join(ROOT, path), content);
  }
  console.log(`Wrote ${files.size} files into addons/mechanics.`);
}
