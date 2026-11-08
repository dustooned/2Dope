"""Extract selected IPA members into a minimal .app bundle for REA Interface Builder decode.

Writes under beta/.rea-work/<name>/<bundle>.app/, preserving member paths. Read-only on the IPA.
"""
import argparse
import os
import zipfile


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("ipa")
    ap.add_argument("out", help="destination .app directory")
    ap.add_argument("--prefix", required=True, help="member prefix without the app folder, e.g. LayersResources.bundle/")
    ap.add_argument("--info", default="Payload/Procreate.app/Info.plist")
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    written = 0
    with zipfile.ZipFile(args.ipa) as z:
        info = z.read(args.info)
        open(os.path.join(args.out, "Info.plist"), "wb").write(info)
        for member in z.infolist():
            if member.is_dir():
                continue
            marker = "/" + args.prefix
            at = member.filename.find(marker)
            if at < 0:
                continue
            rel = member.filename[at + 1:]
            dest = os.path.join(args.out, rel.replace("/", os.sep))
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            open(dest, "wb").write(z.read(member))
            written += 1
    print(f"wrote {written} members into {args.out}")


if __name__ == "__main__":
    main()
