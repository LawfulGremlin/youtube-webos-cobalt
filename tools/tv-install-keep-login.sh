#!/bin/bash
# Install an IPK (1.x or starterless v2) over an app that holds a signed-in
# session, keeping that session — also the way back from v2 to 1.x. Uninstall
# first: installing 2.x over 1.x crash-loops (existing directories keep their
# owner, upstream #2), and the uninstall wipes the app directory, so the login
# is saved and put back.
#
# The login is Cobalt's storage file for the https://www.youtube.com/tv origin.
# The 1.x starter keeps it in content/; the starterless runtime reads it from
# $HOME, which SAM sets to the app directory. The live copy is the one the
# INSTALLED runtime uses (v2 ships lib/libstdc++.so.6, 1.x does not) — the
# other location only holds whatever an earlier restore left there. Every run
# saves into its own timestamped folder and never overwrites an earlier save.
# The restore goes to both locations (each runtime ignores the other's),
# owner 0:5000, mode 660 (the app runs with group 5000).
#
# Usage: tools/tv-install-keep-login.sh <device-name> <ipk> [app-id]
#   app-id defaults to com.cobalt.youtube.adfree.debug
#   LOGIN_FILE=<path on the TV> restores that file instead of the newest
#   saved live login (the saves are listed at the end of every run).

set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
source "$HERE/tv-lib.sh"

DEVICE="$1"
IPK="$2"
APP_ID="${3:-com.cobalt.youtube.adfree.debug}"
[ -z "$DEVICE" ] || [ ! -f "$IPK" ] && { echo "usage: $0 <device-name> <ipk> [app-id]"; exit 1; }

APP_DIR="/media/developer/apps/usr/palm/applications/$APP_ID"
STORAGE=".starboard.aHR0cHM6Ly93d3cueW91dHViZS5jb20vdHY=.storage"
SAVES="/media/developer/ytaf-storage-backup/$APP_ID-saves"

ares-launch --device "$DEVICE" -c "$APP_ID" >/dev/null 2>&1 || true
# [/] keeps pkill -f from matching this ssh shell's own command line.
tv_ssh "$DEVICE" "pkill -f '[/]media/developer/apps/usr/palm/applications/$APP_ID/cobalt' || true"

echo "closed; saving the login from $APP_ID..."
tv_ssh "$DEVICE" "
  if [ -e '$APP_DIR/lib/libstdc++.so.6' ]; then live='$APP_DIR/$STORAGE'; other='$APP_DIR/content/$STORAGE';
  else live='$APP_DIR/content/$STORAGE'; other='$APP_DIR/$STORAGE'; fi
  d='$SAVES/'\$(date +%Y%m%d-%H%M%S); mkdir -p \"\$d\"
  if [ -s \"\$live\" ]; then cp -p \"\$live\" \"\$d/live$STORAGE\"; echo \"saved live login \$live\";
  else echo \"no live login at \$live\"; fi
  [ -s \"\$other\" ] && cp -p \"\$other\" \"\$d/other$STORAGE\" || true"

ares-install --device "$DEVICE" -r "$APP_ID" >/dev/null 2>&1 || true
if ares-install --device "$DEVICE" -l 2>/dev/null | grep -qx "$APP_ID"; then
  echo "ERROR: $APP_ID is still installed after the uninstall; nothing installed"; exit 1
fi
# Not `ares-install <ipk>`: on lg75 (2026-09-23) it uploaded the IPK and then
# failed with "Unable to exec" twice in a row, while the same install through
# appInstallService over root ssh worked. Upload and install that way.
IP=$(tv_resolve_ip "$DEVICE"); KEY=$(tv_resolve_key "$DEVICE")
REMOTE_IPK="/media/developer/temp/$(basename "$IPK")"
tv_ssh "$DEVICE" "mkdir -p /media/developer/temp" >/dev/null
scp -q -O -i "$KEY" -o StrictHostKeyChecking=no -o BatchMode=yes "$IPK" "root@$IP:$REMOTE_IPK" 2>/dev/null ||
  scp -q -i "$KEY" -o StrictHostKeyChecking=no -o BatchMode=yes "$IPK" "root@$IP:$REMOTE_IPK"
echo "installing $(basename "$IPK")..."
tv_ssh "$DEVICE" "luna-send -n 8 -f luna://com.webos.appInstallService/dev/install '{\"id\":\"com.ares.defaultName\",\"ipkUrl\":\"$REMOTE_IPK\",\"subscribe\":true}'" >/dev/null
installed=no
for i in $(seq 1 40); do
  ares-install --device "$DEVICE" -l 2>/dev/null | grep -qx "$APP_ID" && { installed=yes; break; }
  sleep 3
done
[ "$installed" = yes ] || { echo "ERROR: $APP_ID did not register after install; the saved login is in $SAVES on the TV"; exit 1; }
tv_ssh "$DEVICE" "rm -f '$REMOTE_IPK'" >/dev/null

tv_ssh "$DEVICE" "
  f='${LOGIN_FILE:-}'
  [ -n \"\$f\" ] || f=\$(ls -t '$SAVES'/*/live$STORAGE 2>/dev/null | head -1)
  if [ -s \"\$f\" ]; then
    mkdir -p '$APP_DIR/content'
    for t in '$APP_DIR/$STORAGE' '$APP_DIR/content/$STORAGE'; do
      cp \"\$f\" \"\$t\" && chown 0:5000 \"\$t\" && chmod 660 \"\$t\"
    done
    echo \"login restored from \$f\"
  else
    echo 'WARNING: no saved login; the app starts signed out'
  fi
  echo 'saved logins (newest first):'; ls -lt '$SAVES'/*/* 2>/dev/null | head -8"
ares-launch --device "$DEVICE" "$APP_ID"
echo "launched $APP_ID on $DEVICE"
