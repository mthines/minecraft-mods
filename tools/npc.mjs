// mc npc [--near <player>] [--dry-run] [--fresh] [--count <n>] [instruction]
// mc npc --remove [name]: sends that NPC away, or every NPC without a name.
// No instruction: an NPC joins next to you. An instruction ("dig a hole next to me"): Claude turns it into a plan
// (addons/npc/behavior_pack/scripts/plan.js), and an NPC carries it out, a new one if there's none yet.
// An instruction given before reuses its saved plan (tools/lib/npc-history.mjs) without asking Claude; --fresh asks again.
// --count: that many new NPCs join, and each does the instruction.
import { execFileSync, spawnSync } from "node:child_process";
import { ACTIONS, checkPlan } from "../addons/npc/behavior_pack/scripts/plan.js";
import { npcFor, remember, savedFor } from "./lib/npc-history.mjs";

const CONTAINER = process.env.BEDROCK_CONTAINER ?? "family-bedrock";
const args = process.argv.slice(2);
const nearAt = args.indexOf("--near");
const chosenNear = nearAt >= 0 ? args.splice(nearAt, 2)[1] : undefined;
const dryRunAt = args.indexOf("--dry-run");
const dryRun = dryRunAt >= 0 && Boolean(args.splice(dryRunAt, 1)); // only show Claude's plan
const freshAt = args.indexOf("--fresh");
const fresh = freshAt >= 0 && Boolean(args.splice(freshAt, 1)); // ask Claude even when a plan is saved
const countAt = args.indexOf("--count");
const count = countAt >= 0 ? Number(args.splice(countAt, 2)[1]) : 1;
const MAX_COUNT = 8; // NPCs take player slots, and the server has 10 (MAX_PLAYERS)
const removeAt = args.indexOf("--remove");
const remove = removeAt >= 0 && Boolean(args.splice(removeAt, 1));
const instruction = args.join(" ").trim();
if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT) fail(`--count takes a number from 1 to ${MAX_COUNT}: NPCs take player slots, and the server has room for 10 players.`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const send = (command) => execFileSync("docker", ["exec", CONTAINER, "send-command", command], { encoding: "utf8" });
const logsSince = (since) => spawnSync("docker", ["logs", "--since", since, CONTAINER], { encoding: "utf8" }).stdout + "";

/** Runs a server command and returns what the server printed in the next second. */
async function ask(command) {
  const since = new Date().toISOString();
  send(command);
  await sleep(1000);
  return logsSince(since);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

try {
  const listed = dryRun ? "" : await ask("list");
  const online = (listed.match(/players online:\s*\n(?:\[[^\]]*\] )?([^\n]*)/)?.[1] ?? "").split(",").map((n) => n.trim()).filter(Boolean);
  const npcList = dryRun ? "[]" : (await ask(`scriptevent family:npc {"list":true}`)).match(/\{"npc\.list":(\[[^\]]*\])\}/)?.[1];
  if (!npcList) fail("The NPC mod isn't running. It needs Beta APIs, which mc turns on at the next restart: mc restart");
  const npcs = JSON.parse(npcList);
  const people = online.filter((name) => !npcs.includes(name));
  const near = chosenNear ?? people[0] ?? (dryRun ? "You" : undefined);
  if (!near) fail("Nobody is online to bring an NPC to. Join the server first.");

  if (remove) {
    const log = await ask(`scriptevent family:npc ${JSON.stringify({ remove: instruction || "all" })}`);
    const gone = JSON.parse(log.match(/\{"npc\.removed":(\[[^\]]*\])\}/)?.[1] ?? "[]");
    console.log(gone.length ? `${names(gone)} left.` : instruction ? `There's no NPC called ${instruction}.` : "There are no NPCs to send away.");
    for (const line of log.split("\n").filter((l) => l.includes("[NPC]"))) console.log(`  ⚠ ${line.replace(/^.*\[NPC\] /, "").trim()}`);
    process.exit(0);
  }

  if (!instruction) {
    const since = new Date().toISOString();
    for (let i = 0; i < count; i++) {
      send(`scriptevent family:npc ${JSON.stringify({ spawn: true, near })}`);
      await sleep(300);
    }
    await sleep(1500);
    const joined = names([...logsSince(since).matchAll(/"minecraft\.npc\.name":"([^"]+)"/g)].map((m) => m[1]));
    console.log(joined ? `${joined} joined next to ${near}.` : `Asked for ${count > 1 ? `${count} NPCs` : "an NPC"} next to ${near}; see the server log if none came.`);
    process.exit(0);
  }

  // Given before: its saved plan, if it still makes sense, for whichever NPC is around now.
  const saved = fresh ? undefined : savedFor(instruction);
  let result = saved && checkPlan({ ...saved.plan, npc: npcFor(saved.plan.npc, npcs) });
  if (result?.ok) console.log(`"${instruction}" again, with the plan from before (no need to ask Claude).`);
  else {
    result = undefined;
    console.log(`Asking Claude how to "${instruction}"...`);
  }
  let problems = "";
  for (let attempt = 0; attempt < 2 && !result?.ok; attempt++) {
    const reply = claude(prompt({ instruction, near, npcs, problems }));
    let plan;
    try {
      plan = JSON.parse(reply.slice(reply.indexOf("{"), reply.lastIndexOf("}") + 1));
    } catch {
      plan = undefined;
    }
    result = checkPlan(plan);
    if (!result.ok) problems = `Your last answer had problems: ${result.errors.join("; ")}. Reply was: ${reply.slice(0, 500)}`;
  }
  if (!result?.ok) fail(`Claude's plan didn't make sense: ${result?.errors.join("; ")}`);
  if (dryRun) {
    console.log(`${result.plan.npc === "new" ? "A new NPC" : result.plan.npc} would: ${result.plan.actions.map(describe).join(", then ")}.`);
    console.log(JSON.stringify(result.plan));
    process.exit(0);
  }
  // Several: each a new NPC with the same plan, so they do it together.
  const plan = count > 1 ? { ...result.plan, npc: "new" } : result.plan;
  const message = JSON.stringify({ near, ...plan });
  if (message.length > 2000) fail("That plan is too long for one go. Ask for something smaller.");
  const since = new Date().toISOString();
  for (let i = 0; i < count; i++) {
    send(`scriptevent family:npc ${message}`);
    if (count > 1) await sleep(300);
  }
  await sleep(1500);
  const log = logsSince(since);
  const told = [...log.matchAll(/"event\.name":"minecraft\.npc\.told","minecraft\.npc\.name":"([^"]+)"/g)].map((m) => m[1]);
  const who = names(told) || (count > 1 ? `${count} new NPCs` : plan.npc === "new" ? "A new NPC" : plan.npc);
  const said = `${who} will: ${result.plan.actions.map(describe).join(", then ")}.`;
  console.log(said);
  remember({ instruction, plan: result.plan, said });
  for (const line of log.split("\n").filter((l) => l.includes("[NPC]"))) console.log(`  ⚠ ${line.replace(/^.*\[NPC\] /, "").trim()}`);
} catch (e) {
  fail(e instanceof Error ? e.message : String(e));
}

