"""Read selected iOS Mach-O declarations from an IPA; never execute its code.

Standard-library-only supplementary inspection, NOT a REA native dossier.
Supports the thin little-endian ARM64 layout and chained-pointer format 6
observed in this particular package. Does not decompile method bodies.
"""
import argparse
import hashlib
import json
import plistlib
import struct
import zipfile
from pathlib import Path


SELECTED_CLASSES = {
    "DocumentSelectionController", "DocumentSelectionViewController",
    "DocumentTransformController", "DocumentTransformBehaviourNumpad",
    "ValkyrieSelectionMode", "ValkyrieSelectionModeRenderer",
    "ValkyrieSelectionModePaintableMask", "ValkyrieWarpGeometry",
}
SELECTOR_TERMS = (
    "threshold", "feather", "mask", "undo", "wand", "paint", "commit",
    "transformwith", "snapping", "advancedmesh", "chords",
)


def inspect(ipa_path):
    with zipfile.ZipFile(ipa_path) as archive:
        info_member = "Payload/Procreate.app/Info.plist"
        info_bytes = archive.read(info_member)
        info = plistlib.loads(info_bytes)
        executable_member = "Payload/Procreate.app/" + info["CFBundleExecutable"]
        binary = archive.read(executable_member)
        entry_count = len(archive.infolist())
    magic, cpu, subtype, file_type, ncmds, command_bytes, flags, reserved = struct.unpack_from("<8I", binary)
    if magic != 0xFEEDFACF or cpu != 0x100000C:
        raise ValueError("Expected a thin little-endian ARM64 Mach-O")
    sections, segments, encryption, fixup_formats = [], [], [], []
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
        elif command == 0x2C:
            cryptoff, cryptsize, cryptid, pad = struct.unpack_from("<4I", binary, command_offset + 8)
            encryption.append({"command_index": index, "cryptoff": cryptoff,
                               "cryptsize": cryptsize, "cryptid": cryptid})
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
        if value >> 63:  # Imported/bind pointer; unresolved here.
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
            return []
        bits, count = struct.unpack_from("<II", binary, offset)
        entry_size = bits & 0xFFFF
        if count > 10000 or entry_size not in (12, 24):
            raise ValueError("Unsupported method-list layout")
        result = []
        for index in range(count):
            entry = address + 8 + index * entry_size
            at = file_offset(entry)
            if at is None:
                raise ValueError("Unmapped method record")
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
                raise ValueError("Unresolved selected method name")
            in_text = implementation is not None and text_section["address"] <= implementation < text_section["address"] + text_section["size"]
            result.append({"selector": name, "implementation": hex(implementation) if implementation else None,
                           "implementation_in_text": in_text, "method_record": hex(entry),
                           "method_record_file_offset": at})
        return result

    class_list = next(section for section in sections if section["name"] == "__objc_classlist")
    selected, unresolved, named = [], [], 0
    for index in range(class_list["size"] // 8):
        raw = struct.unpack_from("<Q", binary, class_list["file_offset"] + index * 8)[0]
        class_address = pointer(raw)
        class_data = pointer(u64(class_address + 32) & ~7) if class_address else None
        name = string_at(pointer(u64(class_data + 24))) if class_data else None
        if not name or not name.isprintable():
            unresolved.append(index)
            continue
        named += 1
        if name in SELECTED_CLASSES:
            records = method_records(pointer(u64(class_data + 32)))
            selected.append({"name": name, "class_address": hex(class_address),
                             "method_count": len(records), "methods": [method for method in records
                             if any(term in method["selector"].lower() for term in SELECTOR_TERMS)]})
    return {
        "authority": "supplementary local structural inspection, not REA native Evidence",
        "source": str(Path(ipa_path).resolve()), "archive_entry_count": entry_count,
        "bundle": {key: info.get(key) for key in ("CFBundleIdentifier", "CFBundleShortVersionString", "CFBundleVersion", "MinimumOSVersion", "UIDeviceFamily")},
        "members": [{"path": info_member, "bytes": len(info_bytes), "sha256": hashlib.sha256(info_bytes).hexdigest()},
                    {"path": executable_member, "bytes": len(binary), "sha256": hashlib.sha256(binary).hexdigest()}],
        "encryption_commands": encryption, "chained_fixups": fixup_formats,
        "objc": {"classlist_entries": class_list["size"] // 8, "named_classes_decoded": named,
                 "unresolved_classlist_indices": unresolved, "selected_classes": selected},
        "limitations": ["Internal metadata does not authenticate the package.",
                        "Selectors and implementation addresses do not establish call paths or runtime reachability.",
                        "No method bodies, shader algorithms, performance or Pencil input were analyzed.",
                        "No application code was executed; Swift-only members, categories and inherited methods are outside this selected-method inventory."],
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("ipa", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    report = inspect(args.ipa)
    serialized = json.dumps(report, indent=2, ensure_ascii=False) + "\n"
    if args.output:
        args.output.write_text(serialized, encoding="utf-8")
        print(json.dumps({"output": str(args.output), "selected_classes": len(report["objc"]["selected_classes"]),
                          "named_classes_decoded": report["objc"]["named_classes_decoded"],
                          "implementation_addresses_in_text": all(method["implementation_in_text"] for cls in report["objc"]["selected_classes"] for method in cls["methods"])}))
    else:
        print(serialized, end="")
