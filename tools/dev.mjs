// mc dev: a full-screen view that starts the server, sends saved changes to it once that is on (watch.mjs, o then s),
// and runs ./mc commands on a key press: kits, tests, worlds, day, peace, fall damage, and more.
import { spawn, execFile } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { ADDONS_DIR, ROOT } from "./lib/addons.mjs";
import { kitEmojis, kitLabels, kitNames, materials, TOOLS_EMOJI } from "./lib/kits.mjs";
import { recentInstructions } from "./lib/npc-history.mjs";
import { currentWorld } from "./lib/world.mjs";
import { onSave, sendSaves, waiting, watchAddons } from "./watch.mjs";

const run = promisify(execFile);
const CONTAINER = process.env.BEDROCK_CONTAINER ?? "family-bedrock";
const PROPS = join(ROOT, "server", "data", "server.properties");
const WORLDS = join(ROOT, "server", "data", "worlds");
const MAX_LINES = 2000;
const out = process.stdout;

/** @param {string | number} code */
const ansi = (code) => (/** @type {string} */ s) => `\x1b[${code}m${s}\x1b[0m`;
const plain = (/** @type {string} */ s) => s;
const S = {
  bold: ansi(1),
  dim: ansi(2),
  red: ansi(31),
  green: ansi(32),
  yellow: ansi(33),
  cyan: ansi(36),
  bar: ansi("1;30;42"),
  key: ansi("1;30;47"),
  tab: ansi("1;30;46"),
};

/** @typedef {{ text: string, color?: (s: string) => string, open?: boolean }} Line */
/** @type {Line[]} what happened: saved changes, and the commands you ran */
const activity = [];
/** @type {Line[]} the server's own log since it last started */
const serverLog = [];
/** @type {"activity" | "server"} */
let view = "activity";
let scroll = 0; // rows scrolled up from the newest line
/** @typedef {{ more?: (value: string) => void, moreLabel?: string, back?: () => void }} PickExtras → opens more for a choice (moreLabel says what, in the hints), ← goes back */
/** @typedef {{ label: string, value: string, state?: [string, (s: string) => string], hidden?: boolean }} Choice state: shown at the right, like "● on"; hidden: only shown when something is typed */
/** @type {null | { title: string, choices: Choice[], filter: string, number: string, index: number, then: (value: string) => void } & PickExtras} number: digits typed so far */
let picker = null;
/** @type {null | { row: number, first: number, count: number, left: number, right: number }} where the picker's choices are on screen (1-based, like mouse clicks), for clicking them */
let pickerArea = null;
let mouse = false; // whether the terminal reports clicks: only while a picker is open, so log text can be selected otherwise
/** @type {null | { prompt: string, text: string, then: (text: string) => void }} */
let input = null;
/** @type {null | { question: string, then: () => void }} */
let confirm = null;
/** @type {null | { name: string, child: import("node:child_process").ChildProcess }} */
let action = null;
/** @type {{ args: string[], then?: (ok: boolean) => void, question?: string }[]} commands asked for while one runs, to run after it in order */
const queue = [];
let watching = false;
let kitCraft = false; // whether the k key's kits come with their crafting table and materials (mc kit --craft)
/** @type {null | { args: string[], question?: string }} the last ./mc command, for . to run again; question: asked again first */
let last = null;
/** @type {string | undefined} the question just answered with y, while its command starts */
let confirmed;
const server = { running: false, health: "", startedAt: "", players: new Set(), peace: false, fallDamage: /** @type {boolean | undefined} */ (undefined), keepInventory: /** @type {boolean | undefined} */ (undefined), pvp: /** @type {boolean | undefined} */ (undefined), invincible: /** @type {boolean | undefined} */ (undefined), showCoordinates: /** @type {boolean | undefined} */ (undefined), world: currentWorld() };
/** @type {import("node:child_process").ChildProcess | undefined} */
let follower;

// ── Lines ──────────────────────────────────────────────────────────────────

const time = () => new Date().toLocaleTimeString();

/** @param {Line[]} lines @param {string} text @param {Line["color"]} [color] */
function push(lines, text, color) {
  lines.push({ text, color });
  if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES);
  draw();
}

/** A note in the activity list, with the time in front. */
const note = (/** @type {string} */ text, /** @type {Line["color"]} */ color) => push(activity, `[${time()}] ${text}`, color);

/** A note that answers a key press, so it switches to the activity list where it shows. */
function tell(/** @type {string} */ text, /** @type {Line["color"]} */ color) {
  view = "activity";
  scroll = 0;
  note(text, color);
}

/**
 * Feeds a stream into lines. Text without a newline yet (like "Waiting......") shows as it grows.
 * @param {Line[]} lines @param {string} indent @param {(line: string) => void} [onLine]
 */
function feed(lines, indent, onLine) {
  return (/** @type {Buffer} */ chunk) => {
    const parts = chunk.toString().replaceAll("\r", "").split("\n");
    parts.forEach((part, i) => {
      const last = lines.at(-1);
      if (i === 0 && last?.open) last.text += part;
      else if (part || i < parts.length - 1) push(lines, indent + part);
      const line = lines.at(-1);
      if (!line) return;
      line.open = i === parts.length - 1 && part !== "";
      if (i < parts.length - 1) onLine?.(line.text);
    });
    draw();
  };
}

