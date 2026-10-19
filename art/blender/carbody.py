"""Body engine v2: a car is described by continuous design curves (side,
plan and section) instead of a handful of hand placed sections. ~45 stations
are sampled from the curves, lofted, subdivided, sculpted (arch bulges,
character lines) and finally cut (arches, panel gaps).

Blender axes as in carkit: X across (+X driver side), -Y forward, Z up."""
import bpy, bmesh
from math import radians, pi, sin, cos, sqrt
from mathutils import Vector
import carkit as K


# ---------------------------------------------------------------- curves
class Curve:
    """Smooth y -> value curve through control points (Catmull-Rom, sampled)."""

    def __init__(self, pts, steps=12):
        pts = sorted(pts)
        dense = K.catmull([(y, v, 0) for y, v in pts], steps) if len(pts) > 2 else [Vector((y, v, 0)) for y, v in pts]
        self.s = [(p.x, p.y) for p in dense]
        # keep strictly increasing y for the lookup
        clean = [self.s[0]]
        for y, v in self.s[1:]:
            if y > clean[-1][0] + 1e-6:
                clean.append((y, v))
        self.s = clean

    def __call__(self, y):
        s = self.s
        if y <= s[0][0]:
            return s[0][1]
        if y >= s[-1][0]:
            return s[-1][1]
        lo, hi = 0, len(s) - 1
        while hi - lo > 1:
            mid = (lo + hi) // 2
            if s[mid][0] <= y:
                lo = mid
            else:
                hi = mid
        (y0, v0), (y1, v1) = s[lo], s[hi]
        return v0 + (v1 - v0) * (y - y0) / (y1 - y0)


def smooth(a, b, x):
    t = max(0., min(1., (x - a) / (b - a))) if b != a else float(x >= b)
    return t * t * (3 - 2 * t)


H = 14  # points per half section


def section(D, y):
    """Half section at y: bottom centre -> flank -> greenhouse/bonnet -> top centre."""
    s, b, t, h = D['sill'](y), D['belt'](y), D['top'](y), D['hw'](y)
    g = h - D['shoulder'](y)                      # greenhouse base / bonnet edge
    r = D['rw'](y)                                 # roof edge half width
    d = D['dip'](y)                                # bonnet centre below wing tops
    lo = D.get('lower', lambda y: .35)(y)          # belly position
    ch = D.get('char', lambda y: .0)(y)            # character line depth
    cab = smooth(D.get('cab_lo', .08), D.get('cab_hi', .26), t - b)
    side = [(0, s), (h - .13, s), (h - .045, s + .022), (h - .012, s + .085),
            (h, s + (b - s) * lo), (h - .002 - ch * .3, s + (b - s) * .66), (h - .004 + ch, b - .075),
            (h - .014, b - .028), (h - .032, b), (g, b + .014)]
    hood = [(g - .035, b + .03 + d * .6), (h * .6, t + d * .35), (h * .3, t + d * .06), (0, t)]
    cabin = [(r + .034, t - .072), (r - .014, t - .012), (r * .52, t - .002), (0, t)]
    top = [((1 - cab) * hx + cab * cx, (1 - cab) * hz + cab * cz) for (hx, hz), (cx, cz) in zip(hood, cabin)]
    # never let the greenhouse fold outward over the shoulder
    top[0] = (min(top[0][0], g - .01), max(top[0][1], b + .02))
    return side + top


def stations(D):
    y0, y1 = D['y0'], D['y1']
    ys = [y0, y0 + .006, y0 + .025, y0 + .06, y0 + .11]
    step = D.get('step', .1)
    y = y0 + .17
    while y < y1 - .17:
        ys.append(y)
        y += step
    ys += [y1 - .11, y1 - .06, y1 - .025, y1 - .006, y1]
    for extra in D.get('extra_y', ()):
        ys.append(extra)
    ys = sorted(set(round(v, 4) for v in ys))
    return [(y, section(D, y)) for y in ys]


# ---------------------------------------------------------------- sculpting
def bulge(ob, y0, zc, r_in, r_out, amount, x_from, top_fade=None):
    """Push the flank outward around a wheel centre (smooth radial falloff)."""
    me = ob.data
    for v in me.vertices:
        x, y, z = v.co
        ax = abs(x)
        if ax < x_from:
            continue
        dist = sqrt((y - y0) ** 2 + (z - zc) ** 2)
        if dist > r_out:
            continue
        w = 1 - smooth(r_in, r_out, dist)
        w *= smooth(x_from, x_from + .12, ax)
        if top_fade:
            w *= 1 - smooth(top_fade[0], top_fade[1], z)
        v.co.x += (1 if x > 0 else -1) * amount * w
    me.update()


