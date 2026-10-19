"""Shared parts for the Breuer GP fleet: materials, sections, decals, interior,
body pipeline. Builds on carkit; Kadett and E30 predate this module."""
import bpy, bmesh
from math import radians, pi, sin, cos
from carkit import *  # noqa: F401,F403
import carkit as K

FONT = 'C:/Windows/Fonts/bahnschrift.ttf'


def base_materials(prefix, paint, rim=(.62, .63, .65), rim_metal=1., rim_rough=.28, cage=(.85, .85, .83), paint_rough=.28, metallic_paint=0.):
    P = K.principled
    M = {}
    M['paint'] = P(prefix + '_paint', K.lin(paint) if isinstance(paint, int) else paint, metallic=metallic_paint, rough=paint_rough, coat=1, coat_rough=.02)
    M['under'] = P('underbody', (.012, .012, .013), rough=.8)
    M['chrome'] = P('chrome', (.92, .93, .95), metallic=1, rough=.06)
    M['rubber'] = P('trim_rubber', (.012, .012, .014), rough=.55)
    M['glass'] = K.thin_glass('glass')
    M['black'] = P('satin_black', (.016, .016, .018), rough=.42)
    M['gloss_black'] = P('gloss_black', (.01, .01, .012), rough=.12, coat=1)
    M['carbon'] = P('carbon', (.02, .021, .024), metallic=.3, rough=.25, coat=1, coat_rough=.03)
    M['gap'] = P('panel_gap', (.004, .004, .004), rough=.9)
    M['well'] = P('wheel_well', (.01, .01, .011), rough=.85)
    M['tyre'] = P('tyre', (.022, .022, .024), rough=.82)
    M['tyre_side'] = P('tyre_letters', (.05, .05, .052), rough=.7)
    M['rim'] = P(prefix + '_rim', rim, metallic=rim_metal, rough=rim_rough)
    M['brake'] = P('brake_disc', (.35, .35, .36), metallic=1, rough=.38)
    M['brake_hat'] = P('brake_hat', (.06, .06, .065), metallic=.6, rough=.5)
    M['caliper'] = P('caliper_red', K.lin(0xc8102e), rough=.35, coat=.5)
    M['lens'] = K.thin_glass('headlamp_lens', tint=(.92, .93, .95), reflect=.05)
    M['reflector'] = P('reflector', (.9, .9, .92), metallic=1, rough=.2, emission=(1, .96, .88), estrength=.22)
    M['led'] = P('led_white', (.9, .92, 1.0), rough=.1, emission=(.9, .95, 1.0), estrength=1.4)
    M['red_lens'] = P('tail_red', K.lin(0xb3061a), rough=.08, transmission=.6, emission=K.lin(0xff1020), estrength=.6)
    M['red_led'] = P('tail_led', K.lin(0xd0101e), rough=.08, emission=K.lin(0xff1424), estrength=2.0)
    M['amber_lens'] = P('indicator_amber', K.lin(0xff8a00), rough=.08, transmission=.6, emission=K.lin(0xff8a00), estrength=.35)
    M['white_lens'] = P('reverse_white', (.85, .85, .85), rough=.06, transmission=.7)
    M['plate'] = P('plate_white', (.86, .86, .84), rough=.45)
    M['eu'] = P('plate_eu', K.lin(0x003399), rough=.45)
    M['m_light'] = P('m_lightblue', K.lin(0x43b7e9), rough=.3, coat=1)
    M['m_dark'] = P('m_darkblue', K.lin(0x142760), rough=.3, coat=1)
    M['m_red'] = P('m_red', K.lin(0xe82c39), rough=.3, coat=1)
    M['decal_white'] = P('decal_white', (.9, .9, .88), rough=.35, coat=1)
    M['decal_black'] = P('decal_black', (.012, .012, .014), rough=.35, coat=1)
    M['breuer_red'] = P('breuer_red', K.lin(0xc8102e), rough=.3, coat=1)
    M['seat'] = P('seat_fabric', (.02, .02, .022), rough=.95)
    M['seat_accent'] = P('seat_red', K.lin(0xb3122a), rough=.85)
    M['cage'] = P('cage', cage, rough=.3, coat=.6)
    M['dash'] = P('dash', (.018, .018, .02), rough=.6)
    return M


