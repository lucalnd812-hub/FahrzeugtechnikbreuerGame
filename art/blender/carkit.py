"""Shared Blender helpers for the Breuer GP vehicle models.

Blender axes: X across the car (+X = driver/left side), -Y forward, Z up,
metres, tyre contact at Z=0. The glTF exporter turns -Y into the game's +Z.
"""
import bpy, bmesh, math
from mathutils import Vector, Matrix
from math import pi, sin, cos, radians


# ---------------------------------------------------------------- basics
def lin(hexcolor):
    def c(v):
        v /= 255
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    return (c((hexcolor >> 16) & 255), c((hexcolor >> 8) & 255), c(hexcolor & 255))


def reset_scene():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for c in list(bpy.data.collections):
        bpy.data.collections.remove(c)
    for coll in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.lights,
                 bpy.data.cameras, bpy.data.images, bpy.data.worlds):
        for d in list(coll):
            if d.users == 0:
                coll.remove(d)


def collection(name):
    col = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if col.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(col)
    return col


def link(obj, col=None, parent=None):
    (col or bpy.context.scene.collection).objects.link(obj)
    if parent is not None:
        obj.parent = parent
    return obj


def empty(name, loc=(0, 0, 0), col=None, parent=None):
    e = bpy.data.objects.new(name, None)
    e.location = loc
    e.empty_display_size = .2
    return link(e, col, parent)


# ---------------------------------------------------------------- materials
def _nodes(m):
    try:
        m.use_nodes = True
    except Exception:
        pass
    return m.node_tree


def principled(name, color, metallic=0., rough=.5, coat=0., coat_rough=.03, transmission=0.,
               ior=1.45, emission=None, estrength=0., specular=.5):
    m = bpy.data.materials.new(name)
    nt = _nodes(m)
    b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Metallic'].default_value = metallic
    b.inputs['Roughness'].default_value = rough
    b.inputs['Coat Weight'].default_value = coat
    b.inputs['Coat Roughness'].default_value = coat_rough
    b.inputs['Transmission Weight'].default_value = transmission
    b.inputs['IOR'].default_value = ior
    b.inputs['Specular IOR Level'].default_value = specular
    if emission:
        b.inputs['Emission Color'].default_value = (*emission, 1)
        b.inputs['Emission Strength'].default_value = estrength
    m.diffuse_color = (*color, 1)
    m.metallic, m.roughness = metallic, rough
    return m


def thin_glass(name, tint=(.30, .34, .36), reflect=.07):
    """Single-surface car glass: tinted see-through plus fresnel reflections."""
    m = bpy.data.materials.new(name)
    nt = _nodes(m)
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    tr = nt.nodes.new('ShaderNodeBsdfTransparent')
    tr.inputs['Color'].default_value = (*tint, 1)
    gl = nt.nodes.new('ShaderNodeBsdfGlossy')
    gl.inputs['Roughness'].default_value = .015
    fr = nt.nodes.new('ShaderNodeFresnel')
    fr.inputs['IOR'].default_value = 1.52
    add = nt.nodes.new('ShaderNodeMath')
    add.operation = 'ADD'
    add.use_clamp = True
    add.inputs[1].default_value = reflect
    mix = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(fr.outputs['Fac'], add.inputs[0])
    nt.links.new(add.outputs[0], mix.inputs['Fac'])
    nt.links.new(tr.outputs[0], mix.inputs[1])
    nt.links.new(gl.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs['Surface'])
    m.diffuse_color = (*tint, .4)
    return m


# ---------------------------------------------------------------- meshes
def mesh_from_bm(name, bm, mats, col=None, parent=None, smooth=True, sharp=35):
    me = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    for m in mats if isinstance(mats, (list, tuple)) else [mats]:
        me.materials.append(m)
    ob = bpy.data.objects.new(name, me)
    link(ob, col, parent)
    shade(ob, smooth, sharp)
    return ob


