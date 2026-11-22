// How the weapons on a vehicle behave. No Minecraft imports here, so the tests can run it.
import { count } from "./design.js";

/** `burst` shots from one tap, `gap` ticks between shots, `cooldown` ticks before the next tap, damage per shot, range in blocks. */
export const WEAPONS = {
  gatling: { burst: 6, gap: 2, cooldown: 14, damage: 5, range: 64 },
  rocket: { burst: 1, gap: 0, cooldown: 30, damage: 0, range: 80, power: 4 },
  laser: { burst: 1, gap: 0, cooldown: 8, damage: 10, range: 96 },
};
export const MAX_MULTIPLIER = 3; // mounting more than three of a kind adds nothing

/** What a vehicle can shoot: each kind it has mounted, with how many (up to three). @param {import("./design.js").Design} design */
export function armament(design) {
  return /** @type {("gatling" | "rocket" | "laser")[]} */ (Object.keys(WEAPONS))
    .map((kind) => ({ kind, n: Math.min(MAX_MULTIPLIER, count(design, kind)) }))
    .filter(({ n }) => n > 0);
}

/** Damage of one shot of a kind, with `n` of them mounted. */
export const damageOf = (/** @type {keyof typeof WEAPONS} */ kind, /** @type {number} */ n) => WEAPONS[kind].damage * Math.min(MAX_MULTIPLIER, n);

/** An explosion's power for a rocket pod with `n` mounted: more pods, a bigger bang. */
export const powerOf = (/** @type {number} */ n) => WEAPONS.rocket.power + (Math.min(MAX_MULTIPLIER, n) - 1);

/** Can this kind fire at `tick`? @param {Map<string, number>} next the tick each kind may fire again */
export const ready = (/** @type {Map<string, number>} */ next, /** @type {string} */ kind, /** @type {number} */ tick) => tick >= (next.get(kind) ?? 0);

/**
 * The first thing a shot hits: skips the vehicle and its riders. Hits are nearest first, as getEntitiesFromViewDirection gives them.
 * @template {{ entity?: { id: string }, distance: number }} T
 * @param {T[]} hits @param {string[]} skip ids of the vehicle and everybody on it
 */
export function firstTarget(hits, skip) {
  return hits.find((hit) => hit.entity && !skip.includes(hit.entity.id));
}
