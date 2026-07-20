#!/bin/bash
# Build and deploy the release or debug variant to a TV in one step.
# Auto-bumps the patch version from the highest existing output/*.ipk for
# that variant unless one is given explicitly.
#
# Usage: tools/tv-deploy.sh debug|release <device-name> [version]
#
# debug:   builds with COBALT_DEBUG=1 (requires the qa-config Cobalt binary
#          already built — see FORK.md "Debug builds"), installs via
#          tv-app-restart.sh so playback state survives the reinstall.
# release: plain build, close/install/launch (no CDP, no state to restore).

set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/.." && pwd)"
source "$HERE/tv-lib.sh"

VARIANT="$1"
DEVICE="$2"
VERSION="$3"
[ "$VARIANT" != "debug" ] && [ "$VARIANT" != "release" ] && {
  echo "usage: $0 debug|release <device-name> [version]"; exit 1;
}
[ -z "$DEVICE" ] && { echo "usage: $0 debug|release <device-name> [version]"; exit 1; }

if [ "$VARIANT" = "debug" ]; then
  APP_ID=com.cobalt.youtube.adfree.debug
  DISPLAY_NAME='YouTube Cobalt Debug'
else
  APP_ID=com.cobalt.youtube.adfree
  DISPLAY_NAME='YouTube Cobalt AdFree'
fi

if [ -z "$VERSION" ]; then
  VERSION=$(python3 -c "
import re, glob, os
pattern = re.compile(r'^${APP_ID//./\\.}_(\d+)\.(\d+)\.(\d+)_arm\.ipk\$')
best = (0, 0, -1)
for path in glob.glob('$REPO/output/*.ipk'):
    m = pattern.match(os.path.basename(path))
    if m:
        v = tuple(int(x) for x in m.groups())
        if v > best: best = v
print(f'{best[0]}.{best[1]}.{best[2]+1}')
")
  echo "auto-picked version $VERSION (highest existing $APP_ID + 1 patch)"
fi

cd "$REPO"
BUILD_ARGS=(
  PACKAGE=ipks-official/2023-07-30-youtube.leanback.v4-1.1.7.ipk
  PACKAGE_NAME="$APP_ID"
  PACKAGE_DISPLAY_NAME="$DISPLAY_NAME"
  PROJECT_VERSION="$VERSION"
)
[ "$VARIANT" = "debug" ] && BUILD_ARGS+=(COBALT_DEBUG=1)

make package "${BUILD_ARGS[@]}"

IPK="output/${APP_ID}_${VERSION}_arm.ipk"
[ -f "$IPK" ] || { echo "build did not produce $IPK"; exit 1; }

if [ "$VARIANT" = "debug" ]; then
  "$HERE/tv-app-restart.sh" "$DEVICE" "$IPK"
else
  ares-launch --device "$DEVICE" -c "$APP_ID" 2>/dev/null || true
  ares-install --device "$DEVICE" "$IPK"
  ares-launch --device "$DEVICE" "$APP_ID"
  echo "installed and launched $APP_ID $VERSION on $DEVICE (no CDP on release — verify by eye)"
fi
