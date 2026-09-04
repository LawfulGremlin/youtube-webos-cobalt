#!/usr/bin/env python3
"""Regression tests for IPK ownership normalization and verification."""

from __future__ import annotations

import importlib.util
import io
from pathlib import Path
import tarfile
import tempfile
import unittest


SCRIPTS_DIR = Path(__file__).resolve().parent


def load_script(name: str):
    path = SCRIPTS_DIR / name
    spec = importlib.util.spec_from_file_location(path.stem.replace("-", "_"), path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


normalizer = load_script("normalize-ipk-ownership.py")
verifier = load_script("verify-ipk-container.py")


def make_tar(entries: list[tuple[tarfile.TarInfo, bytes]]) -> bytes:
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode="w:gz", format=tarfile.USTAR_FORMAT) as archive:
        for member, data in entries:
            archive.addfile(member, io.BytesIO(data) if member.isfile() else None)
    return output.getvalue()


def make_ar_member(name: str, data: bytes, mtime: int) -> bytes:
    header = (
        f"{name:<16}{mtime:<12}{0:<6}{0:<6}{100644:<8}{len(data):<10}`\n"
    ).encode("ascii")
    if len(header) != normalizer.AR_HEADER_SIZE:
        raise AssertionError(f"Invalid synthetic ar header length: {len(header)}")
    return header + data + (b"\n" if len(data) % 2 else b"")


def make_package(path: Path) -> None:
    directory = tarfile.TarInfo("usr/palm/applications/test.app/")
    directory.type = tarfile.DIRTYPE
    directory.mode = 0o777
    directory.uid = 501
    directory.gid = 20
    directory.uname = "builder"
    directory.mtime = 1_700_000_000

    appinfo_data = b'{"id":"test.app","version":"1.0.0"}\n'
    appinfo = tarfile.TarInfo("usr/palm/applications/test.app/appinfo.json")
    appinfo.mode = 0o644
    appinfo.uid = 501
    appinfo.gid = 20
    appinfo.uname = "builder"
    appinfo.mtime = directory.mtime
    appinfo.size = len(appinfo_data)

    control_data = b"Package: test.app\nVersion: 1.0.0\n"
    control = tarfile.TarInfo("control")
    control.mode = 0o644
    control.mtime = directory.mtime
    control.size = len(control_data)

    members = (
        ("debian-binary", b"2.0\n"),
        ("control.tar.gz", make_tar([(control, control_data)])),
        (
            "data.tar.gz",
            make_tar([(directory, b""), (appinfo, appinfo_data)]),
        ),
    )
    contents = bytearray(normalizer.AR_MAGIC)
    for name, data in members:
        contents.extend(make_ar_member(name, data, int(directory.mtime)))
    path.write_bytes(contents)


class IpkOwnershipTest(unittest.TestCase):
    def test_normalization_is_verified_and_idempotent(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            package = Path(temp_dir) / "test.app_1.0.0_arm.ipk"
            make_package(package)

            original_members = verifier.read_members(package)
            with self.assertRaisesRegex(ValueError, "501:20"):
                verifier.verify_data_metadata(original_members["data.tar.gz"][1])

            entry_count = normalizer.normalize_package(package, 0, 5000, 0o775)
            self.assertEqual(entry_count, 2)

            normalized_members = verifier.read_members(package)
            verifier.verify_tar("control.tar.gz", normalized_members["control.tar.gz"][1])
            verifier.verify_tar("data.tar.gz", normalized_members["data.tar.gz"][1])
            verifier.verify_data_metadata(normalized_members["data.tar.gz"][1])
            self.assertEqual(
                normalized_members["control.tar.gz"],
                original_members["control.tar.gz"],
            )

            first_result = package.read_bytes()
            normalizer.normalize_package(package, 0, 5000, 0o775)
            self.assertEqual(package.read_bytes(), first_result)


if __name__ == "__main__":
    unittest.main()