def shade(ob, smooth=True, sharp=35):
    me = ob.data
    for p in me.polygons:
        p.use_smooth = smooth
    if smooth and sharp is not None and hasattr(me, 'set_sharp_from_angle'):
        me.set_sharp_from_angle(angle=radians(sharp))


def bake(ob):
    """Apply all modifiers (and curves) into a plain mesh object in place."""
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    if ob.type == 'MESH':
        old = ob.data
        ob.modifiers.clear()
        ob.data = me
        if old.users == 0:
            bpy.data.meshes.remove(old)
        return ob
    new = bpy.data.objects.new(ob.name, me)
    for c in ob.users_collection:
        c.objects.link(new)
    new.parent, new.matrix_world = ob.parent, ob.matrix_world.copy()
    bpy.data.objects.remove(ob, do_unlink=True)
    return new


def box(name, size, loc, mat, col=None, parent=None, rot=(0, 0, 0), bevel=.006, segs=3):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1, matrix=Matrix.Diagonal((*size, 1)))
    ob = mesh_from_bm(name, bm, mat, col, parent)
    ob.location, ob.rotation_euler = loc, rot
    if bevel:
        b = ob.modifiers.new('bevel', 'BEVEL')
        b.width, b.segments, b.limit_method = bevel, segs, 'ANGLE'
        ob = bake(ob)
        shade(ob, True, 50)
    return ob


def cylinder(name, r, depth, loc, mat, col=None, parent=None, rot=(0, 0, 0), segs=32, r2=None, bevel=0):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs, radius1=r,
                          radius2=r if r2 is None else r2, depth=depth)
    ob = mesh_from_bm(name, bm, mat, col, parent)
    ob.location, ob.rotation_euler = loc, rot
    if bevel:
        b = ob.modifiers.new('bevel', 'BEVEL')
        b.width, b.segments, b.limit_method = bevel, 2, 'ANGLE'
        ob = bake(ob)
        shade(ob, True, 50)
    return ob


def sphere(name, r, loc, mat, col=None, parent=None, scale=(1, 1, 1), segs=24):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=segs // 2, radius=r)
    ob = mesh_from_bm(name, bm, mat, col, parent, sharp=None)
    ob.location, ob.scale = loc, scale
    return ob


def lathe(name, profile, mats, col=None, parent=None, segs=64, closed=False, mat_of=None, displace=None):
    """Revolve (x, radius) profile points around the local X axis."""
    bm = bmesh.new()
    n = len(profile)
    rings = []
    for s in range(segs):
        a = 2 * pi * s / segs
        ring = []
        for i, (x, r) in enumerate(profile):
            if displace:
                r = displace(s, i, x, r)
            ring.append(bm.verts.new((x, r * cos(a), r * sin(a))))
        rings.append(ring)
    edges = range(n) if closed else range(n - 1)
    for s in range(segs):
        a, b = rings[s], rings[(s + 1) % segs]
        for i in edges:
            i2 = (i + 1) % n
            f = bm.faces.new((a[i], a[i2], b[i2], b[i]))
            if mat_of:
                f.material_index = mat_of(i)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mesh_from_bm(name, bm, mats, col, parent)


def prism(name, poly, x0, x1, mat, col=None):
    """Extrude a closed (y, z) polygon along X from x0 to x1."""
    bm = bmesh.new()
    a = [bm.verts.new((x0, y, z)) for y, z in poly]
    b = [bm.verts.new((x1, y, z)) for y, z in poly]
    n = len(poly)
    for i in range(n):
        bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
    bm.faces.new(list(reversed(a)))
    bm.faces.new(b)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mesh_from_bm(name, bm, mat, col, smooth=False)


