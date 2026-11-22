import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { generate } from "../gen/build.mjs";
import { ART, LOOK } from "../gen/icons.mjs";

test("the generated files match catalog.js (run node addons/mechanics/gen/build.mjs)", () => {
  for (const [path, content] of generate()) {
    const onDisk = readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)));
    assert.ok(Buffer.from(content).equals(onDisk), `${path} is out of date: run node addons/mechanics/gen/build.mjs`);
  }
});

test("every picture is 8×8 and every item has one", () => {
  for (const [key, rows] of Object.entries(ART)) assert.ok(rows.length === 8 && rows.every((row) => row.length === 8), key);
  for (const [item, [art]] of Object.entries(LOOK)) assert.ok(ART[art], item);
});
