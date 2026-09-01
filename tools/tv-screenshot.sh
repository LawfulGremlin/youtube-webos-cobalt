#!/bin/bash
# Grab what a TV is showing right now, as a JPEG. webos-mcp's tv_take_screenshot
# (ssap://tv/executeOneShot) without the SSAP pairing prompt: the capture
# service that SSAP call wraps is called directly on the TV's luna bus as root,
# then the file is scp'd home. Payload is what the gateway's apiadapter sends
# (/usr/palm/services/com.webos.service.apiadapter/adapters/tv/index.js on the
# TV) at full resolution instead of its 960x540. A black image is a *successful*
# capture of a black or DRM-protected screen.
#
# Usage: tools/tv-screenshot.sh <device-name> [out.jpg] [WxH]
#   default out: <device>-<timestamp>.jpg in the cwd; default size 1920x1080

set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
source "$HERE/tv-lib.sh"

DEVICE="$1"
OUT="${2:-$DEVICE-$(date +%Y%m%d-%H%M%S).jpg}"
SIZE="${3:-1920x1080}"
[ -z "$DEVICE" ] && { echo "usage: $0 <device-name> [out.jpg] [WxH]"; exit 1; }
W="${SIZE%x*}"; H="${SIZE#*x}"

IP=$(tv_resolve_ip "$DEVICE") || { echo "no device named '$DEVICE' in the ares registry"; exit 1; }
KEY=$(tv_resolve_key "$DEVICE")

REPLY=$(tv_luna "$DEVICE" com.webos.service.capture/executeOneShot \
  "{\"path\":\"/tmp/tv-screenshot.jpg\",\"method\":\"DISPLAY\",\"width\":$W,\"height\":$H,\"format\":\"JPEG\"}")
echo "$REPLY" | grep -q '"returnValue": true' || { echo "capture failed:"; echo "$REPLY"; exit 1; } >&2
scp -q -i "$KEY" -o StrictHostKeyChecking=no "root@$IP:/tmp/tv-screenshot.jpg" "$OUT"
echo "$OUT (${W}x${H}, $(stat -c %s "$OUT") bytes)"
