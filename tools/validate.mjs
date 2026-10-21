// Catches the mistakes that make Minecraft silently ignore a pack.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { listAddons, walk } from "./lib/addons.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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
  if (addon.packs.length === 0) errors.push(`addons/${addon.name}: needs a behavior_pack/ or resource_pack/ with a manifest.json`);
  for (const pack of addon.packs) headerUuids.add(pack.manifest.header?.uuid);
}

for (const addon of addons) {
  for (const pack of addon.packs) {
    const where = `addons/${addon.name}/${pack.folder}`;
    const { header, modules = [], dependencies = [] } = pack.manifest;

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

if (errors.length) {
  console.error(errors.map((e) => `✗ ${e}`).join("\n"));
  process.exit(1);
}
console.log(`✓ ${addons.length} add-ons look good`);
