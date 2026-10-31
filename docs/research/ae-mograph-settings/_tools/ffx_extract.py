"""Read-only RIFX (.ffx) extractor for After Effects animation presets.

Produces one JSON record per preset: ordered effects, each with parameters
(display name, match name, numeric value, slider min/max, popup choices,
expression text). Never writes to the source tree.
"""
import json, os, struct, sys


def cstr(raw):
    i = raw.find(b"\x00")
    if i >= 0:
        raw = raw[:i]
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        return raw.decode("utf-8", "replace")


def doubles(raw):
    n = len(raw) // 8
    if n == 0:
        return []
    try:
        return [round(v, 5) for v in struct.unpack(">%dd" % n, raw[:n * 8])]
    except struct.error:
        return []


def events(buf):
    out = []

    def parse(start, end):
        pos = start
        while pos + 8 <= end:
            cid = buf[pos:pos + 4]
            size = struct.unpack(">i", buf[pos + 4:pos + 8])[0]
            if size < 0:
                return
            ds, de = pos + 8, min(pos + 8 + size, end)
            if cid in (b"RIFX", b"LIST"):
                ltype = buf[ds:ds + 4]
                out.append(("open", ltype))
                parse(ds + 4, de)
                out.append(("close", ltype))
            else:
                out.append((cid, buf[ds:de]))
            pos = ds + size + (size & 1)

    parse(0, len(buf))
    return out


def parse_preset(path):
    buf = open(path, "rb").read()
    if buf[:4] != b"RIFX":
        return None

    rec = {"preset": os.path.basename(path), "effects": []}

    tail = buf[-40000:]
    i = tail.find(b"<xmp:CreateDate>")
    if i >= 0:
        j = tail.find(b"<", i + 16)
        rec["created"] = tail[i + 16:j].decode("utf-8", "replace").strip()

    ev = events(buf)
    tdsp_d = tdsi_d = sspc_d = part_d = tdgp_d = 0
    cur = None
    last_real = None
    curparam = None
    expect_id = False

    for kind, data in ev:
        if kind == "open":
            if data == b"tdsp":
                tdsp_d += 1
                if tdsp_d == 1:
                    rec["effects"].append({"match": "", "name": "", "params": []})
                    cur = rec["effects"][-1]
                    curparam = None
                    expect_id = True
            elif data == b"tdsi":
                tdsi_d += 1
            elif data == b"sspc":
                sspc_d += 1
            elif data == b"parT":
                part_d += 1
            elif data == b"tdgp":
                tdgp_d += 1
                curparam = None
            continue
        if kind == "close":
            if data == b"tdsp":
                tdsp_d -= 1
                expect_id = False
            elif data == b"tdsi":
                tdsi_d -= 1
            elif data == b"sspc":
                sspc_d -= 1
            elif data == b"parT":
                part_d -= 1
            elif data == b"tdgp":
                tdgp_d -= 1
            continue

        if cur is None:
            continue

        if kind == b"tdmn":
            name = cstr(data)
            if expect_id and tdsi_d > 0:
                if name not in ("ADBE Effect Parade", "ADBE End of path sentinel"):
                    cur["match"] = name
                    last_real = cur
                    expect_id = False
            elif part_d == 0 and tdgp_d > 0 and last_real is not None and not name.startswith("ADBE Group End"):
                curparam = {"match": name}
                last_real["params"].append(curparam)
            continue
        if kind == b"tdsn":
            txt = cstr(data)
            if txt in ("Utf8", ""):
                continue
            if curparam is not None:
                if not curparam.get("name"):
                    curparam["name"] = txt
            elif tdsp_d == 0 and cur is not None and not cur.get("name"):
                cur["name"] = txt
            continue
        if curparam is None:
            continue
        if kind == b"cdat" and "value" not in curparam:
            curparam["value"] = doubles(data)
        elif kind == b"tdum":
            v = doubles(data)
            if v:
                curparam["min"] = v[0]
        elif kind == b"tduM":
            v = doubles(data)
            if v:
                curparam["max"] = v[0]
        elif kind == b"pdnm":
            curparam["choices"] = [c for c in cstr(data).split("|") if c]
        elif kind == b"expr":
            curparam["expr"] = cstr(data)

    rec["effects"] = [e for e in rec["effects"] if e.get("match")]
    for e in rec["effects"]:
        if not e.get("name"):
            e["name"] = e["match"]
    return rec


if __name__ == "__main__":
    for p in sys.argv[1:]:
        r = parse_preset(p)
        print(json.dumps(r, indent=1, ensure_ascii=False)[:5000])