def boolean(target, cutters, op='DIFFERENCE', batch=12):
    """Exact booleans in small batches; a batch that would wreck the mesh is
    retried cutter by cutter and any single bad cutter is skipped."""
    for c in cutters:
        c.hide_render = c.hide_viewport = True

    def apply(ob, group, self_check=False):
        for c in group:
            m = ob.modifiers.new('bool', 'BOOLEAN')
            m.operation, m.object = op, c
            m.solver = 'FLOAT' if self_check else 'EXACT'
            try:
                m.material_mode = 'TRANSFER'
            except Exception:
                pass
        before = ob.data.copy()
        n0 = len(before.polygons)
        ob = bake(ob)
        if len(ob.data.polygons) < n0 * .5:
            old = ob.data
            ob.data = before
            bpy.data.meshes.remove(old)
            return ob, False
        bpy.data.meshes.remove(before)
        return ob, True
    ob = target
    for k in range(0, len(cutters), batch):
        group = cutters[k:k + batch]
        ob, ok = apply(ob, group)
        if not ok:
            for c in group:
                ob, ok1 = apply(ob, [c], self_check=True)
                if not ok1:
                    print('boolean: skipped cutter', c.name, c.location[:])
    for c in cutters:
        bpy.data.objects.remove(c, do_unlink=True)
    return ob


