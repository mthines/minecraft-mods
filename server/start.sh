#!/usr/bin/env bash
# Starts (or updates) the family server with the right settings for this computer.
set -euo pipefail
cd "$(dirname "$0")"

if [[ "$(uname)" == "Darwin" ]]; then
  HOST_IP="${HOST_IP:-$(ipconfig getifaddr en0 || ipconfig getifaddr en1 || true)}"
  if [[ -z "$HOST_IP" ]]; then
    echo "Couldn't find this Mac's Wi-Fi address. Run it like this instead: HOST_IP=192.168.1.20 ./start.sh" >&2
    exit 1
  fi
  export HOST_IP
  docker compose -f docker-compose.yml -f docker-compose.mac.yml up -d
  echo "Server starting at $HOST_IP. Devices join with Servers → Add Server → $HOST_IP, port 19132."
else
  docker compose up -d
  echo "Server starting. Devices on the same Wi-Fi find it under Friends → LAN Games."
fi
echo "Watch it start with: docker logs -f family-bedrock"
