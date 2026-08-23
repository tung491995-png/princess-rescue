#!/usr/bin/env python3
"""Mobile-safe vertex-cluster reduction for a single static Tripo GLB prop."""

from __future__ import annotations

import argparse
import io
import json
import struct
from pathlib import Path

import numpy as np
from PIL import Image


COMPONENT_DTYPES = {5123: "<u2", 5125: "<u4", 5126: "<f4"}
TYPE_COLUMNS = {"SCALAR": 1, "VEC2": 2, "VEC3": 3}


def read_glb(path: Path):
    data = path.read_bytes()
    if struct.unpack_from("<III", data, 0)[:2] != (0x46546C67, 2):
        raise ValueError("Only GLB 2.0 is supported")
    offset, document, binary = 12, None, None
    while offset < len(data):
        length, chunk_type = struct.unpack_from("<II", data, offset)
        offset += 8
        chunk = data[offset : offset + length]
        if chunk_type == 0x4E4F534A:
            document = json.loads(chunk.decode("utf-8").strip())
        elif chunk_type == 0x004E4942:
            binary = chunk
        offset += length
    if document is None or binary is None:
        raise ValueError("Missing GLB JSON/BIN chunk")
    return document, binary


def accessor_array(document, binary, accessor_index):
    accessor = document["accessors"][accessor_index]
    view = document["bufferViews"][accessor["bufferView"]]
    columns = TYPE_COLUMNS[accessor["type"]]
    dtype = np.dtype(COMPONENT_DTYPES[accessor["componentType"]])
    start = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    stride = view.get("byteStride", dtype.itemsize * columns)
    if stride == dtype.itemsize * columns:
        return np.frombuffer(binary, dtype=dtype, count=accessor["count"] * columns, offset=start).reshape(-1, columns).copy()
    rows = np.empty((accessor["count"], columns), dtype=dtype)
    for row in range(accessor["count"]):
        rows[row] = np.frombuffer(binary, dtype=dtype, count=columns, offset=start + row * stride)
    return rows


def cluster_mesh(positions, normals, uvs, indices, position_resolution, uv_resolution):
    pmin, pmax = positions.min(axis=0), positions.max(axis=0)
    pspan = np.maximum(pmax - pmin, 1e-8)
    uvmin, uvmax = uvs.min(axis=0), uvs.max(axis=0)
    uvspan = np.maximum(uvmax - uvmin, 1e-8)
    pq = np.clip(((positions - pmin) / pspan * position_resolution).astype(np.int64), 0, position_resolution - 1)
    uq = np.clip(((uvs - uvmin) / uvspan * uv_resolution).astype(np.int64), 0, uv_resolution - 1)
    normal_octant = (
        (normals[:, 0] >= 0).astype(np.int64)
        + 2 * (normals[:, 1] >= 0).astype(np.int64)
        + 4 * (normals[:, 2] >= 0).astype(np.int64)
    )
    position_key = pq[:, 0] + position_resolution * (pq[:, 1] + position_resolution * pq[:, 2])
    key = position_key + position_resolution**3 * (
        uq[:, 0] + uv_resolution * (uq[:, 1] + uv_resolution * normal_octant)
    )
    _, inverse = np.unique(key, return_inverse=True)
    cluster_count = int(inverse.max()) + 1
    counts = np.bincount(inverse, minlength=cluster_count).astype(np.float64)

    def average(values):
        return np.stack(
            [np.bincount(inverse, weights=values[:, axis], minlength=cluster_count) / counts for axis in range(values.shape[1])],
            axis=1,
        ).astype(np.float32)

    out_positions = average(positions)
    out_normals = average(normals)
    lengths = np.linalg.norm(out_normals, axis=1, keepdims=True)
    out_normals /= np.maximum(lengths, 1e-8)
    out_uvs = average(uvs)

    triangles = inverse[indices.reshape(-1)].reshape(-1, 3)
    keep = (triangles[:, 0] != triangles[:, 1]) & (triangles[:, 0] != triangles[:, 2]) & (triangles[:, 1] != triangles[:, 2])
    triangles = triangles[keep]
    _, unique_rows = np.unique(np.sort(triangles, axis=1), axis=0, return_index=True)
    triangles = triangles[np.sort(unique_rows)]

    used, compact_inverse = np.unique(triangles.reshape(-1), return_inverse=True)
    out_positions = out_positions[used]
    out_normals = out_normals[used]
    out_uvs = out_uvs[used]
    out_indices = compact_inverse.reshape(-1, 3)
    if len(used) > 65535:
        raise ValueError("Reduced mesh still exceeds uint16 vertex range")
    return out_positions, out_normals, out_uvs, out_indices.astype(np.uint16)


def image_bytes(document, binary, image_record, max_texture, quality):
    if "bufferView" not in image_record:
        raise ValueError("Only embedded image bufferViews are supported")
    view = document["bufferViews"][image_record["bufferView"]]
    start = view.get("byteOffset", 0)
    source = binary[start : start + view["byteLength"]]
    with Image.open(io.BytesIO(source)) as image:
        image = image.convert("RGB")
        image.thumbnail((max_texture, max_texture), Image.Resampling.LANCZOS)
        output = io.BytesIO()
        image.save(output, "JPEG", quality=quality, optimize=True, progressive=True)
        return output.getvalue(), image.size


