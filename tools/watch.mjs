// npm run watch: every time you save, copy the change to the running server and reload it.
// Code (scripts/) and commands (functions/) reload in a second without leaving the world.
// Anything else (items, recipes, pictures, manifest.json) restarts the server.
import { watch } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { ADDONS_DIR, ROOT } from "./lib/addons.mjs";
import { deploy } from "./lib/deploy.mjs";
import { validate } from "./lib/validate.mjs";
import { currentWorld } from "./lib/world.mjs";

const run = promisify(execFile);
const CONTAINER = process.env.BEDROCK_CONTAINER ?? "family-bedrock";
const DATA_DIR = join(ROOT, "server", "data");
const RELOADABLE = /\/behavior_pack\/(scripts|functions)\//;
const IN_A_PACK = /\/(behavior|resource)_pack\//;

/** @type {Set<string>} */
let changed = new Set();
/** @type {NodeJS.Timeout | undefined} */
let timer;
let busy = false;
/** Where messages go: the terminal, or the mc dev screen (tools/dev.mjs). */
let log = console.log;
/**
 * What a save does, set from mc dev's options: send it at all, and restart even when a reload would do.
 * Sending starts off, so saving while the family plays doesn't reload or restart their server: turn it on in mc dev.
 */
export const onSave = { send: false, alwaysRestart: false };

/** Turns sending saved changes on or off. Changes saved while it was off go to the server when it's on again. @param {boolean} on */
export function sendSaves(on) {
  onSave.send = on;
  if (on && changed.size) apply();
}

/** How many saved changes wait for sending to be on again. */
export const waiting = () => changed.size;

/** @param {(message: string) => void} [logTo] */
export function watchAddons(logTo = console.log) {
  log = logTo;
  watch(ADDONS_DIR, { recursive: true }, (_event, file) => {
    if (!file) return;
    const path = `/${file.split("\\").join("/")}`;
    if (!IN_A_PACK.test(path)) return; // tests and notes don't go to the server
    if (!onSave.send && !changed.has(path)) log(`[${new Date().toLocaleTimeString()}] Saved ${describe([path])}: not sent, sending saves is off.`);
    changed.add(path);
    if (!onSave.send) return;
    clearTimeout(timer);
    timer = setTimeout(apply, 300); // editors save in bursts: wait until it's quiet
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  onSave.send = true; // npm run watch is only for sending saves
  watchAddons();
  log(`Watching addons/ for changes. Server: ${CONTAINER}. Press Ctrl+C to stop.`);
}

async function apply() {
  if (busy) return void (timer = setTimeout(apply, 300));
  if (!onSave.send) return;
  busy = true;
  const files = [...changed];
  changed = new Set();
  const time = new Date().toLocaleTimeString();
  try {
    const { errors } = validate();
    if (errors.length) {
      log(`\n[${time}] ✗ Not sent to the server. Fix this first:\n${errors.map((e) => `  ${e}`).join("\n")}`);
      return;
    }
    deploy(DATA_DIR, currentWorld()); // read each time: ./mc world play can switch it
    const since = new Date().toISOString();
    const reloaded = !onSave.alwaysRestart && files.every((f) => RELOADABLE.test(f));
    if (reloaded) {
      await run("docker", ["exec", CONTAINER, "send-command", "reload"]);
      log(`\n[${time}] ↻ Reloaded ${describe(files)}. Try it in the game now.`);
    } else {
      await run("docker", ["restart", CONTAINER]);
      log(`\n[${time}] ⟳ Restarted the server for ${describe(files)}. Wait for it to come back up.`);
      if (files.some((f) => f.includes("/resource_pack/"))) {
        log("  Changed a picture? Raise the resource pack's version in manifest.json, or devices keep the old one.");
      }
    }
    await showScriptErrors(since, reloaded ? "reloaded" : "Server started");
    if (!reloaded) await reportJoinable();
  } catch (e) {
    log(`\n[${time}] ✗ ${e instanceof Error ? e.message.split("\n")[0] : e}`);
    log(`  Is the server running? Start it with ./server/start.sh`);
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
  for (const line of problems) log(`  ⚠ ${line.trim()}`);
}

// "Server started" isn't enough: the server has said it while nobody could join (see server/README.md).
// Its health check knows whether joins work (docker-compose.yml), so wait for that instead.
async function reportJoinable() {
  for (let waited = 0; waited < 120_000; waited += 2000) {
    const { stdout } = await run("docker", ["inspect", "-f", "{{if .State.Health}}{{.State.Health.Status}}{{end}}", CONTAINER]);
    const status = stdout.trim();
    if (status === "healthy" || status === "") return void log("  Server is back up. Rejoin now.");
    if (status === "unhealthy") break;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  log("  ⚠ The server is running but not accepting joins yet. The autoheal service restarts it if this lasts.");
}
