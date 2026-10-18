# 2Dope importer for Blender.
#
# Builds a Blender scene from a 2Dope "Export for Blender" package (a .zip, or its scene.json):
#   drawings layers -> image planes with an image sequence (holds, loops and swaps already timed)
#   nulls           -> empties (parenting kept)
#   the camera      -> an orthographic camera (pan, roll, zoom)
#   precomps        -> collection instances (shared), or rendered planes when they run on their own clock
#   keyframes       -> F-curves with the same Bezier handles, so easing matches 2Dope exactly
#
# Install: Edit > Preferences > Add-ons > (v) > Install from Disk... > pick this file.
# Then: File > Import > 2Dope scene (.zip / scene.json).
#
# Units: 2Dope works in pixels with y down. Here 100 px = 1 m by default (change it in the import
# options), x stays x, y becomes -z, and layers face the camera on the XZ plane (front view).

bl_info = {
    "name": "2Dope importer",
    "author": "2Dope",
    "version": (0, 1, 0),
    "blender": (4, 2, 0),
    "location": "File > Import > 2Dope scene",
    "description": "Image planes, cameras, precomps and keyframes from a 2Dope animation",
    "category": "Import-Export",
}

import json
import math
import os
import shutil
import zipfile

import bpy
from bpy.props import FloatProperty, StringProperty
from bpy_extras.io_utils import ImportHelper

FORMAT = "2dope-blender"
DEPTH = 0.01  # metres between stacked layers


# ---------------------------------------------------------------------------------------------
# Package


def open_package(path):
    """Return (scene dict, folder holding the images). A .zip is unpacked next to itself."""
    if path.lower().endswith(".zip"):
        folder = os.path.splitext(path)[0] + "_2dope"
        os.makedirs(folder, exist_ok=True)
        with zipfile.ZipFile(path) as z:
            for info in z.infolist():
                name = os.path.normpath(info.filename)
                if name.startswith("..") or os.path.isabs(name):
                    raise ValueError("unsafe file name in the package: " + info.filename)
            z.extractall(folder)
        # the package may hold one folder with scene.json in it
        for root, _dirs, files in os.walk(folder):
            if "scene.json" in files:
                folder = root
                break
        path = os.path.join(folder, "scene.json")
    with open(path, "r", encoding="utf-8") as f:
        scene = json.load(f)
    if scene.get("format") != FORMAT:
        raise ValueError("this is not a 2Dope scene")
    if scene.get("version", 0) > 1:
        raise ValueError("this package was made by a newer 2Dope; update the add-on")
    return scene, os.path.dirname(path)


def link_or_copy(src, dst):
    if os.path.exists(dst):
        os.remove(dst)
    try:
        os.link(src, dst)
    except OSError:
        shutil.copyfile(src, dst)


# ---------------------------------------------------------------------------------------------
# Animation helpers (works with Blender 4.2 to 5.x actions)


def fcurves_of(id_data):
    ad = id_data.animation_data
    if ad is None or ad.action is None:
        return None
    act = ad.action
    try:
        from bpy_extras import anim_utils

        if hasattr(anim_utils, "action_get_channelbag_for_slot") and getattr(ad, "action_slot", None) is not None:
            bag = anim_utils.action_get_channelbag_for_slot(act, ad.action_slot)
            if bag is not None:
                return bag.fcurves
    except Exception:
        pass
    return getattr(act, "fcurves", None)


def apply_keys(id_data, data_path, index, keys, convert, frame_start):
    """Key one channel. `convert(v)` maps a 2Dope value to Blender; handles convert the same way."""
    target = id_data.path_resolve(data_path.rsplit(".", 1)[0]) if "." in data_path else id_data
    prop = data_path.rsplit(".", 1)[-1]
    for k in keys:
        value = convert(k["value"])
        cur = getattr(target, prop)
        if hasattr(cur, "__len__") and index >= 0:
            cur[index] = value
        else:
            setattr(target, prop, value)
        id_data.keyframe_insert(data_path=data_path, index=index, frame=k["frame"] + frame_start)
    fcs = fcurves_of(id_data)
    if fcs is None:
        return
    fc = fcs.find(data_path, index=index) if index >= 0 else fcs.find(data_path)
    if fc is None:
        return
    by_frame = {round(p.co[0]): p for p in fc.keyframe_points}
    for k in keys:
        p = by_frame.get(k["frame"] + frame_start)
        if p is None:
            continue
        p.interpolation = k["interp"]
        if k["interp"] == "BEZIER":
            p.handle_left_type = "FREE"
            p.handle_right_type = "FREE"
            if k.get("right"):
                p.handle_right = (k["right"][0] + frame_start, convert(k["right"][1]))
            else:
                p.handle_right = (p.co[0] + 1, p.co[1])
            if k.get("left"):
                p.handle_left = (k["left"][0] + frame_start, convert(k["left"][1]))
            else:
                p.handle_left = (p.co[0] - 1, p.co[1])
    fc.update()


