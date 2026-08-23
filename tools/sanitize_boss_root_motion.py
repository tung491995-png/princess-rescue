#!/usr/bin/env python3
"""Remove world-space X/Z root motion while preserving vertical animation.

Tripo's skeleton is rotated -90 degrees at ``Root``. Consequently the large
forward/back movement is stored in ``Hip.position.y`` rather than local Z.
Filtering hard-coded local X/Z axes does not lock this rig. This tool projects
translation keys into bind-pose world space, removes the horizontal component,
and transforms the remaining vertical component back into each node's local
parent space.
"""

from __future__ import annotations

import argparse
import json
import math
import struct
from pathlib import Path

import numpy as np


COMPONENTS = {
    5120: np.int8,
    5121: np.uint8,
    5122: np.int16,
    5123: np.uint16,
    5125: np.uint32,
    5126: np.float32,
}
WIDTHS = {
    "SCALAR": 1,
    "VEC2": 2,
    "VEC3": 3,
    "VEC4": 4,
    "MAT2": 4,
    "MAT3": 9,
    "MAT4": 16,
}
JSON_CHUNK = 0x4E4F534A
BIN_CHUNK = 0x004E4942


def read_glb(path: Path) -> tuple[dict, bytearray]:
    raw = path.read_bytes()
    magic, version, total = struct.unpack_from("<III", raw, 0)
    if magic != 0x46546C67 or version != 2 or total != len(raw):
        raise ValueError("Invalid GLB 2.0 header")
    document = None
    binary = None
    offset = 12
    while offset < len(raw):
        length, kind = struct.unpack_from("<II", raw, offset)
        offset += 8
        chunk = raw[offset : offset + length]
        offset += length
        if kind == JSON_CHUNK:
            document = json.loads(chunk.rstrip(b" \t\r\n\0"))
        elif kind == BIN_CHUNK:
            binary = bytearray(chunk)
    if document is None or binary is None:
        raise ValueError("GLB must contain JSON and BIN chunks")
    return document, binary


def write_glb(path: Path, document: dict, binary: bytearray) -> None:
    document["buffers"][0]["byteLength"] = len(binary)
    json_chunk = json.dumps(document, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    json_chunk += b" " * ((-len(json_chunk)) % 4)
    bin_chunk = bytes(binary) + b"\0" * ((-len(binary)) % 4)
    total = 12 + 8 + len(json_chunk) + 8 + len(bin_chunk)
    payload = bytearray(struct.pack("<III", 0x46546C67, 2, total))
    payload.extend(struct.pack("<II", len(json_chunk), JSON_CHUNK))
    payload.extend(json_chunk)
    payload.extend(struct.pack("<II", len(bin_chunk), BIN_CHUNK))
    payload.extend(bin_chunk)
    path.write_bytes(payload)


def accessor_array(document: dict, binary: bytearray, index: int) -> np.ndarray:
    accessor = document["accessors"][index]
    view = document["bufferViews"][accessor["bufferView"]]
    dtype = np.dtype(COMPONENTS[accessor["componentType"]])
    width = WIDTHS[accessor["type"]]
    item_size = dtype.itemsize * width
    stride = view.get("byteStride", item_size)
    start = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    if stride == item_size:
        return np.frombuffer(binary, dtype=dtype, count=accessor["count"] * width, offset=start).reshape(accessor["count"], width).copy()
    return np.ndarray(
        (accessor["count"], width),
        dtype=dtype,
        buffer=binary,
        offset=start,
        strides=(stride, dtype.itemsize),
    ).copy()


def write_accessor_array(document: dict, binary: bytearray, index: int, values: np.ndarray) -> None:
    accessor = document["accessors"][index]
    view = document["bufferViews"][accessor["bufferView"]]
    dtype = np.dtype(COMPONENTS[accessor["componentType"]])
    width = WIDTHS[accessor["type"]]
    values = np.asarray(values, dtype=dtype).reshape(accessor["count"], width)
    item_size = dtype.itemsize * width
    stride = view.get("byteStride", item_size)
    start = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    if stride == item_size:
        binary[start : start + values.nbytes] = values.tobytes(order="C")
        return
    for row_index, row in enumerate(values):
        row_start = start + row_index * stride
        binary[row_start : row_start + item_size] = row.tobytes(order="C")


def quaternion_matrix(quaternion: list[float]) -> np.ndarray:
    x, y, z, w = [float(value) for value in quaternion]
    norm = math.sqrt(x * x + y * y + z * z + w * w) or 1.0
    x, y, z, w = x / norm, y / norm, z / norm, w / norm
    return np.array(
        [
            [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w), 0],
            [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w), 0],
            [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y), 0],
            [0, 0, 0, 1],
        ],
        dtype=np.float64,
    )


