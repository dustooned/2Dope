"""Print context windows around regex matches in a ZIP text member (CEP panel reading)."""
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
    ap.add_argument("--limit", type=int, default=40)
    ap.add_argument("--span", type=int, default=70)
    args = ap.parse_args()
    regex = re.compile(args.pattern, re.I)
    with zipfile.ZipFile(args.zip) as z:
        text = z.read(args.member).decode("utf-8", "replace")
    for i, m in enumerate(regex.finditer(text)):
        if i >= args.limit:
            break
        a = max(0, m.start() - args.span)
        b = min(len(text), m.end() + args.span)
        print(" ".join(text[a:b].split()))
        print("-")


if __name__ == "__main__":
    main()
