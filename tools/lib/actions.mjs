// The one-press actions that mc dev (a key) and the kit menu on the iPad (a tile in the Do tab) both have.
// Add one here and both get it: `args` is the ./mc command it runs. Anything that needs more than one command
// or a question first (clear inventory, find a place, the rules and worlds in the Game tab) is built in each by hand: add it to both.

/** @typedef {{ id: string, key: string, emoji: string, label: string, title: string, sub?: string, doing: string, args: string[] }} Action key: mc dev's key; label: its hint there; title, sub, doing: the tile and its toast on the web */
/** @type {Action[]} */
export const ACTIONS = [
  { id: "day", key: "d", emoji: "🌞", label: "day", title: "Make it day", doing: "Making it day", args: ["cmd", "time set day"] },
  { id: "night", key: "g", emoji: "🌙", label: "night", title: "Make it night", doing: "Making it night", args: ["cmd", "time set night"] },
  { id: "enemies", key: "e", emoji: "💀", label: "kill enemies", title: "Kill enemies", sub: "zombies, creepers…", doing: "Removing enemies", args: ["kill-enemies"] },
];