def local_matrix(node: dict) -> np.ndarray:
    if "matrix" in node:
        return np.asarray(node["matrix"], dtype=np.float64).reshape(4, 4, order="F")
    matrix = quaternion_matrix(node.get("rotation", [0, 0, 0, 1]))
    matrix[:3, :3] = matrix[:3, :3] @ np.diag(node.get("scale", [1, 1, 1]))
    matrix[:3, 3] = node.get("translation", [0, 0, 0])
    return matrix


def global_bind_matrices(document: dict) -> list[np.ndarray]:
    parents = {}
    for parent_index, node in enumerate(document["nodes"]):
        for child_index in node.get("children", []):
            parents[child_index] = parent_index
    cache: dict[int, np.ndarray] = {}

    def resolve(index: int) -> np.ndarray:
        if index not in cache:
            local = local_matrix(document["nodes"][index])
            parent = parents.get(index)
            cache[index] = local if parent is None else resolve(parent) @ local
        return cache[index]

    return [resolve(index) for index in range(len(document["nodes"]))], parents


def filter_vector(vector: np.ndarray, linear: np.ndarray) -> tuple[np.ndarray, float]:
    world = linear @ vector
    removed = float(math.hypot(world[0], world[2]))
    world[0] = 0.0
    world[2] = 0.0
    return np.linalg.solve(linear, world), removed


def sanitize(source: Path, output: Path) -> dict:
    document, binary = read_glb(source)
    globals_, parents = global_bind_matrices(document)
    lock_names = {"Root", "Hip", "Hips", "Pelvis"}
    lock_nodes = {
        index
        for index, node in enumerate(document["nodes"])
        if node.get("name") in lock_names
    }
    if not any(document["nodes"][index].get("name") == "Hip" for index in lock_nodes):
        raise ValueError("Exact Hip node was not found")

    report = {"clips": [], "lockedNodes": [document["nodes"][index].get("name") for index in sorted(lock_nodes)]}
    global_max = 0.0
    for animation_index, animation in enumerate(document.get("animations", [])):
        clip_max = 0.0
        channels_changed = 0
        for channel in animation.get("channels", []):
            target = channel.get("target", {})
            node_index = target.get("node")
            if node_index not in lock_nodes or target.get("path") != "translation":
                continue
            sampler = animation["samplers"][channel["sampler"]]
            accessor_index = sampler["output"]
            values = accessor_array(document, binary, accessor_index).astype(np.float64)
            bind = np.asarray(document["nodes"][node_index].get("translation", [0, 0, 0]), dtype=np.float64)
            parent = parents.get(node_index)
            linear = np.eye(3) if parent is None else globals_[parent][:3, :3]
            interpolation = sampler.get("interpolation", "LINEAR")

            if interpolation == "CUBICSPLINE":
                if len(values) % 3:
                    raise ValueError("Invalid CUBICSPLINE translation accessor")
                for row_index in range(0, len(values), 3):
                    for tangent_index in (row_index, row_index + 2):
                        values[tangent_index], removed = filter_vector(values[tangent_index], linear)
                        clip_max = max(clip_max, removed)
                    delta = values[row_index + 1] - bind
                    filtered, removed = filter_vector(delta, linear)
                    values[row_index + 1] = bind + filtered
                    clip_max = max(clip_max, removed)
            else:
                for row_index, value in enumerate(values):
                    filtered, removed = filter_vector(value - bind, linear)
                    values[row_index] = bind + filtered
                    clip_max = max(clip_max, removed)
            write_accessor_array(document, binary, accessor_index, values)
            channels_changed += 1

        global_max = max(global_max, clip_max)
        report["clips"].append(
            {
                "index": animation_index,
                "name": animation.get("name", f"animation_{animation_index}"),
                "translationChannelsFiltered": channels_changed,
                "maxRemovedWorldXZ": clip_max,
            }
        )

    report["animationCount"] = len(document.get("animations", []))
    report["maxRemovedWorldXZ"] = global_max
    report["status"] = "PASS" if report["animationCount"] == 19 and global_max > 1.0 else "FAIL"
    if report["status"] != "PASS":
        raise ValueError(f"Unexpected root-motion report: {report}")
    write_glb(output, document, binary)
    return report


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    report = sanitize(args.source, args.output)
    if args.report:
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({key: value for key, value in report.items() if key != "clips"}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
