// npm run deploy -- [server data folder] [world name]
// Copies every pack to the Bedrock server and turns them on for the world.
import { join, resolve } from "node:path";
import { ROOT } from "./lib/addons.mjs";
import { deploy } from "./lib/deploy.mjs";
import { currentWorld } from "./lib/world.mjs";

const dataDir = resolve(process.argv[2] ?? join(ROOT, "server", "data"));
const world = process.argv[3] ?? currentWorld();
try {
  const { copied, removed } = deploy(dataDir, world);
  for (const name of copied) console.log(`copied ${name}`);
  for (const name of removed) console.log(`removed ${name} (its add-on is gone)`);
  console.log(`Turned on ${copied.length} packs in "${world}". Restart the server.`);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
