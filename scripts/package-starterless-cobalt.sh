#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
build_dir="${COBALT_BUILD_DIR:-$repo_root/workdir/cobalt-23.lts.6/out/webos-arm-sbversion-13_devel}"
output_dir="${COBALT_PACKAGE_OUTPUT_DIR:-$repo_root/output}"
runtime_dir="${COBALT_RUNTIME_DIR:-$repo_root/starterless-cobalt/lib}"
package_id="$(jq -r '.id' "$repo_root/starterless-cobalt/appinfo.json")"
package_version="$(jq -r '.version' "$repo_root/starterless-cobalt/appinfo.json")"
ares_package="$(command -v ares-package || true)"

if [[ -z "$ares_package" && -x "$repo_root/node_modules/.bin/ares-package" ]]; then
  ares_package="$repo_root/node_modules/.bin/ares-package"
fi
if [[ -z "$ares_package" ]]; then
  echo "ares-package was not found. Install @webos-tools/cli first." >&2
  exit 2
fi
if [[ ! -x "$build_dir/cobalt" || ! -d "$build_dir/content" ]]; then
  echo "Missing completed starterless Cobalt build in: $build_dir" >&2
  exit 3
fi
if [[ ! -f "$runtime_dir/libstdc++.so.6" || ! -f "$runtime_dir/libgcc_s.so.1" ]]; then
  echo "Missing ARM C++ runtime libraries in: $runtime_dir" >&2
  exit 4
fi

package_root="$(mktemp -d "${TMPDIR:-/tmp}/cobalt-starterless-package.XXXXXX")"
trap 'rm -rf "$package_root"' EXIT

cp "$repo_root/starterless-cobalt/appinfo.json" "$package_root/appinfo.json"
cp "$build_dir/cobalt" "$package_root/cobalt"
cp -R "$build_dir/content" "$package_root/content"
# Development-only resources are not needed by the TV application.  Leaving
# them out saves roughly 8 MB installed without removing runtime fonts or ICU.
rm -rf "$package_root/content/web/debug_remote" "$package_root/content/test"
# Incremental GN builds do not delete fonts from an earlier package profile.
# Keep only files referenced by the newly generated filtered fonts.xml so a
# previous standard-font build cannot silently add ~20 MB back to the IPK.
fonts_xml="$package_root/content/fonts/fonts.xml"
if [[ -f "$fonts_xml" ]]; then
  while IFS= read -r -d '' font_path; do
    font_name="$(basename "$font_path")"
    if ! grep -Fq ">$font_name<" "$fonts_xml"; then
      rm -f "$font_path"
    fi
  done < <(find "$package_root/content/fonts" -type f ! -name fonts.xml -print0)
fi
mkdir -p "$package_root/lib"
cp "$runtime_dir/libstdc++.so.6" "$package_root/lib/libstdc++.so.6"
cp "$runtime_dir/libgcc_s.so.1" "$package_root/lib/libgcc_s.so.1"
cp "$repo_root/assets/icon.png" "$package_root/icon.png"
cp "$repo_root/assets/largeIcon.png" "$package_root/largeIcon.png"
chmod +x "$package_root/cobalt"

mkdir -p "$output_dir"
"$ares_package" --no-minify --outdir "$output_dir" "$package_root"

package_path="$(find "$output_dir" -maxdepth 1 -type f -name "${package_id}_${package_version}_*.ipk" -print -quit)"
if [[ -z "$package_path" ]]; then
  echo "ares-package succeeded but its output IPK was not found." >&2
  exit 5
fi
python3 "$repo_root/scripts/normalize-ipk-ownership.py" "$package_path"
python3 "$repo_root/scripts/verify-ipk-container.py" "$package_path"
echo "Youtube Cobalt AdFree package: $package_path"
