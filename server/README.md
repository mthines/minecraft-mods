# Hosting the family server

The server runs Mojang's Bedrock Dedicated Server in Docker.
Every Bedrock device can join it: Switch, Xbox, PlayStation, iPad, Android, and Windows.
Devices get the mods automatically when they join, so you never install anything on the consoles.

## What you need

- An always-on x86-64 computer: an old laptop, a mini PC, or a Linux box. A Raspberry Pi works but runs the server through emulation, so expect lag.
- [Docker](https://docs.docker.com/get-docker/) with Docker Compose.
- [Node.js](https://nodejs.org/) 20 or newer, to deploy the add-ons.
- A Microsoft account for every player. On child accounts, a parent must allow **"Join multiplayer games"** in [Xbox Family Settings](https://www.xbox.com/family-app).

## First start

1. Open `docker-compose.yml` and put your family's gamertags in `ALLOW_LIST_USERS`.
2. Start the server so it creates the world:

   ```bash
   cd server
   docker compose up -d
   docker compose logs -f   # wait for "Server started.", then press Ctrl+C
   ```

3. Copy the add-ons in and turn them on, then restart:

   ```bash
   cd ..
   npm run deploy
   docker compose -f server/docker-compose.yml restart
   ```

4. Make yourself an operator so `/function party` works:

   ```bash
   docker attach family-bedrock
   op YourGamertag
   # detach with Ctrl+P then Ctrl+Q (Ctrl+C would stop the server)
   ```

Run `npm run deploy` and restart again whenever you change a mod.

## Joining

| Where the player is | How they join |
| --- | --- |
| Same Wi-Fi, any device | **Play → Friends**. The server appears under **LAN Games**. |
| Elsewhere, on a phone, tablet, or PC | **Play → Servers → Add Server**, using your home's public IP and port `19132`. Forward UDP `19132` on your router to the server computer. |
| Elsewhere, on a console | Consoles can't add custom servers. Use a tool like [BedrockConnect](https://github.com/Pugmatt/BedrockConnect), or have them join through a friend on the same network. |

## When something goes wrong

| Symptom | Fix |
| --- | --- |
| "Outdated client" or "Outdated server" | Update Minecraft on the device, or restart the server so `VERSION: LATEST` pulls the new release. |
| The cookie shows as a purple-and-black box | The resource pack didn't load. Check `TEXTUREPACK_REQUIRED` is `"true"` and rerun `npm run deploy`. |
| A script mod does nothing | Run `docker compose logs` and look for `[Scripting]` errors. |
| "Unknown command" for `/function party` | The player isn't an operator, or `ALLOW_CHEATS` is off. |
| Kids can't see the server under LAN Games | The server computer and the device must be on the same network, and the firewall must allow UDP `19132`. |

## Backups

The whole world lives in `server/data/worlds/`.
Stop the server and copy that folder somewhere safe before big changes.
