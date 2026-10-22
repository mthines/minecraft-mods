// npm run watch: every time you save, copy the change to the running server and reload it.
// Code (scripts/) and commands (functions/) reload in a second without leaving the world.
// Anything else (items, recipes, pictures, manifest.json) restarts the server.
import { watch } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join, relative } from "node:path";
import { ADDONS_DIR, ROOT } from "./lib/addons.mjs";
import { deploy } from "./lib/deploy.mjs";
import { validate } from "./lib/validate.mjs";

const run = promisify(execFile);
const CONTAINER = process.env.BEDROCK_CONTAINER ?? "family-bedrock";
const DATA_DIR = join(ROOT, "server", "data");
const WORLD = process.env.BEDROCK_WORLD ?? "Bedrock level";
const RELOADABLE = /\/behavior_pack\/(scripts|functions)\//;
const IN_A_PACK = /\/(behavior|resource)_pack\//;

/** @type {Set<string>} */
let changed = new Set();
/** @type {NodeJS.Timeout | undefined} */
let timer;
let busy = false;

watch(ADDONS_DIR, { recursive: true }, (_event, file) => {
  if (!file) return;
  const path = `/${file.split("\\").join("/")}`;
  if (!IN_A_PACK.test(path)) return; // tests and notes don't go to the server
  changed.add(path);
  clearTimeout(timer);
  timer = setTimeout(apply, 300); // editors save in bursts: wait until it's quiet
});
console.log(`Watching addons/ for changes. Server: ${CONTAINER}. Press Ctrl+C to stop.`);

async function apply() {
  if (busy) return void (timer = setTimeout(apply, 300));
  busy = true;
  const files = [...changed];
  changed = new Set();
  const time = new Date().toLocaleTimeString();
  try {
    const { errors } = validate();
    if (errors.length) {
      console.log(`\n[${time}] ✗ Not sent to the server. Fix this first:\n${errors.map((e) => `  ${e}`).join("\n")}`);
      return;
    }
    deploy(DATA_DIR, WORLD);
    const since = new Date().toISOString();
    if (files.every((f) => RELOADABLE.test(f))) {
      await run("docker", ["exec", CONTAINER, "send-command", "reload"]);
      console.log(`\n[${time}] ↻ Reloaded ${describe(files)}. Try it in the game now.`);
    } else {
      await run("docker", ["restart", CONTAINER]);
      console.log(`\n[${time}] ⟳ Restarted the server for ${describe(files)}. Wait for it to come back up.`);
      if (files.some((f) => f.includes("/resource_pack/"))) {
        console.log("  Changed a picture? Raise the resource pack's version in manifest.json, or devices keep the old one.");
      }
    }
    const reloaded = files.every((f) => RELOADABLE.test(f));
    await showScriptErrors(since, reloaded ? "reloaded" : "Server started");
    if (!reloaded) await reportJoinable();
  } catch (e) {
    console.log(`\n[${time}] ✗ ${e instanceof Error ? e.message.split("\n")[0] : e}`);
    console.log(`  Is the server running? Start it with ./server/start.sh`);
  } finally {
    busy = false;
  }
}

/** @param {string[]} files */
function describe(files) {
  const names = files.map((f) => relative(ADDONS_DIR, join(ADDONS_DIR, f)));
  return names.length <= 3 ? names.join(", ") : `${names.length} files`;
}

/**
 * Shows script errors the server printed after `since`, so mistakes don't go unnoticed.
 * Waits for the line that says the server is done (a restart can take over a minute), or two minutes at most.
 * @param {string} since
 * @param {string} doneLine
 */
async function showScriptErrors(since, doneLine) {
  let output = "";
  for (let waited = 0; waited < 120_000 && !output.includes(doneLine); waited += 1000) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const { stdout, stderr } = await run("docker", ["logs", "--since", since, CONTAINER]);
    output = `${stdout}\n${stderr}`;
  }
  const problems = output.split("\n").filter((line) => /\b(ERROR|WARN)\]/.test(line));
  for (const line of problems) console.log(`  ⚠ ${line.trim()}`);
}

// "Server started" isn't enough: the server has said it while nobody could join (see server/README.md).
// Its health check knows whether joins work (docker-compose.yml), so wait for that instead.
async function reportJoinable() {
  for (let waited = 0; waited < 120_000; waited += 2000) {
    const { stdout } = await run("docker", ["inspect", "-f", "{{if .State.Health}}{{.State.Health.Status}}{{end}}", CONTAINER]);
    const status = stdout.trim();
    if (status === "healthy" || status === "") return void console.log("  Server is back up. Rejoin now.");
    if (status === "unhealthy") break;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  console.log("  ⚠ The server is running but not accepting joins yet. The autoheal service restarts it if this lasts.");
}
