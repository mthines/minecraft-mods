#!/bin/sh
# Runs before the server (docker-compose.yml) and waits until the join port is free.
# After a restart, connections from the last run linger in TCP TIME_WAIT for up to a minute.
# The server can't open port 19132 (hex 4ABC) while they do, and doesn't say so: it runs, but nobody can join.
i=0
while grep -qE ':4ABC [0-9A-F:]+ 06 ' /proc/net/tcp /proc/net/tcp6 2>/dev/null && [ "$i" -lt 70 ]; do
  [ "$i" -eq 0 ] && echo "Waiting up to a minute for the last run's connections on port 19132 to close..."
  i=$((i + 1))
  sleep 1
done
exec "$@"
