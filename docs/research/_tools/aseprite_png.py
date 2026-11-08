"""Render an Aseprite frame to PNG (32-bit RGBA, zlib cels).

Structural parse + zlib decode; no Aseprite install. Used to look at a reference
brush sheet, not to modify it.
"""
import argparse
import struct
import zlib
from pathlib import Path

from PIL import Image


def read_string(data, at):
    n = struct.unpack_from("<H", data, at)[0]
    return data[at + 2: at + 2 + n].decode("utf-8", "replace"), at + 2 + n


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("path")
    ap.add_argument("out")
    args = ap.parse_args()
    data = Path(args.path).read_bytes()
    _, magic, frames, w, h, depth, _, _ = struct.unpack_from("<IHHHHHIH", data, 0)
    assert magic == 0xA5E0 and depth == 32, "expects 32-bit aseprite"
    at = 128
    layers, cels = [], []
    for _ in range(frames):
        size, fmagic, old, _dur = struct.unpack_from("<IHHH", data, at)
        assert fmagic == 0xF1FA
        cat, end = at + 16, at + size
        chunks = old
        if chunks == 0xFFFF:
            chunks = struct.unpack_from("<I", data, cat)[0]
            cat += 4
        for _c in range(chunks):
            csize, ctype = struct.unpack_from("<IH", data, cat)
            body = cat + 6
            if ctype == 0x2004:
                flags, ltype, child, lw, lh, blend, op = struct.unpack_from("<HHHHHHB", data, body)
                name, _ = read_string(data, body + 16)
                layers.append({"name": name, "w": lw or w, "h": lh or h, "opacity": op, "blend": blend})
            elif ctype == 0x2005:
                li, x, y, op, cty, _z = struct.unpack_from("<HhhBHH", data, body)
                payload = body + 16
                cels.append({"layer": li, "x": x, "y": y, "opacity": op, "type": cty, "payload": payload, "size": csize - 22})
            cat += csize
        at = end
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    for cel in cels:
        layer = layers[cel["layer"]]
        raw = data[cel["payload"]: cel["payload"] + cel["size"]]
        cw, ch = layer["w"], layer["h"]
        if cel["type"] == 2:
            # 1.3-style compressed cel: WORD width, WORD height, then zlib
            if len(raw) > 4 and raw[4] == 0x78:
                cw, ch = struct.unpack_from("<HH", raw, 0)
                raw = zlib.decompress(raw[4:])
            else:
                raw = zlib.decompress(raw)
        img = Image.frombytes("RGBA", (cw, ch), raw[: cw * ch * 4])
        if cel["opacity"] < 255:
            a = img.getchannel("A").point(lambda v: v * cel["opacity"] // 255)
            img.putalpha(a)
        out.alpha_composite(img, (cel["x"], cel["y"]))
    out.save(args.out)
    print(f"{args.out} {out.size} layers={len(layers)} cels={len(cels)}")


if __name__ == "__main__":
    main()
