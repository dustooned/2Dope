"""List EffectCraft effect specs (id, display name, category, file, line).

Read-only over a local source tree. Output is a TSV on stdout so the catalog can be
reviewed and cited; nothing is executed from the target project.
"""
import collections
import glob
import os
import re
import sys

ROOT = r"C:\Users\dusto\effectcraft\crates\effects\src"
PATTERN = re.compile(r'spec\(\s*"(ec\.[^"]+)",\s*"([^"]+)"(?:\s*,\s*"([^"]+)")?')


def main():
    rows = []
    for path in sorted(glob.glob(os.path.join(ROOT, "*.rs"))):
        text = open(path, encoding="utf-8").read()
        for match in PATTERN.finditer(text):
            line = text[: match.start()].count("\n") + 1
            rows.append((match.group(1), match.group(2), match.group(3) or "", os.path.basename(path), line))
    print(f"# {len(rows)} effect specs")
    counts = collections.Counter(r[2] for r in rows)
    for category, count in counts.most_common():
        print(f"# {count:3d}  {category or '(no category)'}")
    for row in rows:
        print("\t".join(str(x) for x in row))
    if len(sys.argv) > 1:
        open(sys.argv[1], "w", encoding="utf-8").write("\n".join("\t".join(map(str, r)) for r in rows))


if __name__ == "__main__":
    main()
