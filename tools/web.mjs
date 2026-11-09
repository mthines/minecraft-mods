// ./mc web: a kit menu for touch screens (an iPad), the same kits as ./mc kit and the k key in mc dev (tools/lib/kits.mjs).
// Serves web/dist (npm run web:build) and a tiny API on the home network. No login: anyone on the wifi can give kits.
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { CATEGORIES, kitNames, menuKits } from "./lib/kits.mjs";
import { lanUrls } from "./lib/lan.mjs";
import { PLACES } from "./lib/places.mjs";
import { currentWorld } from "./lib/world.mjs";

const run = promisify(execFile);
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIST = join(ROOT, "web", "dist");
const SERVER = "family-bedrock";
const WORLDS = join(ROOT, "server", "data", "worlds");
const PROPS = join(ROOT, "server", "data", "server.properties");
const PORT = Number(process.env.PORT ?? 8080);
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png" };

/** The kit menu: categories in mc dev's order, each with its kits (a kit with types lists them). */
function menu() {
  const kits = menuKits();
  const categories = Object.entries(CATEGORIES)
    .map(([name, emoji]) => ({ name, emoji, kits: kits.filter((kit) => kit.category === name) }))
    .filter(({ kits }) => kits.length);
  return { categories };
}

let cache = { at: 0, players: /** @type {string[]} */ ([]) };
/** Who is online, like mc locate asks: the names are on the line after "players online:". */
async function players() {
  if (Date.now() - cache.at < 3000) return cache.players;
  const since = new Date().toISOString();
  await run("docker", ["exec", SERVER, "send-command", "list"]);
  await new Promise((done) => setTimeout(done, 800));
  const { stdout, stderr } = await run("docker", ["logs", "--since", since, SERVER]);
  const lines = `${stdout}\n${stderr}`.split("\n").map((line) => line.replace("\r", ""));
  const at = lines.findIndex((line) => line.includes("players online:"));
  const names = at >= 0 && lines[at + 1] && !lines[at + 1].startsWith("[") ? lines[at + 1].split(", ").map((n) => n.trim()).filter(Boolean) : [];
  cache = { at: Date.now(), players: names };
  return names;
}

// ./mc kit is the one place that gives a kit; one at a time, so two taps don't mix their commands.
let queue = Promise.resolve();
/** @param {string[]} args @param {number} [timeout] */
function mc(args, timeout = 60000) {
  const job = queue.then(() => run(join(ROOT, "mc"), args, { cwd: ROOT, timeout }));
  queue = job.then(() => {}, () => {});
  return job;
}

/** The on/off options a kid can flip: what each is called in ./mc (mc <name> [on|off]). */
const OPTIONS = ["peace", "invincible", "fall-damage", "pvp", "keep-inventory"];

/** Whether an option is on (true), off (false), or unknown (null, when the server isn't running). @param {string} id */
async function optionState(id) {
  if (id === "peace") return existsSync(PROPS) && /^difficulty=peaceful/m.test(readFileSync(PROPS, "utf8"));
  try {
    const { stdout } = await mc([id]);
    const now = stdout.match(/ is (on|off)\b/);
    return now ? now[1] === "on" : null;
  } catch {
    return null;
  }
}

