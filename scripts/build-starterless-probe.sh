#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
sdk_root="${WEBOS_SDK_ROOT:-${1:-}}"
output_dir="${PROBE_OUTPUT_DIR:-$repo_root/output}"
package_version="$(jq -r '.version' "$repo_root/native-probe/appinfo.json")"
package_id="$(jq -r '.id' "$repo_root/native-probe/appinfo.json")"

if [[ -z "$sdk_root" ]]; then
  echo "Usage: WEBOS_SDK_ROOT=/path/to/sdk $0" >&2
  echo "   or: $0 /path/to/sdk" >&2
  exit 2
fi

sdk_root="$(cd "$sdk_root" && pwd)"
sysroot="$sdk_root/arm-webos-linux-gnueabi/sysroot"
compiler="$sdk_root/bin/arm-webos-linux-gnueabi-gcc"
strip="$sdk_root/bin/arm-webos-linux-gnueabi-strip"
readelf="$sdk_root/bin/arm-webos-linux-gnueabi-readelf"
sdl_bundle_root="${SDL2_BUNDLE_DIR:-}"
if [[ -z "$sdl_bundle_root" ]]; then
  echo "SDL2_BUNDLE_DIR must point to the extracted webOSbrew SDL ABI archive." >&2
  echo "The SDK's SDL static archive has no Wayland video backend." >&2
  exit 3
fi
sdl_bundle_root="$(cd "$sdl_bundle_root" && pwd)"
sdl_archive="$sdl_bundle_root/lib/libSDL2.a"
sdl_include_root="$sdl_bundle_root/include"

for required in "$compiler" "$strip" "$readelf" "$sdl_archive" \
  "$sdl_include_root/SDL2/SDL.h"; do
  if [[ ! -e "$required" ]]; then
    echo "Missing SDK component: $required" >&2
    exit 3
  fi
done

ares_package="$(command -v ares-package || true)"
if [[ -z "$ares_package" && -x "$repo_root/node_modules/.bin/ares-package" ]]; then
  ares_package="$repo_root/node_modules/.bin/ares-package"
fi
if [[ -z "$ares_package" ]]; then
  echo "ares-package is required" >&2
  exit 4
fi

build_root="$(mktemp -d "${TMPDIR:-/tmp}/cobalt-starterless-probe.XXXXXX")"
trap 'rm -rf "$build_root"' EXIT
package_dir="$build_root/package"
package_output="$build_root/output"
mkdir -p "$package_dir" "$package_output" "$output_dir"

"$compiler" \
  --sysroot="$sysroot" \
  -std=c11 -Os -fno-pie -no-pie -ffunction-sections -fdata-sections \
  -mcpu=cortex-a9 -mfloat-abi=softfp -mfpu=neon \
  -I"$sdl_include_root" -I"$sysroot/usr/include" \
  "$repo_root/native-probe/main.c" \
  -Wl,--gc-sections \
  -Wl,--whole-archive "$sdl_archive" -Wl,--no-whole-archive \
  -Wl,-Bdynamic -lGLESv2 -ldl -lm -lpthread -lrt \
  -o "$package_dir/cobalt-starterless-probe"

"$strip" "$package_dir/cobalt-starterless-probe"
cp "$repo_root/native-probe/appinfo.json" "$package_dir/appinfo.json"
cp "$repo_root/assets/icon.png" "$package_dir/icon.png"
cp "$repo_root/assets/largeIcon.png" "$package_dir/largeIcon.png"
cp "$repo_root/assets/splashBackground.png" "$package_dir/splashBackground.png"

if command -v python3 >/dev/null 2>&1 &&
   [[ -f "$repo_root/scripts/normalize-package-mtime.py" ]]; then
  python3 "$repo_root/scripts/normalize-package-mtime.py" \
    --mtime "${IPK_MEMBER_MTIME:-$(date +%s)}" "$package_dir"
fi

echo "Native dependencies:"
"$readelf" -d "$package_dir/cobalt-starterless-probe" | grep NEEDED || true

"$ares_package" -v --outdir "$package_output" "$package_dir"
generated_ipk="$package_output/${package_id}_${package_version}_arm.ipk"
if [[ ! -f "$generated_ipk" ]]; then
  echo "Expected package was not generated: $generated_ipk" >&2
  exit 5
fi

target_ipk="$output_dir/${package_id}_${package_version}_arm.ipk"
cp "$generated_ipk" "$target_ipk"
if [[ -f "$repo_root/scripts/verify-ipk-container.py" ]]; then
  python3 "$repo_root/scripts/verify-ipk-container.py" "$target_ipk"
fi

echo "Starterless probe package: $target_ipk"
