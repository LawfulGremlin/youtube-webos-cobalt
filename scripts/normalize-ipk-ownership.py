#!/usr/bin/env python3
"""Normalize ownership metadata in a webOS IPK without extracting its files."""

from __future__ import annotations

import argparse
import gzip
import io
import os
from pathlib import Path
import re
import stat
import tarfile
import tempfile


AR_MAGIC = b"!<arch>\n"
AR_HEADER_SIZE = 60
EXPECTED_MEMBERS = ("debian-binary", "control.tar.gz", "data.tar.gz")
TAR_BLOCK_SIZE = 512
PAX_OWNERSHIP = re.compile(rb"(?:^|\n)[0-9]+ (?:uid|gid|uname|gname)=")


def parse_decimal(field: bytes, label: str) -> int:
    try:
        return int(field.decode("ascii").strip())
    except ValueError as error:
        raise ValueError(f"Invalid {label} field: {field!r}") from error


def parse_octal(field: bytes, label: str) -> int:
    if field and field[0] & 0x80:
        raise ValueError(f"Base-256 {label} fields are not supported")
    value = field.rstrip(b"\0 ").lstrip(b" ") or b"0"
    try:
        return int(value, 8)
    except ValueError as error:
        raise ValueError(f"Invalid {label} field: {field!r}") from error


def format_octal(value: int, width: int, label: str) -> bytes:
    if value < 0:
        raise ValueError(f"{label} must not be negative")
    digits = f"{value:0{width - 2}o}".encode("ascii")
    if len(digits) > width - 2:
        raise ValueError(f"{label} does not fit in a tar header: {value}")
    return digits + b" \0"


def read_ar_members(contents: bytes) -> list[tuple[str, bytes, bytes]]:
    if not contents.startswith(AR_MAGIC):
        raise ValueError("Missing ar archive magic")

    offset = len(AR_MAGIC)
    members: list[tuple[str, bytes, bytes]] = []
    while offset < len(contents):
        header = contents[offset : offset + AR_HEADER_SIZE]
        if len(header) != AR_HEADER_SIZE or header[58:60] != b"`\n":
            raise ValueError(f"Invalid ar member header at byte {offset}")

        raw_name = header[0:16].decode("ascii").rstrip()
        if raw_name.endswith("/"):
            raise ValueError(f"GNU ar member name is not webOS-compatible: {raw_name}")
        size = parse_decimal(header[48:58], f"{raw_name} size")
        data_start = offset + AR_HEADER_SIZE
        data_end = data_start + size
        if data_end > len(contents):
            raise ValueError(f"IPK member {raw_name} extends beyond the archive")

        members.append((raw_name, header, contents[data_start:data_end]))
        offset = data_end + (size % 2)

    order = tuple(name for name, _, _ in members)
    if order != EXPECTED_MEMBERS:
        raise ValueError(
            f"Unexpected IPK members: {list(order)}; expected {list(EXPECTED_MEMBERS)}"
        )
    return members