const worlds = () => (existsSync(WORLDS) ? readdirSync(WORLDS, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort() : []);

/** @param {import("node:http").IncomingMessage} req */
const body = async (req) => { let text = ""; for await (const chunk of req) { text += chunk; if (text.length > 4096) throw new Error("too big"); } return JSON.parse(text || "{}"); };

/** @param {import("node:http").ServerResponse} res @param {number} status @param {unknown} data */
const json = (res, status, data) => { res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify(data)); };

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  try {
    if (url.pathname === "/api/menu") return json(res, 200, menu());
    if (url.pathname === "/api/players") return json(res, 200, { players: await players().catch(() => []) });
    if (url.pathname === "/api/give" && req.method === "POST") {
      const { kit, who = "@a", craft = false } = await body(req);
      if (kit !== "tools" && !kitNames(true).includes(kit)) return json(res, 400, { error: "No such kit." });
      if (who !== "@a" && !(await players()).includes(who)) return json(res, 400, { error: `${who} is not online.` });
      try {
        const { stdout } = await mc(["kit", kit, who, ...(craft === true ? ["--craft"] : [])]);
        return json(res, 200, { ok: true, message: stdout.split("\n")[0] });
      } catch (error) {
        const text = String(error.stderr || error.message).split("\n")[0];
        return json(res, 409, { error: text.startsWith("Nobody") ? "Nobody is online to get it. Join the server first!" : "That didn't work. Is the server running?" });
      }
    }
    if (url.pathname === "/api/places") return json(res, 200, { places: PLACES.map(([label, value]) => ({ label, value })) });
    if (url.pathname === "/api/do" && req.method === "POST") {
      // The grown-up commands kids may press, each is one ./mc command.
      const { action, who = "@a", place = "" } = await body(req);
      if (who !== "@a" && !(await players()).includes(who)) return json(res, 400, { error: `${who} is not online.` });
      const one = who === "@a" ? [] : [who];
      const commands = {
        day: () => ["cmd", "time set day"],
        enemies: () => ["kill-enemies"],
        clear: () => ["clear-inventory", "backpack", ...one],
        find: () => (PLACES.some(([, value]) => value === place) ? ["locate", place, ...one] : undefined),
      };
      const args = commands[action]?.();
      if (!args) return json(res, 400, { error: "I don't know that one." });
      try {
        const { stdout } = await mc(args);
        return json(res, 200, { ok: true, message: stdout.trim().split("\n").slice(-3).join(" ") });
      } catch (error) {
        return json(res, 409, { error: String(error.stderr || error.message).trim().split("\n")[0] || "That didn't work. Is the server running?" });
      }
    }
    if (url.pathname === "/api/options") {
      const states = [];
      for (const id of OPTIONS) states.push({ id, on: await optionState(id) });
      const now = currentWorld();
      return json(res, 200, { options: states, worlds: worlds().map((name) => ({ name, current: name === now })), players: await players().catch(() => []) });
    }
    if (url.pathname === "/api/option" && req.method === "POST") {
      const { id, on } = await body(req);
      if (!OPTIONS.includes(id) || typeof on !== "boolean") return json(res, 400, { error: "I don't know that one." });
      try {
        await mc([id, on ? "on" : "off"]);
        return json(res, 200, { ok: true, on });
      } catch (error) {
        return json(res, 409, { error: "That didn't work. Is the server running?" });
      }
    }
    if (url.pathname === "/api/world" && req.method === "POST") {
      // Switching worlds restarts the server, which kicks everyone: with people online it needs force.
      const { name, force = false } = await body(req);
      if (!worlds().includes(name)) return json(res, 400, { error: "No such world." });
      if (name === currentWorld()) return json(res, 400, { error: "You're already in that world." });
      cache.at = 0;
      const online = await players().catch(() => []);
      if (online.length && force !== true) return json(res, 409, { needsConfirm: true, players: online });
      try {
        await mc(["world", "play", name], 300000);
        return json(res, 200, { ok: true });
      } catch (error) {
        return json(res, 409, { error: "The world didn't start. Ask a grown-up to look at ./mc logs." });
      }
    }
    const file = normalize(url.pathname === "/" ? "/index.html" : url.pathname);
    if (file.includes("..")) return json(res, 404, {});
    const data = await readFile(join(DIST, file)).catch(() => undefined);
    if (!data) return json(res, 404, { error: "Not found. Run npm run web:build first." });
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": file === "/sw.js" ? "no-cache" : "public, max-age=300" });
    res.end(data);
  } catch (error) {
    json(res, 500, { error: String(error.message) });
  }
}).on("error", (error) => {
  console.error(error.code === "EADDRINUSE" ? `Port ${PORT} is busy: is the kit menu already running?` : String(error));
  process.exit(1);
}).listen(PORT, "0.0.0.0", () => {
  const urls = lanUrls(PORT);
  console.log(`Kit menu: ${urls.join("  ") || `http://localhost:${PORT}`}\nOpen it on the iPad (same wifi), then Share → Add to Home Screen.`);
});
