// Catches the mistakes that make Minecraft silently ignore a pack.
import { validate } from "./lib/validate.mjs";

const { errors, count } = validate();
if (errors.length) {
  console.error(errors.map((e) => `✗ ${e}`).join("\n"));
  process.exit(1);
}
console.log(`✓ ${count} add-ons look good`);
