#!/usr/bin/env python3
"""Generate Orbito's PNG and Windows ICO application icons using only Python's standard library."""
from __future__ import annotations

import math
import os
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ICON_DIR = ROOT / "src-tauri" / "icons"
ICON_DIR.mkdir(parents=True, exist_ok=True)

def blend(a, b, t):
    return tuple(round(a[i] * (1 - t) + b[i] * t) for i in range(3))

def pixel(x, y, size):
    # Rounded-square charcoal tile with an orange orbital mark.
    scale = size / 512
    xx, yy = x / scale, y / scale
    radius = 106
    dx = max(2 - xx, 0, xx - 510)
    dy = max(2 - yy, 0, yy - 510)
    if dx or dy:
        return (0, 0, 0, 0)
    cx = min(max(xx, radius), 512-radius)
    cy = min(max(yy, radius), 512-radius)
    if (xx-cx)**2 + (yy-cy)**2 > radius**2:
        return (0, 0, 0, 0)
    base = (23, 21, 19)
    # faint circular orbit
    r = math.hypot(xx-256, yy-256)
    angle = (math.degrees(math.atan2(yy-256, xx-256)) + 360) % 360
    color = base
    if abs(r-164) < 12:
        color = (69, 43, 32)
    # Bright broken outer orbit
    if abs(r-164) < 15 and (angle >= 305 or angle <= 110):
        t = min(max((xx-92)/328, 0), 1)
        color = blend((255, 182, 110), (227, 75, 50), t)
    # Inner orbit arc
    r2 = math.hypot(xx-256, yy-256)
    a2 = (math.degrees(math.atan2(yy-256, xx-256)) + 360) % 360
    if abs(r2-119) < 11 and (a2 >= 205 or a2 <= 70):
        t = min(max((yy-137)/238, 0), 1)
        color = blend((255, 182, 110), (244, 123, 66), t)
    # Central orange core
    if r < 35:
        color = (247, 129, 67)
    return (*color, 255)

def png_bytes(size):
    rows = []
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            row.extend(pixel(x, y, size))
        rows.append(bytes(row))
    raw = b"".join(rows)
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xffffffff)
    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 9))
            + chunk(b"IEND", b""))

sizes = {
    "32x32.png": 32,
    "64x64.png": 64,
    "128x128.png": 128,
    "128x128@2x.png": 256,
    "icon.png": 512,
}
images = {}
for name, size in sizes.items():
    data = png_bytes(size)
    (ICON_DIR / name).write_bytes(data)
    images[size] = data

# Windows ICO with embedded PNG frames for modern Windows shell rendering.
frames = [(16, png_bytes(16)), (32, images[32]), (48, png_bytes(48)),
          (64, images[64]), (128, images[128]), (256, images[256])]
header = struct.pack("<HHH", 0, 1, len(frames))
offset = 6 + 16 * len(frames)
entries = []
payload = bytearray()
for size, data in frames:
    entries.append(struct.pack("<BBBBHHII", 0 if size == 256 else size,
                               0 if size == 256 else size, 0, 0, 1, 32,
                               len(data), offset))
    payload.extend(data)
    offset += len(data)
(ICON_DIR / "icon.ico").write_bytes(header + b"".join(entries) + payload)
print("Generated Orbito PNG and Windows ICO assets.")