def align4(blob: bytearray):
    while len(blob) % 4:
        blob.append(0)


def add_blob(binary_out, views, payload, target=None):
    align4(binary_out)
    offset = len(binary_out)
    binary_out.extend(payload)
    view = {"buffer": 0, "byteOffset": offset, "byteLength": len(payload)}
    if target is not None:
        view["target"] = target
    views.append(view)
    return len(views) - 1


def write_glb(path, document, binary):
    json_bytes = json.dumps(document, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    json_bytes += b" " * ((4 - len(json_bytes) % 4) % 4)
    binary += b"\0" * ((4 - len(binary) % 4) % 4)
    total = 12 + 8 + len(json_bytes) + 8 + len(binary)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(
        struct.pack("<III", 0x46546C67, 2, total)
        + struct.pack("<II", len(json_bytes), 0x4E4F534A)
        + json_bytes
        + struct.pack("<II", len(binary), 0x004E4942)
        + binary
    )


def optimize(source: Path, target: Path, position_resolution: int, uv_resolution: int, max_texture: int, quality: int):
    document, binary = read_glb(source)
    if len(document.get("meshes", [])) != 1 or len(document["meshes"][0].get("primitives", [])) != 1:
        raise ValueError("Expected one mesh with one primitive")
    primitive = document["meshes"][0]["primitives"][0]
    positions = accessor_array(document, binary, primitive["attributes"]["POSITION"]).astype(np.float32)
    normals = accessor_array(document, binary, primitive["attributes"]["NORMAL"]).astype(np.float32)
    uvs = accessor_array(document, binary, primitive["attributes"]["TEXCOORD_0"]).astype(np.float32)
    indices = accessor_array(document, binary, primitive["indices"]).reshape(-1)
    reduced = cluster_mesh(positions, normals, uvs, indices, position_resolution, uv_resolution)
    out_positions, out_normals, out_uvs, out_indices = reduced

    binary_out, views, accessors = bytearray(), [], []
    position_view = add_blob(binary_out, views, out_positions.astype("<f4").tobytes(), 34962)
    normal_view = add_blob(binary_out, views, out_normals.astype("<f4").tobytes(), 34962)
    uv_view = add_blob(binary_out, views, out_uvs.astype("<f4").tobytes(), 34962)
    index_view = add_blob(binary_out, views, out_indices.astype("<u2").tobytes(), 34963)
    accessors.extend(
        [
            {"bufferView": position_view, "componentType": 5126, "count": len(out_positions), "type": "VEC3", "min": out_positions.min(0).tolist(), "max": out_positions.max(0).tolist()},
            {"bufferView": normal_view, "componentType": 5126, "count": len(out_normals), "type": "VEC3"},
            {"bufferView": uv_view, "componentType": 5126, "count": len(out_uvs), "type": "VEC2", "min": out_uvs.min(0).tolist(), "max": out_uvs.max(0).tolist()},
            {"bufferView": index_view, "componentType": 5123, "count": out_indices.size, "type": "SCALAR", "min": [int(out_indices.min())], "max": [int(out_indices.max())]},
        ]
    )

    images = []
    image_sizes = []
    for image_record in document.get("images", []):
        payload, size = image_bytes(document, binary, image_record, max_texture, quality)
        view_index = add_blob(binary_out, views, payload)
        images.append({"name": image_record.get("name", "texture"), "mimeType": "image/jpeg", "bufferView": view_index})
        image_sizes.append(size)

    node = dict(document.get("nodes", [{}])[0])
    node["mesh"] = 0
    node.pop("children", None)
    output_document = {
        "asset": {"version": "2.0", "generator": "Princess Rescue mobile prop optimizer"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [node],
        "meshes": [{"name": document["meshes"][0].get("name", source.stem), "primitives": [{"attributes": {"POSITION": 0, "NORMAL": 1, "TEXCOORD_0": 2}, "indices": 3, "material": primitive.get("material", 0), "mode": 4}]}],
        "materials": document.get("materials", []),
        "textures": document.get("textures", []),
        "samplers": document.get("samplers", []),
        "images": images,
        "accessors": accessors,
        "bufferViews": views,
        "buffers": [{"byteLength": len(binary_out)}],
    }
    for key in ("extensionsUsed", "extensionsRequired", "extensions"):
        if key in document:
            output_document[key] = document[key]
    write_glb(target, output_document, bytes(binary_out))
    return {
        "sourceBytes": source.stat().st_size,
        "targetBytes": target.stat().st_size,
        "sourceVertices": len(positions),
        "sourceTriangles": len(indices) // 3,
        "targetVertices": len(out_positions),
        "targetTriangles": len(out_indices),
        "textures": image_sizes,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("target", type=Path)
    parser.add_argument("--position-resolution", type=int, default=36)
    parser.add_argument("--uv-resolution", type=int, default=8)
    parser.add_argument("--max-texture", type=int, default=1024)
    parser.add_argument("--quality", type=int, default=84)
    args = parser.parse_args()
    result = optimize(args.source, args.target, args.position_resolution, args.uv_resolution, args.max_texture, args.quality)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
