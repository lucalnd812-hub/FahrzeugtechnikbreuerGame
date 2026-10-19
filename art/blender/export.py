"""Game export for a built car (run after <car>.py inside Blender):

* 16 garage views, transparent WebP, same fixed orthographic turntable camera
  the game's manifest describes (elevation 18°, 6.26 m wide, target 0.66 m),
  rendered at 1280×800 for sharp phones/retina screens.
* Two GLB levels of detail: high (race close-up) and low (rivals/2D fallback).
  Each GLB holds 'body' (merged, decimated) and one 'wheel' (outer face +X,
  centred at the hub) that the game instances on all four corners.
"""
import bpy, bmesh, os, json, hashlib, math
import numpy as np
from math import radians
import carkit as K

W, H = 1280, 800
ORTHO, ELEV, TARGET_Z, FRAMES = 6.26, 18.0, .66, 16


def car_objects(car_id):
    col = bpy.data.collections[car_id]
    return [o for o in col.all_objects]


def _sprite_rig(car_id):
    sc = bpy.context.scene
    for o in bpy.data.collections['studio'].objects:
        if o.name.startswith('cyclorama'):
            o.hide_render = True
    catcher = bpy.data.objects.get('sprite_ground')
    if not catcher:
        bm = bmesh.new()
        bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=12)
        catcher = K.mesh_from_bm('sprite_ground', bm, K.principled('ground', (.5, .5, .5)), bpy.data.collections['studio'], smooth=False, sharp=None)
    catcher.is_shadow_catcher = True
    catcher.hide_render = False
    pivot = bpy.data.objects.get('sprite_pivot') or K.empty('sprite_pivot', col=bpy.data.collections['studio'])
    pivot.rotation_euler = (0, 0, 0)
    for o in car_objects(car_id):
        if o.parent is None:
            mw = o.matrix_world.copy()
            o.parent = pivot
            o.matrix_world = mw
    cam = bpy.data.objects['cam']
    for c in list(cam.constraints):
        cam.constraints.remove(c)
    e = radians(ELEV)
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = ORTHO
    cam.location = (0, -30 * math.cos(e), TARGET_Z + 30 * math.sin(e))
    cam.rotation_euler = (radians(90) - e, 0, 0)
    sc.camera = cam
    sc.render.film_transparent = True
    sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = W, H, 100
    sc.render.image_settings.file_format = 'WEBP'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.render.image_settings.quality = 84
    return pivot


def alpha_bounds(path):
    img = bpy.data.images.load(path, check_existing=False)
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    bpy.data.images.remove(img)
    a = px.reshape(h, w, 4)[::-1, :, 3] > .02          # flip to top-down rows
    ys, xs = np.nonzero(a)
    if not len(xs):
        return [0, 0, 0, 0], 0
    return [int(xs.min()), int(ys.min()), int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1)], int(a.sum())


def queue_sprites(car_id, out_dir, marker, samples=48):
    """Render the 16 views one per timer tick and write sprites.json."""
    os.makedirs(out_dir, exist_ok=True)
    pivot = _sprite_rig(car_id)
    bpy.context.scene.cycles.samples = samples
    state = {'k': 0, 'files': []}
    if os.path.exists(marker):
        os.remove(marker)

    def tick():
        k = state['k']
        if k >= FRAMES:
            ppm = W / ORTHO
            anchor = [W / 2, H / 2 + TARGET_Z * math.cos(radians(ELEV)) * ppm]
            json.dump({'id': car_id, 'width': W, 'height': H, 'groundAnchor': anchor, 'pixelsPerMetre': ppm,
                       'files': state['files']}, open(os.path.join(out_dir, 'sprites.json'), 'w'), indent=1)
            open(marker, 'w').write('done')
            return None
        pivot.rotation_euler = (0, 0, -radians(k * 360 / FRAMES))
        path = os.path.join(out_dir, f'{k:02d}.webp')
        bpy.context.scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        bounds, visible = alpha_bounds(path)
        data = open(path, 'rb').read()
        state['files'].append({'frame': k, 'contentBounds': bounds, 'visiblePixels': visible, 'bytes': len(data),
                               'sha256': hashlib.sha256(data).hexdigest()})
        state['k'] = k + 1
        return .05
    bpy.app.timers.register(tick, first_interval=.1)


