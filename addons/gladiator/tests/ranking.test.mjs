import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_ENTRIES, lines, parse, record, top } from "../behavior_pack/scripts/ranking.js";

test("a match is one win and one loss", () => {
  const r = record(record([], "Ann", "Bo"), "Ann", "Cy");
  assert.deepEqual(r.find((e) => e.n === "Ann"), { n: "Ann", w: 2, l: 0 });
  assert.deepEqual(r.find((e) => e.n === "Bo"), { n: "Bo", w: 0, l: 1 });
});

test("the top is sorted by wins, then fewer losses, then name", () => {
  let r = [];
  r = record(r, "Bo", "Ann");
  r = record(r, "Bo", "Cy");
  r = record(r, "Cy", "Ann");
  r = record(r, "Dee", "Cy");
  assert.deepEqual(top(r, 3).map((e) => e.n), ["Bo", "Dee", "Cy"]);
  assert.equal(lines(r).length, 3);
});

test("recording doesn't change the old ranking, and odd names are safe", () => {
  const before = [{ n: "Ann", w: 1, l: 0 }];
  const after = record(before, "__proto__", "Ann");
  assert.equal(before[0].w, 1);
  assert.ok(after.some((e) => e.n === "__proto__" && e.w === 1));
  assert.equal({}.w, undefined);
});

test("it survives a save and a load, and bad saved data", () => {
  const r = record([], "Ann", "Bo");
  assert.deepEqual(parse(JSON.stringify(r)), r);
  assert.deepEqual(parse(undefined), []);
  assert.deepEqual(parse("{nonsense"), []);
  assert.deepEqual(parse('[{"n":"x"},{"n":"Ann","w":1,"l":2}]'), [{ n: "Ann", w: 1, l: 2 }]);
});

test("the list stays small", () => {
  let r = [];
  for (let i = 0; i < MAX_ENTRIES + 50; i++) r = record(r, `p${i}`, `q${i}`);
  assert.ok(r.length <= MAX_ENTRIES);
});
