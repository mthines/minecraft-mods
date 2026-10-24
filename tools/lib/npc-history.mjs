// The recent NPC instructions and the plan Claude made for each, newest first. mc npc uses a saved plan
// instead of asking Claude again, and mc dev's n key lists them to pick one again, like k lists kits.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { ROOT } from "./addons.mjs";

export const NPC_HISTORY = process.env.MC_NPC_HISTORY ?? join(ROOT, "server", "npc-history.json"); // per computer: not committed
export const KEEP = 25;

/** @typedef {{ instruction: string, plan: { npc: string, actions: object[] }, said: string, at: string }} Remembered said: what mc npc printed about the plan */

/** Instructions given the same way count as one: "Dig a hole" and "dig  a hole". @param {string} s */
const same = (s) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** The remembered instructions, newest first. @returns {Remembered[]} */
export function recentInstructions(file = NPC_HISTORY) {
  try {
    const list = JSON.parse(readFileSync(file, "utf8"));
    return Array.isArray(list) ? list : [];
  } catch {
    return []; // none yet, or a broken file: start over
  }
}

/** The saved plan for this instruction, if it was given before. @param {string} instruction */
export const savedFor = (instruction, file = NPC_HISTORY) => recentInstructions(file).find((r) => same(r.instruction) === same(instruction));

/** Puts an instruction first, once, and keeps the newest KEEP. @param {Omit<Remembered, "at">} entry */
export function remember(entry, file = NPC_HISTORY) {
  const rest = recentInstructions(file).filter((r) => same(r.instruction) !== same(entry.instruction));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify([{ ...entry, at: new Date().toISOString() }, ...rest].slice(0, KEEP), null, 2)}\n`);
}

/**
 * Which NPC does a saved plan now: the one it named if it's still in the game, else the only NPC, else a new one.
 * @param {string} named @param {string[]} npcs the NPCs in the game now
 */
export const npcFor = (named, npcs) => (npcs.includes(named) ? named : npcs.length === 1 ? npcs[0] : "new");
