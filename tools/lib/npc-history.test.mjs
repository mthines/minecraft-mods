import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { KEEP, npcFor, recentInstructions, remember, savedFor } from "./npc-history.mjs";

const file = () => join(mkdtempSync(join(tmpdir(), "npc-history-")), "npc-history.json");
const plan = (n) => ({ npc: "new", actions: [{ do: "wait", seconds: n }] });

test("nothing remembered yet, or a broken file: an empty list", () => {
  const f = file();
  assert.deepEqual(recentInstructions(f), []);
  writeFileSync(f, "{oops");
  assert.deepEqual(recentInstructions(f), []);
});

test("the newest instruction comes first, and one given again moves to the top instead of showing twice", () => {
  const f = file();
  remember({ instruction: "dig a hole", plan: plan(1), said: "Bob will: dig" }, f);
  remember({ instruction: "build a wall", plan: plan(2), said: "Bob will: build" }, f);
  remember({ instruction: "Dig  a hole ", plan: plan(3), said: "Bob will: dig again" }, f);
  assert.deepEqual(recentInstructions(f).map((r) => r.instruction), ["Dig  a hole ", "build a wall"]);
  assert.deepEqual(savedFor("dig a hole", f)?.plan, plan(3));
  assert.equal(savedFor("fly to the moon", f), undefined);
});

test(`only the newest ${KEEP} are kept`, () => {
  const f = file();
  for (let i = 0; i < KEEP + 5; i++) remember({ instruction: `task ${i}`, plan: plan(i), said: "" }, f);
  const list = recentInstructions(f);
  assert.equal(list.length, KEEP);
  assert.equal(list[0].instruction, `task ${KEEP + 4}`);
  assert.equal(list.at(-1)?.instruction, "task 5");
});

test("a saved plan goes to the NPC it named, else the only NPC, else a new one", () => {
  assert.equal(npcFor("Bob", ["Bob", "Ann"]), "Bob");
  assert.equal(npcFor("Bob", ["Ann"]), "Ann");
  assert.equal(npcFor("new", ["Ann"]), "Ann");
  assert.equal(npcFor("Bob", []), "new");
  assert.equal(npcFor("Bob", ["Ann", "Cy"]), "new");
});
