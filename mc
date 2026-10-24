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
  dev                    start, then send each add-on change to the server as you save.
                         Keys run commands: k kit, t test, w world, n NPC, d day, e kill enemies, a reload, r restart, and o options:
                         whether saves go to the server and reload or restart it, kit crafting, peace, fall damage, a server command, mods
  stop                   Stop the server
  restart                Restart the server, to load changed add-ons
  reload                 Reload scripts and functions without kicking anyone (other changes need: mc restart)
  status                 Show whether the server is running and accepting joins
  update                 Update the server to the newest Minecraft, to match devices
  logs                   Follow the server log (Ctrl+C stops following, not the server)

Mods
  mods                   List the mods the server loaded
  install <file> [name]  Install or update a downloaded .mcaddon or .mcpack
  remove <name>          Remove an add-on from addons/ and the server

  kidex                  Kids make and change mods by talking (Kidex: press space, talk, and Claude builds it).
                         The first time, it offers to install Kidex
  kidex app              A Minecraft (Kidex) app on the Dock and the Desktop that opens ./mc kidex
  kidex update           Update the Kidex that ./mc kidex installed

Testing
  test [mod]             Play the mods' e2e tests with simulated players on a separate test server

Worlds (each one is saved; switch back any time)
  world                  List the worlds and show which one the server plays
  world new <name> [seed]  Make a new world and play it (no seed: a random one)
  world play <name>      Switch to a saved world and carry on where you left it
  world rename <name> <new name>  Give a world another name (restarts the server if it plays that world)
  world delete <name>    Delete a world for good

In the game
  kit                    Pick a kit from a list and give it to everyone online
  kit tools [player]     Give diamond tools (to everyone online, or one player)
  kit <kit> [player]     Give what you need to try a mod (its kit.json), one of its extra kits, like weapons-ammo,
                         or a kit from kits/, like bed or wood-spruce (building materials: wood, stone, glass, …).
                         Add --craft for the crafting table and materials too
  peace [on|off]         Peaceful mode: no monsters, and health refills. No argument: show which it is
  fall-damage [on|off]   Turn fall damage on or off. No argument: show which it is
  keep-inventory [on|off]  Whether players keep their things when they die. No argument: show which it is
  npc [instruction]      An NPC joins next to you; with an instruction ("dig a hole next to me"), Claude plans it and an NPC does it.
  npc --remove [name]    Send an NPC away, or all of them
                         An instruction given before reuses its plan without asking Claude; --fresh asks again;
                         --count <n>: n new NPCs come, and each does it (up to 8)
  kill-enemies           Remove every hostile mob (zombies, creepers, skeletons...) in loaded areas
  clear-inventory [backpack|all] [player]  Empty everyone's backpack (or one player's); all empties the item bar too.
                         Armor and the off hand stay
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

# Every kit's name, one a line, and what a kit gives: see tools/lib/kits.mjs.
kit_names() { node tools/kits.mjs names; }