def groove(ob, pts, width, depth, x_from):
    """Character line: a soft shallow groove along a side polyline [(y, z)]."""
    me = ob.data
    seg = [(Vector((0, a[0], a[1])), Vector((0, b[0], b[1]))) for a, b in zip(pts, pts[1:])]
    for v in me.vertices:
        if abs(v.co.x) < x_from:
            continue
        p = Vector((0, v.co.y, v.co.z))
        best = 9.
        for a, b in seg:
            ab = b - a
            t = max(0., min(1., (p - a).dot(ab) / ab.length_squared))
            best = min(best, (a + ab * t - p).length)
        if best < width:
            k = cos(best / width * pi / 2) ** 2
            v.co.x -= (1 if v.co.x > 0 else -1) * depth * k
    me.update()


# ---------------------------------------------------------------- build
def build_body(prefix, D, M, col, glass, gaps=(), arch_x=None, level=3, black_rear=False, sculpt=None):
    """glass: dict(cowl=y, roof_f=y, b=y, roof_r=y, deck=y, side_end=y)."""
    keys = ['paint', 'under', 'trim', 'rubber', 'glass', 'black']
    mats = [M[k] for k in keys]
    I = {k: i for i, k in enumerate(keys)}
    S = stations(D)
    ys = [y for y, _ in S]
    bm, info, rows = K.loft(S)
    last = len(S) - 1
    K.crease(bm, rows, .7, ring=0)
    K.crease(bm, rows, .7, ring=last)
    K.crease(bm, rows, D.get('shoulder_crease', .6), line=8)
    K.crease(bm, rows, .35, line=2)
    K.crease(bm, rows, D.get('char_crease', .3), line=6)
    mid = lambda i: (ys[i] + ys[i + 1]) / 2
    for f, (i, j, s) in info.items():
        f.material_index = I['under'] if j == 0 else I['paint']
    G = glass
    sel = lambda pred: [f for f, (i, j, s) in info.items() if pred(mid(i), j)]
    TOP = (10, 11, 12)
    groups = [
        (sel(lambda y, j: G['cowl'] <= y <= G['roof_f'] and j in TOP), 'glass', .012, .011),
        (sel(lambda y, j: G['roof_r'] <= y <= G['deck'] and j in TOP), 'black' if black_rear else 'glass', .012, .011),
        (sel(lambda y, j: G['cowl'] <= y <= G['b'] and j == 9), 'glass', .011, .01),
        (sel(lambda y, j: G['b'] <= y <= G['side_end'] and j == 9), G.get('quarter', 'glass'), .011, .01),
    ]
    for faces, gk, tr, rb in groups:
        if faces:
            K.window(bm, faces, I['trim'], I['rubber'], I[gk], trim=tr, rubber=rb)
    K.crease_material_borders(bm, .95)
    ob = K.mesh_from_bm(prefix + '.body', bm, mats, col, smooth=True, sharp=None)
    sub = ob.modifiers.new('sub', 'SUBSURF')
    sub.levels = sub.render_levels = level
    ob = K.bake(ob)
    if sculpt:
        sculpt(ob)
    cut = []
    ax = arch_x if arch_x is not None else D['track'] / 2
    for y in D['axles']:
        for sx in (1, -1):
            cut.append(K.cylinder('arch', D['arch'], .40, (sx * (ax + .02), y, D['R'] + D.get('arch_z', .012)), M['well'],
                                  rot=(0, radians(90), 0), segs=128))
    for gp in gaps:
        cut.append(K.box('gap', gp[0], gp[1], M['gap'], bevel=gp[2] if len(gp) > 2 else 0, segs=4))
    ob = K.boolean(ob, cut)
    K.shade(ob, True, 28)
    return ob


