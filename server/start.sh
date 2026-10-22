#!/usr/bin/env bash
# Starts (or updates) the family server with the right settings for this computer.
set -euo pipefail
cd "$(dirname "$0")"

files=(-f docker-compose.yml)
if [[ "$(uname)" == "Darwin" ]]; then
  files+=(-f docker-compose.mac.yml)
fi
if [[ -f .env ]] && grep -q '^DASH0_AUTH_TOKEN=auth_' .env && ! grep -q '^DASH0_AUTH_TOKEN=auth_x*$' .env; then
  files+=(-f docker-compose.telemetry.yml)
  echo "Sending telemetry to Dash0 (server/.env)."
fi

if [[ "$(uname)" == "Darwin" ]]; then
  HOST_IP="${HOST_IP:-$(ipconfig getifaddr en0 || ipconfig getifaddr en1 || true)}"
  if [[ -z "$HOST_IP" ]]; then
    echo "Couldn't find this Mac's Wi-Fi address. Run it like this instead: HOST_IP=192.168.1.20 ./start.sh" >&2
    exit 1
  fi
  export HOST_IP
  docker compose "${files[@]}" up -d
  echo "Server starting at $HOST_IP. Devices join with Servers → Add Server → $HOST_IP, port 19132."
else
  docker compose "${files[@]}" up -d
  echo "Server starting. Devices on the same Wi-Fi find it under Friends → LAN Games."
fi
echo "Watch it start with: docker logs -f family-bedrock"
