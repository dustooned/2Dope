import struct, sys

CONTAINERS = {b"RIFX", b"LIST"}

def walk(buf, start, end, depth, out):
    pos = start
    while pos + 8 <= end:
        cid = buf[pos:pos+4]
        size = struct.unpack(">i", buf[pos+4:pos+8])[0]
        if size < 0:
            size = 0
        data_start = pos + 8
        if cid == b"LIST":
            ltype = buf[data_start:data_start+4]
            out.append("  "*depth + f"LIST {ltype!r} size={size}")
            walk(buf, data_start+4, min(data_start+size, end), depth+1, out)
        elif cid == b"RIFX":
            ftype = buf[data_start:data_start+4]
            out.append("  "*depth + f"RIFX {ftype!r} size={size}")
            walk(buf, data_start+4, min(data_start+size, end), depth+1, out)
        else:
            raw = buf[data_start:min(data_start+size, end)]
            if cid in (b"tdmn", b"tdsn"):
                out.append("  "*depth + f"{cid.decode()} {raw[:1].hex()} {raw[1:]!r}")
            elif cid == b"cdat":
                n = len(raw)//8
                vals = struct.unpack(">%dd" % n, raw[:n*8]) if n else ()
                out.append("  "*depth + f"cdat n={len(raw)} vals={[round(v,4) for v in vals][:8]}")
            elif cid in (b"tdum", b"tduM"):
                v = struct.unpack(">d", raw[:8])[0] if len(raw) >= 8 else None
                out.append("  "*depth + f"{cid.decode()} {v}")
            elif cid in (b"tdix", b"tdpl", b"tdpi"):
                out.append("  "*depth + f"{cid.decode()} {raw.hex()}")
            else:
                out.append("  "*depth + f"{cid.decode(errors='replace')} n={len(raw)}")
        pos = data_start + size + (size & 1)

p = sys.argv[1]
buf = open(p, "rb").read()
out = []
walk(buf, 0, len(buf), 0, out)
print("\n".join(out[:int(sys.argv[2]) if len(sys.argv) > 2 else 400]))
