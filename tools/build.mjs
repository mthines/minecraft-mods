// Packs every add-on into dist/<name>.mcaddon. Open that file on a device to install it.
import { mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { ROOT, listAddons, walk } from "./lib/addons.mjs";
import { zip } from "./lib/zip.mjs";

const only = process.argv[2];
const dist = join(ROOT, "dist");
if (!only) rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

const addons = listAddons().filter((a) => !only || a.name === only);
if (addons.length === 0) {
  console.error(`No add-on called "${only}" in addons/.`);
  process.exit(1);
}

for (const addon of addons) {
  const entries = addon.packs.flatMap((pack) =>
    walk(pack.dir).map((file) => ({
      name: `${pack.installName}/${file}`,
      data: readFileSync(join(pack.dir, file)),
    })),
  );
  const out = join(dist, `${addon.name}.mcaddon`);
  writeFileSync(out, zip(entries));
  console.log(`built dist/${addon.name}.mcaddon (${entries.length} files)`);
}
