// Icons for the kit menu. The kids can't read yet, so no two tiles on one screen may look the same
// (icons.test.mjs checks that for every kit): a type is a drawn shape in its own color, or its own emoji (or two).
// An icon is an emoji string, or { shape, color, pattern? } drawn by Icon.jsx.

export const COLORS = {
  white: "#f2f2f2", orange: "#f07613", magenta: "#bd44b3", "light-blue": "#3aafd9", yellow: "#f8c627", lime: "#70b919", pink: "#ed8dac",
  gray: "#3e4447", "light-gray": "#8e8e86", cyan: "#158991", purple: "#792aac", blue: "#35399d", brown: "#724728", green: "#546d1b", red: "#a12722", black: "#141519",
};

/** Kits whose types are the 16 colors: one block each, in that color, drawn in the kit's own look. */
const COLORED = { concrete: "plain", glass: "glass", terracotta: "terracotta", wool: "wool" };

const block = (color, pattern = "plain") => ({ shape: "block", color, pattern });
const ingot = (color) => ({ shape: "ingot", color });
const gem = (color) => ({ shape: "gem", color });
const nugget = (color) => ({ shape: "nugget", color });
const pile = (color) => ({ shape: "pile", color });
const lump = (color) => ({ shape: "lump", color });

/** Every other type, by "<kit>-<type>". */
export const ICONS = {
  "armor-leather": "🐄🛡️", "armor-gold": "🟡🛡️", "armor-chainmail": "⛓️🛡️", "armor-iron": "⚪🛡️", "armor-diamond": "💎🛡️", "armor-netherite": "⬛🛡️",
  "bucket-lava": "🔥🪣", "bucket-water": "💧🪣", "bucket-empty": "🪣", "bucket-milk": "🥛", "bucket-powder-snow": "❄️🪣",
  "end-eyes": "👁️", "end-portal": "🌀", "end-dragon-fight": "🐉⚔️", "end-late-game": "🌌", "end-making-eyes": "👁️🔨",
  "ground-grass": "🌿", "ground-dirt": "🟫", "ground-sand": "🏖️", "ground-red-sand": "🏜️", "ground-gravel": "🪨", "ground-clay": lump("#9fa8b5"), "ground-moss": "🍀", "ground-snow": "⛄",
  "ingots-iron": ingot("#d8d8d8"), "ingots-gold": ingot("#fcdb4a"), "ingots-copper": ingot("#c8714b"), "ingots-netherite": ingot("#4a3f45"),
  "ingots-diamond": gem("#4ee3d6"), "ingots-emerald": gem("#17dd62"), "ingots-lapis": gem("#2d4fb5"), "ingots-quartz": gem("#efe9e0"),
  "ingots-redstone": pile("#d6201a"), "ingots-coal": lump("#2b2b2b"), "ingots-iron-nugget": nugget("#d8d8d8"), "ingots-gold-nugget": nugget("#fcdb4a"),
  "ingots-charcoal": "⬛🔥", "ingots-flint": "⚡🪨", "ingots-string": "🧵", "ingots-stick": "🥢", "ingots-leather": "🐄", "ingots-feather": "🪶", "ingots-bone": "🦴",
  "ingots-gunpowder": "🧨", "ingots-paper": "📄", "ingots-slime": "🟢🫧", "ingots-glowstone-dust": "✨🟡", "ingots-clay": lump("#b0b8c6"), "ingots-brick": ingot("#a34f3a"),
  "ingots-ink-sac": "🦑", "ingots-bone-meal": "🦴✨", "ingots-sugar-cane": "🎋", "ingots-wheat": "🌾", "ingots-honeycomb": "🍯", "ingots-nether-wart": "🔴🍄",
  "light-torches": "🔥🪵", "light-soul-torches": "💙🔥", "light-glowstone": block("#f0c060"), "light-sea-lantern": block("#bfe8e4"), "light-froglights": "🐸💡",
  "light-redstone-lamps": "🔴💡", "light-end-rods": "🪄⚪", "light-candles": "🕯️",
  "rare-obsidian": "⬛", "rare-crying-obsidian": "😢🟣", "rare-nether-portal": "🌀🟣", "rare-diamond-block": block("#4ee3d6", "smooth"), "rare-gold-block": block("#fcdb4a", "smooth"),
  "rare-iron-block": block("#dcdcdc", "smooth"), "rare-emerald-block": block("#17dd62", "smooth"), "rare-lapis-block": block("#2d4fb5", "smooth"), "rare-redstone-block": block("#d6201a", "smooth"),
  "rare-netherite-block": block("#4a3f45", "smooth"), "rare-amethyst": "🔮", "rare-copper-block": block("#c8714b", "smooth"),
  "stone-stone": block("#8a8a8a"), "stone-cobblestone": block("#7a7a7a", "cobble"), "stone-mossy-cobblestone": block("#7a7a7a", "mossy"), "stone-stone-bricks": block("#8a8a8a", "bricks"),
  "stone-smooth-stone": block("#bdbdbd", "smooth"), "stone-granite": block("#a0675a"), "stone-polished-granite": block("#b0766a", "smooth"), "stone-diorite": block("#d0d0d0", "speck"),
  "stone-polished-diorite": block("#e2e2e2", "smooth"), "stone-andesite": block("#8b8b88", "speck"), "stone-polished-andesite": block("#8c9088", "smooth"),
  "stone-cobbled-deepslate": block("#4a4a50", "cobble"), "stone-deepslate-bricks": block("#3e3e44", "bricks"), "stone-deepslate-tiles": block("#3a3a40", "tiles"),
  "stone-tuff-bricks": block("#6b6b5d", "bricks"), "stone-blackstone": block("#2a2630"), "stone-polished-blackstone-bricks": block("#35303c", "bricks"),
  "stone-sandstone": block("#d9cc8f", "layers"), "stone-smooth-sandstone": block("#e6dba6", "smooth"), "stone-red-sandstone": block("#b5622d", "layers"), "stone-bricks": block("#a0523f", "bricks"),
  "stone-mud-bricks": block("#8d6e50", "bricks"), "stone-quartz": block("#f3efe8", "tiles"), "stone-prismarine": block("#5aa593", "speck"), "stone-nether-bricks": block("#3d1a1e", "bricks"),
  "stone-end-stone-bricks": block("#dbe0a0", "bricks"),
  "wood-oak": block("#c19a5f", "planks"), "wood-spruce": block("#6b4f2e", "planks"), "wood-birch": block("#d6c98a", "planks"), "wood-jungle": block("#9c6b45", "planks"),
  "wood-acacia": block("#ba6a3a", "planks"), "wood-dark-oak": block("#3e2a14", "planks"), "wood-mangrove": block("#7a2f2c", "planks"), "wood-cherry": block("#e8b3be", "planks"),
  "wood-pale-oak": block("#e6e0d6", "planks"), "wood-bamboo": block("#c9b43c", "planks"), "wood-crimson": block("#7a2a4a", "planks"), "wood-warped": block("#1f7a73", "planks"),
  "weapons-ammo-all": "🎁", "weapons-ammo-bullets": "🔫", "weapons-ammo-grenades": "💣", "weapons-ammo-missiles": "🚀",
};

