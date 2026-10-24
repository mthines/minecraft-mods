// node tools/install.mjs <file.mcaddon | file.mcpack | file.zip | folder> [name]
// Puts a downloaded add-on into addons/<name>, the same shape as our own, so deploy and watch handle it.
// Installing a newer file of an add-on that's already here updates it.
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { ADDONS_DIR } from "./lib/addons.mjs";
import { validate } from "./lib/validate.mjs";

const [source, nameArg] = process.argv.slice(2);
const chosenName = nameArg || undefined;
if (!source || !existsSync(source)) {
  console.error("Usage: ./mc install <file.mcaddon | file.mcpack | folder> [name]");
  process.exit(1);
}

const work = mkdtempSync(join(tmpdir(), "mc-install-"));
try {
  const packs = findPacks(unpack(resolve(source)));
  if (packs.length === 0) throw new Error("No packs in there: a pack is a folder with a manifest.json.");

  // One behavior pack and one resource pack become one add-on; anything bigger, one add-on per pack.
  const fallback = slug(basename(source, extname(source)));
  const kinds = packs.map((p) => p.folder);
  const together = kinds.filter((k) => k === "behavior_pack").length <= 1 && kinds.filter((k) => k === "resource_pack").length <= 1;
  const groups = together
    ? [{ name: chosenName ?? slug(packs.find((p) => p.folder === "behavior_pack")?.name ?? packs[0].name) ?? fallback, packs }]
    : packs.map((p) => ({ name: [chosenName, slug(p.name) ?? fallback].filter(Boolean).join("-"), packs: [p] }));

  for (const { name } of groups) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(name ?? "")) throw new Error(`"${name}" can't be an add-on name. Pick one: ./mc install <file> my-mod`);
  }

  /** @type {{ dir: string, backup?: string }[]} */
  const changed = [];
  const report = [];
  for (const group of groups) {
    const dir = join(ADDONS_DIR, group.name); // a folder inside addons/, never addons/ itself (checked above)
    const before = existsSync(dir) ? versions(dir) : undefined;
    let backup;
    if (before) renameSync(dir, (backup = join(work, `old-${group.name}`)));
    changed.push({ dir, backup });
    for (const pack of group.packs) cpSync(pack.dir, join(dir, pack.folder), { recursive: true });
    const after = versions(dir);
    report.push(before ? `Updated ${group.name}: ${before} → ${after}` : `Installed ${group.name} ${after} in addons/${group.name}`);
  }

  const { errors } = validate();
  if (errors.length) {
    // Put everything back the way it was.
    for (const { dir, backup } of changed) {
      rmSync(dir, { recursive: true, force: true });
      if (backup) renameSync(backup, dir);
    }
    throw new Error(`Not installed, the add-on has problems:\n${errors.map((e) => `  ${e}`).join("\n")}`);
  }
  for (const line of report) console.log(line);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  rmSync(work, { recursive: true, force: true });
}

/** Unzips a file (and any .mcpack inside it) into the work folder, or returns a folder as it is. */
function unpack(path) {
  if (statSync(path).isDirectory()) return path;
  const out = join(work, "unpacked");
  unzip(path, out);
  for (const inner of walkFiles(out).filter((f) => /\.(mcpack|zip)$/i.test(f))) {
    unzip(inner, join(dirname(inner), basename(inner, extname(inner))));
  }
  return out;
}

/** @param {string} file @param {string} to */
function unzip(file, to) {
  try {
    execFileSync("unzip", ["-q", "-o", file, "-d", to]);
  } catch {
    throw new Error(`Couldn't unzip ${basename(file)}. Is it a .mcaddon or .mcpack file? (Needs the unzip command.)`);
  }
}

/** Every folder with a manifest.json, with the kind of pack it is. */
function findPacks(root) {
  return walkFiles(root)
    .filter((f) => basename(f) === "manifest.json" && !f.includes("__MACOSX"))
    .map((file) => {
      const dir = dirname(file);
      const manifest = JSON.parse(readFileSync(file, "utf8"));
      const types = (manifest.modules ?? []).map((m) => m.type);
      if (types.includes("skin_pack") || types.includes("world_template")) {
        throw new Error(`${manifest.header?.name ?? dir} is a ${types.join("/")}, not an add-on. Open it in Minecraft instead.`);
      }
      return { dir, folder: types.includes("resources") ? "resource_pack" : "behavior_pack", name: packName(dir, manifest) };
    });
}

/** The pack's name; many packs keep it in texts/en_US.lang instead of the manifest. */
function packName(dir, manifest) {
  const name = manifest.header?.name ?? "";
  if (name !== "pack.name") return name;
  const lang = join(dir, "texts", "en_US.lang");
  const line = existsSync(lang) && readFileSync(lang, "utf8").match(/^pack\.name=(.+)$/m);
  return line ? line[1].trim() : "";
}

/** "Super Cool Mod! (BP)" → "super-cool-mod" */
function slug(text) {
  const s = (text ?? "").toLowerCase().replace(/\b(bp|rp|behaviou?r|resources?)\b|\bpack\b/g, " ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s || undefined;
}

/** "1.0.0" for one pack, or "1.0.0 + 1.0.0" for behavior + resource. */
function versions(dir) {
  return ["behavior_pack", "resource_pack"]
    .filter((folder) => existsSync(join(dir, folder, "manifest.json")))
    .map((folder) => (JSON.parse(readFileSync(join(dir, folder, "manifest.json"), "utf8")).header?.version ?? []).join("."))
    .join(" + ");
}

/** @param {string} dir @returns {string[]} */
function walkFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walkFiles(full) : [full];
  });
}
