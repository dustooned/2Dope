"""Print quoted UI strings from a JS member inside a ZIP that match a regex.

For CEP panels: the bundle is readable JavaScript, so settings can be read without REA.
"""
import argparse
import re
import sys
import zipfile

sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("zip")
    ap.add_argument("member")
    ap.add_argument("pattern")
    ap.add_argument("--limit", type=int, default=120)
    args = ap.parse_args()
    regex = re.compile(args.pattern, re.I)
    with zipfile.ZipFile(args.zip) as z:
        text = z.read(args.member).decode("utf-8", "replace")
    seen, out = set(), []
    for m in re.finditer(r'"([^"\\\n]{2,60})"|\'([^\'\\\n]{2,60})\'', text):
        s = m.group(1) or m.group(2)
        if s and s not in seen and regex.search(s):
            seen.add(s)
            out.append(s)
    for s in out[: args.limit]:
        print(s)
    print(f"--- {len(out)} unique matches ---")


if __name__ == "__main__":
    main()
