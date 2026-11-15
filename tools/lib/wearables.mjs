// What ./mc kit does with wearable items (armor, elytra, shield, heads, our own hats and boots): the one that fits an empty
// slot is put on, the rest go in the backpack as usual. ./mc kit is the one place that gives a kit, so mc dev and the iPad menu do it too.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ADDONS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "addons");

/** Vanilla wearables by name: the first pattern that matches says the slot. */
const VANILLA = [
  [/(_helmet|^carved_pumpkin|_skull$|_head$)/, "slot.armor.head"],
  [/(_chestplate|^elytra$)/, "slot.armor.chest"],
  [/_leggings$/, "slot.armor.legs"],
  [/_boots$/, "slot.armor.feet"],
  [/^shield$/, "slot.weapon.offhand"],
];

/** @type {Map<string, string> | undefined} our own items (family:pirate_hat) with a `minecraft:wearable` component, and its slot */
let custom;

function customWearables() {
  if (custom) return custom;
  custom = new Map();
  for (const addon of existsSync(ADDONS) ? readdirSync(ADDONS) : []) {
    const dir = join(ADDONS, addon, "behavior_pack", "items");
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir).filter((name) => name.endsWith(".json"))) {
      try {
        const item = JSON.parse(readFileSync(join(dir, file), "utf8"))["minecraft:item"];
        const slot = item?.components?.["minecraft:wearable"]?.slot;
        if (item?.description?.identifier && typeof slot === "string") custom.set(item.description.identifier, slot);
      } catch {
        // a file that isn't an item: nothing to wear
      }
    }
  }
  return custom;
}

/** The slot an item goes in when worn, like slot.armor.head, or undefined for everything else. @param {string} item like minecraft:iron_helmet */
export function wearSlot(item) {
  if (item.startsWith("minecraft:")) {
    const name = item.slice("minecraft:".length);
    return VANILLA.find(([pattern]) => pattern.test(name))?.[1];
  }
  return customWearables().get(item);
}

/** The script's name (EquipmentSlot) for each slot. */
const EQUIPMENT_SLOT = { "slot.armor.head": "Head", "slot.armor.chest": "Chest", "slot.armor.legs": "Legs", "slot.armor.feet": "Feet", "slot.weapon.offhand": "Offhand" };

/**
 * The commands that give these items to `who`. A wearable goes to the welcome mod (addons/welcome), which puts it on when
 * that slot is empty and otherwise, and for any more than one, in the backpack. A command can't ask whether a slot is
 * empty: `hasitem` with air matches a full one too. `testfor` makes the log say "No targets matched" when nobody is there to get it.
 * @param {string} who @param {[string, number][]} items
 * @returns {string[]}
 */
export function giveCommands(who, items) {
  const worn = items.some(([item]) => wearSlot(item));
  return [
    ...(worn ? [`testfor ${who}`] : []),
    ...items.map(([item, count]) => {
      const slot = wearSlot(item);
      return slot ? `scriptevent family:wear ${JSON.stringify({ who, slot: EQUIPMENT_SLOT[slot], item, count })}` : `give ${who} ${item} ${count}`;
    }),
  ];
}
