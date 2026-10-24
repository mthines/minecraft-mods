// The world's "Beta APIs" experiment, saved in its level.dat. Simulated players (the NPC mod, mc test) need it.
// Only change level.dat while the server is stopped: a running server writes its own copy over it.
import { readFileSync, writeFileSync } from "node:fs";
import nbt from "prismarine-nbt";

/** @param {string} file a world's level.dat */
export async function hasBetaApis(file) {
  const { parsed } = await nbt.parse(readFileSync(file));
  return parsed.value.experiments?.value?.gametest?.value === 1;
}

/** Turns the experiment on. Returns false if it was on already. @param {string} file a world's level.dat */
export async function enableBetaApis(file) {
  const buf = readFileSync(file);
  const { parsed } = await nbt.parse(buf);
  const experiments = parsed.value.experiments?.value ?? {};
  if (experiments.gametest?.value === 1) return false;
  parsed.value.experiments = nbt.comp({
    ...experiments,
    gametest: nbt.byte(1),
    experiments_ever_used: nbt.byte(1),
    saved_with_toggled_experiments: nbt.byte(1),
  });
  const body = nbt.writeUncompressed(parsed, "little");
  const header = Buffer.alloc(8);
  header.writeInt32LE(buf.readInt32LE(0), 0);
  header.writeInt32LE(body.length, 4);
  writeFileSync(file, Buffer.concat([header, body]));
  return true;
}