def arch_lips(prefix, B, D, M, col, depth=.028, out=.012, a0=10, a1=170):
    """Rolled lip following each cut-out edge so the arch reads as a real panel edge."""
    prof = [(-.004, -.003), (depth, -.003), (depth + .004, out * .5), (depth - .004, out), (.006, out + .002), (-.006, out * .6)]
    R, ar, zc = D['R'], D['arch'], D['R'] + D.get('arch_z', .012)
    for y0 in D['axles']:
        for sx in (1, -1):
            bm = bmesh.new()
            rings = []
            steps = 56
            for s in range(steps + 1):
                th = radians(a0 + (a1 - a0) * s / steps)
                d = Vector((0, -cos(th), sin(th)))
                y, z = y0 + (ar + .006) * d.y, zc + (ar + .006) * d.z
                try:
                    p, _ = K.surface(B, (sx * 3, y, z), (-sx, 0, 0))
                except RuntimeError:
                    continue
                base = Vector((p.x, y0 + ar * d.y, zc + ar * d.z))
                taper = min(1, s / 5, (steps - s) / 5)
                n = Vector((sx, 0, 0))
                rings.append([bm.verts.new(base + d * a * (.3 + .7 * taper) + n * b * taper) for a, b in prof])
            m = len(prof)
            for a, b in zip(rings, rings[1:]):
                for j in range(m):
                    bm.faces.new((a[j], a[(j + 1) % m], b[(j + 1) % m], b[j]))
            if len(rings) > 1:
                bm.faces.new(rings[0])
                bm.faces.new(list(reversed(rings[-1])))
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
            ob = K.mesh_from_bm(f'{prefix}.arch_lip{sx}{y0}', bm, M['paint'], col, sharp=70)
            s_ = ob.modifiers.new('sub', 'SUBSURF')
            s_.levels = 1
            K.bake(ob)


