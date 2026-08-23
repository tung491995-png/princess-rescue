#!/usr/bin/env python3
"""Create lower-memory GLB variants by resizing the embedded boss texture.

The mesh, skin, weights, nodes and animation buffers are copied byte-for-byte.
Only the JPEG bufferView referenced by ``images[0]`` is replaced.
"""

from __future__ import annotations

import argparse
import io
import json
import struct
from pathlib import Path

from PIL import Image


GLB_MAGIC = 0x46546C67
GLB_VERSION = 2
JSON_CHUNK = 0x4E4F534A
BIN_CHUNK = 0x004E4942


def pad4(data: bytes, fill: bytes) -> bytes:
    return data + fill * ((-len(data)) % 4)


def read_glb(path: Path) -> tuple[dict, bytes]:
    raw = path.read_bytes()
    magic, version, declared_length = struct.unpack_from("<III", raw, 0)
    if magic != GLB_MAGIC or version != GLB_VERSION or declared_length != len(raw):
        raise ValueError(f"Invalid GLB header: {path}")

    document = None
    binary = None
    offset = 12
    while offset < len(raw):
        chunk_length, chunk_type = struct.unpack_from("<II", raw, offset)
        offset += 8
        chunk = raw[offset : offset + chunk_length]
        offset += chunk_length
        if chunk_type == JSON_CHUNK:
            document = json.loads(chunk.decode("utf-8").rstrip(" \x00"))
        elif chunk_type == BIN_CHUNK:
            binary = chunk
    if document is None or binary is None:
        raise ValueError("GLB must contain one JSON and one BIN chunk")
    return document, binary


def write_glb(path: Path, document: dict, binary: bytes) -> None:
    json_bytes = pad4(
        json.dumps(document, ensure_ascii=False, separators=(",", ":")).encode("utf-8"),
        b" ",
    )
    binary = pad4(binary, b"\x00")
    total_length = 12 + 8 + len(json_bytes) + 8 + len(binary)
    payload = bytearray(struct.pack("<III", GLB_MAGIC, GLB_VERSION, total_length))
    payload.extend(struct.pack("<II", len(json_bytes), JSON_CHUNK))
    payload.extend(json_bytes)
    payload.extend(struct.pack("<II", len(binary), BIN_CHUNK))
    payload.extend(binary)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(payload)


def make_variant(source: Path, output: Path, max_size: int, quality: int) -> None:
    document, binary = read_glb(source)
    images = document.get("images", [])
    if len(images) != 1 or "bufferView" not in images[0]:
        raise ValueError("Expected exactly one embedded image bufferView")
    if images[0].get("mimeType") != "image/jpeg":
        raise ValueError("Expected an embedded JPEG texture")

    image_view_index = int(images[0]["bufferView"])
    image_view = document["bufferViews"][image_view_index]
    old_start = int(image_view.get("byteOffset", 0))
    old_length = int(image_view["byteLength"])
    old_end = old_start + old_length

    later_offsets = [
        int(view.get("byteOffset", 0))
        for index, view in enumerate(document["bufferViews"])
        if index != image_view_index and int(view.get("byteOffset", 0)) >= old_end
    ]
    replacement_end = min(later_offsets, default=len(binary))
    if replacement_end < old_end:
        raise ValueError("Overlapping image bufferView")

    original_jpeg = binary[old_start:old_end]
    with Image.open(io.BytesIO(original_jpeg)) as image:
        image = image.convert("RGB")
        image.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
        encoded = io.BytesIO()
        image.save(
            encoded,
            format="JPEG",
            quality=quality,
            subsampling=0,
            optimize=True,
            progressive=False,
        )
        resized_jpeg = encoded.getvalue()
        resized_dimensions = image.size

    replacement = pad4(resized_jpeg, b"\x00")
    binary = binary[:old_start] + replacement + binary[replacement_end:]
    delta = len(replacement) - (replacement_end - old_start)

    image_view["byteLength"] = len(resized_jpeg)
    for index, view in enumerate(document["bufferViews"]):
        if index == image_view_index:
            continue
        offset = int(view.get("byteOffset", 0))
        if offset >= replacement_end:
            view["byteOffset"] = offset + delta
    document["buffers"][0]["byteLength"] = len(binary)

    write_glb(output, document, binary)
    print(
        f"{output.name}: texture {resized_dimensions[0]}x{resized_dimensions[1]}, "
        f"JPEG {len(resized_jpeg):,} bytes, GLB {output.stat().st_size:,} bytes"
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output_dir", type=Path)
    args = parser.parse_args()
    make_variant(
        args.source,
        args.output_dir / "ma_vuong_mat_ngu_mobile_2k.glb",
        max_size=2048,
        quality=92,
    )
    make_variant(
        args.source,
        args.output_dir / "ma_vuong_mat_ngu_mobile_1k.glb",
        max_size=1024,
        quality=90,
    )


if __name__ == "__main__":
    main()
