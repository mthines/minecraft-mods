// Catches the mistakes that make Minecraft silently ignore a pack.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { MinecraftItemTypes } from "@minecraft/vanilla-data";
import { ROOT, listAddons, walk } from "./addons.mjs";

/** Every vanilla item, to catch kits giving an item Bedrock calls something else (oak's fence gate is minecraft:fence_gate). */
const VANILLA_ITEMS = new Set(Object.values(MinecraftItemTypes));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Checks every add-on. `errors` is empty when all is well. */
export function validate() {
  const errors = [];
  const seenUuids = new Map();
  const headerUuids = new Set();
  const addons = listAddons();

  function useUuid(uuid, where) {
    if (!UUID.test(uuid ?? "")) return errors.push(`${where}: "${uuid}" is not a valid UUID`);
    if (seenUuids.has(uuid)) errors.push(`${where}: UUID ${uuid} is already used by ${seenUuids.get(uuid)}`);
    seenUuids.set(uuid, where);
  }

  for (const addon of addons) {
    if (addon.packs.length === 0)
      errors.push(`addons/${addon.name}: needs a behavior_pack/ or resource_pack/ with a manifest.json`);
    for (const pack of addon.packs) headerUuids.add(pack.manifest.header?.uuid);
  }

  /** Checks one kit file: its items (or, for kits like the building materials, each type's items) and craft lists. */
  function checkKit(path, where) {
    try {
      const { items, types, craft = [], label } = JSON.parse(readFileSync(path, "utf8"));
      if (label !== undefined && (typeof label !== "string" || !label.trim())) errors.push(`${where}: label (what the kit menu in mc dev shows in brackets) should be some words, like "golden feather fly"`);
      const ok = (list) => Array.isArray(list) && list.length > 0 && list.every(([item, n]) => /^[a-z0-9_]+:[a-z0-9_.]+$/.test(item) && Number.isInteger(n) && n > 0);
      const lists = types ? Object.entries(types).map(([type, list]) => [`${where} type ${type}`, list]) : [[where, items]];
      if (types && items) errors.push(`${where}: give either items or types, not both`);
      if (types && Object.keys(types).some((type) => !/^[a-z0-9-]+$/.test(type))) errors.push(`${where}: name types with lowercase letters, numbers, and dashes`);
      for (const [at, list] of lists) if (!ok(list)) errors.push(`${at}: items should look like [["minecraft:dirt", 9], ...]`);
      if (craft.length && !ok(craft)) errors.push(`${where}: craft (what mc kit --craft adds) should look like [["minecraft:crafting_table", 1], ...]`);
      for (const [at, list] of [...lists, [where, craft]])
        for (const [item] of Array.isArray(list) ? list : [])
          if (item?.startsWith("minecraft:") && !VANILLA_ITEMS.has(item)) errors.push(`${at}: ${item} isn't a Bedrock item (see @minecraft/vanilla-data for the right name)`);
    } catch (e) {
      errors.push(`${where}: broken JSON (${e.message})`);
    }
  }

  for (const addon of addons) {
    // kit.json, and extra kits named kit-<name>.json (./mc kit <mod>-<name>)
    for (const file of readdirSync(addon.dir).filter((f) => /^kit(-.+)?\.json$/.test(f))) {
      if (!/^kit(-[a-z0-9-]+)?\.json$/.test(file)) errors.push(`addons/${addon.name}/${file}: name extra kits kit-<name>.json, with lowercase letters, numbers, and dashes`);
      checkKit(join(addon.dir, file), `addons/${addon.name}/${file}`);
    }
  }

  // kits/<name>.json: kits that belong to no mod (./mc kit <name>). A mod's name would hide its own kit.
  const kitsDir = join(ROOT, "kits");
  for (const file of existsSync(kitsDir) ? readdirSync(kitsDir).filter((f) => f.endsWith(".json")) : []) {
    const name = file.slice(0, -5);
    if (!/^[a-z0-9-]+$/.test(name)) errors.push(`kits/${file}: name kits with lowercase letters, numbers, and dashes`);
    if (addons.some((addon) => name === addon.name || name.startsWith(`${addon.name}-`))) errors.push(`kits/${file}: ${name} is taken by a mod's kits; pick another name`);
    checkKit(join(kitsDir, file), `kits/${file}`);
  }

  for (const addon of addons) {
    for (const pack of addon.packs) {
      const where = `addons/${addon.name}/${pack.folder}`;
      const { header, modules = [], dependencies = [] } = pack.manifest;

      for (const file of walk(pack.dir).filter((f) => f.endsWith(".js"))) {
        const check = spawnSync(process.execPath, ["--check", join(pack.dir, file)], { encoding: "utf8" });
        if (check.status !== 0) {
          const reason = check.stderr.split("\n").find((l) => l.startsWith("SyntaxError")) ?? "syntax error";
          errors.push(`${where}/${file}: ${reason}`);
        }
      }

      for (const file of walk(pack.dir).filter((f) => f.endsWith(".json"))) {
        try {
          JSON.parse(readFileSync(join(pack.dir, file), "utf8"));
        } catch (e) {
          errors.push(`${where}/${file}: broken JSON (${e.message})`);
        }
      }

      if (!header?.name) errors.push(`${where}/manifest.json: header.name is missing`);
      useUuid(header?.uuid, `${where} header`);
      if (modules.length === 0) errors.push(`${where}/manifest.json: needs at least one module`);
      modules.forEach((m, i) => {
        useUuid(m.uuid, `${where} module ${i}`);
        if (m.type === "script" && !existsSync(join(pack.dir, m.entry ?? ""))) {
          errors.push(`${where}/manifest.json: script entry "${m.entry}" does not exist`);
        }
      });
      for (const dep of dependencies) {
        if (dep.uuid && !headerUuids.has(dep.uuid)) {
          errors.push(`${where}/manifest.json: depends on ${dep.uuid}, which no pack in addons/ has`);
        }
      }

      const atlas = join(pack.dir, "textures", "item_texture.json");
      if (existsSync(atlas)) {
        const { texture_data = {} } = JSON.parse(readFileSync(atlas, "utf8"));
        for (const [key, { textures }] of Object.entries(texture_data)) {
          for (const path of [textures].flat()) {
            if (!existsSync(join(pack.dir, `${path}.png`))) {
              errors.push(`${where}/textures/item_texture.json: "${key}" points to ${path}.png, which is missing`);
            }
          }
        }
      }
    }
  }

  return { errors, count: addons.length };
}
