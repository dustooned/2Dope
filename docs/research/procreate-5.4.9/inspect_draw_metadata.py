"""Dump Objective-C class names, and full method lists for classes matching a regex.

Supplementary local structural inspection of a local Procreate `.ipa`; NOT REA native
Evidence, and no method bodies are read or executed. Reuses the bounded Mach-O /
chained-fixup reader from `inspect_native_metadata.py` (pointer format 6, ARM64).

Usage:
  python inspect_draw_metadata.py Procreate_5.4.9_Pro.ipa --names names.txt
  python inspect_draw_metadata.py Procreate_5.4.9_Pro.ipa --match "brush|stroke|smudge" --output draw.json
"""
import argparse
import hashlib
import json
import plistlib
import re
import struct
import zipfile
from pathlib import Path


def read_macho(ipa_path):
    with zipfile.ZipFile(ipa_path) as archive:
        info_bytes = archive.read("Payload/Procreate.app/Info.plist")
        info = plistlib.loads(info_bytes)
        executable_member = "Payload/Procreate.app/" + info["CFBundleExecutable"]
        binary = archive.read(executable_member)
        entry_count = len(archive.infolist())
    magic, cpu, subtype, file_type, ncmds, command_bytes, flags, reserved = struct.unpack_from("<8I", binary)
    if magic != 0xFEEDFACF or cpu != 0x100000C:
        raise ValueError("Expected a thin little-endian ARM64 Mach-O")
    sections, segments, fixup_formats = [], [], []
    command_offset = 32
    for index in range(ncmds):
        command, size = struct.unpack_from("<II", binary, command_offset)
        if size < 8 or command_offset + size > 32 + command_bytes:
            raise ValueError("Invalid Mach-O load-command bounds")
        if command == 0x19:
            segment_name = binary[command_offset + 8:command_offset + 24].rstrip(b"\0").decode()
            vmaddr, vmsize, fileoff, filesize = struct.unpack_from("<4Q", binary, command_offset + 24)
            segments.append({"name": segment_name, "address": vmaddr, "size": vmsize,
                             "file_offset": fileoff, "file_size": filesize})
            section_count = struct.unpack_from("<I", binary, command_offset + 64)[0]
            if 72 + 80 * section_count > size:
                raise ValueError("Invalid segment section count")
            for section_index in range(section_count):
                at = command_offset + 72 + section_index * 80
                name = binary[at:at + 16].rstrip(b"\0").decode()
                segment = binary[at + 16:at + 32].rstrip(b"\0").decode()
                addr, length, offset = struct.unpack_from("<QQI", binary, at + 32)
                sections.append({"name": name, "segment": segment, "address": addr,
                                 "size": length, "file_offset": offset})
        elif command == 0x80000034:
            data_offset, data_size = struct.unpack_from("<II", binary, command_offset + 8)
            if data_offset + data_size > len(binary):
                raise ValueError("Invalid chained-fixups bounds")
            fixup_header = struct.unpack_from("<7I", binary, data_offset)
            starts = data_offset + fixup_header[1]
            segment_count = struct.unpack_from("<I", binary, starts)[0]
            for segment_index in range(segment_count):
                relative = struct.unpack_from("<I", binary, starts + 4 + 4 * segment_index)[0]
                if relative:
                    record = starts + relative
                    record_size, page_size, pointer_format = struct.unpack_from("<IHH", binary, record)
                    fixup_formats.append({"segment_index": segment_index,
                                          "pointer_format": pointer_format, "page_size": page_size})
        command_offset += size
    if command_offset != 32 + command_bytes:
        raise ValueError("Load-command size mismatch")
    if not fixup_formats or any(item["pointer_format"] != 6 for item in fixup_formats):
        raise ValueError("This bounded parser requires chained-pointer format 6")
    image_base = next(seg["address"] for seg in segments if seg["name"] == "__TEXT")

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
        offset = file_offset(address)
        return struct.unpack_from("<Q", binary, offset)[0] if offset is not None else 0

    def string_at(address):
        offset = file_offset(address) if address else None
        if offset is None:
            return None
        end = binary.find(b"\0", offset, min(len(binary), offset + 2048))
        if end < 0:
            return None
        try:
            return binary[offset:end].decode("utf-8")
        except UnicodeDecodeError:
            return None

    text_section = next(section for section in sections if section["name"] == "__text")

    def method_records(address):
        offset = file_offset(address) if address else None
        if offset is None:
            return None
        bits, count = struct.unpack_from("<II", binary, offset)
        entry_size = bits & 0xFFFF
        if count > 20000 or entry_size not in (12, 24):
            return None
        result = []
        for index in range(count):
            entry = address + 8 + index * entry_size
            at = file_offset(entry)
            if at is None:
                return None
            if bits & 0x80000000:
                name_delta, type_delta, imp_delta = struct.unpack_from("<iii", binary, at)
                name_address = entry + name_delta
                if not bits & 0x40000000:
                    name_address = pointer(u64(name_address))
                implementation = entry + 8 + imp_delta
            else:
                name_raw, type_raw, imp_raw = struct.unpack_from("<QQQ", binary, at)
                name_address, implementation = pointer(name_raw), pointer(imp_raw)
            name = string_at(name_address)
            if name is None:
                return None
            in_text = implementation is not None and text_section["address"] <= implementation < text_section["address"] + text_section["size"]
            result.append({"selector": name, "implementation": hex(implementation) if implementation else None,
                           "implementation_in_text": in_text})
        return result

    class_list = next(section for section in sections if section["name"] == "__objc_classlist")
    classes, unresolved = [], []
    for index in range(class_list["size"] // 8):
        raw = struct.unpack_from("<Q", binary, class_list["file_offset"] + index * 8)[0]
        class_address = pointer(raw)
        class_data = pointer(u64(class_address + 32) & ~7) if class_address else None
        name = string_at(pointer(u64(class_data + 24))) if class_data else None
        if not name or not name.isprintable():
            unresolved.append(index)
            continue
        methods = method_records(pointer(u64(class_data + 32)))
        superclass = string_at(pointer(u64(class_address + 8) if class_address else 0))
        classes.append({"name": name, "superclass": superclass, "class_address": hex(class_address),
                        "method_count": len(methods) if methods is not None else None,
                        "methods": methods})
    return {
        "authority": "supplementary local structural inspection, not REA native Evidence",
        "source": str(Path(ipa_path).resolve()), "archive_entry_count": entry_count,
        "bundle": {key: info.get(key) for key in ("CFBundleIdentifier", "CFBundleShortVersionString", "CFBundleVersion", "MinimumOSVersion", "UIDeviceFamily")},
        "members": [{"path": "Payload/Procreate.app/Info.plist", "bytes": len(info_bytes), "sha256": hashlib.sha256(info_bytes).hexdigest()},
                    {"path": executable_member, "bytes": len(binary), "sha256": hashlib.sha256(binary).hexdigest()}],
        "classlist_entries": class_list["size"] // 8, "unresolved_classlist_indices": unresolved,
        "binary_sha256": hashlib.sha256(binary).hexdigest(),
        "classes": classes,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("ipa", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--names", type=Path)
    parser.add_argument("--match", type=str)
    args = parser.parse_args()
    data = read_macho(args.ipa)
    names = sorted({c["name"] for c in data["classes"]})
    if args.names:
        args.names.write_text("\n".join(names) + "\n", encoding="utf-8")
    pattern = re.compile(args.match, re.I) if args.match else None
    selected = [c for c in data["classes"] if pattern and pattern.search(c["name"])]
    report = {k: v for k, v in data.items() if k != "classes"}
    report["matched_class_count"] = len(selected)
    report["classes"] = selected
    serialized = json.dumps(report, indent=2, ensure_ascii=False) + "\n"
    if args.output:
        args.output.write_text(serialized, encoding="utf-8")
        print(json.dumps({"output": str(args.output), "named_classes": len(names),
                          "matched": [c["name"] for c in selected][:60],
                          "method_total": sum(c["method_count"] or 0 for c in selected),
                          "unresolved_method_lists": sum(1 for c in selected if c["method_count"] is None)}))
    else:
        print(json.dumps({"named_classes": len(names), "matched": [c["name"] for c in selected][:80]}))
