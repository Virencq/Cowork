#!/usr/bin/env python3
"""Generate consistent Orbito native icons from the single branded orbital mark.

Uses Python's standard library only. Writes PNGs for Tauri/Windows Store/Android/iOS,
a multi-frame Windows ICO, and a macOS ICNS container.
"""
from __future__ import annotations
import math
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ICON_DIR = ROOT / "src-tauri" / "icons"
ICON_DIR.mkdir(parents=True, exist_ok=True)

def blend(a, b, t):
    return tuple(round(a[i] * (1-t) + b[i] * t) for i in range(3))

def pixel(x, y, size):
    scale = size / 512
    xx, yy = x / scale, y / scale
    radius = 106
    dx = max(2-xx, 0, xx-510)
    dy = max(2-yy, 0, yy-510)
    if dx or dy:
        return (0, 0, 0, 0)
    cx = min(max(xx, radius), 512-radius)
    cy = min(max(yy, radius), 512-radius)
    if (xx-cx)**2 + (yy-cy)**2 > radius**2:
        return (0, 0, 0, 0)
    color = (23, 21, 19)
    r = math.hypot(xx-256, yy-256)
    angle = (math.degrees(math.atan2(yy-256, xx-256)) + 360) % 360
    if abs(r-164) < 12:
        color = (69, 43, 32)
    if abs(r-164) < 15 and (angle >= 305 or angle <= 110):
        color = blend((255, 182, 110), (227, 75, 50), min(max((xx-92)/328, 0), 1))
    r2 = math.hypot(xx-256, yy-256)
    a2 = (math.degrees(math.atan2(yy-256, xx-256)) + 360) % 360
    if abs(r2-119) < 11 and (a2 >= 205 or a2 <= 70):
        color = blend((255, 182, 110), (244, 123, 66), min(max((yy-137)/238, 0), 1))
    if r < 35:
        color = (247, 129, 67)
    return (*color, 255)

def png_bytes(size, circle=False, foreground_only=False):
    rows = []
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            rgba = pixel(x, y, size)
            if circle:
                dx, dy = x + 0.5 - size/2, y + 0.5 - size/2
                if dx*dx + dy*dy > (size*0.49)**2:
                    rgba = (0, 0, 0, 0)
            if foreground_only:
                # Android adaptive foreground: only the orbital strokes/core, transparent backing.
                xx, yy = (x + 0.5) * 512 / size, (y + 0.5) * 512 / size
                r = math.hypot(xx-256, yy-256)
                a = (math.degrees(math.atan2(yy-256, xx-256)) + 360) % 360
                r2 = r
                a2 = a
                is_outer = abs(r-164) < 15 and (a >= 305 or a <= 110)
                is_inner = abs(r2-119) < 11 and (a2 >= 205 or a2 <= 70)
                is_core = r < 35
                if not (is_outer or is_inner or is_core):
                    rgba = (0, 0, 0, 0)
                elif is_core:
                    rgba = (247, 129, 67, 255)
                elif is_outer:
                    t = min(max((xx-92)/328, 0), 1)
                    rgba = (*blend((255, 182, 110), (227, 75, 50), t), 255)
                else:
                    t = min(max((yy-137)/238, 0), 1)
                    rgba = (*blend((255, 182, 110), (244, 123, 66), t), 255)
            row.extend(rgba)
        rows.append(bytes(row))
    raw = b"".join(rows)
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind+data) & 0xffffffff)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))

def write_png(name, size, **kwargs):
    data = png_bytes(size, **kwargs)
    (ICON_DIR / name).write_bytes(data)
    return data

# Desktop/Tauri icon sizes
sizes = {"32x32.png":32, "64x64.png":64, "128x128.png":128, "128x128@2x.png":256, "icon.png":512}
images = {size: write_png(name, size) for name,size in sizes.items()}

# Windows Store tiles
for side in (30,44,71,89,107,142,150,284,310):
    write_png(f"Square{side}x{side}Logo.png", side)
write_png("StoreLogo.png", 50)

# Android launcher regular, round, and adaptive foreground sizes
android_sizes = {"mdpi":48,"hdpi":72,"xhdpi":96,"xxhdpi":144,"xxxhdpi":192}
for density, side in android_sizes.items():
    d = ICON_DIR / "android" / f"mipmap-{density}"
    d.mkdir(parents=True, exist_ok=True)
    (d / "ic_launcher.png").write_bytes(png_bytes(side))
    (d / "ic_launcher_round.png").write_bytes(png_bytes(side, circle=True))
    fg_side = side * 2
    (d / "ic_launcher_foreground.png").write_bytes(png_bytes(fg_side, foreground_only=True))

# iOS app icon set: preserve existing paths, overwrite with consistent Orbito imagery.
ios_sizes = {
    "AppIcon-20x20@1x.png":20, "AppIcon-20x20@2x.png":40, "AppIcon-20x20@2x-1.png":40,
    "AppIcon-20x20@3x.png":60, "AppIcon-29x29@1x.png":29, "AppIcon-29x29@2x.png":58,
    "AppIcon-29x29@2x-1.png":58, "AppIcon-29x29@3x.png":87, "AppIcon-40x40@1x.png":40,
    "AppIcon-40x40@2x.png":80, "AppIcon-40x40@2x-1.png":80, "AppIcon-40x40@3x.png":120,
    "AppIcon-60x60@2x.png":120, "AppIcon-60x60@3x.png":180, "AppIcon-76x76@1x.png":76,
    "AppIcon-76x76@2x.png":152, "AppIcon-83.5x83.5@2x.png":167, "AppIcon-512@2x.png":1024
}
for name,side in ios_sizes.items():
    (ICON_DIR / "ios" / name).write_bytes(png_bytes(side))

# Multi-frame Windows ICO with embedded PNGs.
frames = [(16,png_bytes(16)),(32,images[32]),(48,png_bytes(48)),(64,images[64]),(128,images[128]),(256,images[256])]
header = struct.pack("<HHH",0,1,len(frames))
offset = 6 + 16*len(frames)
entries, payload = [], bytearray()
for size,data in frames:
    entries.append(struct.pack("<BBBBHHII",0 if size==256 else size,0 if size==256 else size,0,0,1,32,len(data),offset))
    payload.extend(data); offset += len(data)
(ICON_DIR / "icon.ico").write_bytes(header + b"".join(entries) + payload)

# ICNS with valid PNG chunks for standard macOS sizes.
icns_frames = [(b"icp4",16),(b"icp5",32),(b"icp6",64),(b"ic07",128),(b"ic08",256),(b"ic09",512),(b"ic10",1024)]
chunks = []
for code,side in icns_frames:
    data = png_bytes(side)
    chunks.append(code + struct.pack(">I",len(data)+8) + data)
body = b"".join(chunks)
(ICON_DIR / "icon.icns").write_bytes(b"icns" + struct.pack(">I",len(body)+8) + body)
print("Generated all Orbito native icon assets.")
