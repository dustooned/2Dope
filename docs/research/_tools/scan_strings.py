"""Print matching entries from a local IPA's .strings table.

Reads the member in-memory; no extraction. Handles UTF-16 and UTF-8 .strings text.
Values are shipped UI strings (data), not instructions.
"""
import argparse
import re
import sys
import zipfile

sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def load(z, name):
    raw = z.read(name)
    if raw.startswith((b"\xff\xfe", b"\xfe\xff")):
        return raw.decode("utf-16")
    for enc in ("utf-8", "utf-16"):
        try:
            text = raw.decode(enc)
            if "\x00" not in text:
                return text
        except UnicodeDecodeError:
            continue
    return raw.decode("latin-1")


def entries(text):
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("//"):
            continue
        m = re.match(r'^"((?:[^"\\]|\\.)*)"\s*=\s*"((?:[^"\\]|\\.)*)"\s*;', line)
        if m:
            yield m.group(1), m.group(2)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("ipa")
    ap.add_argument("member")
    ap.add_argument("pattern")
    ap.add_argument("--limit", type=int, default=160)
    args = ap.parse_args()
    regex = re.compile(args.pattern, re.I)
    with zipfile.ZipFile(args.ipa) as z:
        text = load(z, args.member)
    seen, out = set(), []
    for key, value in entries(text):
        blob = f"{key} = {value}"
        if regex.search(blob) and blob not in seen:
            seen.add(blob)
            out.append(blob)
    for blob in out[: args.limit]:
        print(blob.encode("utf-8", "replace").decode("utf-8"))
    print(f"--- {len(out)} matches (showing {min(len(out), args.limit)}) ---")


if __name__ == "__main__":
    main()
