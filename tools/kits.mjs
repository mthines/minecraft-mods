// For ./mc kit (see tools/lib/kits.mjs):
//   node tools/kits.mjs names [--types]         every kit name, one a line; --types adds <kit>-<type> names
//   node tools/kits.mjs items <kit> [--craft]   "<item> <count>" lines; fails if there's no such kit
//   node tools/kits.mjs has-craft <kit>         succeeds if the kit has crafting materials
import { hasCraft, kitItems, kitNames } from "./lib/kits.mjs";

const [command, name, flag] = process.argv.slice(2);
if (command === "names") console.log(kitNames(name === "--types").join("\n"));
else if (command === "items") {
  const items = kitItems(name ?? "", flag === "--craft");
  if (!items) process.exit(1);
  console.log(items.map(([item, count]) => `${item} ${count}`).join("\n"));
} else if (command === "has-craft") process.exit(hasCraft(name ?? "") ? 0 : 1);
else {
  console.error("Usage: node tools/kits.mjs names [--types] | items <kit> [--craft] | has-craft <kit>");
  process.exit(2);
}
