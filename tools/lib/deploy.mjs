import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { listAddons } from "./addons.mjs";

/**
 * Copies every pack to the Bedrock server in dataDir and turns them on for the world.
 * Returns the names of the packs it copied.
 * @param {string} dataDir
 * @param {string} world
 */
export function deploy(dataDir, world) {
  const worldDir = join(dataDir, "worlds", world);
  if (!existsSync(worldDir)) {
    throw new Error(`No world at ${worldDir}. Start the server once so it creates the world, then try again.`);
  }

  const copied = [];
  const enabled = { behavior_pack: [], resource_pack: [] };
  for (const addon of listAddons()) {
    for (const pack of addon.packs) {
      const target = join(dataDir, `${pack.folder}s`, pack.installName);
      rmSync(target, { recursive: true, force: true });
      mkdirSync(join(target, ".."), { recursive: true });
      cpSync(pack.dir, target, { recursive: true });
      enabled[pack.folder].push({ pack_id: pack.manifest.header.uuid, version: pack.manifest.header.version });
      copied.push(pack.installName);
    }
  }

  // Keep packs someone turned on by hand; replace only the ones from this repo.
  for (const [folder, packs] of Object.entries(enabled)) {
    const file = join(worldDir, `world_${folder}s.json`);
    const ours = new Set(packs.map((p) => p.pack_id));
    const existing = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : [];
    writeFileSync(file, `${JSON.stringify([...existing.filter((p) => !ours.has(p.pack_id)), ...packs], null, 2)}\n`);
  }
  return copied;
}
