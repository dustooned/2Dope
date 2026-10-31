"""Read-only PDF text extractor with glyph-offset auto-detection.

Handles PDFs whose page text is drawn from literal `(...)` strings or from
UTF-16BE `<hex>` strings using a shifted subset-font encoding (e.g. '5HWUR'
decodes to 'Retro' at shift 29). Prints the best-scoring decode.
"""
import re, sys, zlib

WORDS = re.compile(r"\b(the|and|for|with|you|this|that|effect|effects|value|default|range|"
                   r"parameter|blur|size|color|colour|amount|from|will|can|use|when|your|are|not|"
                   r"based|render|comp|layer|plugin|version|section|settings?|an|of|to|in|is|on|it|"
                   r"mode|angle|scale|opacity|width|height)\b", re.I)


def streams(data):
    for m in re.finditer(rb"stream\r?\n", data):
        start = m.end()
        end = data.find(b"endstream", start)
        if end < 0:
            continue
        try:
            yield zlib.decompress(data[start:end])
        except zlib.error:
            continue


def tokens(data):
    out = []
    for c in streams(data):
        for m in re.finditer(rb"\((?:\\.|[^\\()])*\)|<[0-9A-Fa-f\s]{8,}>", c):
            tok = m.group(0)
            if tok.startswith(b"<"):
                hexs = re.sub(rb"\s", b"", tok[1:-1])
                if len(hexs) % 4:
                    continue
                try:
                    b = bytes.fromhex(hexs.decode("ascii"))
                except ValueError:
                    continue
                s = b.decode("utf-16-be", "replace")
            else:
                body = tok[1:-1]
                body = re.sub(rb"\\([()\\])", rb"\1", body)
                s = body.decode("latin-1", "replace")
            if s.strip():
                out.append(s)
    return out


def shift(text, off):
    return "".join(chr(ord(c) - off) if 32 <= ord(c) - off < 127
                   else ("\n" if c == "\n" else " ") for c in text)


def score(t):
    return len(WORDS.findall(t))


def main(path):
    data = open(path, "rb").read()
    toks = tokens(data)
    if not toks:
        print("(no text tokens)")
        return
    blob = "\n".join(toks)
    scored = [(score(shift(blob, o)), o) for o in range(0, 64)]
    best_score, best = max(scored)
    txt = shift(blob, best)
    txt = re.sub(r"[ ]{2,}", " ", txt)
    txt = re.sub(r"\n{3,}", "\n\n", txt)
    print(f"[shift={best} hits={best_score} tokens={len(toks)}]")
    print(txt[:14000])


if __name__ == "__main__":
    main(sys.argv[1])
