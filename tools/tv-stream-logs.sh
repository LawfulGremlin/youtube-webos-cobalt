#!/bin/bash
# Stream a TV's kernel log, system logs (/var/log/messages, legacy-log), the
# starterless runtime log and a memory/CMA/temperature sample every 10 s into
# <out-dir>, until killed. The TV's own logs start over at every boot, so a
# stream that stops because the TV went down is the point: the files keep
# what led up to it. Each file ends with a line saying when and how its
# stream ended.
#
# Usage: tools/tv-stream-logs.sh <device-name> <out-dir>

HERE="$(cd "$(dirname "$0")" && pwd)"
source "$HERE/tv-lib.sh"

DEVICE="$1"
OUT="$2"
[ -z "$DEVICE" ] || [ -z "$OUT" ] && { echo "usage: $0 <device-name> <out-dir>"; exit 1; }
IP=$(tv_resolve_ip "$DEVICE") || { echo "no device named '$DEVICE' in the ares registry"; exit 1; }
KEY=$(tv_resolve_key "$DEVICE")
mkdir -p "$OUT"

# No pty: output streams line by line. Keepalives end a stream within ~15 s
# of the TV dropping off the network.
stream() {
  local file="$1" cmd="$2"
  ssh -o LogLevel=ERROR -i "$KEY" -o StrictHostKeyChecking=no -o BatchMode=yes -o ConnectTimeout=8 \
    -o ServerAliveInterval=5 -o ServerAliveCountMax=3 "root@$IP" "$cmd" >>"$OUT/$file" 2>&1
  echo "=== stream ended $(date '+%F %T') (ssh exit $?)" >>"$OUT/$file"
}

stream kernel.log 'dmesg -w -T' &
stream messages.log 'tail -F /var/log/messages' &
stream legacy.log 'tail -F /var/log/legacy-log' &
stream runtime.log 'tail -F /tmp/cobalt-starterless.log' &
stream mem.log 'while :; do echo "$(date +%T) $(grep -E "^(MemAvailable|CmaFree)" /proc/meminfo | tr -s " " | tr "\n" " ")temp=$(cat /sys/class/thermal/thermal_zone0/temp) load=$(cut -d" " -f1 /proc/loadavg)"; sleep 10; done' &
# kill 0 also reaches the ssh processes inside the subshells. Start this in its
# own process group (setsid) when a caller's group must survive.
trap 'trap - EXIT INT TERM; kill 0' EXIT INT TERM
echo "streaming $DEVICE logs into $OUT"
wait
