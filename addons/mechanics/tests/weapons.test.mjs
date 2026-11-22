import assert from "node:assert/strict";
import { test } from "node:test";
import { PART_BY_KEY } from "../behavior_pack/scripts/catalog.js";
import { armament, damageOf, firstTarget, powerOf, ready, WEAPONS } from "../behavior_pack/scripts/combat.js";
import { emptyDesign } from "../behavior_pack/scripts/design.js";

const mounted = (kinds) => {
  const design = emptyDesign("hauler");
  kinds.forEach((kind, i) => (design.slots[6 + i] = PART_BY_KEY[kind].id));
  return design;
};

test("with no weapon mounted, nothing can fire", () => {
  assert.deepEqual(armament(emptyDesign("racer")), []);
});

test("mounting more of a kind multiplies the damage, up to three", () => {
  assert.deepEqual(armament(mounted(["gatling", "gatling"])), [{ kind: "gatling", n: 2 }]);
  assert.equal(damageOf("gatling", 2), WEAPONS.gatling.damage * 2);
  assert.equal(damageOf("gatling", 5), WEAPONS.gatling.damage * 3);
  assert.equal(armament(mounted(Array(5).fill("laser")))[0].n, 3);
});

test("each kind has its own cooldown", () => {
  const next = new Map([["rocket", 100]]);
  assert.equal(ready(next, "rocket", 99), false);
  assert.equal(ready(next, "rocket", 100), true);
  assert.equal(ready(next, "laser", 0), true);
});

test("a shot never hits the vehicle or anyone riding it", () => {
  const hits = [{ entity: { id: "car" }, distance: 1 }, { entity: { id: "me" }, distance: 2 }, { entity: { id: "husk" }, distance: 9 }, { entity: { id: "later" }, distance: 20 }];
  assert.equal(firstTarget(hits, ["car", "me", "friend"])?.entity.id, "husk");
  assert.equal(firstTarget(hits.slice(0, 2), ["car", "me"]), undefined);
});

test("rockets blow up blocks, and more pods make a bigger bang", () => {
  assert.ok(powerOf(1) >= 4);
  assert.ok(powerOf(3) > powerOf(1));
  assert.ok(WEAPONS.rocket.power >= 4);
});

test("a burst is several shots, the laser one strong one", () => {
  assert.ok(WEAPONS.gatling.burst > 1);
  assert.equal(WEAPONS.laser.burst, 1);
  assert.ok(WEAPONS.laser.damage > WEAPONS.gatling.damage);
});
