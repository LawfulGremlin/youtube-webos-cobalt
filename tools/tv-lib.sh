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

# --- ssh + luna -------------------------------------------------------------
# The TVs are rooted. Everything the LG SSAP WebSocket API offers (what
# https://github.com/anurmatov/webos-mcp drives, after an on-screen pairing
# prompt) is a luna-service call the SSAP gateway forwards; as root over ssh we
# make the same call directly, no pairing. The ssap://X/Y -> luna://... map is
# on the TV: /usr/palm/services/com.webos.service.secondscreen.gateway/interfaces/

# The ssh key the ares registry holds for a device (~/.ssh/<privateKey.openSsh>).
tv_resolve_key() {
  python3 - "$1" <<'EOF'
import json, os, sys
name = sys.argv[1]
for d in json.load(open(os.path.expanduser('~/.webos/tv/novacom-devices.json'))):
    if d.get('name') == name and d.get('host'):
        key = (d.get('privateKey') or {}).get('openSsh', '')
        print(os.path.expanduser('~/.ssh/' + key) if key else '')
        sys.exit(0)
sys.exit(1)
EOF
}

# Run a shell command on a TV as root. Always allocates a pty (-tt): without
# one luna-send exits 0 and prints NOTHING, indistinguishable from a silent
# permission denial (cost an afternoon on 2026-09-01). The pty's \r is stripped.
# Usage: tv_ssh <device> '<remote sh command>'
tv_ssh() {
  local name="$1" cmd="$2" ip key out rc
  ip=$(tv_resolve_ip "$name") || { echo "no device named '$name' in the ares registry" >&2; return 1; }
  key=$(tv_resolve_key "$name")
  out=$(ssh -tt -o LogLevel=ERROR -i "$key" -o StrictHostKeyChecking=no -o BatchMode=yes -o ConnectTimeout=8 \
        "root@$ip" "$cmd; exit")
  rc=$?
  printf '%s\n' "${out//$'\r'/}"
  return $rc
}

# One luna-service call on a TV, pretty-printed reply on stdout.
# Usage: tv_luna <device> <service/method> [json-payload]
#   tv_luna lg75 com.webos.service.audio/master/getVolume
#   tv_luna lg75 com.webos.service.audio/master/setVolume '{"volume":15}'
tv_luna() {
  local name="$1" uri="$2" json="${3:-{\}}"
  tv_ssh "$name" "luna-send -n 1 -f 'luna://$uri' '${json//\'/\'\\\'\'}'"
}
