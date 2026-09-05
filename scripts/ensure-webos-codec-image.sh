#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
image="${WEBOS_CODEC_BUILD_IMAGE:-cobalt-build-webos-codecs:latest}"

if ! docker image inspect "$image" >/dev/null 2>&1; then
  docker build --platform linux/amd64 \
    --tag "$image" \
    --file "$repo_root/docker/webos-codecs/Dockerfile" \
    "$repo_root/docker/webos-codecs"
fi
