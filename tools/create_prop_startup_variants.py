#!/usr/bin/env python3
"""Create texture-light startup GLBs while preserving every mesh and node."""

from __future__ import annotations

import argparse
import io
import json
import struct
from pathlib import Path

from PIL import Image


def pad4(data: bytes, fill: bytes = b"\x00") -> bytes:
    return data + fill * ((-len(data)) % 4)


def read_glb(path: Path) -> tuple[dict, bytes]:
    raw = path.read_bytes()
    magic, version, declared = struct.unpack_from("<III", raw, 0)
    if magic != 0x46546C67 or version != 2 or declared != len(raw):
        raise ValueError(f"Invalid GLB: {path}")
    document = binary = None
    offset = 12
    while offset < len(raw):
        length, kind = struct.unpack_from("<II", raw, offset)
        offset += 8
        chunk = raw[offset : offset + length]
        offset += length
        if kind == 0x4E4F534A:
            document = json.loads(chunk.decode("utf-8").rstrip(" \x00"))
        elif kind == 0x004E4942:
            binary = chunk
    if document is None or binary is None:
        raise ValueError("Missing GLB JSON/BIN chunk")
    return document, binary


def write_glb(path: Path, document: dict, binary: bytes) -> None:
    json_bytes = pad4(json.dumps(document, separators=(",", ":"), ensure_ascii=False).encode(), b" ")
    binary = pad4(binary)
    total = 12 + 8 + len(json_bytes) + 8 + len(binary)
    path.write_bytes(
        struct.pack("<III", 0x46546C67, 2, total)
        + struct.pack("<II", len(json_bytes), 0x4E4F534A)
        + json_bytes
        + struct.pack("<II", len(binary), 0x004E4942)
        + binary
    )


def make_variant(source: Path, target: Path, max_texture: int, quality: int) -> dict:
    document, binary = read_glb(source)
    images = document.get("images", [])
    embedded = [index for index, image in enumerate(images) if "bufferView" in image]
    if not embedded:
        raise ValueError("No embedded textures")
    embedded.sort(key=lambda index: document["bufferViews"][images[index]["bufferView"]].get("byteOffset", 0), reverse=True)
    dimensions = []

    for image_index in embedded:
        image = images[image_index]
        view_index = image["bufferView"]
        view = document["bufferViews"][view_index]
        start = int(view.get("byteOffset", 0))
        length = int(view["byteLength"])
        end = start + length
        later_offsets = [
            int(other.get("byteOffset", 0))
            for index, other in enumerate(document["bufferViews"])
            if index != view_index and int(other.get("byteOffset", 0)) >= end
        ]
        replacement_end = min(later_offsets, default=len(binary))
        with Image.open(io.BytesIO(binary[start:end])) as texture:
            texture = texture.convert("RGB")
            texture.thumbnail((max_texture, max_texture), Image.Resampling.LANCZOS)
            encoded = io.BytesIO()
            texture.save(encoded, "JPEG", quality=quality, optimize=True, progressive=False, subsampling=0)
            payload = encoded.getvalue()
            dimensions.append(texture.size)
        replacement = pad4(payload)
        binary = binary[:start] + replacement + binary[replacement_end:]
        delta = len(replacement) - (replacement_end - start)
        view["byteLength"] = len(payload)
        image["mimeType"] = "image/jpeg"
        for index, other in enumerate(document["bufferViews"]):
            if index == view_index:
                continue
            offset = int(other.get("byteOffset", 0))
            if offset >= replacement_end:
                other["byteOffset"] = offset + delta

    document["buffers"][0]["byteLength"] = len(binary)
    document.setdefault("asset", {})["generator"] = "Princess Rescue prop startup texture pass"
    target.parent.mkdir(parents=True, exist_ok=True)
    write_glb(target, document, binary)
    return {
        "source": source.name,
        "target": target.name,
        "sourceBytes": source.stat().st_size,
        "targetBytes": target.stat().st_size,
        "textures": [f"{width}x{height}" for width, height in dimensions],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("target", type=Path)
    parser.add_argument("--max-texture", type=int, default=512)
    parser.add_argument("--quality", type=int, default=84)
    args = parser.parse_args()
    print(json.dumps(make_variant(args.source, args.target, args.max_texture, args.quality), indent=2))


if __name__ == "__main__":
    main()