# First ./mc kidex on a new computer: Kidex itself, the tools it hears and talks with, and its speech model.
install_kidex() {
  echo "Kidex lets kids make mods by talking: press space, say what you want, and Claude builds it."
  read -r -p "Kidex isn't installed yet. Install it to $KIDEX_DIR? (about 600 MB with the speech model) [Y/n] " answer
  [[ "${answer:-y}" =~ ^[Yy] ]] || { echo "Install it yourself from https://github.com/mthines/kidex, or set KIDEX_DIR." >&2; return 1; }
  local node_major
  node_major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  [ "$node_major" -ge 22 ] || { echo "Kidex needs Node.js 22 or newer: https://nodejs.org" >&2; return 1; }
  if command -v brew >/dev/null; then
    local missing=()
    command -v ffmpeg >/dev/null || missing+=(ffmpeg)
    command -v whisper-cli >/dev/null || command -v whisper-cpp >/dev/null || missing+=(whisper-cpp)
    [ ${#missing[@]} -eq 0 ] || brew install "${missing[@]}" || return 1
  else
    echo "Kidex needs ffmpeg and whisper.cpp: install Homebrew (https://brew.sh) and run ./mc kidex again, or install them yourself." >&2
  fi
  # Each step returns on failure: set -e doesn't stop a function called with ||.
  mkdir -p "$(dirname "$KIDEX_DIR")" || return 1
  git clone --depth 1 https://github.com/mthines/kidex.git "$KIDEX_DIR" || return 1
  (cd "$KIDEX_DIR" && npm install --no-fund --no-audit && node bin/kidex.mjs setup) || { echo "Kidex didn't finish installing: fix the error above, delete $KIDEX_DIR, and run ./mc kidex again." >&2; return 1; }
  (cd "$KIDEX_DIR" && node bin/kidex.mjs doctor) || true
  echo
  echo "✅ Kidex is installed. It runs Claude with your Claude Code login (or ANTHROPIC_API_KEY)."
  echo "   For a Minecraft (Kidex) icon on the Dock: ./mc kidex app"
}

# The world the server plays, from server/data/world.env (see tools/lib/world.mjs).
current_world() {
  local name
  name="$(sed -n 's/^LEVEL_NAME=//p' server/data/world.env 2>/dev/null || true)"
  echo "${name:-Bedrock level}"
}

# Every world gets Beta APIs: the NPC mod's simulated players need them. They're saved in the world's level.dat,
# which can only change while the server is stopped, so this stops it if needed. The caller starts it again.
ensure_beta_apis() {
  local world
  world="server/data/worlds/$(current_world)"
  node tools/beta-apis.mjs check "$world" && return
  docker stop "$SERVER" >/dev/null 2>&1 || true
  node tools/beta-apis.mjs enable "$world"
}

# Picks the world the server plays next time it starts; a seed only matters for a new world.
# A game rule switched on or off, like fall damage. It's saved in the world, so it survives restarts and stays with that world.
# Usage: switch_rule <game rule> <mc command> <on|off|empty: just show it> <Name> <said when turned on> <said when turned off>
switch_rule() {
  local rule="$1" cmd="$2" arg="$3" name="$4" said_on="$5" said_off="$6" value now since
  if [[ "$(docker inspect -f '{{.State.Running}}' "$SERVER" 2>/dev/null)" != "true" ]]; then
    echo "The server isn't running. Start it with: mc start" >&2
    exit 1
  fi
  case "$arg" in
    on) value=true ;;
    off) value=false ;;
    "") value="" ;;
    *) echo "Usage: mc $cmd [on|off]" >&2; exit 1 ;;
  esac
  since="$(date -u +%Y-%m-%dT%H:%M:%S.000000000Z)"
  docker exec "$SERVER" send-command "gamerule $rule $value"
  sleep 1
  now="$(docker logs --since "$since" "$SERVER" 2>&1 | sed -nE "s/.*$rule( =| has been updated to) (true|false).*/\2/p" | tail -1 | tr -d '\r')"
  case "$now:$value" in
    true:) echo "$name is on. Turn it off with: mc $cmd off" ;;
    false:) echo "$name is off. Turn it on with: mc $cmd on" ;;
    true:true) echo "$said_on" ;;
    false:false) echo "$said_off" ;;
    *) echo "The server didn't answer. Try again, or see: mc logs" >&2; exit 1 ;;
  esac
}

choose_world() {
  printf 'LEVEL_NAME=%s\nLEVEL_SEED=%s\n' "$1" "${2:-}" >server/data/world.env
}

world_name_ok() {
  [[ "$1" =~ ^[A-Za-z0-9][A-Za-z0-9\ _-]*$ ]] || { echo "Use letters, numbers, spaces, - and _ in a world name, like: mc world new \"Cherry Land\" 42" >&2; exit 1; }
}

