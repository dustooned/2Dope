"""List IPA members whose paths look like Interface Builder docs or export/layer resources.

Read-only; prints path + bytes so a subset bundle can be assembled for REA's
decode_interface_builder. Nothing is extracted here.
"""
import argparse
import re
import zipfile

DEFAULT = r"(?i)(\.nib$|\.storyboardc/|storyboard|layer|track|export|share|onion|flipbook|color|colour|palette|brush|timeline|xsheet|tracking)"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("ipa")
    ap.add_argument("--pattern", default=DEFAULT)
    ap.add_argument("--limit", type=int, default=400)
    args = ap.parse_args()
    regex = re.compile(args.pattern)
    with zipfile.ZipFile(args.ipa) as z:
        rows = [(i.filename, i.file_size) for i in z.infolist() if regex.search(i.filename)]
    rows.sort(key=lambda r: r[0])
    for name, size in rows[: args.limit]:
        print(f"{size:>9}  {name}")
    print(f"--- {len(rows)} matching members (showing {min(len(rows), args.limit)}) ---")


if __name__ == "__main__":
    main()
