import { test } from "node:test";
import assert from "node:assert/strict";
import { THROW, throwSpeed } from "../behavior_pack/scripts/throw.js";

test("a quick tap lobs it, a one second hold throws it hardest", () => {
  assert.equal(throwSpeed(0), THROW.weakest);
  assert.equal(throwSpeed(THROW.fullTicks), THROW.strongest);
  assert.equal(throwSpeed(10 * THROW.fullTicks), THROW.strongest, "holding longer doesn't add more");
  assert.ok(throwSpeed(5) < throwSpeed(10) && throwSpeed(10) < throwSpeed(15));
});
