// For ./mc kit (see tools/lib/kits.mjs):
//   node tools/kits.mjs names [--types]         every kit name, one a line; --types adds <kit>-<type> names
//   node tools/kits.mjs menu                    "<kit> <emoji> <kit>" lines for mc kit's list, diamond tools first
//   node tools/kits.mjs items <kit> [--craft]   "<item> <count>" lines; fails if there's no such kit
//   node tools/kits.mjs has-craft <kit>         succeeds if the kit has crafting materials
import { hasCraft, kitEmojis, kitItems, kitNames, TOOLS_EMOJI } from "./lib/kits.mjs";

const [command, name, flag] = process.argv.slice(2);
if (command === "names") console.log(kitNames(name === "--types").join("\n"));
else if (command === "menu") {
  const emojis = kitEmojis();
  console.log([`tools ${TOOLS_EMOJI} tools`, ...kitNames().map((kit) => `${kit} ${emojis.get(kit) ?? " "} ${kit}`)].join("\n"));
} else if (command === "items") {
  const items = kitItems(name ?? "", flag === "--craft");
  if (!items) process.exit(1);
  console.log(items.map(([item, count]) => `${item} ${count}`).join("\n"));
} else if (command === "has-craft") process.exit(hasCraft(name ?? "") ? 0 : 1);
else {
  console.error("Usage: node tools/kits.mjs names [--types] | menu | items <kit> [--craft] | has-craft <kit>");
  process.exit(2);
}
