// mc doctor: checks what the server needs and says what's wrong and how to fix it.
// mc doctor --fix: then asks Claude to fix what it found (Claude Code, headless).
import { spawn } from "node:child_process";
import { ROOT } from "./lib/addons.mjs";
import { diagnose, report } from "./lib/doctor.mjs";

const findings = await diagnose();
const lines = report(findings);
console.log(lines.join("\n"));
const broken = findings.some((f) => f.status !== "ok");

if (!process.argv.includes("--fix") || !broken) process.exit(findings.some((f) => f.status === "fail") ? 1 : 0);

const prompt = `The family Minecraft server's "mc doctor" found problems:

${lines.join("\n")}

Fix them, in this repo (${ROOT}). Read CLAUDE.md first. Rules:
- Start with the least disruptive fix. Re-run ./mc doctor after each one and stop when it is clean.
- Restarting Colima, the server (./mc restart) or anything else that stops containers kicks players and stops other projects' containers. Before that, make sure nobody is online (docker logs --since 5m family-bedrock | grep "Player connected\\|Player disconnected"), and back up server/data with tar into the folder above this repo first.
- Never delete a world, an image store or a Colima VM (colima delete), and never print or commit server/.env or .mcp.json. If the only fix left is destructive, stop and say so.
- Finish with a short summary of what was wrong, what you did, and what is still open.`;

console.log("\n→ Asking Claude to fix it…\n");
const claude = spawn("claude", ["-p", prompt, "--permission-mode", "acceptEdits", "--allowedTools", "Bash,Read,Edit,Grep,Glob"], { cwd: ROOT, stdio: ["ignore", "inherit", "inherit"] });
claude.on("error", (error) => {
  console.error(`✗ Couldn't start claude: ${error.message}`);
  process.exit(1);
});
claude.on("close", (code) => process.exit(code ?? 1));
