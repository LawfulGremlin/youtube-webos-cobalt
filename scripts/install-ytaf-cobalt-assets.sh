#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cobalt_root="${1:-$repo_root/workdir/cobalt-23.lts.6}"
webapp_output="${WEBAPP_OUTPUT_DIR:-$repo_root/webapp/output}"
app_patch="$repo_root/cobalt-patches/cobalt-23.lts.6.patch"
content_target="$cobalt_root/cobalt/adblock/content"

if [[ ! -d "$cobalt_root/.git" ]]; then
  echo "Not a Cobalt source tree: $cobalt_root" >&2
  exit 2
fi

for asset in adblockMain.js adblockMain.css adblockPreload.js; do
  if [[ ! -f "$webapp_output/$asset" ]]; then
    echo "Missing built web asset: $webapp_output/$asset" >&2
    echo "Run 'make npm-docker' before building starterless Cobalt." >&2
    exit 3
  fi
done

if [[ ! -f "$cobalt_root/cobalt/adblock/BUILD.gn" ]]; then
  git -C "$cobalt_root" apply --check --recount "$app_patch"
  git -C "$cobalt_root" apply --recount "$app_patch"
fi

if ! grep -q 'adblockPreload.js' \
  "$cobalt_root/cobalt/adblock/content/BUILD.gn"; then
  echo "The Cobalt tree contains an older YTAF patch without preload support." >&2
  echo "Use a clean Cobalt 23.lts.6 checkout and rerun this script." >&2
  exit 4
fi

mkdir -p "$content_target"
for asset in adblockMain.js adblockMain.css adblockPreload.js; do
  cp -p "$webapp_output/$asset" "$content_target/$asset"
done

echo "Installed current YTAF Cobalt patch and web assets into: $cobalt_root"