/** @param {string} text */
function colorOf(text) {
  if (/✗|ERROR\]|failed|Error:/.test(text)) return S.red;
  if (/⚠|WARN\]/.test(text)) return S.yellow;
  if (/✓|ready!|Gave |back up|Player connected/.test(text)) return S.green;
  if (/↻|⟳|^\[[^\]]+\] \$ /.test(text)) return S.cyan;
  if (/Player disconnected/.test(text)) return S.yellow;
  return plain;
}

// ── Drawing ────────────────────────────────────────────────────────────────

/** @typedef {[string, ((s: string) => string)?]} Segment */

const graphemes = new Intl.Segmenter();
/** How many columns the terminal draws a character in: emoji (like the kits' 🪵) take two. @param {string} char */
const columns = (char) => (/\p{Emoji_Presentation}|\uFE0F/u.test(char) ? 2 : 1);
/** @param {string} text */
const chars = (text) => [...graphemes.segment(text)].map(({ segment }) => segment);

/** Cuts and pads styled segments to exactly `width` columns. @param {Segment[]} segments */
function fit(segments, width, fill = plain) {
  let left = width;
  let row = "";
  for (const [text, style = plain] of segments) {
    if (left <= 0) break;
    let shown = "";
    for (const char of chars(text)) {
      if (columns(char) > left) break;
      left -= columns(char);
      shown += char;
    }
    row += style(shown);
  }
  return row + fill(" ".repeat(Math.max(0, left)));
}

const len = (/** @type {Segment[]} */ segments) => segments.reduce((n, [text]) => n + chars(text).reduce((sum, char) => sum + columns(char), 0), 0);

/** Breaks a line at spaces, and indents the rows after the first. @param {string} text */
function wrap(text, width) {
  const indent = [...`${text.match(/^\s*/)?.[0] ?? ""}  `].slice(0, Math.floor(width / 2));
  const rows = [];
  let rest = [...text];
  while (rest.length > width) {
    let cut = rest.lastIndexOf(" ", width);
    if (cut <= indent.length) cut = width;
    rows.push(rest.slice(0, cut).join(""));
    rest = [...indent, ...rest.slice(cut).join("").trimStart()];
  }
  rows.push(rest.join(""));
  return rows;
}

/** "[2026-10-22 19:41:31:840 INFO] Server started." reads as "19:41:31 Server started." @param {string} text */
const shorten = (text) => text.replace(/^\[\d{4}-\d\d-\d\d (\d\d:\d\d:\d\d):\d+ (\w+)\] ?/, (_, t, level) => (level === "INFO" ? `${t} ` : `${t} ${level} `));

function statusSegments() {
  /** @type {Segment[]} */
  const dot = !server.running
    ? [["● Stopped", S.red]]
    : server.health === "unhealthy"
      ? [["● Not accepting joins", S.red]]
      : server.health === "starting"
        ? [["● Starting", S.yellow]]
        : [["● Joinable", S.green]];
  const players = [...server.players];
  return [
    [" "],
    ...dot,
    ["   World ", S.dim],
    [server.world, S.bold],
    ["   Players ", S.dim],
    [players.length ? `${players.length}: ${players.join(", ")}` : "none", players.length ? S.bold : S.dim],
    ["   Peace ", S.dim],
    [server.peace ? "on" : "off", S.bold],
    ["   Fall damage ", S.dim],
    [server.fallDamage === undefined ? "?" : server.fallDamage ? "on" : "off", S.bold],
    ["   PvP ", S.dim],
    [server.pvp === undefined ? "?" : server.pvp ? "on" : "off", S.bold],
    ["   Invincible ", S.dim],
    [server.invincible === undefined ? "?" : server.invincible ? "on" : "off", S.bold],
    ["   Keep inventory ", S.dim],
    [server.keepInventory === undefined ? "?" : server.keepInventory ? "on" : "off", S.bold],
    ["   Coordinates ", S.dim],
    [server.showCoordinates === undefined ? "?" : server.showCoordinates ? "on" : "off", S.bold],
    ["   Kit crafting ", S.dim],
    [kitCraft ? "on" : "off", S.bold],
    ["   Saves ", S.dim],
    ...saveSegments(),
    ...(/** @type {Segment[]} */ (action ? [["   running: ", S.dim], [`mc ${action.name}`, S.yellow]] : [])),
    ...(/** @type {Segment[]} */ (queue.length ? [[`   next: ${queue.length}`, S.yellow]] : [])),
  ];
}

/** What saving a file does now, for the status row. @returns {Segment[]} */
function saveSegments() {
  if (!watching) return [["not watching yet", S.yellow]];
  if (!onSave.send) return [[`not sent${waiting() ? ` (${waiting()} waiting)` : ""}`, S.yellow]];
  return [[onSave.alwaysRestart ? "restart the server" : "reload scripts", S.bold]];
}