def key_visibility(obj, layer, length, frame_start):
    """Hide the object outside the layer's in/out range."""
    start = layer["in"]
    end = layer["out"] if layer["out"] is not None else length
    if not layer.get("visible", True):
        obj.hide_render = True
        obj.hide_viewport = True
        return
    if start <= 0 and end >= length:
        return
    for prop in ("hide_render", "hide_viewport"):
        for frame, hidden in ((frame_start - 1, start > 0), (frame_start + max(0, start), False), (frame_start + end, True)):
            setattr(obj, prop, hidden)
            obj.keyframe_insert(data_path=prop, frame=frame)
    fcs = fcurves_of(obj)
    if fcs:
        for fc in fcs:
            if fc.data_path in ("hide_render", "hide_viewport"):
                for p in fc.keyframe_points:
                    p.interpolation = "CONSTANT"
    obj.hide_render = False
    obj.hide_viewport = False


# ---------------------------------------------------------------------------------------------
# Building


class Builder:
    def __init__(self, scene, folder, ppu):
        self.s = scene
        self.folder = folder
        self.ppu = ppu
        self.fs = 1  # Blender frame of 2Dope frame 0
        self.collections = {}
        self.notes = []

    # ---- coordinates
    def px(self, v):
        return v / self.ppu

    # ---- images
    def image_path(self, key):
        rel = self.s["images"].get(key)
        return os.path.join(self.folder, rel) if rel else None

    def sequence(self, comp_id, layer, size):
        """Write a numbered image sequence for a layer (hard links, so it costs no space) and load it."""
        length = self.s["comps"][comp_id]["length"]
        folder = os.path.join(self.folder, "seq", "%s_%s" % (comp_id, layer["id"]))
        os.makedirs(folder, exist_ok=True)
        blank = os.path.join(folder, "_blank.png")
        if not os.path.exists(blank):
            img = bpy.data.images.new("2dope_blank", width=max(1, int(size[0])), height=max(1, int(size[1])), alpha=True)
            img.pixels = [0.0] * (img.size[0] * img.size[1] * 4)
            img.filepath_raw = blank
            img.file_format = "PNG"
            img.save()
            bpy.data.images.remove(img)
        per = [None] * length
        for run in layer.get("frames", []):
            for f in range(run["from"], min(run["to"], length - 1) + 1):
                per[f] = run["image"]
        for f, key in enumerate(per):
            src = self.image_path(key) if key else None
            link_or_copy(src if src and os.path.exists(src) else blank, os.path.join(folder, "%04d.png" % (f + 1)))
        img = bpy.data.images.load(os.path.join(folder, "0001.png"), check_existing=False)
        img.name = "%s %s" % (self.s["comps"][comp_id]["name"], layer["name"])
        img.source = "SEQUENCE"
        img.alpha_mode = "STRAIGHT"
        return img, length

    def material(self, name, img, length, layer):
        mat = bpy.data.materials.new(name)
        mat.use_nodes = True
        if hasattr(mat, "surface_render_method"):
            mat.surface_render_method = "BLENDED"
        if hasattr(mat, "blend_method"):
            try:
                mat.blend_method = "BLEND"
            except Exception:
                pass
        mat.use_backface_culling = False
        nt = mat.node_tree
        for n in list(nt.nodes):
            nt.nodes.remove(n)
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = img
        tex.interpolation = "Linear"
        tex.image_user.frame_duration = length
        tex.image_user.frame_start = self.fs
        tex.image_user.frame_offset = 0
        tex.image_user.use_auto_refresh = True
        tex.image_user.use_cyclic = False
        emit = nt.nodes.new("ShaderNodeEmission")
        clear = nt.nodes.new("ShaderNodeBsdfTransparent")
        mix = nt.nodes.new("ShaderNodeMixShader")
        alpha = nt.nodes.new("ShaderNodeMath")
        alpha.operation = "MULTIPLY"
        opacity = nt.nodes.new("ShaderNodeValue")
        opacity.name = "2Dope opacity"
        opacity.label = "Opacity"
        nt.links.new(tex.outputs["Color"], emit.inputs["Color"])
        nt.links.new(tex.outputs["Alpha"], alpha.inputs[0])
        nt.links.new(opacity.outputs[0], alpha.inputs[1])
        nt.links.new(alpha.outputs[0], mix.inputs["Fac"])
        nt.links.new(clear.outputs[0], mix.inputs[1])
        nt.links.new(emit.outputs[0], mix.inputs[2])
        nt.links.new(mix.outputs[0], out.inputs["Surface"])
        ch = layer["channels"].get("opacity", {"value": 100})
        opacity.outputs[0].default_value = max(0.0, min(1.0, ch["value"] / 100))
        if ch.get("keys"):
            apply_keys(nt, 'nodes["2Dope opacity"].outputs[0].default_value', -1, ch["keys"], lambda v: max(0.0, min(1.0, v / 100)), self.fs)
        return mat

    def plane(self, name, layer, collection):
        """A page-sized plane, its origin at the layer's anchor, facing the camera (-Y)."""
        w, h = layer["size"]
        ax, ay = layer["anchor"]
        verts = [(self.px(x - ax), 0.0, -self.px(y - ay)) for (x, y) in ((0, h), (w, h), (w, 0), (0, 0))]
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(verts, [], [(0, 1, 2, 3)])
        uv = mesh.uv_layers.new(name="UVMap")
        for i, (u, v) in enumerate(((0, 0), (1, 0), (1, 1), (0, 1))):
            uv.data[i].uv = (u, v)
        mesh.update()
        obj = bpy.data.objects.new(name, mesh)
        collection.objects.link(obj)
        return obj

    # ---- transforms
    def transform(self, obj, layer, comp, parent_layer):
        ch = layer["channels"]
        W, H = comp["width"], comp["height"]
        ref = parent_layer["anchor"] if parent_layer else (W / 2, H / 2)

        def put(name, path, index, convert, default):
            c = ch.get(name)
            v = c["value"] if c else default
            vec = getattr(obj, path)
            vec[index] = convert(v)
            if c and c.get("keys"):
                apply_keys(obj, path, index, c["keys"], convert, self.fs)

        put("position.x", "location", 0, lambda v: self.px(v - ref[0]), ref[0])
        put("position.y", "location", 2, lambda v: -self.px(v - ref[1]), ref[1])
        put("scale.x", "scale", 0, lambda v: v / 100, 100)
        put("scale.y", "scale", 2, lambda v: v / 100, 100)
        # 2Dope turns clockwise on screen; seen from the front (looking +Y), that is +Y rotation
        put("rotation", "rotation_euler", 1, lambda v: math.radians(v), 0)

    # ---- comps
    def build_comp(self, comp_id, collection):
        comp = self.s["comps"][comp_id]
        layers = comp["layers"]
        by_id = {l["id"]: l for l in layers}
        objects = {}
        n = len(layers)
        depth = {l["id"]: -(n - i) * DEPTH for i, l in enumerate(layers)}
        for l in layers:
            kind = l["kind"]
            name = l["name"]
            if kind == "camera":
                objects[l["id"]] = self.camera(l, comp, collection)
                continue
            if kind == "null":
                obj = bpy.data.objects.new(name, None)
                obj.empty_display_type = "PLAIN_AXES"
                obj.empty_display_size = 0.3
                collection.objects.link(obj)
            elif kind in ("drawings", "baked"):
                img, length = self.sequence(comp_id, l, l["size"])
                obj = self.plane(name, l, collection)
                obj.data.materials.append(self.material(name, img, length, l))
            elif kind == "instance":
                obj = bpy.data.objects.new(name, None)
                obj.empty_display_type = "PLAIN_AXES"
                obj.empty_display_size = 0.2
                collection.objects.link(obj)
                inst = bpy.data.objects.new(name + " (instance)", None)
                inst.instance_type = "COLLECTION"
                inst.instance_collection = self.comp_collection(l["comp"])
                nested = self.s["comps"][l["comp"]]
                ax, ay = l["anchor"]
                inst.location = (self.px(nested["width"] / 2 - ax), 0.0, -self.px(nested["height"] / 2 - ay))
                collection.objects.link(inst)
                inst.parent = obj
                # hiding a parent does not hide its children in Blender: the instance keys its own visibility
                key_visibility(inst, l, comp["length"], self.fs)
            else:
                continue
            objects[l["id"]] = obj
            key_visibility(obj, l, comp["length"], self.fs)
        # parents, then transforms (positions are in the parent's space)
        for l in layers:
            obj = objects.get(l["id"])
            if obj is None or l["kind"] == "camera":
                continue
            parent = by_id.get(l["parent"]) if l["parent"] else None
            pobj = objects.get(l["parent"]) if parent else None
            if pobj is not None and parent["kind"] != "camera":
                obj.parent = pobj
                self.transform(obj, l, comp, parent)
                obj.location[1] = depth[l["id"]] - depth[parent["id"]]
            else:
                self.transform(obj, l, comp, None)
                obj.location[1] = depth[l["id"]]
        return objects

    def comp_collection(self, comp_id):
        if comp_id in self.collections:
            return self.collections[comp_id]
        holder = self.collections.get("__holder")
        if holder is None:
            holder = bpy.data.collections.new("2Dope comps")
            bpy.context.scene.collection.children.link(holder)
            self.collections["__holder"] = holder
            # the comps themselves are not drawn; their instances are
            lc = bpy.context.view_layer.layer_collection.children.get(holder.name)
            if lc is not None:
                lc.exclude = True
        coll = bpy.data.collections.new(self.s["comps"][comp_id]["name"])
        holder.children.link(coll)
        self.collections[comp_id] = coll
        self.build_comp(comp_id, coll)
        return coll

    def camera(self, layer, comp, collection):
        W, H = comp["width"], comp["height"]
        cam = bpy.data.cameras.new(layer["name"])
        cam.type = "ORTHO"
        obj = bpy.data.objects.new(layer["name"], cam)
        collection.objects.link(obj)
        obj.rotation_euler = (math.pi / 2, 0.0, 0.0)
        ch = layer["channels"]
        base = max(W, H)

        def put(name, path, index, convert, default):
            c = ch.get(name)
            vec = getattr(obj, path)
            vec[index] = convert(c["value"] if c else default)
            if c and c.get("keys"):
                apply_keys(obj, path, index, c["keys"], convert, self.fs)

        put("position.x", "location", 0, lambda v: self.px(v - W / 2), W / 2)
        put("position.y", "location", 2, lambda v: -self.px(v - H / 2), H / 2)
        obj.location[1] = -50.0
        put("rotation", "rotation_euler", 1, lambda v: math.radians(v), 0)
        zoom = ch.get("zoom", {"value": 100})
        cam.ortho_scale = self.px(base) / max(0.01, zoom["value"] / 100)
        if zoom.get("keys"):
            # ortho scale is 1/zoom, not a straight line: key every frame between the first and last key
            first = zoom["keys"][0]["frame"]
            last = zoom["keys"][-1]["frame"]
            for f in range(first, last + 1):
                v = self.zoom_at(zoom["keys"], f)
                cam.ortho_scale = self.px(base) / max(0.01, v / 100)
                cam.keyframe_insert(data_path="ortho_scale", frame=f + self.fs)
        cam.clip_end = 1000
        bpy.context.scene.camera = obj
        return obj

    @staticmethod
    def zoom_at(keys, f):
        """Evaluate a zoom track at a frame (Bezier between keys, like 2Dope)."""
        if f <= keys[0]["frame"]:
            return keys[0]["value"]
        for a, b in zip(keys, keys[1:]):
            if a["frame"] <= f <= b["frame"]:
                if a["interp"] == "CONSTANT":
                    return a["value"] if f < b["frame"] else b["value"]
                t = (f - a["frame"]) / max(1e-9, b["frame"] - a["frame"])
                if a["interp"] == "LINEAR" or not a.get("right") or not b.get("left"):
                    return a["value"] + (b["value"] - a["value"]) * t
                p0, p1, p2, p3 = (a["frame"], a["value"]), tuple(a["right"]), tuple(b["left"]), (b["frame"], b["value"])
                lo, hi = 0.0, 1.0
                for _ in range(40):
                    u = (lo + hi) / 2
                    x = (1 - u) ** 3 * p0[0] + 3 * (1 - u) ** 2 * u * p1[0] + 3 * (1 - u) * u * u * p2[0] + u ** 3 * p3[0]
                    if x < f:
                        lo = u
                    else:
                        hi = u
                u = (lo + hi) / 2
                return (1 - u) ** 3 * p0[1] + 3 * (1 - u) ** 2 * u * p1[1] + 3 * (1 - u) * u * u * p2[1] + u ** 3 * p3[1]
        return keys[-1]["value"]

    def build(self):
        s = self.s
        main = s["comps"][s["main"]]
        scene = bpy.context.scene
        scene.render.resolution_x = int(main["width"])
        scene.render.resolution_y = int(main["height"])
        scene.render.resolution_percentage = 100
        fps = float(main["fps"])
        scene.render.fps = int(round(fps))
        scene.render.fps_base = scene.render.fps / fps if fps else 1.0
        scene.frame_start = self.fs
        scene.frame_end = self.fs + int(main["length"]) - 1
        scene.render.film_transparent = main.get("background") is None
        for engine in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
            try:
                scene.render.engine = engine
                break
            except TypeError:
                continue
        try:
            scene.view_settings.view_transform = "Standard"
        except TypeError:
            pass
        if main.get("background"):
            hexv = main["background"].lstrip("#")
            rgb = tuple(int(hexv[i : i + 2], 16) / 255 for i in (0, 2, 4))
            if scene.world is None:
                scene.world = bpy.data.worlds.new("2Dope background")
            scene.world.color = rgb
        top = bpy.data.collections.new(s.get("name") or main["name"])
        scene.collection.children.link(top)
        objects = self.build_comp(s["main"], top)
        if not any(l["kind"] == "camera" for l in main["layers"]):
            # no camera in 2Dope: one that frames the shot exactly
            cam = bpy.data.cameras.new("Camera")
            cam.type = "ORTHO"
            cam.ortho_scale = self.px(max(main["width"], main["height"]))
            obj = bpy.data.objects.new("Camera", cam)
            top.objects.link(obj)
            obj.location = (0.0, -50.0, 0.0)
            obj.rotation_euler = (math.pi / 2, 0.0, 0.0)
            cam.clip_end = 1000
            scene.camera = obj
        self.storyboard(scene)
        return objects

    def storyboard(self, scene):
        # the storyboard for 3D blocking: a timeline marker per panel and a text with every caption
        board = self.s.get("board") or []
        if not board:
            return
        lines = ["2Dope storyboard", ""]
        for p in board:
            what = [p.get("shot", ""), p.get("camera", "")]
            if not any(what):
                what = [(p.get("action") or p.get("dialogue") or "")[:40]]
            label = " ".join(x for x in [str(p.get("n", ""))] + what if x)
            m = scene.timeline_markers.new(label[:63] or "Panel", frame=self.fs + int(p.get("frame", 0)))
            m.select = False
            lines.append(f"Panel {p.get('n')}  frame {self.fs + int(p.get('frame', 0))}  ({p.get('length', 0)} frames)")
            for key, name in (("shot", "Shot"), ("camera", "Camera"), ("dialogue", "Dialogue"), ("action", "Action"), ("slug", "Timing"), ("note", "Notes")):
                if p.get(key):
                    lines.append(f"  {name}: {p[key]}")
            img = p.get("image")
            if img and img in self.s.get("images", {}):
                lines.append(f"  Picture: {self.s['images'][img]}")
            lines.append("")
        text = bpy.data.texts.get("2Dope storyboard") or bpy.data.texts.new("2Dope storyboard")
        text.clear()
        text.write("\n".join(lines))


