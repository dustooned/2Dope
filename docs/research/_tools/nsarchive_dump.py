"""Dump an NSKeyedArchiver plist (e.g. a Procreate/Dreams Brush.archive) as a tree.

Read-only: resolves UID references in $objects and prints scalar leaves with their key paths.
Binary blobs are shown as a length + short hex, never written out.
"""
import argparse
import plistlib
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def resolve(value, objects, seen):
    if isinstance(value, plistlib.UID):
        index = value.data
        if index in seen:
            return "<cycle>"
        return resolve(objects[index], objects, seen | {index})
    if isinstance(value, dict):
        return {k: resolve(v, objects, seen) for k, v in value.items() if k not in ("$class",)}
    if isinstance(value, list):
        return [resolve(v, objects, seen) for v in value]
    if isinstance(value, (bytes, bytearray)):
        return f"<bytes {len(value)}>"
    return value


def walk(node, path, out, depth=0):
    if depth > 4:
        return
    if isinstance(node, dict):
        for key, value in node.items():
            walk(value, f"{path}.{key}" if path else key, out, depth + 1)
    elif isinstance(node, list):
        out.append((path, f"[{len(node)} items]"))
    else:
        out.append((path, node))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("path")
    ap.add_argument("--limit", type=int, default=400)
    ap.add_argument("--prefix", default="")
    args = ap.parse_args()
    data = plistlib.loads(open(args.path, "rb").read())
    objects = data["$objects"]
    root = resolve(data["$top"]["root"], objects, set())
    out = []
    walk(root, "", out)
    shown = 0
    for path, value in out:
        if args.prefix and not path.startswith(args.prefix):
            continue
        text = str(value)
        print(f"{path} = {text[:120]}")
        shown += 1
        if shown >= args.limit:
            break
    print(f"--- {len(out)} leaves, {shown} shown ---")


if __name__ == "__main__":
    main()
