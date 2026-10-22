# Family Minecraft Mods

Our own Minecraft Bedrock add-ons, plus a private server to play them on together.

## What's inside

| Add-on | What it does | How it's made |
| --- | --- | --- |
| [`welcome`](./addons/welcome) | Says hi when you join | Code: 10 lines of JavaScript |
| [`rainbow-cookie`](./addons/rainbow-cookie) | A new cookie that makes you fast and bouncy. Craft it from a cookie, sugar, and glow berries. | Item + picture + recipe + a little code |
| [`trampoline`](./addons/trampoline) | Build slime blocks with a wooden edge, like a portal, and get a trampoline. Bigger ones bounce higher. You get the blocks in a chest when you first join. | Code, with tests |
| [`party-commands`](./addons/party-commands) | `/function party` and `/function sunny`, and 9 dirt crafts into 1 diamond | No code: commands and a recipe |
| [`game-stats`](./addons/game-stats) | Counts what everyone digs, builds, beats, eats, and how they die, plus minutes played, blocks travelled, level-ups, and Nether trips, for the [Dash0 dashboard](./server/README.md#family-dashboard) | Code, with tests |

Each add-on is a folder in `addons/` with up to two packs:

```text
addons/rainbow-cookie/
├── behavior_pack/        how things ACT
│   ├── manifest.json     the pack's name and ID card
│   ├── items/            new items
│   ├── recipes/          crafting recipes
│   ├── functions/        lists of commands (no code)
│   └── scripts/main.js   JavaScript code
└── resource_pack/        how things LOOK
    ├── manifest.json
    └── textures/         pictures (16×16 PNGs)
```

## Setup (once)

1. Install [Node.js](https://nodejs.org/) 20 or newer and [VS Code](https://code.visualstudio.com/).
2. In this folder, run:

   ```bash
   npm install   # adds autocomplete for Minecraft's code in VS Code
   npm run build
   ```

`npm run build` checks every add-on for mistakes and writes one `.mcaddon` file per add-on into `dist/`.

To let Claude Code read the server's telemetry in Dash0, copy `.mcp.example.json` to `.mcp.json` and replace `auth_REPLACE_ME` with a Dash0 auth token.
Git ignores `.mcp.json`, so the token isn't committed.

## Play the mods

**Together on the server (any device, including Switch):** follow [`server/README.md`](./server/README.md).
Host it on Linux (like Omarchy) if anyone plays on a console; a Mac works for tablets, phones, and PCs.
The server sends the mods to every device that joins.

**On one tablet, phone, or Windows PC:** open `dist/rainbow-cookie.mcaddon` on the device and Minecraft imports it.
Then create a world, turn the packs on under **Behavior Packs** and **Resource Packs**, and turn on **Cheats** for the commands.

## Make your own mod

### No code: recipes and commands

1. Copy a file in `addons/party-commands/behavior_pack/recipes/` and change the items.
   Item names are the ones you use in `/give`, like `minecraft:golden_apple`.
2. Add a `.mcfunction` file in `functions/`. Put one command per line, without the `/`.
   The file `functions/zoom.mcfunction` runs with `/function zoom`.

### With code

```bash
npm run new -- lava-boots
```

That creates `addons/lava-boots/` with a working starter script and fresh pack IDs.
Edit `behavior_pack/scripts/main.js`; VS Code suggests what you can type after `world.` or `player.`.
The [Script API docs](https://learn.microsoft.com/minecraft/creator/scriptapi/) list everything.

### Try it fast (Windows)

Copy a pack folder into Minecraft's development folder instead of re-importing it every time:

- Newer Minecraft: `%APPDATA%\Minecraft Bedrock\Users\Shared\games\com.mojang\development_behavior_packs\`
- Older Minecraft: `%LOCALAPPDATA%\Packages\Microsoft.MinecraftUWP_8wekyb3d8bbwe\LocalState\games\com.mojang\development_behavior_packs\`

Resource packs go into `development_resource_packs\` next to it.
After a change, type `/reload` in the world to reload scripts and functions without restarting.

### Rules that keep a pack working

- Every `uuid` in a `manifest.json` must be different. `npm run new` makes fresh ones; never copy them by hand.
- When you change a pack that's already in a world, raise its `version` (for example `[1, 0, 0]` → `[1, 1, 0]`) so devices download the new one.
- Start new item names with `family:`, like `family:lava_boots`, so they never clash with Minecraft's own.
- Run `npm run validate` before playing. It catches broken JSON, copied UUIDs, and missing pictures.
- Put tests in a `tests/` folder next to the packs, like [`addons/trampoline/tests`](./addons/trampoline/tests). They never get packed into the `.mcaddon`.

## Ideas to try next

- A sword that sets mobs on fire (`entityHitEntity` event).
- A block that launches you into the air when you step on it.
- A pet mob with a custom texture.
- A treasure hunt: a function that hides chests, and a script that cheers when you open one.
- Custom sounds: record your own voice into a resource pack.

## Commands

Run the server with `./mc` from this folder (`./mc help` lists everything):

| Command | What it does |
| --- | --- |
| `./mc start` (or `npm start`) | Copy the add-ons in, start the server, and wait until players can join. Starts Colima on a Mac if needed. |
| `./mc dev` (or `npm run dev`) | `start`, then send each change to the server as you save |
| `./mc stop` (or `npm stop`) | Stop the server |
| `./mc restart` | Restart the server, to load changed add-ons |
| `./mc status` | Is it running, and can players join? |
| `./mc mods` | List the mods the server loaded |
| `./mc install ~/Downloads/cool.mcaddon` | Install a downloaded add-on into `addons/` and restart. Installing a newer file of it updates it; a broken one is rolled back. |
| `./mc remove <name>` | Remove an add-on from `addons/` and turn it off in the world |
| `./mc update` | Update the server to the newest Minecraft, so updated devices can still join |
| `./mc kit [player]` | Give diamond tools to everyone online (or one player) |
| `./mc logs` | Follow the server log |
| `./mc console` | Type server commands (leave with Ctrl+P, then Ctrl+Q) |
| `./mc cmd time set day` | Run one server command |

Add-ons from `mc install` are other people's work: check their license before you commit them.

To use `mc` from any folder, link it into a folder on your `PATH`:

```bash
ln -s "$PWD/mc" ~/.local/bin/mc
```

For the add-ons:

| Command | What it does |
| --- | --- |
| `npm run new -- <name>` | Make a new add-on with fresh pack IDs |
| `npm run validate` | Check every add-on for mistakes |
| `npm test` | Run every add-on's tests (files ending in `.test.mjs`) |
| `npm run build` | Check, then write `dist/<name>.mcaddon` files |
| `npm run build -- <name>` | Build only one add-on |
| `npm run deploy` | Copy every add-on to the server in `server/data` and turn them on |
| `npm run watch` | Send each change to the running server as you save; code reloads in about a second |