/** The key hints at the bottom, wrapped into as many rows as they need. */
function hintRows(width) {
  if (input) return [fit([[` ${input.prompt} `, S.key], [` ${input.text}`], ["▌", S.dim], ["   enter run · esc cancel", S.dim]], width)];
  if (confirm) return [fit([[` ${confirm.question} `, S.key], ["  enter/y yes · any other key no", S.dim]], width)];
  /** @type {[string, string][]} */
  const keys = picker
    ? [
        ["type", "filter"],
        ["↑↓", "choose"],
        ["enter/click", "pick"],
        ["1-99", "go to number"],
        ...(picker.more ? [["→", picker.moreLabel ?? "more"]] : []),
        ...(picker.back ? [["←", "back"]] : []),
        ["esc", "cancel"],
      ]
    : [
        // An emoji on each action, so kids spot it at a glance: ones always drawn two columns wide, like the kits'.
        ["k", "🎒 kit"],
        ["t", "🧪 test"],
        ["w", "🌍 world"],
        ["n", "🤖 NPC"],
        ["d", "🌞 day"],
        ["e", "💀 kill enemies"],
        ["j", "🧭 find a place"],
        ["x", "🧹 clear inventory"],
        ["o", "🔧 options"],
        ["a", "🔄 reload (no kick)"],
        ["r", "🔁 restart"],
        ...(last ? [[".", `⏪ again: mc ${last.args.join(" ").slice(0, 30)}`]] : []),
        ["tab", view === "activity" ? "server log" : "activity"],
        ["↑↓", "scroll"],
        ["q", "quit"],
      ];
  /** @type {Segment[][]} */
  const rows = [[]];
  for (const [key, label] of keys) {
    /** @type {Segment[]} */
    const hint = [[` ${key} `, S.key], [` ${label}  `]];
    if (len(rows.at(-1) ?? []) + len(hint) > width - 1 && rows.at(-1)?.length) rows.push([]);
    rows.at(-1)?.push(...hint);
  }
  return rows.map((row) => fit([[" "], ...row], width));
}

/** @param {Line[]} lines */
function bodyRows(lines, width, height) {
  /** @type {string[]} */
  const rows = [];
  for (let i = lines.length - 1; i >= 0 && rows.length < height + scroll; i--) {
    const { text, color = colorOf(text) } = lines[i];
    rows.unshift(...wrap(shorten(text), width - 1).map((row) => ` ${color(row)}`));
  }
  scroll = Math.max(0, Math.min(scroll, rows.length - height));
  const shown = rows.slice(Math.max(0, rows.length - height - scroll), rows.length - scroll);
  while (shown.length < height) shown.push("");
  return shown;
}

/** Draws the picker as a box over the middle of the body. @param {string[]} body */
function drawPicker(body, width) {
  if (!picker) return;
  const boxWidth = Math.min(44, width - 4);
  const left = " ".repeat(Math.max(0, Math.floor((width - boxWidth) / 2)));
  const visible = Math.max(1, body.length - 4);
  const choices = shownChoices();
  const first = Math.max(0, Math.min(picker.index - Math.floor(visible / 2), choices.length - visible));
  /** @type {Segment[]} */
  const filter = picker.number ? [[`  ${picker.number}`, S.bold], ["▌", S.dim]] : picker.filter ? [[`  ${picker.filter}`], ["▌", S.dim]] : [["  type to filter", S.dim]];
  const rows = [
    left + S.dim(`╭${"─".repeat(boxWidth - 2)}╮`),
    left + S.dim("│") + fit([[` ${picker.title}`, S.bold], ...filter], boxWidth - 2) + S.dim("│"),
    ...(choices.length ? [] : [left + S.dim("│") + fit([["   nothing matches", S.dim]], boxWidth - 2) + S.dim("│")]),
    ...choices.slice(first, first + visible).map(({ label, state }, i) => {
      const chosen = first + i === picker?.index;
      const style = chosen ? S.tab : plain;
      const key = String(first + i + 1).padStart(String(choices.length).length);
      /** @type {Segment[]} */
      const row = [[`${chosen ? " ▸" : "  "} ${key} ${label}`, style]];
      if (state) row.push([" ".repeat(Math.max(1, boxWidth - 3 - len(row) - [...state[0]].length)), style], [state[0], chosen ? S.tab : state[1]]);
      return left + S.dim("│") + fit(row, boxWidth - 2, style) + S.dim("│");
    }),
    left + S.dim(`╰${"─".repeat(boxWidth - 2)}╯`),
  ];
  const top = Math.max(0, Math.floor((body.length - rows.length) / 2));
  rows.forEach((row, i) => {
    if (top + i < body.length) body[top + i] = row;
  });
  // The body starts on the 4th screen row, and the choices below the border and the title.
  const count = Math.min(visible, choices.length, body.length - top - 2);
  pickerArea = { row: 4 + top + 2, first, count, left: left.length + 1, right: left.length + boxWidth };
}

/** Turns click reporting on while a picker is open, and off again after. */
function setMouse() {
  if (!!picker === mouse) return;
  mouse = !!picker;
  out.write(mouse ? "\x1b[?1000h\x1b[?1006h" : "\x1b[?1000l\x1b[?1006l");
}

