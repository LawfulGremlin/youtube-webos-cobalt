#!/bin/bash
# Install a starterless (v2) IPK under an id whose app already holds a signed-in
# session, keeping that session. Uninstall first: installing 2.x over 1.x
# crash-loops (existing directories keep their owner, upstream #2), and the
# uninstall wipes the app directory, so the login is saved and put back.
#
# The login is Cobalt's storage file for the https://www.youtube.com/tv origin.
# The 1.x starter keeps it in content/; the starterless runtime reads it from
# $HOME, which SAM sets to the app directory. Owner 0:5000, mode 660 (the app
# runs with group 5000).
#
# Usage: tools/tv-v2-install.sh <device-name> <ipk> [app-id]
#   app-id defaults to com.cobalt.youtube.adfree.debug

set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
source "$HERE/tv-lib.sh"

DEVICE="$1"
IPK="$2"
APP_ID="${3:-com.cobalt.youtube.adfree.debug}"
[ -z "$DEVICE" ] || [ ! -f "$IPK" ] && { echo "usage: $0 <device-name> <ipk> [app-id]"; exit 1; }

APP_DIR="/media/developer/apps/usr/palm/applications/$APP_ID"
STORAGE=".starboard.aHR0cHM6Ly93d3cueW91dHViZS5jb20vdHY=.storage"
SAVE="/media/developer/ytaf-storage-backup/$APP_ID-latest"

echo "saving the login from $APP_ID..."
tv_ssh "$DEVICE" "mkdir -p '$SAVE'; for f in '$APP_DIR/$STORAGE' '$APP_DIR/content/$STORAGE'; do [ -s \"\$f\" ] && { cp -p \"\$f\" '$SAVE/$STORAGE'; echo \"saved \$f\"; break; }; done; [ -s '$SAVE/$STORAGE' ] || echo 'WARNING: no login found, the app will start signed out'"

ares-launch --device "$DEVICE" -c "$APP_ID" >/dev/null 2>&1 || true
# [/] keeps pkill -f from matching this ssh shell's own command line.
tv_ssh "$DEVICE" "pkill -f '[/]media/developer/apps/usr/palm/applications/$APP_ID/cobalt' || true"
ares-install --device "$DEVICE" -r "$APP_ID" >/dev/null 2>&1 || true
ares-install --device "$DEVICE" "$IPK"

tv_ssh "$DEVICE" "[ -s '$SAVE/$STORAGE' ] && cp '$SAVE/$STORAGE' '$APP_DIR/$STORAGE' && chown 0:5000 '$APP_DIR/$STORAGE' && chmod 660 '$APP_DIR/$STORAGE' && echo 'login restored' || true"
ares-launch --device "$DEVICE" "$APP_ID"
echo "launched $APP_ID on $DEVICE"
