"""Write src/io/fixtures/testbrush.ts: a Procreate-format .brush (base64) for the importer tests.

The archive is an NSKeyedArchiver binary plist, laid out the way Procreate 5.4.9 writes
Brush.archive (a ValkyrieBrush root, response curves as ValkyrieMagnitudinalCurve objects whose
points are '{x, y}' strings, a bundledGrainPath picture in the brush folder). The values are our own
test values, not a copy of any shipped brush.

    python -I scripts/make-brush-fixture.py
"""
import base64
import io
import plistlib
import struct
import zipfile
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "src" / "io" / "fixtures" / "testbrush.ts"


def png(w, h, pixel):
    """A greyscale PNG; pixel(x, y) -> 0..255."""
    raw = b"".join(b"\0" + bytes(pixel(x, y) for x in range(w)) for y in range(h))
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 0, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")


class Archive:
    def __init__(self):
        self.objects = ["$null"]
        self.classes = {}

    def add(self, obj):
        self.objects.append(obj)
        return plistlib.UID(len(self.objects) - 1)

    def cls(self, *names):
        if names[0] not in self.classes:
            self.classes[names[0]] = self.add({"$classname": names[0], "$classes": list(names)})
        return self.classes[names[0]]

    def curve(self, points):
        pts = [self.add("{%f, %f}" % p) for p in points]
        arr = self.add({"NS.objects": pts, "$class": self.cls("NSMutableArray", "NSMutableArray", "NSArray", "NSObject")})
        return self.add({"points": arr, "$class": self.cls("ValkyrieMagnitudinalCurve", "ValkyrieMagnitudinalCurve", "NSObject")})


def main():
    a = Archive()
    root = {}
    root_uid = a.add(root)
    linear = [(0, 0), (1, 1)]
    values = {
        "name": a.add("Fixture Dry Ink"),
        "bundledShapePath": a.add("Fixture-Shape.png"),
        "bundledGrainPath": a.add("Fixture-Grain.png"),
        "paintSize": 0.12,
        "paintOpacity": 0.9,
        "maxSize": 1.5,
        "plotSpacing": 0.08,
        "plotJitter": 5.5,
        "plotSmoothing": 0.35,
        "plotMovingAverageStabilization": 0.4,
        "dynamicsPressureSize": -0.6,
        "dynamicsPressureSizeCurve": a.curve([(0, 0), (0.25, 0.6), (1, 1)]),
        "dynamicsPressureOpacity": 0.5,
        "dynamicsPressureOpacityCurve": a.curve(linear),
        "dynamicsPressureHueCurve": a.curve(linear),
        "dynamicsSpeedSize": 0.8,
        "dynamicsJitterSize": 0.3,
        "dynamicsTiltSize": 0.5,
        "pencilTaperStartLength": 0.25,
        "pencilTaperEndLength": 0.5,
        "pencilTaperSize": 0.7,
        "pencilTaperOpacity": 0.4,
        "pencilTaperShape": 0.5,
        "pencilTaperSizeLinked": False,
        "taperStartLength": 0.0,
        "taperPressure": 1.0,
        "grainBlendMode": 28,
        "grainDepth": 0.2,
        "grainDepthMinimum": 0.05,
        "textureScale": 0.5,
        "textureMovement": 0.4,
        "textureZoom": 1.0,
        "textureRotation": 0.25,
        "textureOrientation": 1,
        "textureInverted": False,
        "dualBlendMode": 1,
        "fixtureFutureKey": 1.0,
        "$class": a.cls("ValkyrieBrush", "ValkyrieBrush", "NSObject"),
    }
    root.update(values)
    data = plistlib.dumps({"$version": 100000, "$archiver": "NSKeyedArchiver", "$top": {"root": root_uid}, "$objects": a.objects}, fmt=plistlib.FMT_BINARY)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("Fixture/Brush.archive", data)
        z.writestr("Fixture/Fixture-Shape.png", png(16, 16, lambda x, y: 255 if (x - 7.5) ** 2 + (y - 7.5) ** 2 < 49 else 0))
        z.writestr("Fixture/Fixture-Grain.png", png(16, 16, lambda x, y: 255 if (x + y) % 4 else 40))
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    OUT.write_text(
        "// A Procreate-format .brush written by scripts/make-brush-fixture.py (Python's NSKeyedArchiver\n"
        "// binary plist writer, Procreate 5.4.9's key names, our own values), for the importer's test.\n"
        f"export const TEST_BRUSH_B64 = '{b64}';\n",
        encoding="utf-8", newline="\n")
    print(OUT, len(buf.getvalue()))


if __name__ == "__main__":
    main()
