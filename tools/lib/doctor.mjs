// The checks behind `mc doctor`: what has to work for the server to start and for players to join.
// Each check says what it found and, when something is wrong, what to do about it.
import { execFile } from "node:child_process";
import { statfsSync } from "node:fs";
import { promisify } from "node:util";
import { ROOT } from "./addons.mjs";
import { validate } from "./validate.mjs";

const run = promisify(execFile);
const CONTAINER = process.env.BEDROCK_CONTAINER ?? "family-bedrock";
const MAC = process.platform === "darwin";

/** @typedef {{ name: string, status: "ok" | "warn" | "fail", detail: string, fix?: string }} Finding */

/** Runs a command and returns its output, or the error text when it fails or takes too long. @param {string} cmd @param {string[]} args */
async function sh(cmd, args, timeout = 20000) {
  try {
    const { stdout, stderr } = await run(cmd, args, { cwd: ROOT, timeout, maxBuffer: 10_000_000 });
    return { ok: true, text: `${stdout}${stderr}`.trim() };
  } catch (/** @type {any} */ error) {
    const text = `${error.stdout ?? ""}${error.stderr ?? ""}`.trim() || String(error.message ?? error);
    return { ok: false, text: error.killed ? `${cmd} didn't answer in ${timeout / 1000}s` : text };
  }
}

/** The first line that says what went wrong, short enough for a screen. @param {string} text */
const gist = (text) => (text.split("\n").find((line) => /error|fail|cannot|denied|refused|not found/i.test(line)) ?? text.split("\n")[0]).replace(/\s+/g, " ").slice(0, 220);

const RESTART_COLIMA = "colima restart (stops every container in Colima, other projects' too, so check nobody is playing first)";

/** @returns {Promise<Finding[]>} */
export async function diagnose() {
  /** @type {Finding[]} */
  const findings = [];
  const add = (/** @type {Finding} */ finding) => findings.push(finding);

  // Colima (Mac): the VM the containers run in, and the address players join on.
  let vmUp = true;
  if (MAC) {
    const colima = await sh("colima", ["status", "-j"], 15000);
    if (!colima.ok) {
      vmUp = false;
      add({ name: "Colima", status: "fail", detail: "Colima isn't running.", fix: "colima start --network-address --port-forwarder grpc  (mc start does this too)" });
    } else if (!/"ip_address":"[^"]+"/.test(colima.text)) {
      add({ name: "Colima address", status: "fail", detail: "Colima has no network address, so joining fails with a NetherNet error.", fix: "colima stop && colima start --network-address --port-forwarder grpc" });
    } else add({ name: "Colima", status: "ok", detail: "running with a network address" });
  }

  if (vmUp) {
    const info = await sh("docker", ["info", "--format", "{{.ServerVersion}}"]);
    if (!info.ok) add({ name: "Docker", status: "fail", detail: gist(info.text), fix: MAC ? "colima start --network-address --port-forwarder grpc" : "start the Docker service" });
    else {
      add({ name: "Docker", status: "ok", detail: `answering (${info.text})` });

      // A damaged image store ("blob ... input/output error") stops every pull and start, and docker logs.
      const images = await sh("docker", ["images", "-q"]);
      if (!images.ok) add({ name: "Docker images", status: "fail", detail: gist(images.text), fix: `The disk Colima keeps its images on is unreadable. First ${RESTART_COLIMA}. If it comes back, the only way left is colima delete, which wipes all images and volumes` });
      else add({ name: "Docker images", status: "ok", detail: "image store readable" });

      const ps = await sh("docker", ["inspect", "-f", "{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}", CONTAINER]);
      if (!ps.ok) add({ name: "Server container", status: "fail", detail: `${CONTAINER} doesn't exist.`, fix: "mc start" });
      else {
        const [state, health] = ps.text.split("|");
        if (state !== "running") add({ name: "Server container", status: "fail", detail: `${CONTAINER} is ${state}.`, fix: "mc start" });
        else if (health === "healthy") add({ name: "Server container", status: "ok", detail: "running and accepting joins" });
        else add({ name: "Server container", status: "fail", detail: `running, but ${health || "no health check"}: not accepting joins.`, fix: "docker logs --tail 50 family-bedrock for why; if it stays unhealthy, mc restart (kicks everyone)" });

        const log = await sh("docker", ["logs", "--since", "10m", CONTAINER], 20000);
        if (!log.ok) add({ name: "Server log", status: "fail", detail: gist(log.text), fix: `docker can't read its own files: ${RESTART_COLIMA}` });
        else {
          const errors = log.text.split("\n").filter((line) => /ERROR\]/.test(line));
          if (errors.length) add({ name: "Server log", status: "warn", detail: `${errors.length} errors in the last 10 minutes, latest: ${errors.at(-1)?.slice(0, 200)}`, fix: "Find the mod it names (a script error names its file) and fix it. Errors that repeat every tick break a loop for everyone" });
          else add({ name: "Server log", status: "ok", detail: "no errors in the last 10 minutes" });
        }
      }
    }
  }

  // Free space where the world lives.
  try {
    const { bavail, bsize, blocks } = statfsSync(ROOT);
    const free = (bavail * bsize) / 1e9;
    const pct = Math.round((bavail / blocks) * 100);
    if (free < 5) add({ name: "Disk space", status: "fail", detail: `${free.toFixed(1)} GB free (${pct}%).`, fix: "Free some space: docker system prune (unused images and stopped containers), old world folders in server/data/worlds, backups" });
    else add({ name: "Disk space", status: "ok", detail: `${free.toFixed(0)} GB free` });
  } catch {}

  // The add-ons themselves.
  try {
    const { errors, count } = validate();
    if (errors.length) add({ name: "Add-ons", status: "fail", detail: `${errors.length} problems, first: ${errors[0]}`, fix: "npm run validate lists them all" });
    else add({ name: "Add-ons", status: "ok", detail: `${count} add-ons look good` });
  } catch (/** @type {any} */ error) {
    add({ name: "Add-ons", status: "fail", detail: String(error.message ?? error).slice(0, 200), fix: "npm run validate" });
  }

  return findings;
}

const ICON = { ok: "✓", warn: "⚠", fail: "✗" };

/** The findings as lines to print: the problems say what to do. @param {Finding[]} findings */
export function report(findings) {
  const lines = findings.flatMap((f) => [`${ICON[f.status]} ${f.name}: ${f.detail}`, ...(f.fix && f.status !== "ok" ? [`    → ${f.fix}`] : [])]);
  const bad = findings.filter((f) => f.status !== "ok").length;
  lines.push(bad ? `${bad} thing${bad === 1 ? "" : "s"} to look at.` : "✓ Everything looks fine.");
  return lines;
}
