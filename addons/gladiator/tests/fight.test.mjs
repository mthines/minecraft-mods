import { test } from "node:test";
import assert from "node:assert/strict";
import { FLOOR_HEALTH, KO_HEALTH, MAX_HEALTH, capDamage, countsInFight, isKnockedOut } from "../behavior_pack/scripts/fight.js";

test("no hit, however strong, takes a fighter below the floor", () => {
  for (let health = MAX_HEALTH; health > 0; health -= 0.5) {
    for (const damage of [0, 1, 6, 9, 20, 1000]) {
      const left = health - capDamage(health, damage);
      assert.ok(left >= Math.min(health, FLOOR_HEALTH), `${health} - ${damage}`);
      assert.ok(left > 0);
    }
  }
});

test("a hit that doesn't threaten the fighter is untouched", () => {
  assert.equal(capDamage(20, 5), 5);
  assert.equal(capDamage(1, 5), 0);
});

test("knocked out at or below the threshold only", () => {
  assert.ok(isKnockedOut(KO_HEALTH) && isKnockedOut(FLOOR_HEALTH));
  assert.ok(!isKnockedOut(KO_HEALTH + 0.5) && !isKnockedOut(MAX_HEALTH));
});

test("only a hit from the other fighter counts", () => {
  assert.ok(countsInFight("entityAttack", "b", "b"));
  assert.ok(!countsInFight("entityAttack", "c", "b"), "a spectator");
  assert.ok(!countsInFight("fall", undefined, "b"));
  assert.ok(!countsInFight("entityAttack", undefined, "b"), "a mob");
});
