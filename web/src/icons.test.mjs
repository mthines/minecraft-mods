// Every kit and type needs an icon, and no two tiles on one screen may look the same: the kids can't read yet.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CATEGORIES, menuKits } from "../../tools/lib/kits.mjs";
import { avatars, ICONS, iconKey, landscapes, OPTION_ICONS, terminalIcon, typeIcon } from "./icons.js";

const kits = menuKits();
const noRepeats = (what, icons) => {
  const keys = icons.map(iconKey);
  const twice = keys.filter((key, at) => keys.indexOf(key) !== at);
  assert.deepEqual(twice, [], `${what}: these look the same: ${twice.join(" ")}`);
};

test("every type has its own icon", () => {
  for (const { name, types = [] } of kits) {
    const icons = types.map((type) => typeIcon(name, type));
    types.forEach((type, at) => assert.ok(icons[at], `no icon for ${name}-${type}: add it to ICONS in web/src/icons.js`));
    noRepeats(`types of ${name}`, icons);
  }
});

test("no kit or category looks like its neighbour", () => {
  noRepeats("categories", Object.values(CATEGORIES));
  for (const category of Object.keys(CATEGORIES)) noRepeats(`kits in ${category}`, kits.filter((kit) => kit.category === category).map((kit) => kit.emoji.trim()));
});

test("no icon is for a type that doesn't exist", () => {
  const all = new Set(kits.flatMap(({ name, types = [] }) => types.map((type) => `${name}-${type}`)));
  assert.deepEqual(Object.keys(ICONS).filter((key) => !all.has(key)), []);
});

test("players online get different animals", () => {
  const names = ["Ann", "Bo", "Cy", "Di", "Ed", "Flo", "Gus", "Hal", "Ivy", "Jo", "Kai", "Lu"];
  noRepeats("avatars", [...avatars(names).values()]);
});

test("worlds and options each look different", () => {
  noRepeats("worlds", [...landscapes(["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]).values()]);
  noRepeats("options", Object.values(OPTION_ICONS));
});

test("the terminal's icons look different too", () => {
  for (const { name, types = [] } of kits) {
    const keys = types.map((type) => { const { text, color } = terminalIcon(typeIcon(name, type)); return `${text}:${color ?? ""}`; });
    const twice = keys.filter((key, at) => keys.indexOf(key) !== at);
    assert.deepEqual(twice, [], `${name} in the terminal: ${twice.join(" ")}`);
  }
});
