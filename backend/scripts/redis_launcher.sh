#!/bin/bash
# Ensures a local redis-server exists (container resets drop apt packages), then runs it in the foreground.
if ! command -v redis-server >/dev/null 2>&1; then
  apt-get install -y redis-server >/dev/null 2>&1 || (apt-get update >/dev/null 2>&1 && apt-get install -y redis-server >/dev/null 2>&1)
fi
exec redis-server --bind 127.0.0.1 --port 6379 --save "" --appendonly no
