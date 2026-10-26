"""Read selected iOS Mach-O declarations from a Dreams .app; never execute its code.

Standard-library-only supplementary inspection, NOT a REA native dossier. Supports the thin
little-endian ARM64 layout and chained-pointer format 6 seen in this build (1.0.11 / 17168).
It prints JSON to stdout; redirect it yourself if you want a file.
"""
import argparse
import json
import plistlib
import struct
from pathlib import Path

KEYS = (
    "CFBundleIdentifier", "CFBundleShortVersionString", "CFBundleVersion",
    "MinimumOSVersion", "UIDeviceFamily",
)
KEYWORDS = (
    "timeline", "track", "flipbook", "keyframe", "perform", "onion", "lightbox", "brush",
    "content", "panel", "shot", "scene", "camera", "audio", "transition", "export", "render",
    "compositor", "displaylist", "phoenix", "alpine", "dream", "clip", "layer", "playhead",
    "marker", "text", "stroke", "vector", "metal", "shader", "undo", "document",
)


def inspect(app: Path):
    info = plistlib.loads((app / "Info.plist").read_bytes())
    exe_name = info.get("CFBundleExecutable", "Dreams")
    binary = (app / exe_name).read_bytes()
    magic, cpu, subtype, file_type, ncmds, command_bytes, flags, _ = struct.unpack_from("<8I", binary)
    if magic != 0xFEEDFACF or cpu != 0x100000C:
        raise ValueError("Expected a thin little-endian ARM64 Mach-O")

    sections, segments, encryption, symtab = [], [], [], None
    offset = 32
    for index in range(ncmds):
        command, size = struct.unpack_from("<II", binary, offset)
        if size < 8 or offset + size > 32 + command_bytes:
            raise ValueError("Invalid Mach-O load-command bounds")
        if command == 0x19:
            name = binary[offset + 8:offset + 24].rstrip(b"\0").decode()
            vmaddr, vmsize, fileoff, filesize = struct.unpack_from("<4Q", binary, offset + 24)
            segments.append({"name": name, "address": vmaddr, "size": vmsize,
                             "file_offset": fileoff, "file_size": filesize})
            count = struct.unpack_from("<I", binary, offset + 64)[0]
            for k in range(count):
                at = offset + 72 + k * 80
                if at + 80 > offset + size:
                    raise ValueError("Invalid segment section count")
                sname = binary[at:at + 16].rstrip(b"\0").decode()
                seg = binary[at + 16:at + 32].rstrip(b"\0").decode()
                addr, length, foff = struct.unpack_from("<QQI", binary, at + 32)
                sections.append({"name": sname, "segment": seg, "address": addr,
                                 "size": length, "file_offset": foff})
        elif command == 0x2C:
            cryptoff, cryptsize, cryptid, _pad = struct.unpack_from("<4I", binary, offset + 8)
            encryption.append({"cryptoff": cryptoff, "cryptsize": cryptsize, "cryptid": cryptid})
        elif command == 0x2:
            symtab = struct.unpack_from("<4I", binary, offset + 8)
        offset += size
    if offset != 32 + command_bytes:
        raise ValueError("Load-command size mismatch")

    text = next(s for s in sections if s["name"] == "__text")
    image_base = next(s["address"] for s in segments if s["name"] == "__TEXT")

    def file_offset(address):
        for section in sections:
            if section["file_offset"] and section["address"] <= address < section["address"] + section["size"]:
                return section["file_offset"] + address - section["address"]
        return None

    def pointer(value):
        if not value:
            return 0
        if file_offset(value) is not None:
            return value
        if value >> 63:
            return None
        target = image_base + (value & ((1 << 36) - 1))
        target = (target & ((1 << 56) - 1)) | (((value >> 36) & 0xFF) << 56)
        return target if file_offset(target) is not None else None

    def u64(address):
        at = file_offset(address)
        return struct.unpack_from("<Q", binary, at)[0] if at is not None else 0

    def string_at(address):
        at = file_offset(address) if address else None
        if at is None:
            return None
        end = binary.find(b"\0", at, min(len(binary), at + 2048))
        if end < 0:
            return None
        try:
            return binary[at:end].decode("utf-8")
        except UnicodeDecodeError:
            return None

    classes = []
    class_list = next((s for s in sections if s["name"] == "__objc_classlist"), None)
    if class_list:
        for index in range(class_list["size"] // 8):
            raw = struct.unpack_from("<Q", binary, class_list["file_offset"] + index * 8)[0]
            address = pointer(raw)
            data = pointer(u64(address + 32) & ~7) if address else None
            name = string_at(pointer(u64(data + 24))) if data else None
            if name and name.isprintable():
                classes.append(name)

    symbols = []
    if symtab:
        symoff, nsyms, stroff, strsize = symtab
        for index in range(nsyms):
            at = symoff + index * 16
            if at + 16 > len(binary):
                break
            strx, ntype, _sect, _desc, _value = struct.unpack_from("<IBBHQ", binary, at)
            if not strx or strx >= strsize:
                continue
            start = stroff + strx
            end = binary.find(b"\0", start, min(len(binary), stroff + strsize))
            if end < 0:
                continue
            try:
                symbols.append(binary[start:end].decode("utf-8"))
            except UnicodeDecodeError:
                pass

    reflstr = next((s for s in sections if s["name"] == "__swift5_reflstr"), None)
    reflections = []
    if reflstr:
        blob = binary[reflstr["file_offset"]:reflstr["file_offset"] + reflstr["size"]]
        reflections = [part.decode("utf-8", "replace") for part in blob.split(b"\0") if part]

    return {
        "authority": "supplementary local structural inspection, not REA native Evidence",
        "bundle": {key: info.get(key) for key in KEYS},
        "document_types": [
            {"name": d.get("CFBundleTypeName"), "types": d.get("LSItemContentTypes")}
            for d in info.get("CFBundleDocumentTypes", [])
        ],
        "exported_types": [
            {"id": t.get("UTTypeIdentifier"), "extension": (t.get("UTTypeTagSpecification") or {}).get("public.filename-extension")}
            for t in info.get("UTExportedTypeDeclarations", [])
        ],
        "macho": {
            "bytes": len(binary), "cpu": hex(cpu), "file_type": file_type,
            "commands": ncmds, "flags": hex(flags),
            "segments": segments,
            "sections": sections,
            "encryption": encryption,
            "text_section": text,
            "symbol_count": len(symbols),
        },
        "objc": {"class_count": len(classes), "classes": sorted(classes)},
        "swift": {"symbol_names": symbols, "reflection_strings": reflections},
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("app", type=Path, help="path to Dreams.app")
    parser.add_argument("--full", action="store_true", help="print every list instead of a summary")
    args = parser.parse_args()
    report = inspect(args.app)
    if args.full:
        print(json.dumps(report, indent=2, ensure_ascii=False))
        return
    classes = report["objc"]["classes"]
    reflections = report["swift"]["reflection_strings"]
    symbols = report["swift"]["symbol_names"]
    def hits(values, limit=80):
        out = []
        for value in values:
            low = value.lower()
            if any(key in low for key in KEYWORDS):
                out.append(value)
            if len(out) >= limit:
                break
        return out
    summary = {
        "bundle": report["bundle"],
        "document_types": report["document_types"],
        "exported_types": report["exported_types"],
        "macho": {k: report["macho"][k] for k in ("bytes", "commands", "encryption", "symbol_count")},
        "counts": {"objc_classes": len(classes), "swift_symbols": len(symbols),
                   "reflection_strings": len(reflections)},
        "objc_sample": classes[:40],
        "objc_keywords": hits(classes),
        "swift_keywords": hits(symbols),
        "reflection_keywords": hits(reflections),
    }
    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
