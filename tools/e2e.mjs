// npm run e2e -- [mod]: plays each mod's tests/e2e.js with simulated players on a separate test server.
// The test server has its own flat world in server/test-data, so the family world is never touched.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { join } from "node:path";
import { ADDONS_DIR, ROOT, listAddons } from "./lib/addons.mjs";
import { enableBetaApis } from "./lib/beta-apis.mjs";
import { deploy } from "./lib/deploy.mjs";
import { validate } from "./lib/validate.mjs";

const CONTAINER = "family-e2e";
const DATA_DIR = join(ROOT, "server", "test-data");
const WORLD = "e2e";
const HARNESS = join(ROOT, "e2e", "behavior_pack");
const only = process.argv[2];

const docker = (...args) => execFileSync("docker", args, { encoding: "utf8" });
const logs = (since) => spawnSync("docker", ["logs", "--since", since, CONTAINER], { encoding: "utf8" }).stdout + "";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => new Date().toISOString();

const mods = listAddons().filter((a) => existsSync(join(a.dir, "tests", "e2e.js")) && (!only || a.name === only));
if (only && mods.length === 0) fail(`addons/${only}/tests/e2e.js doesn't exist. Mods with e2e tests: ${listAddons().filter((a) => existsSync(join(a.dir, "tests", "e2e.js"))).map((a) => a.name).join(", ")}`);
const { errors } = validate();
if (errors.length) fail(errors.join("\n"));

// One run at a time: they share the test server, and a second run would restart it under the first.
await takeTurn(join(DATA_DIR, "e2e.lock"));

// Every run starts from the same fresh world, so nothing a test left behind (blocks, saved matches) leaks into the next run.
const worldDir = join(DATA_DIR, "worlds", WORLD);
const fresh = join(DATA_DIR, "fresh-world");
if (!existsSync(join(fresh, "level.dat"))) {
  console.log("First run: making the test world and downloading the server (a few minutes)...");
  rmSync(worldDir, { recursive: true, force: true });
  await startServer();
  docker("stop", CONTAINER);
  await enableBetaApis(join(worldDir, "level.dat"));
  cpSync(worldDir, fresh, { recursive: true });
}
rmSync(worldDir, { recursive: true, force: true });
cpSync(fresh, worldDir, { recursive: true });
installPacks();
await startServer();