# ---------------------------------------------------------------- detail parts
def honeycomb(name, w, h, cell, depth, mat, col, back_mat=None, wall=.004):
    """Plane of hexagonal cells in local XZ (facing -Y), centred at origin."""
    bm = bmesh.new()
    rx = cell / 2
    dx, dz = cell * .87, cell * .75
    nz = int(h / dz) + 2
    nx = int(w / dx) + 2
    for iz in range(-nz // 2, nz // 2 + 1):
        for ix in range(-nx // 2, nx // 2 + 1):
            cx = ix * dx + (dx / 2 if iz % 2 else 0)
            cz = iz * dz
            if abs(cx) > w / 2 - rx * .9 or abs(cz) > h / 2 - rx * .9:
                continue
            outer = [Vector((cx + rx * sin(a), 0, cz + rx * cos(a))) for a in [k * pi / 3 for k in range(6)]]
            inner = [Vector((cx, 0, cz)) + (p - Vector((cx, 0, cz))) * (1 - wall / rx) for p in outer]
            vo = [bm.verts.new(p) for p in outer]
            vi = [bm.verts.new(p) for p in inner]
            vob = [bm.verts.new(p + Vector((0, depth, 0))) for p in outer]
            for k in range(6):
                k2 = (k + 1) % 6
                bm.faces.new((vo[k], vo[k2], vi[k2], vi[k]))
                bm.faces.new((vo[k], vob[k], vob[k2], vo[k2]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = K.mesh_from_bm(name, bm, mat, col, smooth=False, sharp=None)
    if back_mat:
        K.box(name + '_back', (w, .004, h), (0, depth + .003, 0), back_mat, col, ob, bevel=0)
    return ob


def tyre_lettering(prefix, wheel_root, text, R, rim, W, mat, col, size=.022):
    """Raised sidewall lettering on the outer face of the wheel prototype."""
    r = rim + (R - rim) * .58
    n = len(text)
    span = radians(4.2) * n
    for k, ch in enumerate(text):
        if ch == ' ':
            continue
        a = pi / 2 + span / 2 - k * span / max(1, n - 1)
        t = K.text_mesh(f'{prefix}.tl{k}', ch, size, mat, col, font=K_FONT, extrude=.0008)
        t.parent = wheel_root
        t.location = (W / 2 + .0095, r * cos(a), r * sin(a))
        # face +X first (Y rotation), then turn the letter's up radially (X rotation)
        t.rotation_mode = 'YXZ'
        t.rotation_euler = (a, radians(90), 0)


K_FONT = 'C:/Windows/Fonts/bahnschrift.ttf'


def valve(prefix, root, rim, mat, col):
    K.cylinder(prefix + '.valve', .004, .03, (.05, 0, -(rim - .02)), mat, col, root, rot=(0, radians(70), 0), segs=8)


def _arc(r, a0, a1, n):
    return [(r * cos(radians(a0 + (a1 - a0) * k / n)), r * sin(radians(a0 + (a1 - a0) * k / n))) for k in range(n + 1)]


def spoke_windows(style, spokes, rim_r):
    ro, ri, rm = rim_r - .026, rim_r * .40, rim_r * .62
    pitch = 360 / spokes
    polys = []
    for k in range(spokes):
        c, n = k * pitch, (k + 1) * pitch
        if style == 'y5':
            outer = _arc(ro, c + 17, n - 17, 8)
            inner = _arc(ri, n - 11, c + 11, 5)
            polys.append(outer + [(rm * cos(radians(n - 8)), rm * sin(radians(n - 8)))] + inner + [(rm * cos(radians(c + 8)), rm * sin(radians(c + 8)))])
            polys.append(_arc(ro - .004, c - 9.5, c + 9.5, 6) + [((rm + .016) * cos(radians(c)), (rm + .016) * sin(radians(c)))])
        elif style == 'ten':
            polys.append(_arc(ro, c + pitch * .2, n - pitch * .2, 6) + _arc(ri + .01, n - pitch * .3, c + pitch * .3, 3))
        elif style == 'mesh':
            w = pitch * .16
            polys.append([(ro * cos(radians(c - w)), ro * sin(radians(c - w))), (ro * cos(radians(c + w)), ro * sin(radians(c + w))),
                          (ri * cos(radians(c + w * .4)), ri * sin(radians(c + w * .4))), (ri * cos(radians(c - w * .4)), ri * sin(radians(c - w * .4)))])
        else:  # minilite
            polys.append(_arc(ro, c + pitch * .2, n - pitch * .2, 7) + _arc(rim_r * .42, n - pitch * .28, c + pitch * .28, 4))
    return polys


def wheel2(name, R, W, rim_r, mats, col, style='y5', spokes=5, concave=.035, centerlock=False, bolts=5, letters='BREUER RACING'):
    """carkit.wheel with a new concave spoke face, bolts / centre lock, valve and sidewall lettering."""
    root = K.wheel(name, R, W, rim_r, mats, col, style='minilite', spokes=8)
    for ch in list(root.children):
        if ch.name.startswith((name + '.face', name + '.hub', name + '.cap', name + '.nut')):
            bpy.data.objects.remove(ch, do_unlink=True)
    h = W / 2
    fx = h - .03
    t = .018
    front = [(fx, rim_r - .012), (fx - concave * .25, rim_r * .82), (fx - concave * .8, rim_r * .6), (fx - concave, rim_r * .38), (fx - concave + .004, .0001)]
    back = [(x - t, r) for x, r in reversed(front)]
    face = K.lathe(name + '.face', front + back, mats['rim'], col, None, segs=96, closed=True)
    cutters = [K.prism('cut', poly, fx - concave - .06, fx + .03, mats['rim']) for poly in spoke_windows(style, spokes, rim_r)]
    face = K.boolean(face, cutters)
    bv = face.modifiers.new('bev', 'BEVEL')
    bv.width, bv.segments, bv.limit_method = .0025, 2, 'ANGLE'
    face = K.bake(face)
    face.parent = root
    K.shade(face, True, 35)
    hx = fx - concave + .004
    if centerlock:
        K.cylinder(name + '.lock', .045, .045, (hx + .02, 0, 0), mats['caliper'], col, root, rot=(0, radians(90), 0), segs=6, bevel=.004)
        K.cylinder(name + '.lock_pin', .016, .06, (hx + .03, 0, 0), mats['chrome'], col, root, rot=(0, radians(90), 0), segs=16)
    else:
        K.lathe(name + '.cap', [(hx + .004, .046), (hx + .016, .04), (hx + .022, .02), (hx + .024, .0001)], mats['chrome'], col, root, segs=40)
        for k in range(bolts):
            a = 2 * pi * k / bolts + pi / 2
            K.cylinder(name + f'.bolt{k}', .011, .022, (hx + .008, .066 * cos(a), .066 * sin(a)), mats['chrome'], col, root,
                       rot=(0, radians(90), 0), segs=6)
    K.cylinder(name + '.valve', .0045, .028, (fx - .01, 0, -(rim_r - .028)), mats['chrome'], col, root, rot=(0, radians(60), 0), segs=8)
    if letters:
        tyre_lettering(name, root, letters, R, rim_r, W, mats['rubber_side'], col)
    return root


def wheels2(prefix, D, M, col, **kw):
    wm = dict(rubber=M['tyre'], rubber_side=M['tyre_side'], rim=M['rim'], lip=M['chrome'], chrome=M['chrome'],
              brake=M['brake'], brake_hat=M['brake_hat'], caliper=M['caliper'])
    proto = wheel2(prefix + '.wheel', D['R'], D['W'], D['rim'], wm, col, **kw)
    fy, ry = D['axles']
    tx = D['track'] / 2
    return K.place_wheels(proto, [(tx, fy, D['R']), (-tx, fy, D['R']), (tx, ry, D['R']), (-tx, ry, D['R'])], col)
