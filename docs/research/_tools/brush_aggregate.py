"""Aggregate numeric brush parameters across many NSKeyedArchiver Brush.archive files.

Reads brush archives directly out of local IPA/ZIP files (no extraction), resolves the keyed
archive, and reports per-key count/min/median/max plus string values seen.
"""
import argparse
import statistics
import sys
import zipfile

import plistlib

sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def resolve(value, objects, seen):
    if isinstance(value, plistlib.UID):
        if value.data in seen:
            return None
        return resolve(objects[value.data], objects, seen | {value.data})
    if isinstance(value, dict):
        return {k: resolve(v, objects, seen) for k, v in value.items() if k != "$class"}
    if isinstance(value, list):
        return [resolve(v, objects, seen) for v in value]
    return value


def brush_dict(raw):
    data = plistlib.loads(raw)
    root = resolve(data["$top"]["root"], data["$objects"], set())
    return root if isinstance(root, dict) else {}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("ipa")
    ap.add_argument("--member", default="Brush.archive")
    args = ap.parse_args()
    numbers, strings = {}, {}
    with zipfile.ZipFile(args.ipa) as z:
        names = [n for n in z.namelist() if n.endswith(args.member)]
        for name in names:
            try:
                brush = brush_dict(z.read(name))
            except Exception:
                continue
            for key, value in brush.items():
                if isinstance(value, bool) or isinstance(value, (int, float)):
                    numbers.setdefault(key, []).append(float(value))
                elif isinstance(value, str):
                    strings.setdefault(key, set()).add(value)
    print(f"brushes: {len(names)}")
    print("key\tn\tmin\tmedian\tmax")
    for key in sorted(numbers):
        vals = numbers[key]
        print(f"{key}\t{len(vals)}\t{min(vals):.4g}\t{statistics.median(vals):.4g}\t{max(vals):.4g}")
    print("--- string keys ---")
    for key in sorted(strings):
        vals = sorted(strings[key])
        print(f"{key}\t{len(vals)}\t{', '.join(vals[:6])}")


if __name__ == "__main__":
    main()