def normalize_tar(
    compressed_tar: bytes, uid: int, gid: int, directory_mode: int
) -> tuple[bytes, int]:
    try:
        contents = bytearray(gzip.decompress(compressed_tar))
        with tarfile.open(fileobj=io.BytesIO(contents), mode="r:") as archive:
            archive.getmembers()
    except (gzip.BadGzipFile, EOFError, OSError, tarfile.TarError) as error:
        raise ValueError(f"Invalid data.tar.gz: {error}") from error

    offset = 0
    entry_count = 0
    zero_blocks = 0
    while offset + TAR_BLOCK_SIZE <= len(contents):
        block = contents[offset : offset + TAR_BLOCK_SIZE]
        if not any(block):
            zero_blocks += 1
            offset += TAR_BLOCK_SIZE
            if zero_blocks == 2:
                break
            continue
        zero_blocks = 0

        size = parse_octal(block[124:136], "tar member size")
        type_flag = bytes(block[156:157])
        payload_start = offset + TAR_BLOCK_SIZE
        payload_end = payload_start + size
        if payload_end > len(contents):
            raise ValueError("Tar member extends beyond data.tar.gz")
        if type_flag in (b"x", b"g") and PAX_OWNERSHIP.search(
            bytes(contents[payload_start:payload_end])
        ):
            raise ValueError(
                "PAX ownership overrides are not supported; refusing a partial normalization"
            )

        header = bytearray(block)
        if type_flag in (b"5", b"D"):
            header[100:108] = format_octal(directory_mode, 8, "directory mode")
        header[108:116] = format_octal(uid, 8, "uid")
        header[116:124] = format_octal(gid, 8, "gid")

        # Empty owner names make extractors use the numeric ids above instead
        # of resolving names inherited from the packaging workstation.
        header[265:297] = b"\0" * 32
        header[297:329] = b"\0" * 32
        header[148:156] = b" " * 8
        header[148:156] = format_octal(sum(header), 8, "tar checksum")
        contents[offset : offset + TAR_BLOCK_SIZE] = header

        entry_count += 1
        offset = payload_start + ((size + TAR_BLOCK_SIZE - 1) // TAR_BLOCK_SIZE) * TAR_BLOCK_SIZE

    if zero_blocks < 2:
        raise ValueError("data.tar.gz is missing the tar end marker")

    return gzip.compress(bytes(contents), compresslevel=9, mtime=0), entry_count


def replace_ar_member(contents: bytes, member_name: str, replacement: bytes) -> bytes:
    members = read_ar_members(contents)
    output = bytearray(AR_MAGIC)
    found = False
    for name, original_header, data in members:
        header = bytearray(original_header)
        if name == member_name:
            data = replacement
            size_field = f"{len(data):<10}".encode("ascii")
            if len(size_field) != 10:
                raise ValueError(f"IPK member {name} is too large for an ar header")
            header[48:58] = size_field
            found = True
        output.extend(header)
        output.extend(data)
        if len(data) % 2:
            output.extend(b"\n")
    if not found:
        raise ValueError(f"Missing IPK member: {member_name}")
    return bytes(output)


def normalize_package(
    package: Path, uid: int, gid: int, directory_mode: int
) -> int:
    original = package.read_bytes()
    members = read_ar_members(original)
    data_tar = next(data for name, _, data in members if name == "data.tar.gz")
    normalized_tar, entry_count = normalize_tar(data_tar, uid, gid, directory_mode)
    normalized_package = replace_ar_member(original, "data.tar.gz", normalized_tar)

    package_mode = stat.S_IMODE(package.stat().st_mode)
    temp_name: str | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="wb", prefix=f".{package.name}.", dir=package.parent, delete=False
        ) as output:
            temp_name = output.name
            output.write(normalized_package)
            output.flush()
            os.fsync(output.fileno())
        os.chmod(temp_name, package_mode)
        os.replace(temp_name, package)
    finally:
        if temp_name is not None and os.path.exists(temp_name):
            os.unlink(temp_name)
    return entry_count


def octal_mode(value: str) -> int:
    try:
        mode = int(value, 8)
    except ValueError as error:
        raise argparse.ArgumentTypeError(f"invalid octal mode: {value}") from error
    if not 0 <= mode <= 0o7777:
        raise argparse.ArgumentTypeError(f"mode is out of range: {value}")
    return mode


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("ipk", type=Path)
    parser.add_argument("--uid", type=int, default=0)
    parser.add_argument("--gid", type=int, default=5000)
    parser.add_argument("--directory-mode", type=octal_mode, default=0o775)
    args = parser.parse_args()

    if not args.ipk.is_file():
        parser.error(f"IPK does not exist: {args.ipk}")

    try:
        entry_count = normalize_package(
            args.ipk, args.uid, args.gid, args.directory_mode
        )
    except (OSError, ValueError) as error:
        parser.error(str(error))

    print(
        f"Normalized {entry_count} data.tar.gz entries in {args.ipk}: "
        f"uid={args.uid}, gid={args.gid}, directories={args.directory_mode:04o}"
    )


if __name__ == "__main__":
    main()
