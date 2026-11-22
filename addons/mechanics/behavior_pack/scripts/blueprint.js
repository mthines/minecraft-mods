// Saved designs: the registry of every design a blueprint ever saved. No Minecraft imports here, so the tests can run it.
import { decode, encode } from "./design.js";

export const MAX_DESIGNS = 32;

/** Adds a design to the registry (a list of lines), newest last. The oldest goes when it is full, and a design saved twice is only kept once. */
export function remember(/** @type {string[]} */ registry, /** @type {import("./design.js").Design} */ design) {
  const line = encode(design);
  const next = registry.filter((known) => known !== line);
  next.push(line);
  return next.slice(-MAX_DESIGNS);
}

/** What a registry holds, ignoring anything that is not a design any more (a part that was taken out of the mod). */
export const recall = (/** @type {unknown} */ saved) => {
  let list = [];
  try {
    list = JSON.parse(String(saved ?? "[]"));
  } catch {
    // an unreadable registry is an empty one
  }
  return Array.isArray(list) ? list.filter((line) => decode(line)) : [];
};

/** What building a design from a blueprint costs: nothing, for everybody. */
export const costOf = (/** @type {import("./design.js").Design} */ _design) => /** @type {{ item: string, n: number }[]} */ ([]);

/** The lore lines shown on a packed vehicle or saved blueprint. */
export function lore(/** @type {import("./design.js").Design} */ design, /** @type {(id: number) => string} */ nameOf) {
  const names = design.slots.filter((id) => id).map(nameOf);
  const tally = names.reduce((all, name) => all.set(name, (all.get(name) ?? 0) + 1), /** @type {Map<string, number>} */ (new Map()));
  return [`§7${design.base} base`, ...[...tally].map(([name, n]) => `§7${n} × ${name}`)];
}