function render() {
  // One column spare: writing the last column, or a symbol the terminal draws wide (like ●), wraps the row,
  // which pushes the whole screen down and the bottom row of keys out of sight.
  const width = (out.columns || 80) - 1;
  const height = out.rows || 24;
  const clock = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const title = " Family Minecraft server · mc dev";
  const header = fit([[title], [" ".repeat(Math.max(1, width - title.length - clock.length - 1))], [clock]], width, S.bar);
  const tabs = (/** @type {typeof view} */ name, /** @type {string} */ label) => [` ${label} `, view === name ? S.tab : S.dim];
  const above = scroll ? `  ↑ ${scroll} rows up · end jumps back` : "";
  const tabRow = fit([[" "], /** @type {Segment} */ (tabs("activity", "Activity")), [" "], /** @type {Segment} */ (tabs("server", "Server log")), [above, S.yellow]], width);
  const hints = hintRows(width);
  const bodyHeight = Math.max(1, height - 4 - hints.length);
  const body = bodyRows(view === "activity" ? activity : serverLog, width, bodyHeight);
  pickerArea = null;
  drawPicker(body, width);
  setMouse();
  const rows = [header, fit(statusSegments(), width), tabRow, ...body, S.dim("─".repeat(width)), ...hints];
  out.write(`\x1b[H${rows.map((row) => `${row}\x1b[0m\x1b[K`).join("\r\n")}\x1b[J`);
}

let drawing = false;
function draw() {
  if (drawing || !out.isTTY) return;
  drawing = true;
  setImmediate(() => {
    drawing = false;
    render();
  });
}

// ── The server ─────────────────────────────────────────────────────────────

async function refreshStatus() {
  try {
    const format = "{{.State.Running}} {{.State.StartedAt}} {{if .State.Health}}{{.State.Health.Status}}{{end}}";
    const { stdout } = await run("docker", ["inspect", "-f", format, CONTAINER]);
    const [running, startedAt, health = ""] = stdout.trim().split(" ");
    server.running = running === "true";
    server.health = health;
    if (server.running && startedAt !== server.startedAt) followLog(startedAt);
  } catch {
    server.running = false;
    server.health = "";
  }
  server.world = currentWorld();
  server.peace = existsSync(PROPS) && /^difficulty=peaceful/m.test(readFileSync(PROPS, "utf8"));
  draw();
}

/** Follows the server log since it started, and keeps track of who is online. @param {string} startedAt */
function followLog(startedAt) {
  follower?.kill();
  server.startedAt = startedAt;
  server.players.clear();
  if (serverLog.length) push(serverLog, `── the server started again at ${new Date(startedAt).toLocaleTimeString()} ──`, S.dim);
  follower = spawn("docker", ["logs", "-f", "--since", startedAt, CONTAINER]);
  const onLine = (/** @type {string} */ line) => {
    const joined = line.match(/Player connected: ([^,]+),/);
    const left = line.match(/Player disconnected: ([^,]+),/);
    if (joined) server.players.add(joined[1]);
    if (left) server.players.delete(left[1]);
    // The game rules show in the log when asked for ("falldamage = true") and when changed.
    const fall = line.match(/falldamage(?: =| has been updated to) (true|false)/);
    if (fall) server.fallDamage = fall[1] === "true";
    const keep = line.match(/keepinventory(?: =| has been updated to) (true|false)/);
    if (keep) server.keepInventory = keep[1] === "true";
    const pvp = line.match(/\bpvp(?: =| has been updated to) (true|false)/);
    if (pvp) server.pvp = pvp[1] === "true";
    const invincible = line.match(/invincible(?: =| has been updated to) (true|false)/); // the invincible mod answers like a game rule
    if (invincible) server.invincible = invincible[1] === "true";
    const coordinates = line.match(/showcoordinates(?: =| has been updated to) (true|false)/);
    if (coordinates) server.showCoordinates = coordinates[1] === "true";
  };
  follower.stdout?.on("data", feed(serverLog, "", onLine));
  follower.stderr?.on("data", feed(serverLog, "", onLine));
}

/**
 * Runs ./mc with these arguments and shows what it prints. One at a time: asked for while one runs, it waits its turn.
 * @param {string[]} args @param {(ok: boolean) => void} [then] @param {string | undefined} [question]
 */
function mc(args, then, question = confirmed) {
  if (action) {
    queue.push({ args, then, question });
    note(`… mc ${args.join(" ")} runs when mc ${action.name} is done`, S.dim);
    return void draw();
  }
  if (args[0] !== "start") last = { args, question }; // mc dev starts the server itself; that's not one to repeat
  view = "activity";
  scroll = 0;
  note(`$ mc ${args.join(" ")}`);
  const child = spawn(join(ROOT, "mc"), args, { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
  action = { name: args[0], child };
  child.stdout?.on("data", feed(activity, "    "));
  child.stderr?.on("data", feed(activity, "    "));
  child.on("close", (code) => {
    action = null;
    if (code) note(`✗ mc ${args[0]} failed`);
    refreshStatus();
    then?.(code === 0);
    const next = action ? undefined : queue.shift(); // then may have started one itself: the queue waits for that
    if (next) mc(next.args, next.then, next.question);
  });
  draw();
}

// ── Keys ───────────────────────────────────────────────────────────────────

/** The saved worlds, by folder name. */
const worlds = () =>
  existsSync(WORLDS)
    ? readdirSync(WORLDS, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort()
    : [];
const tested = () => readdirSync(ADDONS_DIR).filter((mod) => existsSync(join(ADDONS_DIR, mod, "tests", "e2e.js")));

/** @param {string} title @param {Choice[]} choices @param {(value: string) => void} then @param {PickExtras} [extras] */
const pick = (title, choices, then, extras = {}) => void (picker = { title, choices, filter: "", number: "", index: 0, then, ...extras });

/** Picks the highlighted choice. */
function pickChosen() {
  const choice = picker && shownChoices()[picker.index];
  if (!picker || !choice) return;
  const { then } = picker;
  picker = null;
  then(choice.value);
}

/**
 * A digit typed in the picker moves the highlight to that number, and Enter picks it: 2 9 Enter picks the 29th.
 * A digit that makes a number past the end starts a new number instead, so typing again fixes a typo.
 * @param {string} digit
 */
function typeNumber(digit) {
  if (!picker) return;
  const count = shownChoices().length;
  const number = [picker.number + digit, digit].find((typed) => Number(typed) >= 1 && Number(typed) <= count);
  if (!number) return;
  picker.number = number;
  picker.index = Number(number) - 1;
}

/** The picker's choices that match what was typed. */
function shownChoices() {
  const typed = picker?.filter.toLowerCase() ?? "";
  return (picker?.choices ?? []).filter(({ label, hidden }) => (!hidden || typed) && label.toLowerCase().includes(typed));
}

const KICK = "Everyone playing gets kicked.";

/** The w key: pick a world to play, or press → on one for what else you can do with it. */
function worldMenu() {
  const NEW = "\0new";
  const choices = worlds().map((w) => ({ label: w === server.world ? `${w}  (playing now)` : w, value: w }));
  pick(
    "Play which world?",
    [...choices, { label: "+ a new world", value: NEW }],
    (world) => {
      if (world === NEW) return askNewWorld();
      if (world === server.world) return tell(`The server plays ${world} already.`);
      confirm = { question: `Switch to ${world}? ${KICK}`, then: () => mc(["world", "play", world]) };
    },
    { more: (world) => (world === NEW ? askNewWorld() : worldActions(world)) },
  );
}

/** What you can do with one world: play, rename, or delete it. @param {string} world */
function worldActions(world) {
  const playing = world === server.world;
  pick(
    playing ? `${world}  (playing now)` : world,
    [
      ...(playing ? [] : [{ label: "Play it", value: "play" }]),
      { label: "Rename", value: "rename" },
      { label: playing ? "Delete (play another world first)" : "Delete for good", value: "delete" },
    ],
    (action) => {
      if (action === "play") return void (confirm = { question: `Switch to ${world}? ${KICK}`, then: () => mc(["world", "play", world]) });
      if (action === "rename")
        return askWorldName(`New name for ${world}:`, world, (name) => {
          if (name === world) return;
          const rename = () => mc(["world", "rename", world, name]);
          // The server has the world it plays open, so renaming that one restarts it.
          if (playing) confirm = { question: `Rename ${world} to ${name}? The server restarts. ${KICK}`, then: rename };
          else rename();
        });
      if (playing) return tell(`The server plays ${world} now. Play another world first, then delete this one.`, S.yellow);
      input = {
        prompt: `Delete ${world} for good? It can't come back. Type its name to confirm:`,
        text: "",
        then: (typed) => (typed === world ? mc(["world", "delete", world, "--yes"]) : tell(`Kept ${world}.`)),
      };
    },
    { back: worldMenu },
  );
}

const WORLD_LOOKS = ["Haunted", "Cherry", "Sunny", "Frozen", "Secret", "Lucky", "Mossy", "Golden", "Stormy", "Sleepy", "Giant", "Hidden", "Crystal", "Wild", "Misty", "Rainbow"];
const WORLD_PLACES = ["Castle", "Land", "Island", "Valley", "Mountains", "Forest", "Caves", "Kingdom", "Jungle", "Desert", "Lagoon", "Village", "Canyon", "Meadow", "Cliffs", "Bay"];

/** A made-up world name like "Mossy Lagoon" that no saved world has yet. */
function worldNameIdea() {
  const taken = new Set(worlds());
  const any = (/** @type {string[]} */ list) => list[Math.floor(Math.random() * list.length)];
  for (let tries = 0; tries < 50; tries++) {
    const name = `${any(WORLD_LOOKS)} ${any(WORLD_PLACES)}`;
    if (!taken.has(name)) return name;
  }
  return `World ${taken.size + 1}`;
}

/** The new-world name prompt: Enter on its own takes a made-up name. */
function askNewWorld() {
  const idea = worldNameIdea();
  askWorldName(`New world name (Enter: ${idea}):`, "", newWorld, idea);
}

/**
 * Asks for a world name, and asks again while it's one ./mc world won't take.
 * @param {string} prompt @param {string} text @param {(name: string) => void} then @param {string} [fallback] used when nothing is typed
 */
function askWorldName(prompt, text, then, fallback = "") {
  input = {
    prompt,
    text,
    then: (typed) => {
      const name = typed || fallback;
      if (!name) return;
      // The same rule as ./mc world, so a bad name is caught here instead of failing out of sight.
      if (!/^[A-Za-z0-9][A-Za-z0-9 _-]*$/.test(name)) {
        tell("Use letters, numbers, spaces, - and _ in a world name.", S.yellow);
        return askWorldName(prompt, name, then, fallback);
      }
      if (name !== text && worlds().includes(name)) {
        tell(`There's already a world called ${name}.`, S.yellow);
        return askWorldName(prompt, name, then, fallback);
      }
      then(name);
    },
  };
}

/** Asks for a seed, then makes the world and plays it. @param {string} name */
function newWorld(name) {
  input = {
    prompt: "Seed (empty for a random one):",
    text: "",
    then: (seed) => void (confirm = { question: `Make ${name} and play it? ${KICK}`, then: () => mc(["world", "new", name, ...(seed ? [seed] : [])]) }),
  };
}

/**
 * The k key: pick a kit. Building materials (wood, stone, …) open their types, with Enter or →.
 * Typing finds the types too, so "flint" lists ingots-flint without opening ingots first.
 */
function kitMenu() {
  const types = new Map(materials().map(({ name, types }) => [name, types]));
  const labels = kitLabels();
  const emojis = kitEmojis();
  const label = (kit) =>
    `${emojis.get(kit) ?? "  "} ${types.has(kit) ? `${kit}  → ${types.get(kit)?.slice(0, 3).join(", ")}, …` : labels.has(kit) ? `${kit} (${labels.get(kit)})` : kit}`;
  const open = (kit) => (types.has(kit) ? materialMenu(kit, types.get(kit) ?? []) : giveKit(kit));
  const typeChoices = [...types].flatMap(([kit, kinds]) =>
    kinds.map((type) => ({ label: `${emojis.get(kit) ?? "  "} ${kit}-${type}`, value: `${kit}-${type}`, hidden: true })),
  );
  const kits = kitNames().map((kit) => ({ label: label(kit), value: kit }));
  pick("Which kit?", [{ label: `${TOOLS_EMOJI} tools (diamond tools)`, value: "tools" }, ...kits, ...typeChoices], open, {
    more: (kit) => (types.has(kit) ? open(kit) : kitMenu()),
  });
}

/**
 * The n key: an instruction for the NPCs. Past ones come again with the plan Claude made then (no need to ask again),
 * like the k key's kits; → on one does it with several NPCs, or asks Claude for a new plan.
 */
function npcMenu() {
  const NEW = "\u0000new"; // can't be an instruction
  const AWAY = "\u0000away";
  const past = recentInstructions().map(({ instruction, said }) => ({ label: `${instruction}  → ${said}`, value: instruction }));
  pick(
    "NPC, do what?",
    [{ label: "✏️  something new…", value: NEW }, { label: "just bring an NPC", value: "" }, { label: "👋 send NPCs away…", value: AWAY }, ...past],
    (value) => {
      if (value === AWAY) input = { prompt: "Send which NPC away? (Enter: all of them)", text: "", then: (name) => mc(["npc", "--remove", ...(name ? [name] : [])]) };
      else if (value === NEW) input = { prompt: "NPC, do what? (Enter: just bring one)", text: "", then: (text) => mc(["npc", ...(text ? [text] : [])]) };
      else mc(["npc", ...(value ? [value] : [])]);
    },
    { more: (value) => (value === NEW || value === AWAY ? npcMenu() : npcMore(value)), moreLabel: "how many / ask Claude again" },
  );
}

/** → in the n menu: how many new NPCs should do it (each the same plan), or a new plan from Claude. "" just brings NPCs. @param {string} instruction */
function npcMore(instruction) {
  const howMany = () =>
    void (input = {
      prompt: instruction ? `How many NPCs should "${instruction}"?` : "How many NPCs?",
      text: "",
      then: (text) => {
        if (!/^[1-9][0-9]?$/.test(text)) return tell(`"${text}" isn't a number of NPCs. Try again with n.`, S.yellow);
        mc(["npc", "--count", text, ...(instruction ? [instruction] : [])]);
      },
    });
  if (!instruction) return howMany();
  pick(
    instruction,
    [
      { label: "how many NPCs…", value: "count" },
      { label: "ask Claude for a new plan", value: "fresh" },
    ],
    (value) => {
      if (value === "count") return howMany();
      input = {
        prompt: "What should be better? (Enter: just ask again)",
        text: "",
        then: (feedback) => mc(["npc", ...(feedback ? ["--feedback", feedback] : ["--fresh"]), instruction]),
      };
    },
    { back: npcMenu },
  );
}

/** Which type of a building material, like oak or spruce wood. @param {string} kit @param {string[]} types */
function materialMenu(kit, types) {
  pick(`Which ${kit}?`, types.map((type) => ({ label: type, value: `${kit}-${type}` })), giveKit, { back: kitMenu });
}

/** Gives a kit: to the one player online, or asks who. @param {string} kit */
function giveKit(kit) {
  const craft = kitCraft ? ["--craft"] : [];
  if (server.players.size < 2) return mc(["kit", kit, ...craft]);
  const everyone = { label: "everyone online", value: "@a" };
  pick(`Give ${kit} to`, [everyone, ...[...server.players].map((p) => ({ label: p, value: p }))], (who) => mc(["kit", kit, who, ...craft]));
}

/** What the j key finds with /locate, as each player's way there. */
const PLACES = [
  ["🟢 stronghold (the End portal)", "stronghold"],
  ["🔥 fortress (Nether: blazes for blaze rods)", "fortress"],
  ["🐷 bastion (Nether: piglins and gold)", "bastion_remnant"],
  ["🏘️ village", "village"],
  ["🗝️ trial chambers", "trial_chambers"],
  ["🌀 ruined portal", "ruined_portal"],
  ["⛏️ mineshaft", "mineshaft"],
  ["🚢 shipwreck", "shipwreck"],
  ["💰 buried treasure", "buried_treasure"],
  ["🌊 ocean monument", "monument"],
  ["🏰 woodland mansion", "mansion"],
  ["🏹 pillager outpost", "pillager_outpost"],
  ["🏺 trail ruins", "trail_ruins"],
  ["💀 ancient city", "ancient_city"],
  ["🌌 end city (the End)", "end_city"],
];

/** The j key: tells players where the nearest place is from where each one stands. */
function placeMenu() {
  pick("Find which place? Each player is told the way from where they stand.", PLACES.map(([label, value]) => ({ label, value })), (place) => {
    if (server.players.size < 2) return mc(["locate", place]);
    const everyone = { label: "everyone online", value: "" };
    pick("Tell whom?", [everyone, ...[...server.players].map((p) => ({ label: p, value: p }))], (who) => mc(["locate", place, ...(who ? [who] : [])]));
  });
}

/** @returns {[string, (s: string) => string]} */
const onOff = (/** @type {boolean | undefined} */ on) => (on === undefined ? ["?", S.dim] : on ? ["● on", S.green] : ["○ off", S.dim]);

/**
 * The o key: switches and the less used commands. A switch that only mc dev keeps (like sending saves)
 * flips right away and opens the menu again, on the same row, so several can be flipped in a row.
 * Each also has a key of its own outside the menu (s, h, i, p, f, b, u, v, z, j, c, m), except updating Minecraft.
 * @param {number} [index]
 */
function optionsMenu(index = 0) {
  /** @type {[string, Choice["state"], () => void, boolean?][]} label, state, what it does, whether the menu opens again */
  const options = [
    ["Send saved files", onOff(onSave.send), () => commands.s(), true],
    ["Saved scripts", onSave.alwaysRestart ? ["⟳ restart", S.yellow] : ["↻ reload", S.green], () => commands.h(), true],
    ["Kit crafting materials", onOff(kitCraft), () => commands.i(), true],
    ["Peace", onOff(server.peace), () => commands.p()],
    ["Fall damage", onOff(server.fallDamage), () => commands.f()],
    ["PvP (players hurt each other)", onOff(server.pvp), () => commands.b()],
    ["Invincible (nothing hurts players)", onOff(server.invincible), () => commands.u()],
    ["Keep inventory on death", onOff(server.keepInventory), () => commands.v()],
    ["Show coordinates", onOff(server.showCoordinates), () => commands.z()],
    ["Find a place… (stronghold, fortress, …)", undefined, () => commands.j()],
    ["Server command…", undefined, () => commands.c()],
    ["Mods", undefined, () => commands.m()],
    ["Update Minecraft (so updated devices can join)", undefined, () => void (confirm = { question: `Update the server to the newest Minecraft? It restarts twice. ${KICK}`, then: () => mc(["update"]) })],
  ];
  pick(
    "Options",
    options.map(([label, state], i) => ({ label, state, value: String(i) })),
    (value) => {
      const [, , run, again] = options[Number(value)];
      run();
      if (again) optionsMenu(Number(value));
    },
  );
  if (picker) picker.index = index;
}

/** @type {Record<string, () => void>} */
const commands = {
  k: () => kitMenu(),
  t: () =>
    pick("Test which mod?", [{ label: "all of them", value: "" }, ...tested().map((mod) => ({ label: mod, value: mod }))], (mod) =>
      mc(mod ? ["test", mod] : ["test"]),
    ),
  c: () => void (input = { prompt: "Server command: /", text: "", then: (text) => text && mc(["cmd", text.replace(/^\//, "")]) }),
  w: () => worldMenu(),
  i: () => {
    kitCraft = !kitCraft;
    note(kitCraft ? "Kits now come with their crafting table and materials." : "Kits now give just the mod's items.");
  },
  o: () => optionsMenu(),
  s: () => {
    note(onSave.send ? "Saved files stay here now, until sending is on again (o, or s)." : "✓ Saved files go to the server again.");
    sendSaves(!onSave.send); // sends what was saved while it was off
  },
  h: () => {
    onSave.alwaysRestart = !onSave.alwaysRestart;
    note(onSave.alwaysRestart ? "Saved scripts restart the server now, which kicks everyone." : "Saved scripts reload without kicking anyone again.");
  },
  n: () => npcMenu(),
  d: () => mc(["cmd", "time set day"]),
  p: () => mc(["peace", server.peace ? "off" : "on"]),
  f: () => mc(["fall-damage", server.fallDamage === false ? "on" : "off"]),
  b: () => mc(["pvp", server.pvp === false ? "on" : "off"]),
  u: () => mc(["invincible", server.invincible ? "off" : "on"]),
  v: () => mc(["keep-inventory", server.keepInventory ? "off" : "on"]),
  z: () => mc(["show-coordinates", server.showCoordinates ? "off" : "on"]),
  j: () => placeMenu(),
  e: () => mc(["kill-enemies"]),
  x: () =>
    pick(
      "Clear everyone's inventory? Armor and the off hand stay.",
      [
        { label: "🎒 just the backpack (keep the item bar)", value: "backpack" },
        { label: "🧹 the backpack and the item bar", value: "all" },
      ],
      (what) =>
        void (confirm = {
          question: `Empty everyone's ${what === "all" ? "backpack and item bar" : "backpack"}? Those things are gone for good.`,
          then: () => mc(["clear-inventory", what]),
        }),
    ),
  m: () => mc(["mods"]),
  a: () => mc(["reload"]), // scripts and functions, without kicking anyone (/reload all does no more here)
  r: () => void (confirm = { question: "Restart the server? Everyone playing gets kicked.", then: () => mc(["restart"]) }),
  // The last command again, like giving the same kit twice. One that kicks people asks again first.
  ".": () => {
    if (!last) return void tell("Nothing to run again yet: run a command first, like k for a kit.", S.yellow);
    const { args, question } = last;
    if (question) confirm = { question, then: () => mc(args) };
    else mc(args);
  },
  "\t": () => {
    view = view === "activity" ? "server" : "activity";
    scroll = 0;
  },
};
commands.l = commands["\t"];

const UP = "\x1b[A";
const DOWN = "\x1b[B";
const RIGHT = "\x1b[C";
const LEFT = "\x1b[D";
const PAGE_UP = "\x1b[5~";
const PAGE_DOWN = "\x1b[6~";
const HOME = ["\x1b[H", "\x1b[1~", "g"];
const END = ["\x1b[F", "\x1b[4~", "G"];

/**
 * A click in the picker: pressing a choice highlights it, letting go on the same one picks it.
 * Picking on release keeps the release from landing on whatever the choice opens, like a y/n question.
 * The mouse wheel moves the highlight. @param {string} key an SGR mouse report, like \x1b[<0;12;9M
 */
function onMouse(key) {
  const match = key.match(/^\x1b\[<(\d+);(\d+);(\d+)([Mm])$/);
  if (!match || !picker || !pickerArea) return;
  const [button, x, y] = match.slice(1, 4).map(Number);
  const pressed = match[4] === "M";
  const count = shownChoices().length;
  if (button === 64 && count) return void (picker.index = (picker.index + count - 1) % count);
  if (button === 65 && count) return void (picker.index = (picker.index + 1) % count);
  const { row, first, left, right } = pickerArea;
  if (button !== 0 || x < left || x > right || y < row || y >= row + pickerArea.count) return;
  picker.number = "";
  if (pressed) picker.index = first + y - row;
  else if (first + y - row === picker.index) pickChosen();
}

/** @param {string} key */
function onKey(key) {
  if (key === "\x03") return quit();
  if (key.startsWith("\x1b[<")) return onMouse(key), draw();
  if (input) {
    const { then, text } = input;
    if (key === "\r") (input = null), then(text.trim());
    else if (key === "\x1b") input = null;
    else if (key === "\x7f" || key === "\b") input.text = [...text].slice(0, -1).join("");
    else if (!key.startsWith("\x1b")) input.text += key.replace(/[\x00-\x1f]/g, "");
  } else if (confirm) {
    const { then, question } = confirm;
    confirm = null;
    if (key === "y" || key === "Y" || key === "\r") {
      confirmed = question;
      then();
      confirmed = undefined;
    } else tell("Cancelled: only Enter or y says yes.", S.yellow);
  } else if (picker) {
    const choices = shownChoices();
    if (/^[0-9]$/.test(key)) {
      typeNumber(key);
      return draw();
    }
    picker.number = ""; // any other key ends a typed number
    if (key === UP && choices.length) picker.index = (picker.index + choices.length - 1) % choices.length;
    else if (key === DOWN && choices.length) picker.index = (picker.index + 1) % choices.length;
    else if (key === "\x1b") picker = null;
    else if (key === RIGHT && picker.more && choices[picker.index]) {
      const { more, index } = picker;
      picker = null;
      more(choices[index].value);
    } else if (key === LEFT && picker.back) {
      const { back } = picker;
      picker = null;
      back();
    }
    else if (key === "\x7f" || key === "\b") (picker.filter = [...picker.filter].slice(0, -1).join("")), (picker.index = 0);
    else if (key === "\r") pickChosen();
    else if (!key.startsWith("\x1b") && /^[^\x00-\x1f]+$/.test(key)) {
      picker.filter += key; // typing narrows the list; the first match is the one Enter picks
      picker.index = 0;
    }
  } else {
    const page = Math.max(1, (out.rows || 24) - 8);
    if (key === UP) scroll++;
    else if (key === DOWN) scroll = Math.max(0, scroll - 1);
    else if (key === PAGE_UP) scroll += page;
    else if (key === PAGE_DOWN) scroll = Math.max(0, scroll - page);
    else if (HOME.includes(key)) scroll = Infinity;
    else if (END.includes(key)) scroll = 0;
    else if (key === "q") return quit();
    else commands[key.toLowerCase()]?.();
  }
  draw();
}

/** Splits what the terminal sent into keys: a paste or fast typing arrives as one chunk. @param {string} data */
function keysIn(data) {
  if (input && !data.includes("\x1b") && !/[\r\x7f\b\x03]/.test(data)) return [data];
  return data.match(/\x1b\[<[0-9;]*[Mm]|\x1b\[[0-9;]*[A-Za-z~]|\x1b.?|[\s\S]/g) ?? [];
}

// ── Start and stop ─────────────────────────────────────────────────────────

function quit() {
  queue.length = 0;
  action?.child.kill();
  follower?.kill();
  out.write("\x1b[?1000l\x1b[?1006l\x1b[?25h\x1b[?1049l");
  process.stdin.setRawMode?.(false);
  process.exit(0);
}

if (!out.isTTY || !process.stdin.isTTY) {
  console.error("mc dev needs a terminal. For plain output run: ./mc start && npm run watch");
  process.exit(1);
}
out.write("\x1b[?1049h\x1b[?25l"); // a screen of its own, without a blinking cursor
process.stdin.setRawMode(true);
process.stdin.setEncoding("utf8");
process.stdin.on("data", (data) => keysIn(String(data)).forEach(onKey));
out.on("resize", draw);
process.on("SIGTERM", quit);
process.on("uncaughtException", (e) => {
  out.write("\x1b[?1000l\x1b[?1006l\x1b[?25h\x1b[?1049l");
  console.error(e);
  process.exit(1);
});
setInterval(refreshStatus, 2000);
refreshStatus();

mc(["start"], (ok) => {
  if (!ok) return note("✗ The server didn't start. Fix what it says above, then run mc dev again.");
  watchAddons((message) => message.split("\n").filter(Boolean).forEach((line) => push(activity, line)));
  watching = true;
  mc(["fall-damage"], () => mc(["keep-inventory"], () => mc(["show-coordinates"], () => mc(["pvp"], () => mc(["invincible"])))));
  note("✓ Watching addons/: save a file and it reaches the server. Scripts reload without kicking anyone.");
});
