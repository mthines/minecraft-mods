# Notes for Claude

Bedrock add-ons for the family server. `README.md` explains the layout and the `./mc` commands; these are the lessons that aren't obvious from the code.

## Making a mod

- Start with `npm run new -- <name>`. Every mod ships a `kit.json` (its `items` for `./mc kit <mod>`, and under `craft` the table and materials that `--craft` adds; extra kits like refills go in `kit-<name>.json`, for `./mc kit <mod>-<name>`) and a `tests/e2e.js` that plays it like a player. Run `./mc test <mod>` until it passes before calling the mod done.
- Every kit must work both as `./mc kit <name>` and from the `k` menu in `mc dev`. Kits that belong to no mod (like `bed`) go in `kits/<name>.json`; building materials there list `types` instead of `items` (`kits/wood.json` → `mc kit wood-spruce`, and its own type menu in `mc dev`). `tools/lib/kits.mjs` is the one place that finds kits, for `mc`, `mc dev`, and the validator: a new kit file needs nothing else, and a new place for kits only changes that file (plus its checks in `tools/lib/validate.mjs`). Bedrock item names are irregular (oak's fence gate is `minecraft:fence_gate`), so `npm run validate` checks kits' `minecraft:` items against `@minecraft/vanilla-data`. A running `mc dev` only lists new kits after a restart.
- Pictures:
  - Held tools and weapons (`minecraft:hand_equipped`) are drawn diagonally like vanilla ones: handle at the bottom left, working end (drill bit, blade, barrel) at the top right. Drawn flat, they point the wrong way in the hand.
  - Entity models face -z: the front of a vehicle goes at negative z in `*.geo.json`. Seat positions in `minecraft:rideable` use +z as forward.
- An entity you can stand on (a ship deck) needs `minecraft:is_collidable` and a collision box as high as the deck. The box is always a square (only `width`), so a long ship needs it wide enough for its ends.
- Keep a vehicle's parts below the rider's eyes, about 1 to 1.5 blocks above the seat: a steering wheel right in front of the seat filled the whole view.
- When a resource pack changes, raise its `version` in its manifest and in the behavior pack's dependency on it. Devices keep the old pack otherwise.
- `addons/size-potions/behavior_pack/entities/player.json` overrides the vanilla player (the script API can't set a player's scale). There can only be one: a mod that needs player components adds its component groups and events to that file instead of shipping another player.json.
- Make hits that need to be reliable with a raycast (`getEntitiesFromViewDirection`), not a fast projectile entity. Projectiles faster than about 4 blocks a tick can pass straight through mobs.
- Script API calls that need a screen, like `player.camera`, throw for simulated players: wrap them so the rest of the action still runs.
- On the family server, NPCs (the npc mod's simulated players) come through as `undefined` in every other mod. This applies to entries of `world.getAllPlayers()` and `getPlayers()`, and to the entities in events like `entityHitEntity`, `entityHurt`, `entityDie` and `playerSpawn`. Guard them: `if (!player) continue;`, `hitEntity?.typeId`. A per-tick player loop without the guard throws every tick while an NPC is around, and stops for every player after the NPC. That's how golden-feather flying, trampolines and lanterns all stopped working near NPCs.

## Testing (`./mc test`)

- It runs on a separate container (`family-e2e`) with its own flat world in `server/test-data/`, never the family world. Each run starts from `server/test-data/fresh-world/`.
- Simulated players are only real `Player`s in packs that import `@minecraft/server-gametest`. `tools/e2e.mjs` adds that import to the test server's copies of the mods. So in tests, NPCs and test players are real players in every mod, while on the family server they are `undefined` in every mod but npc. `mc test` can't catch a missing guard (see Making a mod): check for it when reviewing code instead. Only the npc mod imports it itself: every world has Beta APIs now (`mc` turns them on in level.dat before the server starts, see `ensure_beta_apis`), but other mods shouldn't depend on beta modules, which can change with any Minecraft update.
- `mc test` runs one at a time (`server/test-data/e2e.lock`): two runs share the test server, and a second one used to restart it under the first. Another session may be running tests in this folder too.
- `useItemOnBlock` needs a solid block to click on. `playerInteractWithEntity` events don't fire for simulated players, but entity events from `minecraft:interact` do.
- A test only proves the path it really takes. A test that adds the `family:npc` tag to a test player, to stand in for an NPC left over from a script reload, still has a live `SimulatedPlayer`. A real leftover after `/reload` may not. Say so when a test stands in for something it can't reproduce, and don't call that case verified.
- Simulated players survive `/reload`, and the npc mod forgets them then. `kick` doesn't remove them; a restart does. `disconnect()` only works on the `SimulatedPlayer` object from the script context that spawned them.
- Read "Script errors during the tests" at the end of a `mc test` run, even when every test passes: other mods' errors show up there too.
- After a change reaches the family server, check the log for new errors: `docker logs --since 5m family-bedrock 2>&1 | grep ERROR`. Errors that repeat every tick mean a loop broke for everyone.
- Some things only a person can check: how a model or picture looks in game, camera zoom, and whether steering a ridden entity feels right.

## The family server

- `mc dev` (the watcher) is often running while the family plays. Once someone turns on Send saved files in it (off at the start), any change under `addons/*/behavior_pack` or `resource_pack` reaches the live server, and most of them restart it, which kicks players.
- `/reload` only re-reads script files the server had when it started. A new `.js` file (a new mod, or a new import) gives "Import [x.js] not found" until a restart: check `./mc cmd list` shows nobody online, then `./mc restart`.
- Never print or commit `server/.env` or `.mcp.json` (tokens). Ask before restarting Colima: other work runs in it.
- Commit and push to `main` when a change is done and its tests pass.
