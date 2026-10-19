"""Turn an image-to-3D car (Higgsfield / Tripo GLB, one textured mesh) into the
game's two GLB levels of detail.

Steps: orient (front -> Blender -Y = glTF +Z), scale to the real car's length,
width and height, find the four tyre contact patches, cut the tyres/rims out of
the body, keep the front-right wheel as the shared 'wheel' (hub at the origin,
outer face +X), decimate both, shrink the texture and export with meshopt.

Usage inside Blender:
    exec(open(ROOT + 'art/blender/ai_car.py').read())
    process('m2', ROOT + 'art/ai3d/m2_tripo.glb', front='+X')
"""
import bpy, bmesh, os, json, math
from mathutils import Vector, Matrix

ROOT = globals().get('ROOT') or os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')) + '/'

# Real dimensions (m) from src/vehicle-models.js.
SPECS = {
    'kadett': dict(length=4.18, width=1.61, height=1.335, radius=.321, tyre=.219),
    'e30': dict(length=4.345, width=1.76, height=1.37, radius=.329, tyre=.249),
    'm1': dict(length=4.36, width=2.02, height=1.14, radius=.341, tyre=.339),
    'm2': dict(length=4.461, width=1.854, height=1.41, radius=.349, tyre=.279),
    'gt3rs': dict(length=4.572, width=1.90, height=1.322, radius=.367, tyre=.324),
}
# Paint corrections on top of the generated texture. The M2 came out as a
# chrome-like silver (light texture + high metallic map); the game car is the
# grey M2 Competition, so its light body panels become a solid mid grey.
PAINT = {
    'm2': dict(rgb=(112, 118, 127), metal=.3, rough=.3),
}
LODS = {'high': dict(body=45000, wheel=1400, tex=1024), 'low': dict(body=14000, wheel=320, tex=1024)}
FRONT = {'+X': -90, '-X': 90, '+Y': 180, '-Y': 0}


def _clear():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.images):
        for d in list(coll):
            if d.users == 0:
                coll.remove(d)


