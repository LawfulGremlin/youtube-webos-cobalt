#!/bin/bash
# Quick status check for one or more registered TVs: reachable, CDP up,
# which app(s) are currently running. See FORK.md ("Debug builds").
#
# Usage: tools/tv-status.sh [device-name ...]
# With no args, checks every non-emulator device in the ares registry.

set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
source "$HERE/tv-lib.sh"

DEVICES=("$@")
if [ ${#DEVICES[@]} -eq 0 ]; then
  mapfile -t DEVICES < <(python3 -c "
import json, os
devices = json.load(open(os.path.expanduser('~/.webos/tv/novacom-devices.json')))
for d in devices:
    if d.get('name') and d.get('name') != 'emulator':
        print(d['name'])
")
fi

for name in "${DEVICES[@]}"; do
  ip=$(tv_resolve_ip "$name")
  if [ -z "$ip" ]; then
    echo "$name: not found in ares device registry"
    continue
  fi

  if ! ping -c 1 -W 2 "$ip" >/dev/null 2>&1; then
    echo "$name ($ip): DOWN"
    continue
  fi

  cdp="no CDP"
  if curl -s -m 3 "http://$ip:9222/json" >/dev/null 2>&1; then
    cdp="CDP up"
  fi

  running=$(ares-launch --device "$name" -r 2>/dev/null | tail -n +2 | tr '\n' ' ')
  [ -z "$running" ] && running="(nothing running, or device unregistered for ares)"

  echo "$name ($ip): UP, $cdp, running: $running"
done
