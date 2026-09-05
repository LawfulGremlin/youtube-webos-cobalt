#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

"$repo_root/scripts/build-libvpx-webos-docker.sh"
"$repo_root/scripts/build-dav1d-webos-docker.sh"
