# Hosting the family server

The server runs Mojang's Bedrock Dedicated Server in Docker.
Every Bedrock device can join it: Switch, Xbox, PlayStation, iPad, Android, and Windows.
Devices get the mods automatically when they join, so you never install anything on the consoles.

## Which computer to use

| | Omarchy (Linux) | MacBook |
| --- | --- | --- |
| Shows up under **LAN Games** | Yes | No, devices add it by IP address |
| Switch and other consoles can join | Yes, through LAN Games | No: consoles can't add a server by IP |
| Speed | Full speed | Slower: Apple Silicon emulates the x86 server |
| Best for | The family server | Testing mods on an iPad, phone, or PC |

Use Omarchy if the kids play on a Switch.
Whichever you pick, keep it plugged in and stop it sleeping while people play.

## Before you start

- Every player needs a Microsoft account. On child accounts, a parent must allow **"Join multiplayer games"** in [Xbox Family Settings](https://www.xbox.com/family-app).
- Install [Node.js](https://nodejs.org/) 20 or newer, to deploy the add-ons.
- Open `docker-compose.yml` and put your family's gamertags in `ALLOW_LIST_USERS`, and your own in `OPS`.
  Operators can use commands like `/function party`.

## Set up on Omarchy

Omarchy comes with Docker and a firewall that blocks everything coming in.

1. Make sure Docker starts on boot:

   ```bash
   sudo systemctl enable --now docker
   ```

2. Let Minecraft through the firewall:

   ```bash
   sudo ufw allow 19132/tcp comment 'minecraft join'
   sudo ufw allow 19140:19155/udp comment 'minecraft gameplay'
   sudo ufw allow 7551/udp comment 'minecraft LAN games'
   ```

   The server shares Omarchy's network directly, so plain `ufw` rules work and `ufw-docker` isn't needed.

3. Continue with [Start the server](#start-the-server).

## Set up on a MacBook

1. Install [Colima](https://github.com/abiosoft/colima) and start it with its own network address:

   ```bash
   colima start --network-address --port-forwarder grpc
   ```

   Colima remembers these options for the next `colima start`. Restarting Colima stops every other container it runs.
2. Continue with [Start the server](#start-the-server).

Minecraft 1.26 connects over NetherNet (WebRTC), which fails through Docker's port forwarding with "Multiplayer Connection Failed: NetherNet".
With `--network-address`, the Colima VM gets an address like `192.168.64.2`, and `start.sh` runs the server directly on the VM's network.
It prints that address: on the Mac, add the server with it, port `19132`.

That address only works from the Mac itself. For iPads and phones to join, the VM likely needs Colima's `bridged` network mode (untested here), which you can only choose when you create the VM (`colima delete`, then `colima start --network-address --network-mode bridged --port-forwarder grpc`). `colima delete` removes all of the VM's images and volumes.

Without a VM address (Docker Desktop, OrbStack, or Colima without `--network-address`), `start.sh` falls back to forwarding ports from the Mac's Wi-Fi address and warns that joining will likely fail.

## Start the server

1. Start it, and wait for `Server started.` in the log (press Ctrl+C to stop watching):

   ```bash
   ./server/start.sh
   docker logs -f family-bedrock
   ```

2. Copy the add-ons in and turn them on, then restart:

   ```bash
   npm run deploy
   docker restart family-bedrock
   ```

3. Check that other devices can reach it. From a different computer on the same Wi-Fi:

   ```bash
   curl http://<server-ip>:19132/v1/join
   ```

   It answers with the server's name and version.

Run `npm run deploy` and `docker restart family-bedrock` again whenever you change a mod.
Restarting also updates the server to the newest Minecraft version.

## Make quick changes

Keep this running while you work on a mod:

```bash
npm run watch
```

Every time you save a file in `addons/`, it checks the add-on, copies it to the server, and applies it:

| You changed | What happens | How long |
| --- | --- | --- |
| Code (`scripts/`) or commands (`functions/`) | The server runs `/reload`. Stay in the world and try it again. | About a second |
| Anything else: items, recipes, pictures, `manifest.json` | The server restarts. Rejoin the world. | About 20 seconds |

Script errors from the server show up right under the change, marked ⚠.
Broken JSON never reaches the server: the watcher tells you what to fix.
A changed picture needs a higher `version` in the resource pack's `manifest.json`, or devices keep the old one.

This works the same on Omarchy and on a Mac.

## Joining

| Device | How to join |
| --- | --- |
| Any device, server on Omarchy, same Wi-Fi | **Play → Friends → LAN Games** |
| iPad, phone, or PC | **Play → Servers → Add Server**: the server computer's IP address, port `19132` (on a Mac, the address `start.sh` prints) |
| Switch, Xbox, or PlayStation, server on a Mac | Not possible: consoles only see LAN Games and featured servers |

Find the server computer's IP address with `ip -4 addr` on Omarchy, or `ipconfig getifaddr en0` on a Mac.

Playing with friends outside your home means opening ports on your router to the internet.
For a family server, keep it on your home Wi-Fi.

## Send telemetry to Dash0

An [OpenTelemetry Collector](https://opentelemetry.io/docs/collector/) can run next to the server and send to Dash0:

- **Logs:** every line the server prints, with severity, so script errors arrive as `ERROR`.
- **Game events:** log records with an event name and attributes, from the server and the mods.
- **Metrics:** CPU, memory, and network of the server container, every 30 seconds.

It follows Michele Mancioppi's [Monitoring Minecraft with OpenTelemetry](https://www.dash0.com/blog/monitoring-minecraft-with-opentelemetry), adapted for Bedrock.
Bedrock's server isn't Java, so instead of the Java agent, Docker hands the server's console to the Collector.

### Turn it on

1. Copy the example settings and fill in your endpoint and auth token from Dash0 (**Settings → Endpoints** and **Settings → Auth Tokens**):

   ```bash
   cp server/.env.example server/.env
   ```

   `server/.env` holds a secret, so Git ignores it.

2. Run `./server/start.sh` again. It prints `Sending telemetry to Dash0` and starts the `family-otelcol` container next to the server.

Everything arrives with `service.namespace` `minecraft` and `service.name` `bedrock-server`.
To turn it off, delete `server/.env` and run `./server/start.sh` again.

### Game events

| `event.name` | When | Attributes |
| --- | --- | --- |
| `minecraft.server.started` | The server is ready | |
| `minecraft.player.connected` / `minecraft.player.disconnected` | Someone joins or leaves | `minecraft.player.name` |
| `minecraft.trampoline.built` | A trampoline comes alive | `minecraft.player.name`, `minecraft.trampoline.size`, `minecraft.trampoline.height_blocks` |
| `minecraft.trampoline.bounce` | Someone bounces | same as above |
| `minecraft.trampoline.broken` | A trampoline stops working | `minecraft.trampoline.size`, and `minecraft.player.name` or `minecraft.trampoline.cause` |
| `minecraft.starter_chest.given` | A first-time player gets the chest | `minecraft.player.name`, `minecraft.starter_chest.placed` |
| `minecraft.rainbow_cookie.eaten` | Someone eats a rainbow cookie | `minecraft.player.name` |
| `minecraft.block.broken` | Someone digs, chops, or mines a block | `minecraft.player.name`, `minecraft.block.type` (like `oak_log`), `minecraft.block.category` (`wood`, `dirt`, `stone`, `ore`, `sand`, `leaves`, `planks`, `plant`, or `other`), `minecraft.held_item.type` (`hand` when empty) |
| `minecraft.block.placed` | Someone builds with a block | `minecraft.player.name`, `minecraft.block.type`, `minecraft.block.category` |
| `minecraft.mob.killed` | A player beats a mob | `minecraft.player.name`, `minecraft.mob.type` (like `zombie`) |
| `minecraft.player.died` | A player dies | `minecraft.player.name`, `minecraft.death.cause` (like `fall` or `entityAttack`), `minecraft.mob.type` (`none` if no mob did it) |

To add an event to your own mod, print one JSON line with an `event.name`:

```js
console.log(JSON.stringify({ "event.name": "minecraft.lava_boots.worn", "minecraft.player.name": player.name }));
```

The trampoline mod has a small helper for this in [`telemetry.js`](../addons/trampoline/behavior_pack/scripts/telemetry.js).

### Family dashboard

[`dash0/family-dashboard.json`](dash0/family-dashboard.json) is a dashboard made for kids: big counters for wood chopped, blocks dug, mobs beaten and cookies eaten, leaderboards, what got everyone killed, and how hard the server is working.
The game events above come from the Game Stats mod ([`addons/game-stats`](../addons/game-stats)).

To add it in Dash0: **Dashboards → + Add → Edit as JSON**, paste the file's contents, then **Apply** and save.

### Example alerts

Dash0 turns logs into the `dash0.logs` metric, so you can alert on them with PromQL.

The server stopped (no CPU numbers for 5 minutes):

```promql
absent_over_time({otel_metric_name="container.cpu.utilization", service_name="bedrock-server"}[5m])
```

A mod is throwing errors:

```promql
sum(increase({otel_metric_name="dash0.logs", service_name="bedrock-server", otel_log_severity_range="ERROR"}[10m])) > 0
```

Bounces in the last hour, per trampoline size:

```promql
sum by (minecraft_trampoline_size) (increase({otel_metric_name="dash0.logs", event_name="minecraft.trampoline.bounce"}[1h]))
```

## When something goes wrong

| Symptom | Fix |
| --- | --- |
| "Outdated client" or "Outdated server" | Update Minecraft on the device, or run `docker restart family-bedrock` to update the server. |
| "You're not invited to play on this server" | Add that gamertag to `ALLOW_LIST_USERS`, then run `./server/start.sh` again. |
| The server isn't under LAN Games | On Omarchy, check the three `ufw` rules with `sudo ufw status`. The device must be on the same Wi-Fi, not a guest network. On a Mac, add it by IP address instead. |
| "Unable to connect to world" after adding by IP | The UDP ports are blocked: check the firewall (Omarchy) or allow incoming connections (Mac). On a Mac, run `./server/start.sh` again if its address changed. |
| The cookie shows as a purple-and-black box | The resource pack didn't load. Check `TEXTUREPACK_REQUIRED` is `"true"` and rerun `npm run deploy`. |
| A script mod does nothing | Run `docker logs family-bedrock` and look for `[Scripting]` errors, or use `npm run watch`, which shows them. |
| Nothing arrives in Dash0 | Run `docker logs family-otelcol` and look for `error`. Check the endpoint (port `4317`) and token in `server/.env`. |
| "Unknown command" for `/function party` | Put that player's gamertag in `OPS` and run `./server/start.sh` again, or check that `ALLOW_CHEATS` is on. |

## Server console

To type commands straight into the server:

```bash
docker attach family-bedrock
# for example: op KidGamertag1
# leave with Ctrl+P then Ctrl+Q (Ctrl+C would stop the server)
```

## Backups

The whole world lives in `server/data/worlds/`.
Stop the server with `docker stop family-bedrock` and copy that folder somewhere safe before big changes.