/** A type's icon; clear glass and plain terracotta are the two types that aren't one of the 16 colors. Undefined if it has none (a test fails then). */
export function typeIcon(kit, type) {
  const look = COLORED[kit];
  if (look) {
    if (kit === "glass" && type === "clear") return block("#aee3ee", "glass");
    if (kit === "terracotta" && type === "plain") return { ...block("#a0583c", "terracotta"), swatch: "#c0724f" };
    if (!COLORS[type]) return undefined;
    // Terracotta is dulled, and dulled colors blur together in the terminal: it draws the real ones.
    return look === "terracotta" ? { ...block(muted(COLORS[type]), look), swatch: COLORS[type] } : block(COLORS[type], look);
  }
  return ICONS[`${kit}-${type}`];
}

/** Terracotta is the dyed colors, dulled toward clay. @param {string} hex */
function muted(hex) {
  const mix = (a, b) => Math.round(a * 0.55 + b * 0.45);
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `#${[mix(r, 150), mix(g, 90), mix(b, 66)].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

/** Two icons look the same when they're the same emoji or the same drawing. */
export const iconKey = (icon) => (typeof icon === "string" ? icon : `${icon.shape}:${icon.pattern ?? ""}:${icon.color}`);

/** A different picture from `pool` for each name: the same name gets the same one, and two names never share one. @param {string[]} names @param {string[]} pool */
function pictures(names, pool) {
  const taken = new Set();
  return new Map([...names].sort().map((name) => {
    let at = [...name].reduce((sum, ch) => (sum * 31 + ch.charCodeAt(0)) >>> 0, 7) % pool.length;
    while (taken.has(at) && taken.size < pool.length) at = (at + 1) % pool.length;
    taken.add(at);
    return [name, pool[at]];
  }));
}

/** The animals for players online. */
export const avatars = (names) => pictures(names, ["🐶", "🐱", "🐻", "🦊", "🐸", "🐵", "🦁", "🐼", "🐨", "🐯", "🐰", "🐧", "🦄", "🐙", "🦖", "🐢"]);

/** The landscapes for worlds. */
export const landscapes = (names) => pictures(names, ["🏝️", "🏔️", "🌋", "🏜️", "🌲", "🏞️", "🌅", "🏙️", "🏕️", "🗻", "🌄", "🏰", "🌾", "🌴", "🏖️", "⛰️"]);

/** The on/off options in the Game tab: a picture each, in the order the server lists them. */
export const OPTION_ICONS = { peace: "🕊️", invincible: "⭐🛡️", "fall-damage": "🪂", pvp: "⚔️", "keep-inventory": "💀🎒" };
export const OPTION_NAMES = { peace: "Peace mode", invincible: "Invincible", "fall-damage": "Fall damage", pvp: "Fight each other", "keep-inventory": "Keep my stuff" };
export const OPTION_HINTS = { peace: "no monsters", invincible: "nothing hurts", "fall-damage": "falling hurts", pvp: "players hurt players", "keep-inventory": "when you die" };

// ── The terminal (mc dev's kit menu) ──
// It can't draw pictures, so a shape becomes colored glyphs (▦ for bricks, ◆ for a gem) in the nearest of the terminal's 256 colors.
const GLYPHS = { plain: "██", smooth: "▓▓", bricks: "▦▦", cobble: "▩▩", mossy: "▨▨", speck: "░░", tiles: "▥▥", layers: "▤▤", planks: "▤▤", glass: "▒▒", wool: "▒▒", terracotta: "██" };
const SHAPES = { ingot: "▬▬", gem: "◆ ", nugget: "● ", pile: "▲ ", lump: "◉ " };

/** The nearest color of the 256 a terminal has, for #rrggbb: the 6×6×6 cube or the 24 greys. @param {string} hex */
export function color256(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const level = (/** @type {number} */ c) => Math.min(5, Math.round(Math.max(0, c - 35) / 40));
  const cube = [level(r), level(g), level(b)].map((l) => (l ? 55 + l * 40 : 0));
  const grey = Math.min(23, Math.max(0, Math.round((((r + g + b) / 3) - 8) / 10)));
  const dist = (/** @type {number[]} */ c) => (r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2;
  const g256 = 8 + grey * 10;
  return dist([g256, g256, g256]) < dist(cube) ? 232 + grey : 16 + 36 * level(r) + 6 * level(g) + level(b);
}

/** An icon for the terminal: its text, and the 256-color number to draw it in (none for an emoji). @param {string | { shape: string, color: string, pattern?: string, swatch?: string }} icon */
export function terminalIcon(icon) {
  if (typeof icon === "string") return { text: icon };
  return { text: icon.shape === "block" ? GLYPHS[icon.pattern ?? "plain"] : SHAPES[icon.shape], color: color256(icon.swatch ?? icon.color) };
}

/** Any other item (kit "item:<name>", found by searching): a picture by what its name says, else a box. Only the names are different, so the name is on the tile. */
const ITEM_LOOKS = [
  [/diamond/, "💎"], [/emerald/, "💚"], [/gold/, "🟡"], [/iron/, "⚪"], [/copper/, "🟠"], [/netherite/, "⬛"], [/redstone/, "🔴"], [/lapis/, "🔵"], [/coal|charcoal/, "⬛"],
  [/sword/, "🗡️"], [/pickaxe/, "⛏️"], [/_axe$/, "🪓"], [/shovel/, "🪏"], [/hoe$/, "🌾"], [/^bow$|arrow/, "🏹"], [/helmet|chestplate|leggings|boots|shield/, "🛡️"],
  [/spawn_egg/, "🥚"], [/boat|raft/, "🛶"], [/minecart|rail/, "🚃"], [/bucket/, "🪣"], [/potion|bottle/, "🧪"], [/book/, "📕"], [/door|gate/, "🚪"], [/bed$/, "🛏️"],
  [/log|planks|wood|stem|stick|sign/, "🪵"], [/leaves|sapling|grass|fern|flower|tulip|rose|azalea/, "🌿"], [/glass/, "🪟"], [/wool|carpet/, "🧶"], [/torch|lantern|candle|lamp/, "🔦"],
  [/apple|bread|beef|pork|chicken|mutton|cod|salmon|carrot|potato|melon|berries|cookie|cake|pie|stew|soup/, "🍎"], [/dye|banner/, "🎨"], [/music_disc/, "💿"], [/fish/, "🐟"],
  [/stone|brick|deepslate|tuff|ore|cobble|granite|diorite|andesite|slab|stairs|wall/, "🧱"],
];
export const itemIcon = (name) => ITEM_LOOKS.find(([pattern]) => pattern.test(name))?.[1] ?? "📦";
