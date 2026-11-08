"""Print printable strings from a local binary that match a regex.

Quick triage before a full REA/Ghidra session: ASCII and UTF-16LE runs, deduplicated.
"""
import argparse
import re
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def ascii_runs(data, minimum):
    for m in re.finditer(rb"[\x20-\x7e]{%d,}" % minimum, data):
        yield m.group().decode("ascii", "replace")


def utf16_runs(data, minimum):
    for m in re.finditer((rb"(?:[\x20-\x7e]\x00){%d,}" % minimum), data):
        yield m.group().decode("utf-16-le", "replace")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("path")
    ap.add_argument("pattern")
    ap.add_argument("--limit", type=int, default=120)
    ap.add_argument("--min", type=int, default=4)
    args = ap.parse_args()
    data = open(args.path, "rb").read()
    regex = re.compile(args.pattern, re.I)
    seen, out = set(), []
    for s in list(ascii_runs(data, args.min)) + list(utf16_runs(data, args.min)):
        if s not in seen and regex.search(s):
            seen.add(s)
            out.append(s)
    out.sort(key=str.lower)
    for s in out[: args.limit]:
        print(s)
    print(f"--- {len(out)} unique matches ---")


if __name__ == "__main__":
    main()
