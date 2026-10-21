import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const ADDONS_DIR = join(ROOT, "addons");
export const PACK_KINDS = { behavior_pack: "BP", resource_pack: "RP" };

/** Every add-on folder, with the packs it contains. */
export function listAddons() {
  return readdirSync(ADDONS_DIR)
    .filter((name) => statSync(join(ADDONS_DIR, name)).isDirectory())
    .sort()
    .map((name) => {
      const dir = join(ADDONS_DIR, name);
      const packs = Object.entries(PACK_KINDS)
        .filter(([folder]) => existsSync(join(dir, folder, "manifest.json")))
        .map(([folder, suffix]) => {
          const packDir = join(dir, folder);
          return {
            folder,
            dir: packDir,
            installName: `${name}_${suffix}`,
            manifest: JSON.parse(readFileSync(join(packDir, "manifest.json"), "utf8")),
          };
        });
      return { name, dir, packs };
    });
}

/** Every file under dir, as paths relative to dir with forward slashes. */
export function walk(dir, base = dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full, base) : [relative(base, full).split("\\").join("/")];
  });
}
