import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./addons.mjs";

/** server/data/world.env says which world the server plays; ./mc world writes it. */
export const WORLD_FILE = join(ROOT, "server", "data", "world.env");

/** The world the server plays: BEDROCK_WORLD, else world.env, else the server's default. */
export function currentWorld() {
  if (process.env.BEDROCK_WORLD) return process.env.BEDROCK_WORLD;
  const line = existsSync(WORLD_FILE) && readFileSync(WORLD_FILE, "utf8").match(/^LEVEL_NAME=(.+)$/m);
  return line ? line[1].trim() : "Bedrock level";
}