# ---------------------------------------------------------------- GLB
def _game_material(m):
    """Exporter-friendly copy: the thin-glass node setup becomes alpha glass."""
    if m is None or any(n.type == 'BSDF_PRINCIPLED' for n in m.node_tree.nodes):
        return m
    g = K.principled(m.name + '_gltf', (.05, .065, .08), rough=.05, specular=.8)
    b = next(n for n in g.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Alpha'].default_value = .42 if 'lens' not in m.name else .25
    try:
        g.blend_method = 'BLEND'
    except Exception:
        pass
    return g


def _join(objs, name):
    objs = [o for o in objs if o.type == 'MESH' and len(o.data.polygons)]
    for o in objs:
        if o.data.users > 1:
            o.data = o.data.copy()
    with bpy.context.temp_override(active_object=objs[0], object=objs[0], selected_objects=objs, selected_editable_objects=objs):
        bpy.ops.object.join()
    ob = objs[0]
    ob.name = name
    mw = ob.matrix_world.copy()
    ob.parent = None
    ob.matrix_world = mw
    ob.data.transform(ob.matrix_world)
    ob.matrix_world.identity()
    for i, m in enumerate(ob.data.materials):
        ob.data.materials[i] = _game_material(m)
    return ob


def _tris(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


def _decimate(ob, target):
    n = _tris(ob)
    if n <= target:
        return ob
    d = ob.modifiers.new('dec', 'DECIMATE')
    d.ratio = max(.02, target / n)
    d.use_collapse_triangulate = True
    return K.bake(ob)


def _material_colour(m):
    """Representative sRGB-linear colour of a material (base or emission)."""
    if m is None or not m.use_nodes:
        return (.5, .5, .5, 1), False, False
    bsdf = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    textured = any(n.type == 'TEX_IMAGE' for n in m.node_tree.nodes)
    if bsdf is None:
        return (.05, .065, .08, 1), True, textured
    col = list(bsdf.inputs['Base Color'].default_value)
    em = bsdf.inputs.get('Emission Color') or bsdf.inputs.get('Emission')
    strength = bsdf.inputs.get('Emission Strength')
    if em is not None and strength is not None and strength.default_value > .2 and not em.is_linked:
        e = em.default_value
        if max(e[:3]) > .05:
            col = [min(1, e[0]), min(1, e[1]), min(1, e[2]), 1]
    alpha = bsdf.inputs['Alpha'].default_value
    glass = alpha < .95 or any(w in m.name for w in ('glass', 'lens'))
    return tuple(col[:3]) + (1,), glass, textured


def _consolidate_low(ob, name):
    """Low LOD: bake every material into vertex colours and keep only two
    materials (opaque + glass) so a rival car costs a handful of draw calls."""
    me = ob.data
    info = [_material_colour(m) for m in me.materials]
    bm = bmesh.new()
    bm.from_mesh(me)
    drop = [f for f in bm.faces if info and info[f.material_index][2]]   # image decals
    bmesh.ops.delete(bm, geom=drop, context='FACES')
    layer = bm.loops.layers.color.new('Col')
    # byte colour layers hold sRGB; the material colours are scene-linear
    to_srgb = lambda c: c * 12.92 if c <= .0031308 else 1.055 * c ** (1 / 2.4) - .055
    for f in bm.faces:
        col, glass, _ = info[f.material_index] if info else ((.5, .5, .5, 1), False, False)
        col = tuple(to_srgb(v) for v in col[:3]) + (1,)
        for loop in f.loops:
            loop[layer] = col
        f.material_index = 1 if glass else 0
    bm.to_mesh(me)
    bm.free()
    paint = bpy.data.materials.new(name + '_low_paint')
    paint.use_nodes = True
    nt = paint.node_tree
    b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    attr = nt.nodes.new('ShaderNodeVertexColor')
    attr.layer_name = 'Col'
    nt.links.new(attr.outputs['Color'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = .42
    b.inputs['Metallic'].default_value = .0
    glass = _game_material(bpy.data.materials.get('glass') or K.thin_glass('glass_low'))
    me.materials.clear()
    me.materials.append(paint)
    me.materials.append(glass)
    me.color_attributes.active_color = me.color_attributes['Col']
    me.color_attributes.render_color_index = me.color_attributes.find('Col')
    return ob


def export_glb(car_id, out_dir, lod, body_target, wheel_target, keep_interior=True):
    """Duplicate the built car, merge/decimate, export <id>-<lod>.glb."""
    src = car_objects(car_id)
    wheel_root = bpy.data.objects[f'{car_id}.wheel']
    wheel_parts = [o for o in wheel_root.children_recursive]
    skip_words = ('seat', 'dash', 'binnacle', 'steer', 'spoke', 'boss', 'tunnel', 'shift', 'cage', 'rear_bench', 'rear_back', 'column')
    body_src = [o for o in src if o.type == 'MESH' and o not in wheel_parts and o.name != wheel_root.name
                and not o.name.startswith(f'{car_id}.wheel')
                and (keep_interior or not any(w in o.name for w in skip_words))]
    # wheels other than the prototype are copies named '<id>.wheel.N' children
    body_src = [o for o in body_src if not (o.parent and o.parent.name.startswith(f'{car_id}.wheel'))]
    tmp = bpy.data.collections.new(f'export_{car_id}_{lod}')
    bpy.context.scene.collection.children.link(tmp)

    def dup(objs):
        out = []
        for o in objs:
            c = o.copy()
            c.data = o.data.copy()
            tmp.objects.link(c)
            c.parent = None
            c.matrix_world = o.matrix_world.copy()
            for m in c.modifiers:
                c.modifiers.remove(m)
            out.append(c)
        return out
    body = _decimate(_join(dup(body_src), 'body'), body_target)
    saved = (wheel_root.location.copy(), wheel_root.rotation_euler.copy())
    wheel_root.location, wheel_root.rotation_euler = (0, 0, 0), (0, 0, 0)
    bpy.context.view_layer.update()
    wheel = _decimate(_join(dup([o for o in wheel_parts if o.type == 'MESH']), 'wheel'), wheel_target)
    wheel_root.location, wheel_root.rotation_euler = saved
    bpy.context.view_layer.update()
    for ob in (body, wheel):
        K.shade(ob, True, 40)
        if lod == 'low':
            _consolidate_low(ob, f'{car_id}_{ob.name}')
    path = os.path.join(out_dir, f'{car_id}-{lod}.glb')
    with bpy.context.temp_override(selected_objects=[body, wheel], active_object=body):
        bpy.ops.object.select_all(action='DESELECT')
        body.select_set(True)
        wheel.select_set(True)
        bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_yup=True,
                                  export_apply=False, export_materials='EXPORT', export_cameras=False, export_lights=False,
                                  export_meshopt_compression_enable=True,
                                  **({'export_vertex_color': 'ACTIVE'} if lod == 'low' else {}))
    stats = {'lod': lod, 'bodyTris': _tris(body), 'wheelTris': _tris(wheel), 'bytes': os.path.getsize(path),
             'materials': len(body.data.materials)}
    for ob in list(tmp.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    bpy.data.collections.remove(tmp)
    return stats
