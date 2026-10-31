"""Print ASCII/UTF-16 strings from the Procreate executable that match a regex.

Supplementary, read-only string scan of a local IPA. Not REA Evidence; strings do not
establish behavior, defaults, or reachability.
"""
import argparse
import re
import struct
import zipfile


def strings_from(data, minimum=4):
    for match in re.finditer(rb"[\x20-\x7e]{%d,}" % minimum, data):
        yield match.group().decode("ascii", "replace")


def utf16_strings(data, minimum=4):
    for match in re.finditer((rb"(?:[\x20-\x7e]\x00){%d,}" % minimum), data):
        yield match.group().decode("utf-16-le", "replace")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("ipa")
    parser.add_argument("pattern")
    parser.add_argument("--utf16", action="store_true")
    parser.add_argument("--limit", type=int, default=400)
    parser.add_argument("--min", type=int, default=4)
    args = parser.parse_args()
    with zipfile.ZipFile(args.ipa) as archive:
        binary = archive.read("Payload/Procreate.app/Procreate")
    regex = re.compile(args.pattern, re.I)
    seen, out = set(), []
    for s in (utf16_strings(binary, args.min) if args.utf16 else strings_from(binary, args.min)):
        if regex.search(s) and s not in seen:
            seen.add(s)
            out.append(s)
    out.sort(key=str.lower)
    for s in out[: args.limit]:
        print(s)
    print(f"--- {len(out)} unique matches (showing {min(len(out), args.limit)}) ---")