case "${1:-help}" in
  world)
    worlds=server/data/worlds
    name="${3:-}"
    case "${2:-list}" in
      list)
        current="$(current_world)"
        echo "Worlds (* = the one the server plays):"
        for dir in "$worlds"/*/; do
          [[ -d "$dir" ]] || continue
          w="$(basename "$dir")"
          if [[ "$w" == "$current" ]]; then echo "  * $w"; else echo "    $w"; fi
        done
        [[ -d "$worlds/$current" ]] || echo "  * $current (made when the server next starts)"
        echo "Switch with: mc world play <name>. Make one with: mc world new <name> [seed]"
        ;;
      new)
        world_name_ok "$name"
        [[ ! -d "$worlds/$name" ]] || { echo "There's already a world called $name. Play it with: mc world play \"$name\"" >&2; exit 1; }
        # No seed: pick a random one here. An empty LEVEL_SEED doesn't clear the server's level-seed,
        # so the new world would quietly get the last world's seed and look just like it.
        seed="${4:-$(node -e 'console.log(require("node:crypto").randomBytes(8).readBigInt64LE().toString())')}"
        choose_world "$name" "$seed"
        echo "Making $name from seed $seed (make the same world again with: mc world new <name> $seed). The other worlds stay saved."
        # A new world starts with monsters and fall damage. Peace is server-wide, so it would carry over from the last world.
        sed -i.bak "s/^difficulty=peaceful/difficulty=easy/" server/data/server.properties && rm -f server/data/server.properties.bak
        ./server/start.sh >/dev/null # the new settings recreate the server, which makes the world
        wait_until_joinable
        ensure_beta_apis # needs the world folder, which only exists now (and may stop the server)
        npm run --silent deploy | grep -v "Restart the server" || exit 1 # so do the mods
        docker restart "$SERVER" >/dev/null
        wait_until_joinable
        docker exec "$SERVER" send-command "gamerule falldamage true"
        echo "$name has monsters and fall damage. Change that with: mc peace on, mc fall-damage off"
        ;;
      play)
        world_name_ok "$name"
        [[ -d "$worlds/$name" ]] || { echo "No world called $name. See them with: mc world" >&2; exit 1; }
        choose_world "$name"
        out="$(npm run --silent deploy 2>&1)" || { echo "$out"; exit 1; }
        ensure_beta_apis
        ./server/start.sh >/dev/null
        echo "Playing $name."
        wait_until_joinable
        ;;
      rename)
        new="${4:-}"
        world_name_ok "$name"
        world_name_ok "$new"
        [[ -d "$worlds/$name" ]] || { echo "No world called $name. See them with: mc world" >&2; exit 1; }
        [[ ! -e "$worlds/$new" ]] || { echo "There's already a world called $new." >&2; exit 1; }
        if [[ "$name" == "$(current_world)" ]]; then
          # The server has the world open, so it stops while the folder moves, then starts with the new name.
          seed="$(sed -n 's/^LEVEL_SEED=//p' server/data/world.env)"
          docker stop "$SERVER" >/dev/null 2>&1 || true
          mv "$worlds/$name" "$worlds/$new"
          [[ ! -f "$worlds/$new/levelname.txt" ]] || printf '%s' "$new" >"$worlds/$new/levelname.txt"
          choose_world "$new" "$seed"
          ./server/start.sh >/dev/null
          echo "Renamed $name to $new."
          wait_until_joinable
        else
          mv "$worlds/$name" "$worlds/$new"
          [[ ! -f "$worlds/$new/levelname.txt" ]] || printf '%s' "$new" >"$worlds/$new/levelname.txt"
          echo "Renamed $name to $new."
        fi
        ;;
      delete)
        world_name_ok "$name"
        [[ -d "$worlds/$name" ]] || { echo "No world called $name. See them with: mc world" >&2; exit 1; }
        [[ "$name" != "$(current_world)" ]] || { echo "The server plays $name now. Switch to another world first: mc world play <name>" >&2; exit 1; }
        if [[ "${4:-}" != "--yes" ]]; then # mc dev asks for the name itself, then passes --yes
          read -r -p "Delete $name for good? It can't come back. Type the name to confirm: " answer
          [[ "$answer" == "$name" ]] || { echo "Kept $name."; exit 0; }
        fi
        rm -rf "${worlds:?}/$name"
        echo "Deleted $name."
        ;;
      *) usage >&2; exit 1 ;;
    esac
    ;;
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
    # mc kit: pick from a list. mc kit tools [player]: diamond tools. mc kit <kit> [player]: a kit from kit_names.
    # --craft anywhere also gives the kit's crafting table and materials (its "craft" list).
    craft=false args=()
    for arg in "${@:2}"; do if [[ "$arg" == "--craft" ]]; then craft=true; else args+=("$arg"); fi; done
    set -- kit ${args[@]+"${args[@]}"}
    if [[ -z "${2:-}" && -t 0 ]]; then
      # Each line of kits.mjs menu is "<kit> <emoji> <kit>": the list shows the emoji and name, and gives the kit.
      names=() labels=()
      while read -r kit label; do names+=("$kit") labels+=("$label"); done < <(node tools/kits.mjs menu)
      echo "Which kit? (tools = diamond tools)"
      PS3="Number: "
      select label in "${labels[@]}"; do [[ -n "$label" ]] && choice="${names[REPLY - 1]}" && break; done
      [[ -n "${choice:-}" ]] || exit 1
      exec "$0" kit "$choice" $([[ "$craft" == true ]] && echo --craft)
    fi
    [[ "${2:-}" == "tools" ]] && set -- kit "" "${@:3}"
    if [[ -n "${2:-}" ]] && items="$(node tools/kits.mjs items "$2" $([[ "$craft" == true ]] && echo --craft))"; then
      mod="$2"
      who="${3:-@a}"
    else
      mod=""
      who="${2:-@a}"
      items="$(printf 'minecraft:diamond_%s 1\n' sword pickaxe axe shovel hoe)"
    fi
    since="$(date -u +%Y-%m-%dT%H:%M:%S.000000000Z)"
    while read -r item count; do
      docker exec "$SERVER" send-command "give $who $item $count"
    done <<<"$items"
    sleep 1
    if docker logs --since "$since" "$SERVER" 2>&1 | grep -q "No targets matched"; then
      echo "Nobody to give it to: ${who/#@a/no one is online}. Join the server, then run it again." >&2
      exit 1
    fi
    echo "Gave ${who/#@a/everyone online}: $(echo "$items" | awk '{printf "%s%s ×%s", (NR>1 ? ", " : ""), $1, $2}')"
    [[ -n "$mod" ]] || echo "Other kits: $(kit_names | tr '\n' ' ')"
    [[ -z "$mod" || "$craft" == true ]] || ! node tools/kits.mjs has-craft "$mod" ||
      echo "For the crafting table and materials too: mc kit $mod ${3:+$3 }--craft"
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
    # A running server stays up (mc dev opened again just reconnects); only new settings or Beta APIs restart it.
    running_since() { docker inspect -f '{{if .State.Running}}{{.State.StartedAt}}{{end}}' "$SERVER" 2>/dev/null || true; }
    before="$(running_since)"
    ensure_beta_apis
    if [[ -z "$before" ]]; then
      ./server/start.sh
    else
      out="$(./server/start.sh 2>&1)" || { echo "$out"; exit 1; }
      if [[ "$(running_since)" == "$before" ]]; then
        echo "The server was already running, so it kept going: nobody got kicked."
      else
        echo "Restarted the server for its new settings."
      fi
    fi
    wait_until_joinable
    ;;
  dev)
    # In a terminal: a screen with the server's state and keys for kits, tests, and more (tools/dev.mjs).
    [[ -t 0 && -t 1 ]] && exec node tools/dev.mjs
    "$0" start
    exec npm run --silent watch
    ;;
  stop) docker compose -p server stop ;;
  restart)
    ensure_beta_apis
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
  peace)
    # The difficulty lives in server.properties, so it survives restarts; the difficulty command changes it right away.
    props=server/data/server.properties
    current="$(sed -n 's/^difficulty=//p' "$props" | tr -d '\r')"
    case "${2:-}" in
      on) level=peaceful ;;
      off) level=easy ;;
      "")
        if [[ "$current" == "peaceful" ]]; then echo "Peace mode is on. Turn it off with: mc peace off"; else echo "Peace mode is off (difficulty: $current). Turn it on with: mc peace on"; fi
        exit 0
        ;;
      *) echo "Usage: mc peace [on|off]" >&2; exit 1 ;;
    esac
    sed -i.bak "s/^difficulty=.*/difficulty=$level/" "$props" && rm -f "$props.bak"
    if [[ "$(docker inspect -f '{{.State.Running}}' "$SERVER" 2>/dev/null)" == "true" ]]; then
      docker exec "$SERVER" send-command "difficulty $level"
    fi
    if [[ "$level" == "peaceful" ]]; then echo "Peace mode on: monsters are gone and won't spawn, and health refills."; else echo "Peace mode off: monsters are back (difficulty: easy)."; fi
    ;;
  fall-damage) switch_rule falldamage fall-damage "${2:-}" "Fall damage" "Fall damage on: falling hurts again." "Fall damage off: fall as far as you like." ;;
  keep-inventory) switch_rule keepinventory keep-inventory "${2:-}" "Keep inventory" "Keep inventory on: players keep their things when they die." "Keep inventory off: players drop their things when they die again." ;;
  reload)
    # Scripts and functions, in a second. Items, recipes, pictures, and new script files need a restart:
    # on this server "reload all" does no more than "reload" (tried 2026-10-23).
    since="$(date -u +%Y-%m-%dT%H:%M:%S.000000000Z)"
    docker exec "$SERVER" send-command "reload"
    for _ in $(seq 1 60); do
      docker logs --since "$since" "$SERVER" 2>&1 | grep -qiE "reloaded|Server started|error" && break
      sleep 1
    done
    docker logs --since "$since" "$SERVER" 2>&1 | grep -v '\[Scripting\] {' | sed -nE 's/.*(INFO|WARN|ERROR)\] //p' | tr -d '\r'
    ;;
  kidex)
    # Kidex (github.com/mthines/kidex): kids make and change mods by talking. What it may do is in kidex.json.
    # A global kidex wins; otherwise Kidex lives in KIDEX_DIR, and the first ./mc kidex offers to install it there.
    shift
    KIDEX_DIR="${KIDEX_DIR:-$HOME/.kidex/app}"
    if command -v kidex >/dev/null; then kidex=(kidex)
    elif [ -f "$KIDEX_DIR/bin/kidex.mjs" ]; then kidex=(node "$KIDEX_DIR/bin/kidex.mjs")
    else
      install_kidex || exit 1
      kidex=(node "$KIDEX_DIR/bin/kidex.mjs")
    fi
    case "${1:-}" in
      app)
        # A Minecraft (Kidex) app on the Dock and the Desktop that opens ./mc kidex in this folder.
        shift
        if [ -d "/Applications/Minecraft Bedrock Launcher.app" ]; then icon=(--icon-app "Minecraft Bedrock Launcher")
        else icon=(--icon ⛏️ --color "#5d9b3a"); fi
        exec "${kidex[@]}" app . --name Minecraft "${icon[@]}" --command "./mc kidex" "$@"
        ;;
      update)
        [ -d "$KIDEX_DIR/.git" ] || { echo "Kidex wasn't installed by ./mc kidex: update it where it is (${kidex[*]})." >&2; exit 1; }
        git -C "$KIDEX_DIR" pull --ff-only && (cd "$KIDEX_DIR" && npm install --no-fund --no-audit)
        ;;
      *) exec "${kidex[@]}" . "$@" ;;
    esac
    ;;
  npc)
    # Simulated players from the npc mod; the server needs Beta APIs (ensure_beta_apis) for them. See tools/npc.mjs.
    shift
    exec node tools/npc.mjs "$@"
    ;;
  kill-enemies)
    # Hostile mobs all belong to the "monster" family. Only loaded areas (near players) have any to remove.
    since="$(date -u +%Y-%m-%dT%H:%M:%S.000000000Z)"
    docker exec "$SERVER" send-command "kill @e[family=monster]"
    sleep 1
    docker logs --since "$since" "$SERVER" 2>&1 | grep -qE "No targets matched" && echo "No enemies around." \
      || docker logs --since "$since" "$SERVER" 2>&1 | sed -n 's/.*INFO\] //p' | tr -d '\r'
    ;;
  clear-inventory)
    # The backpack is slot.inventory 0-26 and the item bar slot.hotbar 0-8, so armor and the off hand stay
    # (/clear would take those too). The server reads one command a line, so all of them go in one send-command.
    case "${2:-backpack}" in
      backpack) slots=(inventory:26) what="backpack" ;;
      all) slots=(inventory:26 hotbar:8) what="backpack and item bar" ;;
      *) echo "Usage: mc clear-inventory [backpack|all] [player]" >&2; exit 1 ;;
    esac
    who="${3:-@a}"
    [[ "$who" == @* || "$who" != *" "* ]] || who="\"$who\""
    commands=""
    for slot in "${slots[@]}"; do
      for i in $(seq 0 "${slot#*:}"); do commands+="replaceitem entity $who slot.${slot%:*} $i air"$'\n'; done
    done
    since="$(date -u +%Y-%m-%dT%H:%M:%S.000000000Z)"
    docker exec "$SERVER" send-command "${commands%$'\n'}"
    sleep 1
    if docker logs --since "$since" "$SERVER" 2>&1 | grep -q "No targets matched"; then
      echo "Nobody to clear: ${who/#@a/no one is online}." >&2
      exit 1
    fi
    echo "Emptied the $what of ${who/#@a/everyone online}."
    ;;
  test)
    # Simulated players play each mod's tests/e2e.js on a separate test server (tools/e2e.mjs).
    shift
    exec node tools/e2e.mjs "$@"
    ;;
  help | -h | --help) usage ;;
  *)
    usage >&2
    exit 1
    ;;
esac
