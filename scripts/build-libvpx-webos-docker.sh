#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cobalt_root="${COBALT_SOURCE_DIR:-$repo_root/workdir/cobalt-23.lts.6}"
sdk_volume="${WEBOS_LINUX_SDK_VOLUME:-ytaf-webos-linux-sdk}"
codec_image="${WEBOS_CODEC_BUILD_IMAGE:-cobalt-build-webos-codecs:latest}"
"$repo_root/scripts/ensure-webos-codec-image.sh"
parallel="${VPX_PARALLEL:-4}"
build_dir="$cobalt_root/out/libvpx-webos"

if [[ ! -x "$cobalt_root/third_party/libvpx/configure" ]]; then
  echo "Cobalt's bundled libvpx source is missing: $cobalt_root" >&2
  exit 2
fi
if ! docker volume inspect "$sdk_volume" >/dev/null 2>&1; then
  echo "Missing Docker SDK volume: $sdk_volume" >&2
  exit 3
fi

mkdir -p "$build_dir"

if [[ ! -f "$build_dir/Makefile" ]]; then
  docker run --rm --platform linux/amd64 \
    -v "$cobalt_root:/code" \
    -v "$sdk_volume:/sdk" \
    -w /code/out/libvpx-webos \
    -e CROSS=/sdk/arm-webos-linux-gnueabi_sdk-buildroot/bin/arm-webos-linux-gnueabi- \
    "$codec_image" \
    ../../third_party/libvpx/configure \
      --target=armv7-linux-gcc \
      --disable-vp8 \
      --disable-examples \
      --disable-webm-io \
      --disable-vp9-encoder \
      --disable-unit-tests \
      --enable-static \
      --disable-shared \
      --enable-multithread \
      --disable-vp9-highbitdepth \
      --disable-tools \
      --disable-docs \
      --disable-postproc \
      --extra-cflags="--sysroot=/sdk/arm-webos-linux-gnueabi_sdk-buildroot/arm-webos-linux-gnueabi/sysroot -mfpu=neon -mfloat-abi=softfp -Os -ffunction-sections -fdata-sections -fPIC"
fi

docker run --rm --platform linux/amd64 \
  -v "$cobalt_root:/code" \
  -v "$sdk_volume:/sdk" \
  -w /code/out/libvpx-webos \
  -e CROSS=/sdk/arm-webos-linux-gnueabi_sdk-buildroot/bin/arm-webos-linux-gnueabi- \
  "$codec_image" \
  make -j "$parallel" libvpx.a

test -s "$build_dir/libvpx.a"
echo "VP9-only ARM libvpx archive: $build_dir/libvpx.a"