def catmull(points, steps=6, closed=False):
    pts = [Vector(p) for p in points]
    if len(pts) < 3:
        return pts
    out = []
    n = len(pts)
    rng = range(n) if closed else range(n - 1)
    for i in rng:
        p0 = pts[(i - 1) % n] if closed or i > 0 else pts[0]
        p1, p2 = pts[i], pts[(i + 1) % n]
        p3 = pts[(i + 2) % n] if closed or i + 2 < n else pts[-1]
        for s in range(steps):
            t = s / steps
            t2, t3 = t * t, t * t * t
            out.append(.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    if not closed:
        out.append(pts[-1])
    return out


def sweep(name, path, profile, mat, col=None, parent=None, up=(0, 0, 1), caps=True, smooth_steps=6, taper=0):
    """Sweep a closed (side, up) profile along a path; side points away from the car."""
    pts = catmull(path, smooth_steps)
    upv = Vector(up)
    bm = bmesh.new()
    rings = []
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        side = t.cross(upv).normalized()
        u = side.cross(t).normalized()
        k = min(1., i / taper, (len(pts) - 1 - i) / taper) if taper else 1.
        k = .15 + .85 * k * k * (3 - 2 * k)
        rings.append([bm.verts.new(p + side * sx * k + u * sz * k) for sx, sz in profile])
    n = len(profile)
    for a, b in zip(rings, rings[1:]):
        for j in range(n):
            bm.faces.new((a[j], a[(j + 1) % n], b[(j + 1) % n], b[j]))
    if caps:
        bm.faces.new(rings[0])
        bm.faces.new(list(reversed(rings[-1])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mesh_from_bm(name, bm, mat, col, parent, sharp=60)


def rounded_rect(w, h, r, steps=4):
    pts = []
    for cx, cy, a0 in ((w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, 90), (-w / 2 + r, -h / 2 + r, 180), (w / 2 - r, -h / 2 + r, 270)):
        for s in range(steps + 1):
            a = radians(a0 + 90 * s / steps)
            pts.append((cx + r * cos(a), cy + r * sin(a)))
    return pts


def tube(name, points, r, mat, col=None, parent=None, res=8):
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth, cu.bevel_resolution, cu.use_fill_caps = r, 3, True
    sp = cu.splines.new('POLY')
    sp.points.add(len(points) - 1)
    for p, c in zip(sp.points, points):
        p.co = (*c, 1)
    cu.materials.append(mat)
    ob = link(bpy.data.objects.new(name, cu), col, parent)
    ob = bake(ob)
    shade(ob, True, 40)
    return ob


def text_mesh(name, body, size, mat, col=None, font=None, extrude=.0012):
    cu = bpy.data.curves.new(name, 'FONT')
    cu.body = body
    cu.size, cu.extrude = size, extrude
    cu.align_x, cu.align_y = 'CENTER', 'CENTER'
    if font:
        try:
            cu.font = bpy.data.fonts.load(font, check_existing=True)
        except Exception:
            pass
    cu.materials.append(mat)
    ob = link(bpy.data.objects.new(name, cu), col)
    return bake(ob)


def surface(body, origin, direction, offset=0.):
    ok, loc, nrm, _ = body.ray_cast(Vector(origin), Vector(direction).normalized())
    if not ok:
        raise RuntimeError(f'no surface hit from {origin} towards {direction}')
    return loc + nrm * offset, nrm


# ---------------------------------------------------------------- loft body
def ring_from_half(half):
    return list(half) + [(-x, z) for x, z in reversed(half[1:-1])]


def loft(stations):
    """stations: [(y, half_section)] with every half section running from the
    bottom centre (x=0) round the left side to the top centre (x=0).
    Returns bmesh and face info {face: (interval, half_edge, side)}."""
    bm = bmesh.new()
    H = len(stations[0][1])
    rows = []
    for y, half in stations:
        assert len(half) == H, (y, len(half))
        rows.append([bm.verts.new((x, y, z)) for x, z in ring_from_half(half)])
    N = len(rows[0])
    info = {}
    for i in range(len(rows) - 1):
        for k in range(N):
            k2 = (k + 1) % N
            f = bm.faces.new((rows[i][k], rows[i][k2], rows[i + 1][k2], rows[i + 1][k]))
            info[f] = (i, k, 1) if k <= H - 2 else (i, N - k - 1, -1)
    caps = [bm.faces.new(list(reversed(rows[0]))), bm.faces.new(rows[-1])]
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm, info, rows


def crease(bm, rows, value, ring=None, line=None, span=None):
    """Crease a whole station ring, or the longitudinal edges through half
    point `line` (both sides) over the station range `span`."""
    layer = bm.edges.layers.float.get('crease_edge') or bm.edges.layers.float.new('crease_edge')
    N = len(rows[0])
    H = N // 2 + 1
    if ring is not None:
        r = rows[ring]
        for k in range(N):
            e = bm.edges.get((r[k], r[(k + 1) % N]))
            if e:
                e[layer] = value
    if line is not None:
        ks = {line, (N - line) % N}
        a, b = span or (0, len(rows) - 1)
        for i in range(a, b):
            for k in ks:
                e = bm.edges.get((rows[i][k], rows[i + 1][k]))
                if e:
                    e[layer] = value


def window(bm, faces, trim_idx, rubber_idx, glass_idx, trim=.009, rubber=.011, depth=.007):
    r1 = bmesh.ops.inset_region(bm, faces=faces, thickness=trim, depth=0, use_even_offset=True)
    for f in r1['faces']:
        f.material_index = trim_idx
    r2 = bmesh.ops.inset_region(bm, faces=faces, thickness=rubber, depth=-depth, use_even_offset=True)
    for f in r2['faces']:
        f.material_index = rubber_idx
    for f in faces:
        f.material_index = glass_idx


# ---------------------------------------------------------------- wheels
def wheel(name, R, W, rim_r, mats, col, style='minilite', spokes=8):
    """Wheel with outward face towards +X, centred at the origin."""
    root = empty(name, col=col)
    h = W / 2
    side = rim_r + (R - rim_r) * .52
    tyre = [(-h + .014, rim_r + .006), (-h - .002, rim_r + .03), (-h - .007, side), (-h - .003, R - .038),
            (-h + .01, R - .012), (-h + .028, R), (-.044, R), (-.04, R - .009), (-.032, R - .009), (-.028, R),
            (.028, R), (.032, R - .009), (.04, R - .009), (.044, R), (h - .028, R), (h - .01, R - .012),
            (h + .003, R - .038), (h + .007, side), (h + .002, rim_r + .03), (h - .014, rim_r + .006)]

    def tread(s, i, x, r):
        if r >= R - .001 and abs(x) > .048 and s % 3 == 0:
            return r - .0055
        if r >= R - .001 and abs(x) <= .026 and s % 6 == 3:
            return r - .004
        return r
    lathe(name + '.tyre', tyre, mats['rubber'], col, root, segs=108, displace=tread)
    # sidewall lettering ring (subtle raised band)
    lathe(name + '.band', [(h + .0072, side - .018), (h + .0085, side - .012), (h + .0085, side + .012), (h + .0072, side + .018)],
          mats['rubber_side'], col, root, segs=72)
    # rim barrel and polished lip
    lathe(name + '.barrel', [(-h + .02, rim_r + .004), (-h + .028, rim_r - .01), (h - .03, rim_r - .012), (h - .02, rim_r - .004)],
          mats['rim'], col, root, segs=64)
    lip = [(h - .034, rim_r - .016), (h - .014, rim_r - .008), (h - .004, rim_r + .006), (h + .002, rim_r + .012),
           (h + .005, rim_r + .006), (h, rim_r - .006), (h - .02, rim_r - .019)]
    lathe(name + '.lip', lip, mats['lip'], col, root, segs=64, closed=True)
    face_x = h - .036
    disc = cylinder(name + '.face', rim_r - .012, .022, (face_x, 0, 0), mats['rim'], col, rot=(0, radians(90), 0), segs=64)
    cutters = []
    if style == 'minilite':
        for k in range(spokes):
            a0 = 2 * pi * k / spokes + pi / spokes
            poly = []
            ro, ri = rim_r - .03, rim_r * .42
            wo, wi = radians(360 / spokes * .30), radians(360 / spokes * .22)
            for s in range(7):
                a = a0 - wo + 2 * wo * s / 6
                poly.append((ro * cos(a), ro * sin(a)))
            for s in range(5):
                a = a0 + wi - 2 * wi * s / 4
                poly.append((ri * cos(a), ri * sin(a)))
            cutters.append(prism('cut', poly, face_x - .05, face_x + .05, mats['rim']))
    elif style == 'bbs':
        for k in range(spokes * 2):
            a0 = 2 * pi * k / (spokes * 2)
            ro, ri = rim_r - .025, rim_r * .45
            w = radians(360 / (spokes * 2) * .30)
            poly = [(ro * cos(a0 - w), ro * sin(a0 - w)), (ro * cos(a0 + w), ro * sin(a0 + w)),
                    (ri * cos(a0 + w * .5), ri * sin(a0 + w * .5)), (ri * cos(a0 - w * .5), ri * sin(a0 - w * .5))]
            cutters.append(prism('cut', poly, face_x - .05, face_x + .05, mats['rim']))
    elif style == 'turbofan':
        for k in range(spokes):
            a0 = 2 * pi * k / spokes
            poly = []
            for s in range(6):
                a = a0 + radians(360 / spokes * .38) * s / 5
                poly.append(((rim_r - .03) * cos(a + .25), (rim_r - .03) * sin(a + .25)))
            for s in range(4):
                a = a0 + radians(360 / spokes * .3) * (1 - s / 3)
                poly.append((rim_r * .5 * cos(a), rim_r * .5 * sin(a)))
            cutters.append(prism('cut', poly, face_x - .05, face_x + .05, mats['rim']))
    disc.parent = None
    disc = boolean(disc, cutters)
    disc.parent = root
    shade(disc, True, 30)
    # spoke bevel highlight ring, hub, cap and wheel nuts
    lathe(name + '.hub', [(face_x + .006, rim_r * .40), (face_x + .02, rim_r * .34), (face_x + .03, rim_r * .22), (face_x + .032, 0.0001)],
          mats['rim'], col, root, segs=48)
    sphere(name + '.cap', rim_r * .16, (face_x + .03, 0, 0), mats['chrome'], col, root, scale=(.45, 1, 1))
    for k in range(4):
        a = 2 * pi * k / 4 + pi / 4
        cylinder(name + f'.nut{k}', .011, .016, (face_x + .033, rim_r * .27 * cos(a), rim_r * .27 * sin(a)), mats['chrome'],
                 col, root, rot=(0, radians(90), 0), segs=6)
    # brake disc and caliper behind the spokes
    cylinder(name + '.disc', rim_r * .78, .02, (-.01, 0, 0), mats['brake'], col, root, rot=(0, radians(90), 0), segs=48)
    cylinder(name + '.hat', rim_r * .38, .05, (.0, 0, 0), mats['brake_hat'], col, root, rot=(0, radians(90), 0), segs=32)
    box(name + '.caliper', (.05, .085, .06), (.0, rim_r * .55, rim_r * .45), mats['caliper'], col, root, rot=(radians(-38), 0, 0), bevel=.01)
    return root


def place_wheels(proto, positions, col):
    """Duplicate the wheel hierarchy to every (x, y, z); x<0 faces outward to -X."""
    roots = []
    for idx, (x, y, z) in enumerate(positions):
        if idx == 0:
            r = proto
        else:
            r = empty(proto.name.split('.')[0] + f'.{idx}', col=col)
            for ch in proto.children:
                c = ch.copy()
                col.objects.link(c)
                c.parent = r
        r.location = (x, y, z)
        r.rotation_euler = (0, 0, pi if x < 0 else 0)
        roots.append(r)
    return roots


# ---------------------------------------------------------------- plates
def plate(name, text, mats, col, loc, facing='front', w=.40, h=.092):
    root = empty(name, loc, col)
    box(name + '.border', (w + .008, .005, h + .008), (0, .002, 0), mats['black'], col, root, bevel=.004)
    box(name + '.base', (w, .006, h), (0, -.001, 0), mats['plate'], col, root, bevel=.003)
    box(name + '.eu', (.04, .007, h - .008), (-w / 2 + .024, -.0012, 0), mats['eu'], col, root, bevel=.002)
    t = text_mesh(name + '.text', text, h * .62, mats['black'], col, font='C:/Windows/Fonts/bahnschrift.ttf')
    t.parent = root
    t.location = (.02, -.0045, -.002)
    t.rotation_euler = (radians(90), 0, 0)
    d = text_mesh(name + '.d', 'D', h * .3, mats['plate'], col, font='C:/Windows/Fonts/bahnschrift.ttf')
    d.parent = root
    d.location = (-w / 2 + .024, -.0052, -h * .22)
    d.rotation_euler = (radians(90), 0, 0)
    root.rotation_euler = (0, 0, 0 if facing == 'front' else pi)
    return root


# ---------------------------------------------------------------- studio
def studio(col_name='studio'):
    col = collection(col_name)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        prefs.compute_device_type = 'OPTIX'
        prefs.refresh_devices()
        for d in prefs.devices:
            d.use = d.type == 'OPTIX'
        sc.cycles.device = 'GPU'
    except Exception:
        pass
    sc.cycles.samples = 160
    sc.cycles.use_denoising = True
    sc.cycles.max_bounces = 8
    sc.cycles.transparent_max_bounces = 16
    try:
        sc.view_settings.view_transform = 'Khronos PBR Neutral'
    except Exception:
        sc.view_settings.view_transform = 'Standard'
    sc.view_settings.exposure = .15
    world = bpy.data.worlds.new('studio')
    sc.world = world
    nt = _nodes(world)
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputWorld')
    env = nt.nodes.new('ShaderNodeBackground')
    env.inputs['Color'].default_value = (.55, .58, .62, 1)
    env.inputs['Strength'].default_value = .35
    cam = nt.nodes.new('ShaderNodeBackground')
    cam.inputs['Color'].default_value = (.018, .02, .024, 1)
    lp = nt.nodes.new('ShaderNodeLightPath')
    mix = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(lp.outputs['Is Camera Ray'], mix.inputs['Fac'])
    nt.links.new(env.outputs[0], mix.inputs[1])
    nt.links.new(cam.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs['Surface'])
    # cyclorama floor + curved back wall, rotated towards each camera
    pivot = empty('cyc_pivot', col=col)
    prof = [(-40, 0), (6, 0)] + [(6 + 7 * sin(a), 7 - 7 * cos(a)) for a in [pi / 2 * s / 10 for s in range(1, 11)]] + [(13, 20)]
    bm = bmesh.new()
    a = [bm.verts.new((-40, y, z)) for y, z in prof]
    b = [bm.verts.new((40, y, z)) for y, z in prof]
    for i in range(len(prof) - 1):
        bm.faces.new((a[i], a[i + 1], b[i + 1], b[i]))
    floor_mat = principled('studio_floor', (.045, .047, .05), rough=.32, specular=.6)
    cyc = mesh_from_bm('cyclorama', bm, floor_mat, col, pivot)
    for p in cyc.data.polygons:
        p.use_smooth = True
    lights = [('softbox_top', (0, 0, 6.5), (0, 0, 0), 900, (7, 3.2)),
              ('key', (-4.5, -4.8, 3.2), (radians(62), 0, radians(-43)), 520, (3.5, 2.2)),
              ('rim', (4.8, 4.5, 2.6), (radians(70), 0, radians(135)), 420, (4, 1.2)),
              ('fill', (5.5, -3.0, 1.4), (radians(80), 0, radians(-120)), 140, (3, 2))]
    for nm, loc, rot, power, size in lights:
        ld = bpy.data.lights.new(nm, 'AREA')
        ld.energy, ld.shape = power, 'RECTANGLE'
        ld.size, ld.size_y = size
        lo = link(bpy.data.objects.new(nm, ld), col)
        lo.location, lo.rotation_euler = loc, rot
    camd = bpy.data.cameras.new('cam')
    cam_ob = link(bpy.data.objects.new('cam', camd), col)
    target = empty('cam_target', (0, 0, .58), col)
    tc = cam_ob.constraints.new('TRACK_TO')
    tc.target, tc.track_axis, tc.up_axis = target, 'TRACK_NEGATIVE_Z', 'UP_Y'
    sc.camera = cam_ob
    return dict(cam=cam_ob, target=target, pivot=pivot)


def shoot(rig, path, az, el, dist, lens=70, res=(1600, 1000), target=(0, 0, .58), samples=None):
    sc = bpy.context.scene
    tx, ty, tz = target
    a, e = radians(az), radians(el)
    rig['target'].location = target
    rig['cam'].location = (tx + dist * sin(a) * cos(e), ty - dist * cos(a) * cos(e), tz + dist * sin(e))
    rig['cam'].data.lens = lens
    rig['pivot'].rotation_euler = (0, 0, a)
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = False
    if samples:
        sc.cycles.samples = samples
    sc.render.image_settings.file_format = 'PNG'
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path


def queue_shots(rig, shots, done_marker):
    """Render [(path, az, el, dist, lens, res, target, samples)] one per timer
    tick so the MCP call returns at once; writes done_marker when finished."""
    import os
    todo = list(shots)
    if os.path.exists(done_marker):
        os.remove(done_marker)

    def tick():
        if not todo:
            open(done_marker, 'w').write('done')
            return None
        p, az, el, d, lens, res, target, samples = todo.pop(0)
        shoot(rig, p, az, el, d, lens=lens, res=res, target=target, samples=samples)
        return .1
    bpy.app.timers.register(tick, first_interval=.1)


def crease_material_borders(bm, value=.95):
    """Keep window, trim and rubber outlines crisp under subdivision."""
    layer = bm.edges.layers.float.get('crease_edge') or bm.edges.layers.float.new('crease_edge')
    for e in bm.edges:
        if len(e.link_faces) == 2 and e.link_faces[0].material_index != e.link_faces[1].material_index:
            e[layer] = value
