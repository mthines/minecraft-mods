// Every kit ./mc kit and the k key in mc dev can give, from one place:
// <mod> for addons/<mod>/kit.json, <mod>-<name> for addons/<mod>/kit-<name>.json, <name> for kits/<name>.json.
// A kit in kits/ can list types instead of items, like the building materials: kits/wood.json gives oak as
// `wood` (its first type) and spruce as `wood-spruce`.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ADDONS_DIR, ROOT } from "./addons.mjs";

export const KITS_DIR = join(ROOT, "kits");

/** @typedef {[string, number][]} Items */
/** @typedef {{ about?: string, emoji?: string, label?: string, items?: Items, craft?: Items, types?: Record<string, Items> }} KitFile */

/** @param {string} path @returns {KitFile} */
const read = (path) => JSON.parse(readFileSync(path, "utf8"));

/** The kit files: name and path. Kits from kits/ first, then each mod's. */
export function kitFiles() {
  const own = existsSync(KITS_DIR)
    ? readdirSync(KITS_DIR)
        .filter((file) => file.endsWith(".json"))
        .sort()
        .map((file) => ({ name: file.slice(0, -5), path: join(KITS_DIR, file) }))
    : [];
  const mods = readdirSync(ADDONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap(({ name: mod }) =>
      readdirSync(join(ADDONS_DIR, mod))
        .map((file) => file.match(/^kit(-[a-z0-9-]+)?\.json$/))
        .filter((match) => match !== null)
        .map((match) => ({ name: `${mod}${match[1] ?? ""}`, path: join(ADDONS_DIR, mod, match[0]) })),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  return [...own, ...mods];
}

/** Kits with types, like the building materials: name, what it is, and its types (the first is the default). */
export function materials() {
  return kitFiles()
    .map(({ name, path }) => ({ name, kit: read(path) }))
    .filter(({ kit }) => kit.types)
    .map(({ name, kit }) => ({ name, about: kit.about ?? "", types: Object.keys(kit.types ?? {}) }));
}

/** What the kit menu in mc dev says after a kit's name, in brackets: its `label`, like "golden feather fly". */
export function kitLabels() {
  return new Map(kitFiles().flatMap(({ name, path }) => { const { label } = read(path); return label ? [[name, label]] : []; }));
}

/** The emoji in front of the diamond tools in the kit menus (they have no kit file). */
export const TOOLS_EMOJI = "💎";

/** Each kit's `emoji`, shown in front of its name in the kit menus so kids find it at a glance. */
export function kitEmojis() {
  return new Map(kitFiles().flatMap(({ name, path }) => { const { emoji } = read(path); return emoji ? [[name, emoji]] : []; }));
}

/** The kits' names; with `types`, also every <kit>-<type> name ./mc kit takes for kits with types. */
export function kitNames(types = false) {
  return kitFiles().flatMap(({ name, path }) => [name, ...(types ? Object.keys(read(path).types ?? {}).map((type) => `${name}-${type}`) : [])]);
}

/**
 * What a kit gives, or undefined if there's no kit by that name.
 * @param {string} name @param {boolean} [craft] add its crafting table and materials
 * @returns {Items | undefined}
 */
export function kitItems(name, craft = false) {
  for (const file of kitFiles()) {
    const kit = read(file.path);
    if (name === file.name) return [...(kit.items ?? Object.values(kit.types ?? {})[0] ?? []), ...(craft ? kit.craft ?? [] : [])];
    const type = kit.types && name.startsWith(`${file.name}-`) ? kit.types[name.slice(file.name.length + 1)] : undefined;
    if (type) return [...type, ...(craft ? kit.craft ?? [] : [])];
  }
  return undefined;
}

/** Whether a kit has crafting materials for --craft. @param {string} name */
export const hasCraft = (name) => kitFiles().some((file) => (name === file.name || name.startsWith(`${file.name}-`)) && read(file.path).craft);
