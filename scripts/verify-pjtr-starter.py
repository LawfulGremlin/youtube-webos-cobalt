#!/usr/bin/env python3
"""Verify the private k7lp/PJTR starter before packaging."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import tarfile
from pathlib import PurePosixPath


EXPECTED_FILES = {
    "cobalt",
    "appinfo.json",
    "build_info",
    "switches",
    "content/app/cobalt/manifest.json",
}

EXPECTED_HASHES = {
    "cobalt": "6f321480c057abdd240b48e2d8e80c7fc421ea0cdf670e86234160f6df357100",
    "appinfo.json": "88c3fcd1de4735ccda98d39adbac24e50cf9e9250c2de298ce1c862ce6da16a4",
}

EXPECTED_APP_ID = "youtube.leanback.v4-pjtr"


def fail(message: str) -> None:
    raise ValueError(message)


def read_member(archive: tarfile.TarFile, name: str) -> bytes:
    member = archive.getmember(name)
    stream = archive.extractfile(member)
    if stream is None:
        fail(f"{name} is not a regular file")
    return stream.read()


def verify(path: str) -> None:
    with tarfile.open(path, "r:*") as archive:
        members = archive.getmembers()
        file_names: set[str] = set()

        for member in members:
            name = member.name.removeprefix("./")
            parts = PurePosixPath(name).parts
            if member.name.startswith("/") or ".." in parts:
                fail(f"unsafe archive path: {member.name}")
            if member.isdir():
                continue
            if not member.isfile():
                fail(f"unsupported archive entry: {member.name}")
            file_names.add(name)

        if file_names != EXPECTED_FILES:
            missing = sorted(EXPECTED_FILES - file_names)
            extra = sorted(file_names - EXPECTED_FILES)
            fail(f"unexpected file list; missing={missing}, extra={extra}")

        for name, expected_hash in EXPECTED_HASHES.items():
            actual_hash = hashlib.sha256(read_member(archive, name)).hexdigest()
            if actual_hash != expected_hash:
                fail(
                    f"SHA-256 mismatch for {name}: "
                    f"expected {expected_hash}, got {actual_hash}"
                )

        appinfo = json.loads(read_member(archive, "appinfo.json"))
        if appinfo.get("id") != EXPECTED_APP_ID:
            fail(
                f"unexpected app id: expected {EXPECTED_APP_ID}, "
                f"got {appinfo.get('id')}"
            )

        build_info = read_member(archive, "build_info").decode("utf-8")
        if "soc: k7lp" not in build_info:
            fail("build_info does not identify the k7lp SoC")

    print("PJTR starter verified")
    print(f"  app id: {EXPECTED_APP_ID}")
    print("  SoC: k7lp")
    print("  Starboard API: 12")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("archive", help="Path to youtube-webos-stock-starter.tar")
    args = parser.parse_args()

    try:
        verify(args.archive)
    except (KeyError, OSError, tarfile.TarError, ValueError, json.JSONDecodeError) as error:
        print(f"PJTR starter verification failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
