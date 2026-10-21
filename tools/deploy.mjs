// npm run deploy -- [server data folder] [world name]
// Copies every pack to the Bedrock server and turns them on for the world.
import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { ROOT, listAddons } from "./lib/addons.mjs";

const dataDir = resolve(process.argv[2] ?? join(ROOT, "server", "data"));
const world = process.argv[3] ?? "Bedrock level";
const worldDir = join(dataDir, "worlds", world);
if (!existsSync(worldDir)) {
  console.error(`No world at ${worldDir}. Start the server once so it creates the world, then run this again.`);
  process.exit(1);
}

const enabled = { behavior_pack: [], resource_pack: [] };
for (const addon of listAddons()) {
  for (const pack of addon.packs) {
    const target = join(dataDir, `${pack.folder}s`, pack.installName);
    rmSync(target, { recursive: true, force: true });
    mkdirSync(join(target, ".."), { recursive: true });
    cpSync(pack.dir, target, { recursive: true });
    enabled[pack.folder].push({ pack_id: pack.manifest.header.uuid, version: pack.manifest.header.version });
    console.log(`copied ${pack.installName}`);
  }
}

// Keep packs someone turned on by hand; replace only the ones from this repo.
for (const [folder, packs] of Object.entries(enabled)) {
  const file = join(worldDir, `world_${folder}s.json`);
  const ours = new Set(packs.map((p) => p.pack_id));
  const existing = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : [];
  writeFileSync(file, `${JSON.stringify([...existing.filter((p) => !ours.has(p.pack_id)), ...packs], null, 2)}\n`);
}
console.log(`Turned on ${enabled.behavior_pack.length + enabled.resource_pack.length} packs in "${world}". Restart the server.`);
