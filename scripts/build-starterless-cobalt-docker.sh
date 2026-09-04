#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cobalt_root="${COBALT_SOURCE_DIR:-$repo_root/workdir/cobalt-23.lts.6}"
sdl_root="${SDL2_BUNDLE_DIR:-$repo_root/workdir/deps/SDL2-2.30.12-webos-abi}"
sdk_volume="${WEBOS_LINUX_SDK_VOLUME:-ytaf-webos-linux-sdk}"
build_type="${COBALT_BUILD_TYPE:-devel}"
parallel="${NINJA_PARALLEL:-4}"
out_dir="out/webos-arm-sbversion-13_${build_type}"
build_log="${COBALT_BUILD_LOG:-$repo_root/output/starterless-cobalt-${build_type}.log}"

if [[ ! -d "$sdl_root/include/SDL2" || ! -f "$sdl_root/lib/libSDL2.a" ]]; then
  echo "SDL2_BUNDLE_DIR does not contain the extracted webOSbrew SDL ABI archive." >&2
  exit 2
fi
if ! docker volume inspect "$sdk_volume" >/dev/null 2>&1; then
  echo "Missing Docker SDK volume: $sdk_volume" >&2
  exit 3
fi

"$repo_root/scripts/install-webos-starboard-platform.sh" "$cobalt_root"
mkdir -p "$(dirname "$build_log")"

echo "Starting the long Cobalt webos-arm build with $parallel jobs."
echo "Complete build log: $build_log"
docker run --rm --platform linux/amd64 \
  -v "$cobalt_root:/code" \
  -v "$sdk_volume:/sdk" \
  -v "$sdl_root:/sdl:ro" \
  -w /code \
  -e PYTHONPATH=/code \
  -e WEBOS_SDK_ROOT=/sdk/arm-webos-linux-gnueabi_sdk-buildroot \
  -e SDL2_BUNDLE_DIR=/sdl \
  cobalt-build-evergreen:latest \
  sh -c "git config --global --add safe.directory /code && gn --script-executable=python3 gen '$out_dir' --args='target_platform=\"webos-arm\" build_type=\"$build_type\" target_cpu=\"arm\" sb_api_version=13 is_clang=false' && ninja -v -j '$parallel' -C '$out_dir' cobalt" \
  2>&1 | tee "$build_log"

echo "Cobalt binary: $cobalt_root/$out_dir/cobalt"