def _import(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    meshes = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
    with bpy.context.temp_override(active_object=meshes[0], selected_editable_objects=meshes):
        if len(meshes) > 1:
            bpy.ops.object.join()
    ob = meshes[0]
    for o in [o for o in bpy.data.objects if o not in before and o is not ob]:
        bpy.data.objects.remove(o, do_unlink=True)
    ob.parent = None
    ob.data.transform(ob.matrix_world)
    ob.matrix_world = Matrix.Identity(4)
    return ob


def repaint(ob, car_id):
    """Recolour the light, unsaturated body paint (PAINT) in the source maps."""
    spec = PAINT.get(car_id)
    if not spec:
        return 0
    import numpy as np
    nodes = ob.data.materials[0].node_tree.nodes
    images = [n.image for n in nodes if n.type == 'TEX_IMAGE' and n.image]
    color = next(i for i in images if i.name.startswith('Color'))
    orm = next((i for i in images if i.name.startswith('ORM')), None)
    w, h = color.size
    px = np.empty(w * h * 4, dtype=np.float32); color.pixels.foreach_get(px); px = px.reshape(h, w, 4)
    rgb = px[..., :3]
    v, lo = rgb.max(-1), rgb.min(-1)
    sat = (v - lo) / np.maximum(v, 1e-4)
    # Smooth mask: bright (paint) and grey (not glass, rubber, lights or badges).
    m = np.clip((v - .5) / .12, 0, 1) * np.clip((.14 - sat) / .06, 0, 1) * np.clip((.985 - v) / .03, 0, 1)
    target = np.array(spec['rgb'], dtype=np.float32) / 255
    shade = np.clip(.62 + .5 * (v - .82) / .18, .45, 1.1)[..., None]
    rgb[:] = rgb * (1 - m[..., None]) + np.clip(target * shade, 0, 1) * m[..., None]
    color.pixels.foreach_set(px.ravel()); color.update()
    if orm is not None:
        o = np.empty(w * h * 4, dtype=np.float32); orm.pixels.foreach_get(o); o = o.reshape(h, w, 4)
        o[..., 1] = o[..., 1] * (1 - m) + spec['rough'] * m
        o[..., 2] = o[..., 2] * (1 - m) + spec['metal'] * m
        orm.pixels.foreach_set(o.ravel()); orm.update()
    return float(m.mean())


def _bounds(me):
    xs = [v.co.x for v in me.vertices]; ys = [v.co.y for v in me.vertices]; zs = [v.co.z for v in me.vertices]
    return Vector((min(xs), min(ys), min(zs))), Vector((max(xs), max(ys), max(zs)))


def normalise(ob, car_id, front):
    """Front to -Y, real size, centred on X/Y, tyres on z=0."""
    s = SPECS[car_id]
    me = ob.data
    me.transform(Matrix.Rotation(math.radians(FRONT[front]), 4, 'Z'))
    lo, hi = _bounds(me)
    size = hi - lo
    me.transform(Matrix.Translation(-(lo + hi) / 2))
    # Uniform scale from the length: the generated width includes mirrors.
    k = s['length'] / size.y
    me.transform(Matrix.Diagonal((k, k, k, 1)))
    lo, hi = _bounds(me)
    me.transform(Matrix.Translation((0, 0, -lo.z)))
    me.update()


def find_wheels(ob, car_id):
    """Contact patches -> axle positions (Blender Y) and wheel centre X."""
    s = SPECS[car_id]
    low = [v.co for v in ob.data.vertices if v.co.z < .035]
    groups = {}
    for co in low:
        groups.setdefault((co.x > 0, co.y > 0), []).append(co)
    if len(groups) != 4:
        raise RuntimeError(f'{car_id}: expected 4 tyre patches, found {len(groups)}')
    centre = {k: Vector((sum(c.x for c in g) / len(g), sum(c.y for c in g) / len(g), 0)) for k, g in groups.items()}
    front_y = (centre[(True, False)].y + centre[(False, False)].y) / 2   # front is -Y
    rear_y = (centre[(True, True)].y + centre[(False, True)].y) / 2
    half_track = sum(abs(c.x) for c in centre.values()) / 4
    return dict(front_y=front_y, rear_y=rear_y, half_track=half_track, radius=s['radius'], tyre=s['tyre'])


def split_wheels(ob, w):
    """Move tyre/rim faces out of the body; returns the front-right wheel."""
    r, inner = w['radius'] * 1.04, w['half_track'] - w['tyre'] * .78
    bm = bmesh.new(); bm.from_mesh(ob.data)
    wheel_faces, keep_faces = [], []
    for f in bm.faces:
        c = f.calc_center_median()
        if abs(c.x) < inner:
            continue
        for axle in (w['front_y'], w['rear_y']):
            if math.hypot(c.y - axle, c.z - w['radius']) < r:
                (keep_faces if (c.x > 0 and axle == w['front_y']) else wheel_faces).append(f)
                break
    # Front-right wheel becomes its own mesh centred on the hub.
    wb = bmesh.new()
    vmap = {}
    uv_src = bm.loops.layers.uv.active
    uv_dst = wb.loops.layers.uv.new('UVMap') if uv_src else None
    for f in keep_faces:
        vs = []
        for v in f.verts:
            if v not in vmap:
                vmap[v] = wb.verts.new(v.co)
            vs.append(vmap[v])
        try:
            nf = wb.faces.new(vs)
        except ValueError:
            continue
        nf.material_index = f.material_index
        if uv_src:
            for la, lb in zip(f.loops, nf.loops):
                lb[uv_dst].uv = la[uv_src].uv
    xs = [v.co.x for v in wb.verts]
    hub = Vector(((min(xs) + max(xs)) / 2, w['front_y'], w['radius']))
    bmesh.ops.translate(wb, verts=wb.verts, vec=-hub)
    bmesh.ops.delete(bm, geom=wheel_faces + keep_faces, context='FACES')
    bm.to_mesh(ob.data); bm.free()
    wme = bpy.data.meshes.new('wheel'); wb.to_mesh(wme); wb.free()
    for m in ob.data.materials:
        wme.materials.append(m)
    wheel = bpy.data.objects.new('wheel', wme)
    bpy.context.scene.collection.objects.link(wheel)
    ob.name = 'body'
    w['hub_x'] = hub.x
    return wheel


def _decimate(ob, target):
    tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    if tris > target:
        mod = ob.modifiers.new('dec', 'DECIMATE'); mod.ratio = target / tris
        with bpy.context.temp_override(object=ob, active_object=ob):
            bpy.ops.object.modifier_apply(modifier=mod.name)
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


def _game_material(ob, car_id, tex):
    """One unlit-friendly material: base colour only, texture downsized."""
    src = ob.data.materials[0]
    img = None
    for n in src.node_tree.nodes:
        if n.type == 'TEX_IMAGE' and n.image and 'Color' in n.image.name:
            img = n.image
    if img is None:
        img = next(n.image for n in src.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image)
    name = f'{car_id}_{tex}'
    small = bpy.data.images.get(name)
    if small is None:
        small = img.copy(); small.name = name
        small.scale(tex, tex)
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = small
    nt.links.new(t.outputs['Color'], bsdf.inputs['Base Color'])
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    bsdf.inputs['Roughness'].default_value = .42
    bsdf.inputs['Metallic'].default_value = .0
    ob.data.materials.clear(); ob.data.materials.append(mat)
    for p in ob.data.polygons:
        p.use_smooth = True
    return mat


def export_lod(car_id, body_src, wheel_src, lod, out_dir):
    spec = LODS[lod]
    # The game looks the nodes up by the exact names 'body' and 'wheel'.
    body_src.name, wheel_src.name = 'src_body', 'src_wheel'
    objs = []
    for src, name, target in ((body_src, 'body', spec['body']), (wheel_src, 'wheel', spec['wheel'])):
        c = src.copy(); c.data = src.data.copy(); c.name = name
        bpy.context.scene.collection.objects.link(c)
        objs.append(c)
    body, wheel = objs
    stats = {'lod': lod, 'bodyTris': _decimate(body, spec['body']), 'wheelTris': _decimate(wheel, spec['wheel'])}
    for ob in objs:
        _game_material(ob, car_id, spec['tex'])
    body.name, wheel.name = 'body', 'wheel'
    path = os.path.join(out_dir, f'{car_id}-{lod}.glb')
    with bpy.context.temp_override(selected_objects=objs, active_object=body):
        bpy.ops.object.select_all(action='DESELECT')
        for ob in objs:
            ob.select_set(True)
        bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_yup=True,
                                  export_apply=False, export_materials='EXPORT', export_cameras=False,
                                  export_lights=False, export_image_format='JPEG', export_jpeg_quality=86,
                                  export_meshopt_compression_enable=True, export_normals=True)
    stats['bytes'] = os.path.getsize(path)
    for ob in objs:
        bpy.data.objects.remove(ob, do_unlink=True)
    return stats


def process(car_id, glb, front='+X', out_dir=None):
    out_dir = out_dir or ROOT + 'assets/vehicles3d'
    _clear()
    ob = _import(glb)
    repaint(ob, car_id)
    normalise(ob, car_id, front)
    w = find_wheels(ob, car_id)
    wheel = split_wheels(ob, w)
    # Keep the source pair in the scene for sprites and inspection.
    lods = [export_lod(car_id, ob, wheel, lod, out_dir) for lod in ('high', 'low')]
    layout = {'track': round(2 * abs(w['hub_x']), 3), 'radius': round(w['radius'], 3),
              'axles': [round(-w['rear_y'], 3), round(-w['front_y'], 3)]}
    os.makedirs(ROOT + f'art/export/{car_id}', exist_ok=True)
    with open(ROOT + f'art/export/{car_id}/ai_layout.json', 'w') as f:
        json.dump({'layout': layout, 'lods': lods, 'source': os.path.basename(glb)}, f, indent=1)
    return {'layout': layout, 'lods': lods}
