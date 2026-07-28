#!/usr/bin/env python3
"""Normalize IPK member timestamps for older webOS package verifiers."""

from __future__ import annotations

import argparse
import gzip
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile


def is_macos_metadata(member_name: str) -> bool:
    """Return whether a tar member is Finder/AppleDouble metadata."""
    parts = Path(member_name).parts
    return (
        "__MACOSX" in parts
        or any(part.startswith("._") for part in parts)
        or any(part == ".DS_Store" for part in parts)
    )


def normalize_tar_members(archive: Path, timestamp: int) -> None:
    temporary_archive = archive.with_suffix(archive.suffix + ".new")

    with tarfile.open(archive, "r:gz") as source:
        with temporary_archive.open("wb") as output:
            with gzip.GzipFile(
                filename="", fileobj=output, mode="wb", mtime=timestamp
            ) as compressed:
                with tarfile.open(
                    fileobj=compressed, mode="w", format=tarfile.GNU_FORMAT
                ) as target:
                    for member in source.getmembers():
                        if is_macos_metadata(member.name):
                            continue
                        member.mtime = timestamp
                        member.uid = 0
                        member.gid = 0
                        member.uname = ""
                        member.gname = ""
                        member.pax_headers = {}
                        contents = source.extractfile(member) if member.isfile() else None
                        target.addfile(member, contents)

    os.replace(temporary_archive, archive)


# fork: upstream rebuilt the outer archive with `ar qc`, which defeats the whole
# point of this script on any binutils configured with
# --enable-deterministic-archives (Debian/Ubuntu default): the `D` modifier is
# then implicit and `ar` writes mtime/uid/gid 0 into the ar headers, so the
# script that exists to remove epoch-0 timestamps puts them straight back.
# webOS then rejects the package ("ipk verified failed" from
# com.webos.appInstallService) — measured against a known-good IPK, whose ar
# headers carry a real build time with uid/gid 0. `ar qcU` fixes the timestamp
# but also writes the real uid/gid, which the known-good package does not have.
# The ar format is three fixed-width text fields, so just write it directly:
# exact mtime (honouring --mtime, which upstream's version silently ignored for
# the outer archive), uid/gid 0, and no dependence on how binutils was built.
AR_MAGIC = b"!<arch>\n"


def write_ar(destination: Path, work_dir: Path, members: tuple[str, ...], timestamp: int) -> None:
    with destination.open("wb") as archive:
        archive.write(AR_MAGIC)
        for name in members:
            payload = (work_dir / name).read_bytes()
            archive.write(
                b"%-16s%-12d%-6d%-6d%-8s%-10d`\n"
                % (name.encode(), timestamp, 0, 0, b"100644", len(payload))
            )
            archive.write(payload)
            if len(payload) % 2:
                archive.write(b"\n")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("ipk", type=Path)
    parser.add_argument("--mtime", type=int, default=1_700_000_000)
    args = parser.parse_args()

    ipk = args.ipk.resolve()
    if not ipk.is_file():
        parser.error(f"IPK does not exist: {ipk}")

    # fork: build alongside the target, not in /tmp. os.replace() below cannot
    # cross filesystems, and /tmp is tmpfs on most modern distros — upstream's
    # default temp location made `make package` die with EXDEV ("Invalid
    # cross-device link") every time. Staying on the target's filesystem keeps
    # the replace atomic instead of trading it for a copy.
    with tempfile.TemporaryDirectory(prefix="ytaf-ipk-", dir=ipk.parent) as temp_dir:
        work_dir = Path(temp_dir)
        subprocess.run(["ar", "x", str(ipk)], cwd=work_dir, check=True)

        members = ("debian-binary", "control.tar.gz", "data.tar.gz")
        missing = [member for member in members if not (work_dir / member).is_file()]
        if missing:
            parser.error(f"IPK is missing required members: {', '.join(missing)}")

        for name in ("control.tar.gz", "data.tar.gz"):
            normalize_tar_members(work_dir / name, args.mtime)

        rebuilt_ipk = work_dir / ipk.name
        write_ar(rebuilt_ipk, work_dir, members, args.mtime)
        os.replace(rebuilt_ipk, ipk)


if __name__ == "__main__":
    main()
