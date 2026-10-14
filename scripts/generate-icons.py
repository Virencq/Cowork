#!/usr/bin/env python3
"""Generate the selected Orbito Orbit Dot native icons using Python's standard library."""
from __future__ import annotations
import math, struct, zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ICON_DIR = ROOT / "src-tauri" / "icons"
ICON_DIR.mkdir(parents=True, exist_ok=True)

def write_if_changed(path: Path, data: bytes) -> None:
    """Preserve timestamps when generated icon content is unchanged."""
    if path.exists() and path.read_bytes() == data:
        return
    path.write_bytes(data)

def rgba_at(x, y, size, circle=False, transparent_bg=False):
    s = size / 512
    X, Y = (x + .5) / s, (y + .5) / s
    cx = cy = 256
    # App tile background with rounded corners
    radius = 94
    qx, qy = max(abs(X-cx)-(256-radius), 0), max(abs(Y-cy)-(256-radius), 0)
    inside_tile = qx*qx + qy*qy <= radius*radius
    if not inside_tile:
        return (0,0,0,0)
    if circle and (X-cx)**2 + (Y-cy)**2 > 250**2:
        return (0,0,0,0)
    bg = (18, 16, 15)
    # Option 10: bold open C-shaped orbital ring, opening at upper-right, plus satellite dot.
    dx, dy = X-cx, Y-cy
    r = math.hypot(dx,dy)
    angle = (math.degrees(math.atan2(dy,dx)) + 360) % 360
    color = bg
    # subdued full ring underneath
    if abs(r-157) < 15:
        color = (57, 35, 26)
    # Open arc from roughly 42 degrees clockwise through the lower half and around to 315 degrees.
    # Leave a clear upper-right gap for the orbiting sphere.
    if abs(r-157) < 19 and (angle >= 48 or angle <= 310):
        t = min(max((Y-100)/310, 0), 1)
        color = tuple(round(a*(1-t)+b*t) for a,b in zip((255,190,75),(239,61,30)))
    # Satellite: warm sphere at upper-right, with a subtle edge highlight.
    sx, sy = 346, 145
    sr = math.hypot(X-sx, Y-sy)
    if sr < 43:
        t = min(max(((X-sx)+(Y-sy)+75)/150,0),1)
        color = tuple(round(a*(1-t)+b*t) for a,b in zip((255,193,88),(255,78,23)))
        if sr > 38:
            color = (244,91,29)
    return (*color,255)

def png_bytes(size, circle=False):
    raw = bytearray()
    for y in range(size):
        raw.append(0)
        for x in range(size):
            raw.extend(rgba_at(x,y,size,circle))
    # Valid zlib stream with uncompressed DEFLATE blocks.
    deflate = bytearray(b"\x78\x01")
    offset = 0
    while offset < len(raw):
        block = bytes(raw[offset:offset+65535])
        offset += len(block)
        final = 1 if offset >= len(raw) else 0
        deflate.append(final)
        deflate.extend(struct.pack("<HH", len(block), 0xffff-len(block)))
        deflate.extend(block)
    a,b = 1,0
    for byte in raw:
        a = (a + byte) % 65521
        b = (b + a) % 65521
    deflate.extend(struct.pack(">I",(b<<16)|a))
    def chunk(kind,data):
        return struct.pack(">I",len(data))+kind+data+struct.pack(">I",zlib.crc32(kind+data)&0xffffffff)
    return b"\x89PNG\r\n\x1a\n"+chunk(b"IHDR",struct.pack(">IIBBBBB",size,size,8,6,0,0,0))+chunk(b"IDAT",bytes(deflate))+chunk(b"IEND",b"")

sizes={"32x32.png":32,"64x64.png":64,"128x128.png":128,"128x128@2x.png":256,"icon.png":512}
images={}
for name,size in sizes.items():
    data=png_bytes(size); write_if_changed(ICON_DIR / name, data); images[size]=data
# Windows Store tiles and store logo
for side in (30,44,71,89,107,142,150,284,310):
    write_if_changed(ICON_DIR / f"Square{side}x{side}Logo.png", png_bytes(side))
write_if_changed(ICON_DIR / "StoreLogo.png", png_bytes(50))
# Multi-resolution Windows ICO using classic 32-bit DIB frames.
# Tauri's icon decoder rejects indexed PNG payloads in ICO files; DIB frames
# avoid that decoder incompatibility and preserve alpha transparency.
def ico_dib(size):
    xor = bytearray()
    mask_rows = []
    mask_stride = ((size + 31) // 32) * 4
    mask = bytearray(mask_stride * size)
    for y in range(size - 1, -1, -1):  # DIB rows are bottom-up
        for x in range(size):
            r, g, b, a = rgba_at(x, y, size)
            xor.extend((b, g, r, a))
            if a < 128:
                row = size - 1 - y
                mask[row * mask_stride + (x // 8)] |= 0x80 >> (x % 8)
    header = struct.pack("<IiiHHIIiiII", 40, size, size * 2, 1, 32, 0,
                         len(xor), 0, 0, 0, 0)
    return header + xor + mask

frames = [(size, ico_dib(size)) for size in (16, 32, 48, 64, 128, 256)]
offset = 6 + 16 * len(frames)
entries, payload = [], bytearray()
for size, data in frames:
    entries.append(struct.pack("<BBBBHHII", 0 if size == 256 else size,
                               0 if size == 256 else size, 0, 0, 1, 32,
                               len(data), offset))
    payload.extend(data)
    offset += len(data)
write_if_changed(ICON_DIR / "icon.ico", struct.pack("<HHH", 0, 1, len(frames)) +
                  b"".join(entries) + payload)
# Standard ICNS PNG chunks for macOS
chunks=[]
for code,size in [(b"icp4",16),(b"icp5",32),(b"icp6",64),(b"ic07",128),(b"ic08",256),(b"ic09",512),(b"ic10",1024)]:
    data=png_bytes(size); chunks.append(code+struct.pack(">I",len(data)+8)+data)
body=b"".join(chunks); write_if_changed(ICON_DIR / "icon.icns", b"icns"+struct.pack(">I",len(body)+8)+body)
print("Generated Orbit Dot icons for Orbito.")
