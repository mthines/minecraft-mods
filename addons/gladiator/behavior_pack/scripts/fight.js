// The rules that keep a fight safe. Pure, so they can be unit tested (tests/fight.test.mjs).

export const MAX_HEALTH = 20;
/** A fighter at or below this much health is knocked out (it's 2 hearts). */
export const KO_HEALTH = 4;
/** No hit, fall or anything else ever takes a fighter below this. */
export const FLOOR_HEALTH = 1;

/** Whether a fighter with `health` is knocked out. @param {number} health */
export const isKnockedOut = (health) => health <= KO_HEALTH;

/**
 * The damage a fighter with `health` really takes from `damage`: never enough to die. Used before the hit lands,
 * so even a hit stronger than anything the gear can do leaves the fighter on their feet.
 * @param {number} health @param {number} damage
 */
export const capDamage = (health, damage) => Math.max(0, Math.min(damage, health - FLOOR_HEALTH));

/** Whether damage of this kind counts in a fight: only a hit from the other fighter does. @param {string} cause @param {string | undefined} attackerId @param {string} opponentId */
export const countsInFight = (cause, attackerId, opponentId) => (cause === "entityAttack" || cause === "projectile") && attackerId === opponentId;
