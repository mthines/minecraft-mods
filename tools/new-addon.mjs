// npm run new -- <name>   creates addons/<name> with a behavior pack, a resource pack, and fresh UUIDs.
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { ADDONS_DIR } from "./lib/addons.mjs";
import { kitEmojis, TOOLS_EMOJI } from "./lib/kits.mjs";

const SCRIPT_API_VERSION = "2.8.0";
const name = process.argv[2];
if (!name || !/^[a-z0-9-]+$/.test(name)) {
  console.error("Usage: npm run new -- <name>   (lowercase letters, numbers, and dashes, e.g. lava-boots)");
  process.exit(1);
}
const dir = join(ADDONS_DIR, name);
if (existsSync(dir)) {
  console.error(`addons/${name} already exists.`);
  process.exit(1);
}

const title = name.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
const version = [1, 0, 0];
const header = (suffix, description) => ({
  name: `${title}${suffix}`,
  description,
  uuid: randomUUID(),
  version,
  min_engine_version: [1, 21, 80],
});
const rp = {
  format_version: 2,
  header: header(" Resources", "Pictures and sounds."),
  modules: [{ type: "resources", uuid: randomUUID(), version }],
};
const bp = {
  format_version: 2,
  header: header("", "Describe what your mod does here."),
  modules: [
    { type: "data", uuid: randomUUID(), version },
    { type: "script", language: "javascript", uuid: randomUUID(), version, entry: "scripts/main.js" },
  ],
  dependencies: [
    { uuid: rp.header.uuid, version },
    { module_name: "@minecraft/server", version: SCRIPT_API_VERSION },
  ],
};

const write = (path, content) => {
  mkdirSync(join(dir, path, ".."), { recursive: true });
  writeFileSync(join(dir, path), typeof content === "string" ? content : `${JSON.stringify(content, null, 2)}\n`);
};
write("behavior_pack/manifest.json", bp);
write("resource_pack/manifest.json", rp);
write(
  "behavior_pack/scripts/main.js",
  `import { world } from "@minecraft/server";

// Try changing this message, then reload the world.
world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (initialSpawn) player.sendMessage("§a${title} is running!");
});
`,
);
// mc kit <name> gives the items to everyone online, to try the mod; mc kit <name> --craft adds what crafts them.
// Its emoji in the kit menus: one no other kit has yet. Change it to one that fits the mod (npm run validate says if it's taken).
const taken = new Set([TOOLS_EMOJI, ...kitEmojis().values()]);
const emoji = [..."🎁🚀🌟🐉🦄🍄🎈🧪🌈🐸🦖🎃🍕🧲🛸🐙🦊🌵🍩🎸"].find((e) => !taken.has(e)) ?? "🎁";
write("kit.json", { about: `What mc kit ${name} gives you to try it.`, emoji, items: [], craft: [["minecraft:crafting_table", 1]] });
console.log(`Created addons/${name}. Next: edit behavior_pack/scripts/main.js, list its items in kit.json (and pick its emoji), then npm run build.`);
