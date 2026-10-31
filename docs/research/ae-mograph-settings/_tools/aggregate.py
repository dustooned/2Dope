"""Aggregate RIFX .ffx evidence across a preset tree. Read-only."""
import collections, glob, json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ffx_extract as F

ROOTS = [r"D:\Downloads\Misc\Applications\Plugins\Ultimate Mograph Plugins Grab Bag",
         r"D:\Downloads\Misc\Applications\Plugins\After Effects"]


def all_files():
    out = []
    for r in ROOTS:
        out += glob.glob(os.path.join(r, "**", "*.ffx"), recursive=True)
    return sorted(out)


def load():
    recs, bad = [], []
    for p in all_files():
        try:
            r = F.parse_preset(p)
        except Exception as e:
            bad.append((p, repr(e)))
            continue
        if r is None:
            bad.append((p, "not RIFX"))
            continue
        r["_path"] = p
        recs.append(r)
    return recs, bad


def val(p):
    v = p.get("value") or []
    return v


def fmt(p):
    v = val(p)
    if not v:
        return "?"
    if len(v) >= 4 and p.get("choices") is None and max(v) > 1.5:
        return "(" + ",".join(f"{x:g}" for x in v[:4]) + ")"
    s = f"{v[0]:g}"
    rng = ""
    if "min" in p and "max" in p:
        rng = f" [{p['min']:g}..{p['max']:g}]"
    return s + rng


def cmd_effects(recs):
    c = collections.Counter()
    nm = {}
    for r in recs:
        for e in r["effects"]:
            c[e["match"]] += 1
            nm.setdefault(e["match"], collections.Counter())[e.get("name", "")] += 1
    print(f"files={len(recs)}")
    for m, n in c.most_common():
        names = "|".join(list(nm[m])[:2])
        print(f"{n:4d}  {m}   ->  {names}")


def cmd_detail(recs, wanted):
    seen = collections.OrderedDict()
    for r in recs:
        for e in r["effects"]:
            if e["match"] not in wanted:
                continue
            key = e["match"]
            seen.setdefault(key, {"names": collections.Counter(), "params": collections.OrderedDict()})
            seen[key]["names"][e.get("name", "")] += 1
            for p in e["params"]:
                d = seen[key]["params"].setdefault(p["match"], {"names": collections.Counter(), "vals": collections.Counter(), "rng": set(), "ch": None})
                d["names"][p.get("name", "")] += 1
                d["vals"][fmt(p)] += 1
                if "min" in p and "max" in p:
                    d["rng"].add((p["min"], p["max"]))
                if p.get("choices"):
                    d["ch"] = p["choices"]
    for m, d in seen.items():
        print(f"\n## {m}  ({'|'.join(d['names'])[:60]})")
        for pm, pd in d["params"].items():
            ch = ("  choices=" + "|".join(pd["ch"])) if pd["ch"] else ""
            rng = ("  range=" + ",".join(f"{a:g}..{b:g}" for a, b in pd["rng"])) if pd["rng"] else ""
            print(f"  {pd['names'].most_common(1)[0][0] or '(unnamed)':28s} {pm:34s} vals={dict(pd['vals'])}{rng}{ch}"[:300])


def cmd_pseudo(recs):
    """List pseudo (third-party preset controller) effects with their UI knobs."""
    seen = collections.OrderedDict()
    for r in recs:
        for e in r["effects"]:
            if not e["match"].startswith("Pseudo/"):
                continue
            d = seen.setdefault(e["match"], {"name": e.get("name"), "params": [], "files": 0})
            d["files"] += 1
            if not d["params"]:
                d["params"] = [(p.get("name"), fmt(p)) for p in e["params"]]
    print(f"pseudo_effects={len(seen)}")
    for m, d in seen.items():
        ps = "; ".join(f"{n}={v}" for n, v in d["params"] if n)
        print(f"{d['files']:3d} {m} ({d['name']}) :: {ps}"[:400])


def cmd_presets(recs, filt=""):
    for r in sorted(recs, key=lambda x: os.path.basename(x["_path"]).lower()):
        base = os.path.basename(r["_path"])
        if filt and filt.lower() not in base.lower():
            continue
        effs = "; ".join(f"{e.get('name') or e['match']}" for e in r["effects"])
        print(f"{base} :: {effs}"[:260])


def cmd_params(recs):
    c = collections.Counter()
    for r in recs:
        for e in r["effects"]:
            for p in e["params"]:
                if p.get("name"):
                    c[p["name"]] += 1
    for n, k in c.most_common(80):
        print(f"{k:4d}  {n}")


if __name__ == "__main__":
    recs, bad = load()
    cmd = sys.argv[1] if len(sys.argv) > 1 else "effects"
    print(f"# parsed={len(recs)} failed={len(bad)}")
    for p, why in bad:
        print("# FAIL", why, p)
    if cmd == "effects":
        cmd_effects(recs)
    elif cmd == "detail":
        cmd_detail(recs, set(sys.argv[2:]))
    elif cmd == "pseudo":
        cmd_pseudo(recs)
    elif cmd == "presets":
        cmd_presets(recs, sys.argv[2] if len(sys.argv) > 2 else "")
    elif cmd == "params":
        cmd_params(recs)
