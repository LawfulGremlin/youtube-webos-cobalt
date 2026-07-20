# Shared helpers for tools/tv-*.sh. Source, don't execute:
#   source "$(dirname "$0")/tv-lib.sh"
#
# fork: every tv-*.sh tool takes an ares-cli device name (e.g. "lg48"), not a
# bare IP — one source of truth for "what IP is lg48" (the same
# ~/.webos/tv/novacom-devices.json ares-setup-device already maintains)
# instead of hardcoding or re-typing it per script.

tv_resolve_ip() {
  python3 - "$1" <<'EOF'
import json, os, sys
name = sys.argv[1]
path = os.path.expanduser('~/.webos/tv/novacom-devices.json')
devices = json.load(open(path))
for d in devices:
    if d.get('name') == name and d.get('host'):
        print(d['host'])
        sys.exit(0)
sys.exit(1)
EOF
}

# Poll a TV's CDP endpoint until it responds or the timeout elapses.
# Usage: tv_wait_cdp <ip> [timeout_seconds=20]
tv_wait_cdp() {
  local ip="$1" timeout="${2:-20}" i
  for i in $(seq 1 "$timeout"); do
    curl -s -m 2 "http://$ip:9222/json" >/dev/null 2>&1 && return 0
    sleep 1
  done
  return 1
}

# Evaluate JS on a TV over CDP and print just the result value.
# Usage: tv_cdp_eval <ip> '<js expression>'
tv_cdp_eval() {
  local ip="$1" expr="$2" here
  here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  python3 "$here/cdp-eval.py" "$ip" "$expr" 2>/dev/null \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('result',{}).get('result',{}).get('value',''))" 2>/dev/null
}