function prompt({ instruction, near, npcs, problems }) {
  return `You control helper NPCs on a family Minecraft (Bedrock) server. Turn the player's instruction into a plan.
Reply with only one JSON object and nothing else: {"npc": "<name of an NPC in the game, or new>", "actions": [ ... ]}

Actions you can use (places are in blocks relative to the asking player's feet and facing: forward, right, up; up 0 is the ground they stand on):
${ACTIONS}

NPCs in the game now: ${npcs.length ? npcs.join(", ") : "none"}.
Player asking: ${near}.
Pick the NPC the instruction names; if it names none and there is exactly one NPC, use that one; otherwise "new".
Keep things a sensible size for a game (holes and walls up to about 9 blocks). The instruction can be in any language; any "say" text is in the same language.
${problems}
Instruction: ${JSON.stringify(instruction)}`;
}

/** Asks the claude CLI (Claude Code, signed in on this computer). A small fast model is plenty for this. */
function claude(text) {
  const run = spawnSync("claude", ["-p", "--model", "haiku", text], { encoding: "utf8", timeout: 120_000 });
  if (run.error) fail(`Couldn't run the claude command: ${run.error.message}. Is Claude Code installed and signed in?`);
  if (run.status !== 0) fail(`claude failed: ${(run.stderr || run.stdout).trim().slice(0, 300)}`);
  return run.stdout;
}

/** "Bob", "Bob and Ann", "Bob, Ann and Cy"; "" for none. @param {string[]} list */
function names(list) {
  return list.length > 1 ? `${list.slice(0, -1).join(", ")} and ${list.at(-1)}` : (list[0] ?? "");
}

/** "dig a 3×3 hole 2 deep 2 blocks ahead" */
function describe(action) {
  const where = (at) => {
    const parts = [];
    if (at.forward) parts.push(`${Math.abs(at.forward)} ${at.forward > 0 ? "ahead" : "behind"}`);
    if (at.right) parts.push(`${Math.abs(at.right)} ${at.right > 0 ? "right" : "left"}`);
    if (at.up) parts.push(`${Math.abs(at.up)} ${at.up > 0 ? "up" : "down"}`);
    return parts.length ? parts.join(", ") : "right here";
  };
  switch (action.do) {
    case "say":
      return `say "${action.text}"`;
    case "follow":
      return action.seconds ? `follow you for ${action.seconds} s` : "follow you";
    case "go":
      return `walk to ${where(action.at)}`;
    case "dig":
      return `dig a ${action.width}×${action.length} hole ${action.depth} deep (${where(action.at)})`;
    case "build":
      return `build ${action.hollow ? "hollow " : ""}${action.block.replace("minecraft:", "")} ${action.width}×${action.length}, ${action.height} high (${where(action.at)})`;
    case "attack":
      return `fight ${action.mob === "hostile" ? "monsters" : action.mob.replace("minecraft:", "")} for up to ${action.seconds} s`;
    case "wait":
      return `wait ${action.seconds} s`;
    default:
      return action.do;
  }
}
