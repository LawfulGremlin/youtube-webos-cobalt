#!/bin/bash
# Press remote-control buttons on a rooted TV: webos-mcp's tv_press_button /
# tv_move_pointer / tv_click without SSAP pairing. Paired SSAP clients get a
# WebSocket that the gateway relays onto the TV-local unix socket
# /tmp/netinput.pointer.sock; as root over ssh we write the same frames to that
# socket directly (via node, which every webOS TV ships — busybox nc has no -U).
#
# UNVERIFIED: the socket accepts the frames (connect + write both succeed), but
# a VOLUMEUP frame sent this way left the volume unchanged on lg75 on
# 2026-09-01, so delivery to the socket is NOT proof the TV acted on it. Check
# a press by its effect on screen (tv-screenshot.sh before/after) before
# trusting this for anything. Where tv-ctl.sh has a luna equivalent (volume,
# mute, media keys, channel), prefer that — luna answers with a returnValue.
#
# Usage: tools/tv-key.sh <device-name> <action> [action ...]
#   BUTTON       UP DOWN LEFT RIGHT ENTER BACK HOME EXIT MENU INFO DASH
#                PLAY PAUSE STOP REWIND FASTFORWARD MUTE VOLUMEUP VOLUMEDOWN
#                CHANNELUP CHANNELDOWN RED GREEN YELLOW BLUE 0..9
#   move:DX,DY   move the magic-remote pointer by (DX,DY) pixels
#   click        click at the current pointer position
# Actions go out 150ms apart. Example: tools/tv-key.sh lg75 HOME DOWN DOWN ENTER

set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
source "$HERE/tv-lib.sh"

DEVICE="${1:-}"; shift || true
[ -z "$DEVICE" ] || [ $# -eq 0 ] && { sed -n '/^# Usage/,/^$/p' "$0" | sed 's/^# \{0,1\}//'; exit 1; }

# getPointerInputSocket (re)creates the socket and tells us where it is; the
# node script then streams the frames. Wire format is the SSAP pointer socket's:
# "type:button\nname:X\n\n", "type:move\ndx:X\ndy:Y\ndown:0\n\n", "type:click\n\n".
JS=$(base64 -w0 <<'JSEOF'
const [sock, ...acts] = process.argv.slice(2);
const s = require('net').connect(sock);
s.on('error', e => { console.error('pointer socket: ' + e.message); process.exit(1); });
s.on('connect', () => {
  let i = 0;
  (function next() {
    if (i >= acts.length) { s.end(); return; }
    const a = acts[i++], m = a.match(/^move:(-?\d+),(-?\d+)$/);
    s.write(m ? 'type:move\ndx:' + m[1] + '\ndy:' + m[2] + '\ndown:0\n\n'
          : a === 'click' ? 'type:click\n\n'
          : 'type:button\nname:' + a.toUpperCase() + '\n\n');
    setTimeout(next, 150);
  })();
});
JSEOF
)
tv_ssh "$DEVICE" "sock=\$(luna-send -n 1 luna://com.webos.service.networkinput/getPointerInputSocket '{}' | sed -n 's/.*\"socketPath\": *\"\([^\"]*\)\".*/\1/p'); echo '$JS' | base64 -d > /tmp/tv-key.js && node /tmp/tv-key.js \"\$sock\" $* && echo \"sent: $*\""
