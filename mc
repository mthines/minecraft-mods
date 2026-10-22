#!/usr/bin/env bash
# ./mc <command>: start, stop, and talk to the family server. Run ./mc help for the list.
set -euo pipefail
CALLER_DIR="$PWD" # where mc was run from, for file paths like mc install ./mod.mcaddon
cd "$(dirname "$(readlink -f "$0")")" # follows the link when installed as a global command
SERVER=family-bedrock

usage() {
  cat <<'EOF'
Usage: mc <command>

Server
  start                  Copy the add-ons in and start the server (starts Colima on a Mac if needed)
  dev                    start, then send each add-on change to the server as you save
  stop                   Stop the server
  restart                Restart the server, to load changed add-ons
  status                 Show whether the server is running and accepting joins
  update                 Update the server to the newest Minecraft, to match devices
  logs                   Follow the server log (Ctrl+C stops following, not the server)

Mods
  mods                   List the mods the server loaded
  install <file> [name]  Install or update a downloaded .mcaddon or .mcpack
  remove <name>          Remove an add-on from addons/ and the server

In the game
  kit [player]           Give diamond tools to everyone online (or one player)
  cmd <command>          Run one server command, e.g. mc cmd time set day
  console                Type server commands; leave with Ctrl+P then Ctrl+Q
EOF
}

# Waits until the health check says players can join (server/docker-compose.yml).
wait_until_joinable() {
  printf "Waiting until players can join"
  for _ in $(seq 1 90); do
    case "$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$SERVER" 2>/dev/null)" in
      healthy | "") echo " ready!"; return ;;
      unhealthy) break ;;
    esac
    printf "."
    sleep 2
  done
  echo
  echo "Not accepting joins yet. It restarts itself if this lasts; see ./mc logs." >&2
  return 1
}

# Copies the add-ons to the server and restarts it if it's running, so changes take effect.
deploy_and_restart() {
  npm run --silent deploy | grep -v "Restart the server" || return 1
  if [[ "$(docker inspect -f '{{.State.Running}}' "$SERVER" 2>/dev/null)" == "true" ]]; then
    docker restart "$SERVER" >/dev/null
    wait_until_joinable
  else
    echo "The server isn't running. Start it with: mc start"
  fi
}

# The Minecraft version the server ran at its last start, like 1.26.52.3.
server_version() {
  docker logs "$SERVER" 2>&1 | sed -n 's/.*INFO\] Version: //p' | tail -1 | tr -d '\r'
}

case "${1:-help}" in
  install)
    [[ -n "${2:-}" ]] || { echo "Usage: mc install <file.mcaddon | file.mcpack | folder> [name]" >&2; exit 1; }
    node tools/install.mjs "$(cd "$CALLER_DIR" && realpath "$2")" "${3:-}"
    deploy_and_restart
    ;;
  remove)
    name="${2:-}"
    [[ "$name" =~ ^[a-z0-9][a-z0-9-]*$ && -d "addons/$name" ]] || { echo "Usage: mc remove <name>. Add-ons: $(ls addons | tr '\n' ' ')" >&2; exit 1; }
    read -r -p "Remove $name? This deletes addons/$name and turns it off in the world. [y/N] " answer
    [[ "$answer" =~ ^[yY] ]] || { echo "Kept $name."; exit 0; }
    rm -rf "addons/$name"
    echo "Removed $name. (If it was committed, git checkout addons/$name brings it back.)"
    deploy_and_restart
    ;;
  kit)
    # Diamond tools for everyone online, or one player: mc kit ThirdChalk2589
    who="${2:-@a}"
    for item in diamond_sword diamond_pickaxe diamond_axe diamond_shovel diamond_hoe; do
      docker exec "$SERVER" send-command "give $who $item 1"
    done
    echo "Gave diamond sword, pickaxe, axe, shovel, and hoe to ${2:-everyone online}."
    ;;
  update)
    # Devices update Minecraft by themselves, and the server must run the same version or nobody can join.
    before="$(server_version)"
    docker compose -p server -f server/docker-compose.yml pull --quiet bedrock autoheal
    ./server/start.sh >/dev/null
    docker restart "$SERVER" >/dev/null # downloads the newest Minecraft server as it starts
    wait_until_joinable
    after="$(server_version)"
    if [[ "$before" == "$after" ]]; then echo "Already up to date: Minecraft $after"; else echo "Updated Minecraft from $before to $after"; fi
    ;;
  start)
    out="$(npm run --silent deploy 2>&1)" || { echo "$out"; exit 1; }
    ./server/start.sh
    wait_until_joinable
    ;;
  dev)
    "$0" start
    exec npm run --silent watch
    ;;
  stop) docker compose -p server stop ;;
  restart)
    docker restart "$SERVER" >/dev/null
    wait_until_joinable
    ;;
  status) docker compose -p server ps --format "table {{.Name}}\t{{.Status}}" ;;
  mods)
    # The server prints a "Pack Stack" line for every behavior pack it loads; show the last start's.
    echo "Mods the server loaded when it last started:"
    docker logs "$SERVER" 2>&1 | awk '
      /INFO\] Starting Server/ { n = 0 }
      /Pack Stack - / {
        name = $0; sub(/.*Pack Stack - \[[0-9]+\] /, "", name); sub(/ \(id:.*/, "", name)
        ver = $0; sub(/.*version: /, "", ver); sub(/\).*/, "", ver)
        list[n++] = sprintf("  %-20s %s", name, ver)
      }
      END { for (i = 0; i < n; i++) print list[i]; if (n == 0) print "  none (is the server running? ./mc status)" }'
    ;;
  logs) docker logs -f --tail 50 "$SERVER" ;;
  console)
    echo "Type a command like: give @a diamond 5"
    echo "Leave with Ctrl+P then Ctrl+Q. Ctrl+C here stops the server."
    docker attach "$SERVER"
    ;;
  cmd)
    shift
    since="$(date -u +%Y-%m-%dT%H:%M:%S.000000000Z)"
    docker exec "$SERVER" send-command "$*"
    sleep 1
    docker logs --since "$since" "$SERVER" 2>&1 | grep -v '^\s*$' || true
    ;;
  help | -h | --help) usage ;;
  *)
    usage >&2
    exit 1
    ;;
esac
