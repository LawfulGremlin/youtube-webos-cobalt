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


def normalize_tar_members(archive: Path, timestamp: int) -> None:
    temporary_archive = archive.with_suffix(archive.suffix + ".new")

    with tarfile.open(archive, "r:gz") as source:
        with gzip.GzipFile(temporary_archive, "wb", mtime=timestamp) as compressed:
            with tarfile.open(fileobj=compressed, mode="w", format=tarfile.GNU_FORMAT) as target:
                for member in source.getmembers():
                    member.mtime = timestamp
                    member.uid = 0
                    member.gid = 0
                    member.uname = ""
                    member.gname = ""
                    contents = source.extractfile(member) if member.isfile() else None
                    target.addfile(member, contents)

    os.replace(temporary_archive, archive)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("ipk", type=Path)
    parser.add_argument("--mtime", type=int, default=1_700_000_000)
    args = parser.parse_args()

    ipk = args.ipk.resolve()
    if not ipk.is_file():
        parser.error(f"IPK does not exist: {ipk}")

    with tempfile.TemporaryDirectory(prefix="ytaf-ipk-") as temp_dir:
        work_dir = Path(temp_dir)
        subprocess.run(["ar", "x", str(ipk)], cwd=work_dir, check=True)

        members = ("debian-binary", "control.tar.gz", "data.tar.gz")
        missing = [member for member in members if not (work_dir / member).is_file()]
        if missing:
            parser.error(f"IPK is missing required members: {', '.join(missing)}")

        for name in ("control.tar.gz", "data.tar.gz"):
            normalize_tar_members(work_dir / name, args.mtime)

        rebuilt_ipk = work_dir / ipk.name
        subprocess.run(["ar", "qc", str(rebuilt_ipk), *members], cwd=work_dir, check=True)
        os.replace(rebuilt_ipk, ipk)


if __name__ == "__main__":
    main()