def import_2dope(path, ppu=None):
    scene, folder = open_package(path)
    b = Builder(scene, folder, ppu or scene.get("pixelsPerUnit", 100))
    b.build()
    return scene


class IMPORT_OT_2dope(bpy.types.Operator, ImportHelper):
    """Import a 2Dope animation (image planes, camera, precomps and keyframes)"""

    bl_idname = "import_scene.twodope"
    bl_label = "Import 2Dope scene"
    bl_options = {"REGISTER", "UNDO"}

    filter_glob: StringProperty(default="*.zip;*.json", options={"HIDDEN"})
    pixels_per_unit: FloatProperty(name="Pixels per metre", default=100.0, min=1.0, max=100000.0, description="How many 2Dope pixels make one Blender unit")

    def execute(self, context):
        try:
            s = import_2dope(self.filepath, self.pixels_per_unit)
        except Exception as e:  # report, never crash Blender
            self.report({"ERROR"}, "2Dope import failed: %s" % e)
            return {"CANCELLED"}
        self.report({"INFO"}, "Imported %s" % s.get("name", "2Dope scene"))
        return {"FINISHED"}


def menu_func_import(self, context):
    self.layout.operator(IMPORT_OT_2dope.bl_idname, text="2Dope scene (.zip / scene.json)")


def register():
    bpy.utils.register_class(IMPORT_OT_2dope)
    bpy.types.TOPBAR_MT_file_import.append(menu_func_import)


def unregister():
    bpy.types.TOPBAR_MT_file_import.remove(menu_func_import)
    bpy.utils.unregister_class(IMPORT_OT_2dope)


if __name__ == "__main__":
    register()
