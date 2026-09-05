#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cobalt_root="${COBALT_SOURCE_DIR:-$repo_root/workdir/cobalt-23.lts.6}"
sdk_root="${WEBOS_SDK_ROOT:-}"
sdl_root="${SDL2_BUNDLE_DIR:-}"

if [[ -z "$sdk_root" || -z "$sdl_root" ]]; then
  echo "WEBOS_SDK_ROOT and SDL2_BUNDLE_DIR are required." >&2
  exit 2
fi

"$repo_root/scripts/install-webos-starboard-platform.sh" "$cobalt_root"

compiler="$sdk_root/bin/arm-webos-linux-gnueabi-g++"
sysroot="$sdk_root/arm-webos-linux-gnueabi/sysroot"
common_flags=(
  --sysroot="$sysroot"
  -std=gnu++14
  -fsyntax-only
  -mcpu=cortex-a9
  -mfpu=neon
  -mfloat-abi=softfp
  -DSTARBOARD
  -DCOBALT
  -DSTARBOARD_IMPLEMENTATION
  -DSB_API_VERSION=13
  -DSB_IS_ARCH_ARM=1
  -DSB_IS_32_BIT=1
  -DSB_IS_LITTLE_ENDIAN=1
  -DSB_SIZE_OF_POINTER=4
  -DSB_SIZE_OF_LONG=4
  '-DSTARBOARD_CONFIGURATION_INCLUDE="starboard/webos/arm/configuration_public.h"'
  '-DSTARBOARD_ATOMIC_INCLUDE="starboard/webos/arm/atomic_public.h"'
  -I"$sdl_root/include"
  -I"$sysroot/usr/include"
  -I"$cobalt_root"
)

for source in \
  application_sdl.cc \
  main.cc \
  player_set_bounds.cc \
  window_create.cc \
  window_destroy.cc \
  window_get_platform_handle.cc \
  window_get_size.cc; do
  echo "Checking $source"
  "$compiler" "${common_flags[@]}" \
    "$cobalt_root/starboard/webos/arm/$source"
done

echo "webos-arm platform sources passed the SDK syntax check."
