// Every item and block Minecraft has (all of @minecraft/vanilla-data), for "search and load" in mc dev, the kit menu on the iPad
// and ./mc kit: there are far too many to list as kits, so you search by name and give one. It gives as the kit `item:<name>`,
// like `./mc kit item:oak_planks`, so everything that gives a kit (mc, mc dev, the iPad) gives these too.
import { MinecraftItemTypes } from "@minecraft/vanilla-data";

export const ITEM_PREFIX = "item:";

/** Every item's short name (oak_planks, not minecraft:oak_planks), sorted. */
export const ITEMS = Object.values(MinecraftItemTypes).map((id) => id.replace(/^minecraft:/, "")).sort();
const KNOWN = new Set(ITEMS);

/** Things that don't stack: you get one, not a stack of 64 swords. */
const SINGLE = /(_sword|_pickaxe|_axe|_shovel|_hoe|_helmet|_chestplate|_leggings|_boots|_horse_armor|_boat|_chest_boat|_raft|_minecart|^minecart|^bow$|^crossbow$|^shield$|^elytra$|^trident$|^mace$|^saddle$|^fishing_rod$|^flint_and_steel$|^shears$|^brush$|^spyglass$|^compass$|^clock$|^recovery_compass$|^bucket$|_bucket$|_potion$|^potion$|^splash_potion$|^lingering_potion$|^enchanted_book$|^written_book$|^writable_book$|^totem_of_undying$|^goat_horn$|^wolf_armor$|^carrot_on_a_stick$|^warped_fungus_on_a_stick$|^turtle_helmet$|^music_disc|_music_disc$|^disc_fragment|^banner_pattern|_banner_pattern$|_smithing_template$|_armor_trim_smithing_template$)/;

/** How many a give hands over: a full stack, or one for things that don't stack. @param {string} name */
export const itemCount = (name) => (SINGLE.test(name) ? 1 : 64);

/** @param {string} kit like item:oak_planks @returns {string | undefined} the item's short name, if it is one */
export const itemOfKit = (kit) => (kit.startsWith(ITEM_PREFIX) && KNOWN.has(kit.slice(ITEM_PREFIX.length)) ? kit.slice(ITEM_PREFIX.length) : undefined);

/** What the kit item:<name> gives, or undefined. @returns {[string, number][] | undefined} */
export function itemKit(kit) {
  const name = itemOfKit(kit);
  return name ? [[`minecraft:${name}`, itemCount(name)]] : undefined;
}

/**
 * The items matching what was typed: every word must be in the name (spaces count as _ , so "oak stairs" finds oak_stairs).
 * Names that start with the text come first, then the shortest. Empty text finds nothing.
 * @param {string} text @param {number} [limit]
 */
export function searchItems(text, limit = 60) {
  const words = text.toLowerCase().trim().split(/[\s_]+/).filter(Boolean);
  if (!words.length) return { items: /** @type {string[]} */ ([]), total: 0 };
  const flat = words.join("_");
  const found = ITEMS.filter((name) => words.every((word) => name.includes(word)));
  found.sort((a, b) => Number(b.startsWith(flat)) - Number(a.startsWith(flat)) || a.length - b.length || a.localeCompare(b));
  return { items: found.slice(0, limit), total: found.length };
}
