#!/usr/bin/env bash
# ./mc <command>: start, stop, and talk to the family server. Run ./mc help for the list.
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")" # follows the link when installed as a global command
SERVER=family-bedrock

usage() {
  cat <<'EOF'
Usage: ./mc <command>

  start      Copy the add-ons in and start the server (starts Colima on a Mac if needed)
  dev        start, then send each add-on change to the server as you save
  stop       Stop the server
  restart    Restart the server, to load changed add-ons
  status     Show whether the server is running and accepting joins
  mods       List the mods the server loaded
  logs       Follow the server log (Ctrl+C stops following, not the server)
  console    Type server commands; leave with Ctrl+P then Ctrl+Q
  cmd <...>  Run one server command, e.g. ./mc cmd time set day
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

case "${1:-help}" in
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
    docker exec "$SERVER" send-command "$*"
    sleep 1
    docker logs --since 2s "$SERVER" 2>&1 | grep -v '^\s*$' || true
    ;;
  help | -h | --help) usage ;;
  *)
    usage >&2
    exit 1
    ;;
esac
