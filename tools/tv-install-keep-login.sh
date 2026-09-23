#!/bin/bash
# Install an IPK (1.x or starterless v2) over an app that holds a signed-in
# session, keeping that session — also the way back from v2 to 1.x. Uninstall
# first: installing 2.x over 1.x crash-loops (existing directories keep their
# owner, upstream #2), and the uninstall wipes the app directory, so the login
# is saved and put back.
#
# The login is Cobalt's storage file for the https://www.youtube.com/tv origin.
# The 1.x starter keeps it in content/; the starterless runtime reads it from
# $HOME, which SAM sets to the app directory. The newer of the two is saved,
# and it is restored to both (each runtime ignores the other's), owner 0:5000,
# mode 660 (the app runs with group 5000).
#
# Usage: tools/tv-install-keep-login.sh <device-name> <ipk> [app-id]
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

ares-launch --device "$DEVICE" -c "$APP_ID" >/dev/null 2>&1 || true
# [/] keeps pkill -f from matching this ssh shell's own command line.
tv_ssh "$DEVICE" "pkill -f '[/]media/developer/apps/usr/palm/applications/$APP_ID/cobalt' || true"
echo "closed; saving the login from $APP_ID..."
tv_ssh "$DEVICE" "mkdir -p '$SAVE'; f=\$(ls -t '$APP_DIR/$STORAGE' '$APP_DIR/content/$STORAGE' 2>/dev/null | head -1); [ -n \"\$f\" ] && [ -s \"\$f\" ] && cp -p \"\$f\" '$SAVE/$STORAGE' && echo \"saved \$f\"; [ -s '$SAVE/$STORAGE' ] || echo 'WARNING: no login found, the app will start signed out'"

ares-install --device "$DEVICE" -r "$APP_ID" >/dev/null 2>&1 || true
ares-install --device "$DEVICE" "$IPK"

tv_ssh "$DEVICE" "[ -s '$SAVE/$STORAGE' ] && mkdir -p '$APP_DIR/content' && for d in '$APP_DIR' '$APP_DIR/content'; do cp '$SAVE/$STORAGE' \"\$d/$STORAGE\" && chown 0:5000 \"\$d/$STORAGE\" && chmod 660 \"\$d/$STORAGE\"; done && echo 'login restored' || true"
ares-launch --device "$DEVICE" "$APP_ID"
echo "launched $APP_ID on $DEVICE"
