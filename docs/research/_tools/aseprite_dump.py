"""Dump an Aseprite file's header, frames, layers, tags and cel geometry.

Read-only structural parse (Aseprite spec: header 0xA5E0, frame 0xF1FA, chunks).
Cel images are not decoded here; this prints what the file declares.
"""
import argparse
import json
import os
import struct
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def read_string(data, at):
    n = struct.unpack_from("<H", data, at)[0]
    return data[at + 2: at + 2 + n].decode("utf-8", "replace"), at + 2 + n


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("path")
    args = ap.parse_args()
    data = open(args.path, "rb").read()
    file_size, magic, frames, w, h, depth, flags, speed = struct.unpack_from("<IHHHHHIH", data, 0)
    if magic != 0xA5E0:
        raise SystemExit("not an aseprite file")
    at = 128
    layers, tags, cels = [], [], []
    for f in range(frames):
        size, fmagic, old_chunks, duration = struct.unpack_from("<IHHH", data, at)
        if fmagic != 0xF1FA:
            raise SystemExit(f"bad frame magic at {at}")
        chunks = old_chunks
        cat = at + 16
        end = at + size
        if chunks == 0xFFFF:
            chunks = struct.unpack_from("<I", data, cat)[0]
            cat += 4
        for c in range(chunks):
            csize, ctype = struct.unpack_from("<IH", data, cat)
            if ctype == 0x2004:
                lflags, ltype, child, lw, lh, blend, opacity = struct.unpack_from("<HHHHHHB", data, cat + 6)
                name, _ = read_string(data, cat + 6 + 16)
                layers.append({"frame": f, "name": name, "type": ltype, "child": child,
                               "w": lw or w, "h": lh or h, "opacity": opacity, "blend": blend, "flags": lflags})
            elif ctype == 0x2005:
                li, x, y, op, ctype2, z = struct.unpack_from("<HhhBHH", data, cat + 6)
                cels.append({"frame": f, "layer": li, "x": x, "y": y, "opacity": op, "cel_type": ctype2, "z": z})
            elif ctype == 0x2018:
                count = struct.unpack_from("<H", data, cat + 6)[0]
                p = cat + 6 + 10
                for t in range(count):
                    a, b, loop, rep = struct.unpack_from("<HHBH", data, p)
                    p += 10
                    name, p = read_string(data, p)
                    tags.append({"name": name, "from": a, "to": b, "loop": loop, "repeat": rep})
            cat += csize
        at = end
    out = {"file": os.path.abspath(args.path), "width": w, "height": h, "depth": depth,
           "frames": frames, "layers": layers, "tags": tags, "cels": cels}
    print(f"size {w}x{h} depth {depth} frames {frames} layers {len(layers)} tags {len(tags)} cels {len(cels)}")
    print("--- layers ---")
    for l in layers[:40]:
        print(f"{l['name']!r} type={l['type']} child={l['child']} {l['w']}x{l['h']} opacity={l['opacity']}")
    print("--- tags ---")
    for t in tags[:40]:
        print(f"{t['name']!r} {t['from']}..{t['to']} loop={t['loop']} repeat={t['repeat']}")
    tmp = os.path.join(os.environ.get("TEMP", "."), "aseprite-dump.json")
    open(tmp, "w", encoding="utf-8").write(json.dumps(out, indent=1))
    print("json:", tmp)


if __name__ == "__main__":
    main()