const since = now();
docker("exec", CONTAINER, "send-command", "scriptevent family:e2e run");
let failed = 0;
let printed = 0;
for (let waited = 0; ; waited += 1000) {
  const events = logs(since).split("\n").flatMap((line) => {
    const json = line.match(/(\{"e2e\..*\})\s*$/)?.[1];
    return json ? [JSON.parse(json)] : [];
  });
  for (const e of events.slice(printed)) {
    if (e["e2e.done"]) {
      console.log(`\n${e["e2e.passed"]} passed, ${e["e2e.failed"]} failed`);
      failed = e["e2e.failed"];
    } else {
      const ok = e["e2e.result"] === "pass";
      console.log(`${ok ? "✓" : "✗"} ${e["e2e.mod"]}: ${e["e2e.test"]} (${(e["e2e.ticks"] / 20).toFixed(1)} s)${ok ? "" : `\n    ${e["e2e.error"]}`}`);
    }
  }
  printed = events.length;
  if (events.some((e) => e["e2e.done"])) break;
  const crash = logs(since).split("\n").find((l) => l.includes("[Mod Tests]") && /Error|rejection/.test(l));
  if (crash) fail(`The test harness crashed:\n${crash}`);
  if (waited > 10 * 60 * 1000) fail("The tests didn't finish in 10 minutes. See: docker logs family-e2e");
  await sleep(1000);
}
const scriptErrors = logs(since).split("\n").filter((l) => /\[Scripting\].*(Error|error)/.test(l) && !l.includes('"e2e.'));
if (scriptErrors.length) console.log(`\nScript errors during the tests:\n${scriptErrors.join("\n")}`);
docker("stop", CONTAINER);
process.exit(failed ? 1 : 0);

/** Starts the test server and waits until scripts are running. */
async function startServer() {
  spawnSync("docker", ["rm", "-f", CONTAINER]);
  mkdirSync(DATA_DIR, { recursive: true });
  const version = spawnSync("docker", ["exec", "family-bedrock", "sh", "-c", "ls -d /data/bedrock_server-* 2>/dev/null"], { encoding: "utf8" })
    .stdout.trim().split("\n").pop()?.replace(/.*bedrock_server-/, "");
  const since = now();
  docker("run", "-d", "--name", CONTAINER, "--network", "host", "-v", `${DATA_DIR}:/data`,
    "-e", "EULA=TRUE", "-e", `VERSION=${version || "LATEST"}`, // the same Minecraft as the family server
    "-e", "SERVER_PORT=19170", "-e", "SERVER_PORT_V6=19171", "-e", "SERVER_UDP_PORTS=19180-19181",
    "-e", "ENABLE_LAN_VISIBILITY=false", "-e", `LEVEL_NAME=${WORLD}`, "-e", "LEVEL_TYPE=FLAT",
    "-e", "ALLOW_CHEATS=true", "-e", "CONTENT_LOG_CONSOLE_OUTPUT_ENABLED=true",
    "itzg/minecraft-bedrock-server:latest");
  for (let waited = 0; !logs(since).includes("Server started."); waited += 1000) {
    if (waited > 5 * 60 * 1000) fail(`The test server didn't start. See: docker logs ${CONTAINER}`);
    await sleep(1000);
  }
}

/** Waits until no other mc test run holds the lock, then holds it until this run exits. @param {string} lock */
async function takeTurn(lock) {
  mkdirSync(DATA_DIR, { recursive: true });
  let told = false;
  for (;;) {
    try {
      writeFileSync(lock, String(process.pid), { flag: "wx" }); // fails if the file exists: someone else's turn
      break;
    } catch {
      const holder = Number(readFileSync(lock, "utf8"));
      const alive = (() => {
        try {
          return process.kill(holder, 0);
        } catch {
          return false;
        }
      })();
      if (!alive) rmSync(lock, { force: true }); // left behind by a run that crashed
      else {
        if (!told) console.log(`Another mc test run is going (process ${holder}); waiting for it to finish...`);
        told = true;
        await sleep(2000);
      }
    }
  }
  const release = () => {
    if (existsSync(lock) && readFileSync(lock, "utf8") === String(process.pid)) rmSync(lock, { force: true });
  };
  process.on("exit", release);
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => process.exit(130));
}

/** Every mod, plus the test pack with each mod's tests/e2e.js and its scripts next to it. */
function installPacks() {
  const { copied } = deploy(DATA_DIR, WORLD);
  // Mods only see simulated players as players if their scripts load GameTest too. Test server copies only.
  for (const name of copied.filter((n) => n.endsWith("_BP"))) {
    const file = join(DATA_DIR, "behavior_packs", name, "manifest.json");
    const manifest = JSON.parse(readFileSync(file, "utf8"));
    const script = manifest.modules?.find((m) => m.type === "script");
    if (!script) continue;
    const deps = manifest.dependencies ?? [];
    if (!deps.some((d) => d.module_name === "@minecraft/server-gametest")) deps.push({ module_name: "@minecraft/server-gametest", version: "1.0.0-beta" });
    manifest.dependencies = deps;
    // Listing it isn't enough: the mod's scripts must import it, so start them from a file that does.
    const entry = "scripts/e2e-entry.js";
    writeFileSync(join(DATA_DIR, "behavior_packs", name, entry), `import "@minecraft/server-gametest";\nimport "./${script.entry.replace(/^scripts\//, "")}";\n`);
    script.entry = entry;
    writeFileSync(file, JSON.stringify(manifest, null, 2));
  }
  const target = join(DATA_DIR, "behavior_packs", "e2e_BP"); // deploy removes it each time, as it isn't an add-on
  rmSync(target, { recursive: true, force: true });
  cpSync(HARNESS, target, { recursive: true });
  const imports = [];
  for (const mod of mods) {
    const dir = join(target, "scripts", "mods", mod.name);
    cpSync(join(mod.dir, "tests", "e2e.js"), join(dir, "tests", "e2e.js"));
    const scripts = join(ADDONS_DIR, mod.name, "behavior_pack", "scripts");
    if (existsSync(scripts)) cpSync(scripts, join(dir, "behavior_pack", "scripts"), { recursive: true });
    imports.push([mod.name, `./${mod.name}/tests/e2e.js`]);
  }
  writeFileSync(join(target, "scripts", "mods", "index.js"),
    `${imports.map(([name, path], i) => `import * as m${i} from "${path}";`).join("\n")}
/** Each mod's tests/e2e.js exports test functions: export async function aMatchStarts(t) { ... } */
export const tests = [${imports.map(([name], i) => `...Object.entries(m${i}).map(([fn, run]) => ({ mod: "${name}", name: fn.replace(/([A-Z])/g, " $1").toLowerCase(), run }))`).join(", ")}];
`);
  const manifest = JSON.parse(readFileSync(join(HARNESS, "manifest.json"), "utf8"));
  const file = join(DATA_DIR, "worlds", WORLD, "world_behavior_packs.json");
  const packs = JSON.parse(readFileSync(file, "utf8")).filter((p) => p.pack_id !== manifest.header.uuid);
  writeFileSync(file, `${JSON.stringify([...packs, { pack_id: manifest.header.uuid, version: manifest.header.version }], null, 2)}\n`);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
