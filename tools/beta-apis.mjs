// node tools/beta-apis.mjs check|enable <world folder>
// check exits 0 when the world has Beta APIs (or doesn't exist yet), 1 when they still need turning on.
// enable turns them on; run it only while the server is stopped (mc does that).
import { existsSync } from "node:fs";
import { join } from "node:path";
import { enableBetaApis, hasBetaApis } from "./lib/beta-apis.mjs";

const [action, world] = process.argv.slice(2);
const file = join(world ?? "", "level.dat");
if (!["check", "enable"].includes(action) || !world) {
  console.error("Usage: node tools/beta-apis.mjs check|enable <world folder>");
  process.exit(2);
}
if (!existsSync(file)) process.exit(0); // made when the server first starts it
if (action === "check") process.exit((await hasBetaApis(file)) ? 0 : 1);
if (await enableBetaApis(file)) console.log(`Turned on Beta APIs in ${world} (for NPCs).`);
