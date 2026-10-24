// Sorts blocks into a few groups that are easy to chart: "How many trees did we chop today?"

/** @type {[string, RegExp][]} first match wins, so ores come before stone */
const CATEGORIES = [
  ["ore", /_ore$|^ancient_debris$/],
  ["wood", /_log$|_wood$|_stem$|_hyphae$/],
  ["leaves", /leaves$/],
  ["dirt", /^(dirt|grass_block|coarse_dirt|rooted_dirt|podzol|mycelium|mud|dirt_path|farmland)$/],
  ["sand", /^(sand|red_sand|gravel|clay|soul_sand|soul_soil)$/],
  [
    "stone",
    /^(stone|cobblestone|mossy_cobblestone|deepslate|cobbled_deepslate|granite|diorite|andesite|tuff|calcite|netherrack|blackstone|basalt|end_stone|sandstone|red_sandstone)$/,
  ],
  ["planks", /_planks$/],
  ["plant", /^(short_grass|tall_grass|fern|large_fern|dandelion|poppy|sugar_cane|kelp|seagrass|vine|wheat|carrots|potatoes|beetroot|leaf_litter|bush|firefly_bush|short_dry_grass|tall_dry_grass)$|_flower$|_tulip$|_sapling$/],
];

/** "minecraft:oak_log" → "oak_log"; blocks from mods keep their namespace, like "family:cake". */
export function shortName(typeId) {
  return typeId.startsWith("minecraft:") ? typeId.slice("minecraft:".length) : typeId;
}

/** "minecraft:deepslate_diamond_ore" → "ore" */
export function category(typeId) {
  const name = shortName(typeId);
  return CATEGORIES.find(([, pattern]) => pattern.test(name))?.[0] ?? "other";
}
