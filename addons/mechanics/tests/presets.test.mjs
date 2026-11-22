import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { typeIcon } from "../../../web/src/icons.js";
import { PRESETS, presetItem } from "../behavior_pack/scripts/catalog.js";

const path = (rest) => fileURLToPath(new URL(`../${rest}`, import.meta.url));
const garage = JSON.parse(readFileSync(path("kit-garage.json"), "utf8"));
const lang = readFileSync(path("resource_pack/texts/en_US.lang"), "utf8");

for (const name of Object.keys(PRESETS)) {
  test(`the ${name} preset has an item, a picture, a name, a kit type and an icon`, () => {
    const id = presetItem(name);
    const short = id.slice("family:".length);
    assert.ok(existsSync(path(`behavior_pack/items/${short}.json`)), "item file");
    assert.ok(existsSync(path(`resource_pack/textures/items/${short}.png`)), "item picture");
    assert.ok(JSON.parse(readFileSync(path("resource_pack/textures/item_texture.json"), "utf8")).texture_data[`family_${short}`], "item texture entry");
    assert.ok(lang.includes(`item.${id}=`), "lang entry");
    assert.deepEqual(garage.types[name], [[id, 1]], "kit type");
    assert.ok(typeIcon("mechanics-garage", name), "icon in web/src/icons.js");
  });
}

test("the garage has a type for every preset and nothing else", () => {
  assert.deepEqual(Object.keys(garage.types).sort(), Object.keys(PRESETS).sort());
});