def half_section(hw, zb, belt, kind, top=None, roof=None, rw=None, flare=0., dip=0., soft=1.):
    """Generic 10-point half section. `flare` widens the lower flank (box
    arches); `dip` lowers the bonnet centre between raised wings."""
    f = flare
    side = [(0, zb), (hw - .10 + f * .6, zb), (hw - .014 * soft + f, zb + .055), (hw + f, zb + (belt - zb) * .40),
            (hw - .003 + f * .85, belt - .065), (hw - .02 * soft + f * .35, belt)]
    if kind == 'deck':
        side += [(hw - .08, belt + .012), (hw * .64, top - .004 - dip * .35), (hw * .3, top - dip * .9), (0, top - dip)]
    elif kind == 'cowl':
        side += [(hw - .075, belt + .016), (hw - .104, belt + .032), (hw * .42, top + .008 - dip * .8), (0, top + .01 - dip)]
    else:
        side += [(hw - .078, belt + .022), (rw + .032, roof - .066), (rw - .02, roof - .01), (0, roof)]
    return side


def surface_strip(B, name, x0, x1, ys, mat, col, lift=.0016, cols=4):
    bm = bmesh.new()
    rows = []
    for y in ys:
        row = []
        for c in range(cols):
            x = x0 + (x1 - x0) * c / (cols - 1)
            p, n = K.surface(B, (x, y, 5), (0, 0, -1))
            row.append(bm.verts.new(p + n * lift))
        rows.append(row)
    for a, b in zip(rows, rows[1:]):
        for c in range(cols - 1):
            bm.faces.new((a[c], a[c + 1], b[c + 1], b[c]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = K.mesh_from_bm(name, bm, mat, col, sharp=None)
    if any(p.normal.z < 0 for p in ob.data.polygons):
        ob.data.flip_normals()
    return ob


def side_decal(B, name, text, size, y, z, sx, mat, col, plate=None, plate_mat=None):
    p, n = K.surface(B, (sx * 3, y, z), (-sx, 0, 0))
    if plate:
        K.cylinder(name + '_disc', plate, .002, (p.x + sx * .0015, p.y, p.z), plate_mat, col, rot=(0, radians(90), 0), segs=64)
    t = K.text_mesh(name, text, size, mat, col, font=FONT, extrude=.0006)
    # flat lettering on a curved flank: sit on the outermost point it spans
    vx = [v.co.x for v in t.data.vertices]
    half = (max(vx) - min(vx)) / 2 if vx else 0
    xs = [abs(K.surface(B, (sx * 3, y + half * k / 4, z), (-sx, 0, 0))[0].x) for k in range(-4, 5)]
    t.location = (sx * (max(xs) + .003), p.y, p.z)
    t.rotation_euler = (radians(90), 0, radians(90 if sx > 0 else -90))
    return t


def side_stripes(B, prefix, M, col, y0, y1, z, gap=.032, width=.026, order=('m_light', 'm_dark', 'm_red')):
    for sx in (1, -1):
        for k, mk in enumerate(order):
            zz = z - k * gap
            n = max(3, int((y1 - y0) / .08))
            pts = [K.surface(B, (sx * 3, y0 + (y1 - y0) * j / n, zz), (-sx, 0, 0), .0012)[0] for j in range(n + 1)]
            if sx < 0:
                pts.reverse()
            K.sweep(f'{prefix}.stripe{sx}{k}', pts, [(0, width / 2), (.0015, width / 2), (.0015, -width / 2), (0, -width / 2)], M[mk], col, smooth_steps=3)


def logo_decal(name, path, width, loc, rot, col, emission=0.):
    """Image decal plane with the Breuer logo (white on transparent)."""
    img = bpy.data.images.load(path, check_existing=True)
    m = bpy.data.materials.new(name + '_mat')
    nt = K._nodes(m)
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = img
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Roughness'].default_value = .35
    bsdf.inputs['Coat Weight'].default_value = 1
    if emission:
        bsdf.inputs['Emission Strength'].default_value = emission
        nt.links.new(tex.outputs['Color'], bsdf.inputs['Emission Color'])
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    nt.links.new(tex.outputs['Alpha'], bsdf.inputs['Alpha'])
    nt.links.new(bsdf.outputs[0], out.inputs['Surface'])
    h = width * img.size[1] / max(1, img.size[0])
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=.5, calc_uvs=True)
    bmesh.ops.scale(bm, vec=(width, h, 1), verts=bm.verts)
    ob = K.mesh_from_bm(name, bm, m, col, smooth=False, sharp=None)
    ob.location, ob.rotation_euler = loc, rot
    return ob


def interior(prefix, M, col, dash_y, seat_y, floor_z, roof_z, half_w, cage_y, a_pillar_y, cowl_z, steer_x=.36, cage=True, a_bars=True):
    K.box(prefix + '.dash', (half_w * 2 - .1, .28, .17), (0, dash_y, cowl_z - .1), M['dash'], col, bevel=.03)
    K.box(prefix + '.binnacle', (.34, .15, .07), (steer_x, dash_y + .1, cowl_z + .01), M['dash'], col, bevel=.03)
    wheel = K.empty(prefix + '.steering', (steer_x, dash_y + .22, cowl_z - .04), col)
    K.tube('steer_ring', [(.17 * cos(a), .17 * sin(a), 0) for a in [2 * pi * s / 40 for s in range(41)]], .017, M['dash'], col, wheel)
    for a in (0, pi, -pi / 2):
        K.tube('spoke', [(0, 0, 0), (.15 * cos(a), .15 * sin(a), 0)], .014, M['dash'], col, wheel)
    K.cylinder('boss', .045, .05, (0, 0, -.02), M['seat_accent'], col, wheel, segs=24)
    wheel.rotation_euler = (radians(-64), 0, 0)
    for sx in (1, -1):
        x = sx * .35
        K.box(f'{prefix}.seat_base{sx}', (.46, .48, .13), (x, seat_y, floor_z + .1), M['seat'], col, bevel=.05)
        K.box(f'{prefix}.seat_back{sx}', (.46, .12, .62), (x, seat_y + .26, floor_z + .42), M['seat'], col, rot=(radians(-14), 0, 0), bevel=.05)
        K.box(f'{prefix}.seat_stripe{sx}', (.12, .125, .56), (x, seat_y + .255, floor_z + .425), M['seat_accent'], col, rot=(radians(-14), 0, 0), bevel=.02)
        for bx in (.21, -.21):
            K.box(f'{prefix}.seat_bolster{sx}{bx}', (.06, .16, .54), (x + bx, seat_y + .24, floor_z + .39), M['seat'], col, rot=(radians(-14), 0, 0), bevel=.025)
    K.box(prefix + '.tunnel', (.24, 1.2, .12), (0, seat_y - .2, floor_z + .04), M['dash'], col, bevel=.04)
    K.tube(prefix + '.shifter', [(0, seat_y - .27, floor_z + .1), (0, seat_y - .23, floor_z + .3)], .008, M['chrome'], col)
    K.sphere(prefix + '.shift_knob', .026, (0, seat_y - .23, floor_z + .31), M['dash'], col)
    if not cage:
        return
    hw, y, top = half_w - .08, cage_y, roof_z - .06
    hoop = [(hw, y, floor_z), (hw, y, top - .14), (hw - .08, y, top - .02), (.3, y, top + .02), (-.3, y, top + .02), (-(hw - .08), y, top - .02), (-hw, y, top - .14), (-hw, y, floor_z)]
    K.tube(prefix + '.cage_hoop', K.catmull(hoop, 5), .021, M['cage'], col)
    K.tube(prefix + '.cage_diag', [(hw, y, floor_z + .06), (-(hw - .16), y, top)], .018, M['cage'], col)
    for sx in ((1, -1) if a_bars else ()):
        K.tube(f'{prefix}.cage_a{sx}', K.catmull([(sx * (hw - .02), y, top - .1), (sx * (hw - .02), (y + a_pillar_y) / 2 + .1, top - .02),
                                                    (sx * hw, a_pillar_y + .1, cowl_z + .2), (sx * (hw + .02), a_pillar_y, cowl_z - .05)], 6), .018, M['cage'], col)


def finish_wheels(prefix, spec, M, col, style, spokes):
    wm = dict(rubber=M['tyre'], rubber_side=M['tyre_side'], rim=M['rim'], lip=M['chrome'], chrome=M['chrome'],
              brake=M['brake'], brake_hat=M['brake_hat'], caliper=M['caliper'])
    proto = K.wheel(prefix + '.wheel', spec['R'], spec['W'], spec['rim'], wm, col, style=style, spokes=spokes)
    fy, ry = spec['axles']
    tx = spec['track'] / 2
    return K.place_wheels(proto, [(tx, fy, spec['R']), (-tx, fy, spec['R']), (tx, ry, spec['R']), (-tx, ry, spec['R'])], col)


def body_from_stations(prefix, S, M, col, spec, windows, creases, gaps, arch_x):
    """Loft -> creases -> windows -> subdivision -> arches and panel gaps.
    windows: [(pred(i, j, side), trim_key, rubber_key, glass_key, trim, rubber)]
    creases: [(value, {ring|line|span})]"""
    keys = ['paint', 'under', 'chrome', 'rubber', 'glass', 'black']
    mats = [M[k] for k in keys]
    idx = {k: i for i, k in enumerate(keys)}
    bm, info, rows = K.loft(S)
    for value, kw in creases:
        K.crease(bm, rows, value, **kw)
    for f, (i, j, s) in info.items():
        f.material_index = idx['under'] if j == 0 else idx['paint']
    for pred, tk, rk, gk, tr, rb in windows:
        K.window(bm, [f for f, v in info.items() if pred(*v)], idx[tk], idx[rk], idx[gk], trim=tr, rubber=rb)
    K.crease_material_borders(bm, .95)
    ob = K.mesh_from_bm(prefix + '.body', bm, mats, col, smooth=True, sharp=None)
    sub = ob.modifiers.new('sub', 'SUBSURF')
    sub.levels = sub.render_levels = 3
    ob = K.bake(ob)
    cut = []
    R, ar = spec['R'], spec['arch']
    for y in spec['axles']:
        for sx in (1, -1):
            cut.append(K.cylinder('arch', ar, .36, (sx * arch_x, y, R + .01), M['well'], rot=(0, radians(90), 0), segs=96))
    for size, loc in gaps:
        cut.append(K.box('gap', size, loc, M['gap'], bevel=0))
    ob = K.boolean(ob, cut)
    K.shade(ob, True, 30)
    return ob


def contour(B, z, off, front=True, side_ys=(1.9, 2.0), xs=(-.6, -.3, 0, .3, .6), side_off=None):
    """Points around the nose/tail at height z, offset along the surface normal."""
    S = K.surface
    sy = -1 if front else 1
    so = off if side_off is None else side_off
    pts = [S(B, (-3, sy * y, z), (1, 0, 0), so)[0] for y in side_ys]
    pts.append(S(B, (-2.2, sy * 3.0, z), (1, -sy * 1.1, 0), off)[0])
    pts += [S(B, (x, sy * 3, z), (0, -sy, 0), off)[0] for x in xs]
    pts.append(S(B, (2.2, sy * 3.0, z), (-1, -sy * 1.1, 0), off)[0])
    pts += [S(B, (3, sy * y, z), (-1, 0, 0), so)[0] for y in reversed(side_ys)]
    return pts if front else list(reversed(pts))
