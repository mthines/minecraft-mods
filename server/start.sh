#!/usr/bin/env bash
# Starts (or updates) the family server with the right settings for this computer.
set -euo pipefail
cd "$(dirname "$0")"

if [[ "$(uname)" == "Darwin" ]] && command -v colima >/dev/null && ! colima status >/dev/null 2>&1; then
  echo "Starting Colima..."
  colima start --network-address --port-forwarder grpc
fi

files=(-f docker-compose.yml)
# Colima started with --network-address gives its VM an address the Mac reaches without NAT.
# Host networking inside that VM is the only setup where the game's NetherNet (WebRTC) connection works.
VM_IP=""
if [[ "$(uname)" == "Darwin" ]] && command -v colima >/dev/null; then
  VM_IP="$(colima status -j 2>/dev/null | sed -n 's/.*"ip_address":"\([^"]*\)".*/\1/p')"
fi
if [[ "$(uname)" == "Darwin" && -z "$VM_IP" ]]; then
  files+=(-f docker-compose.mac.yml)
  echo "Warning: no Colima VM address, so joining will likely fail with a NetherNet error." >&2
  echo "Fix: colima stop && colima start --network-address --port-forwarder grpc" >&2
fi
if [[ -f .env ]] && grep -q '^DASH0_AUTH_TOKEN=auth_' .env && ! grep -q '^DASH0_AUTH_TOKEN=auth_x*$' .env; then
  files+=(-f docker-compose.telemetry.yml)
  echo "Sending telemetry to Dash0 (server/.env)."
fi

if [[ -n "$VM_IP" ]]; then
  docker compose "${files[@]}" up -d
  echo "Server starting at $VM_IP (the Colima VM). On this Mac: Servers → Add Server → $VM_IP, port 19132."
elif [[ "$(uname)" == "Darwin" ]]; then
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
