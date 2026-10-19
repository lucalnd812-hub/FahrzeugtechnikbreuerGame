"""Opel Kadett C Coupé (yellow, Breuer GP) — detailed Blender model.

Run inside Blender:  exec(open(r'<repo>/art/blender/kadett.py').read())
Dimensions follow src/vehicle-models.js so physics and framing stay valid.
"""
import sys, os, importlib, math
from math import radians, pi, sin, cos
HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else r'.'
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import carkit as K
importlib.reload(K)
import bpy, bmesh
from mathutils import Vector

SPEC = dict(id='kadett', length=4.18, width=1.61, wheelbase=2.395, R=.321, W=.205, rim=.168,
            axles=(-1.29, 1.105), track=1.38, paint=0xf6c000, arch=.356)


def materials():
    M = {}
    M['paint'] = K.principled('kadett_paint', K.lin(SPEC['paint']), rough=.3, coat=1, coat_rough=.02)
    M['under'] = K.principled('underbody', (.012, .012, .013), rough=.8)
    M['chrome'] = K.principled('chrome', (.92, .93, .95), metallic=1, rough=.06)
    M['rubber'] = K.principled('trim_rubber', (.012, .012, .014), rough=.55)
    M['glass'] = K.thin_glass('glass')
    M['black'] = K.principled('satin_black', (.016, .016, .018), rough=.42)
    M['gap'] = K.principled('panel_gap', (.004, .004, .004), rough=.9)
    M['well'] = K.principled('wheel_well', (.01, .01, .011), rough=.85)
    M['tyre'] = K.principled('tyre', (.022, .022, .024), rough=.82)
    M['tyre_side'] = K.principled('tyre_letters', (.05, .05, .052), rough=.7)
    M['rim'] = K.principled('rim_gunmetal', (.055, .058, .065), metallic=.85, rough=.32)
    M['brake'] = K.principled('brake_disc', (.35, .35, .36), metallic=1, rough=.38)
    M['brake_hat'] = K.principled('brake_hat', (.06, .06, .065), metallic=.6, rough=.5)
    M['caliper'] = K.principled('caliper_red', K.lin(0xc8102e), rough=.35, coat=.5)
    M['lens'] = K.thin_glass('headlamp_lens', tint=(.92, .93, .95), reflect=.05)
    M['reflector'] = K.principled('reflector', (.9, .9, .92), metallic=1, rough=.2, emission=(1, .96, .88), estrength=.22)
    M['red_lens'] = K.principled('tail_red', K.lin(0xb3061a), rough=.08, transmission=.6, emission=K.lin(0xff1020), estrength=.6)
    M['amber_lens'] = K.principled('indicator_amber', K.lin(0xff8a00), rough=.08, transmission=.6, emission=K.lin(0xff8a00), estrength=.35)
    M['white_lens'] = K.principled('reverse_white', (.85, .85, .85), rough=.06, transmission=.7)
    M['plate'] = K.principled('plate_white', (.86, .86, .84), rough=.45)
    M['eu'] = K.principled('plate_eu', K.lin(0x003399), rough=.45)
    M['seat'] = K.principled('seat_fabric', (.02, .02, .022), rough=.95)
    M['seat_accent'] = K.principled('seat_red', K.lin(0xb3122a), rough=.85)
    M['cage'] = K.principled('cage_red', K.lin(0xc8102e), rough=.3, coat=.6)
    M['dash'] = K.principled('dash', (.018, .018, .02), rough=.6)
    return M


def half(hw, zb, belt, kind, top=None, roof=None, rw=None):
    """Half cross-section, bottom centre -> left side -> top centre (10 pts)."""
    side = [(0, zb), (hw - .11, zb), (hw - .018, zb + .065), (hw, zb + (belt - zb) * .42),
            (hw - .004, belt - .075), (hw - .024, belt)]
    if kind == 'deck':
        side += [(hw - .095, belt + .013), (hw * .62, top - .006), (hw * .3, top), (0, top + .002)]
    elif kind == 'cowl':
        side += [(hw - .088, belt + .018), (hw - .118, belt + .034), (hw * .42, top + .01), (0, top + .013)]
    else:  # cabin
        side += [(hw - .088, belt + .024), (rw + .036, roof - .078), (rw - .022, roof - .012), (0, roof)]
    return side


# station indices used for windows and creases
COWL, ROOF_F, B_LINE, ROOF_R, C_SLOPE, DECK = 6, 7, 9, 10, 11, 12


def stations():
    S = []
    add = lambda y, *a, **k: S.append((y, half(*a, **k)))
    add(-2.095, .70, .30, .712, 'deck', top=.728)
    add(-2.085, .728, .285, .722, 'deck', top=.740)
    add(-2.05, .758, .245, .735, 'deck', top=.752)
    add(-1.94, .776, .215, .748, 'deck', top=.766)
    add(-1.45, .79, .20, .788, 'deck', top=.81)
    add(-1.00, .80, .20, .826, 'deck', top=.846)
    add(-.64, .805, .20, .852, 'cowl', top=.868)              # 6 windscreen base
    add(-.22, .805, .20, .868, 'cabin', roof=1.30, rw=.632)    # 7 roof front
    add(.12, .805, .20, .876, 'cabin', roof=1.318, rw=.645)
    add(.42, .805, .20, .879, 'cabin', roof=1.31, rw=.643)     # 9 B line
    add(.56, .804, .20, .879, 'cabin', roof=1.292, rw=.636)    # 10 roof rear
    add(.96, .80, .20, .874, 'cabin', roof=1.115, rw=.598)     # 11 C slope
    add(1.40, .795, .20, .862, 'cowl', top=.88)                # 12 deck start
    add(1.76, .787, .21, .834, 'deck', top=.852)
    add(1.95, .772, .22, .80, 'deck', top=.815)
    add(2.05, .748, .25, .768, 'deck', top=.782)
    add(2.082, .722, .285, .748, 'deck', top=.762)
    add(2.094, .695, .30, .736, 'deck', top=.75)
    return S


def body(M, col):
    mats = [M['paint'], M['under'], M['chrome'], M['rubber'], M['glass']]
    PAINT, UNDER, CHROME, RUBBER, GLASS = range(5)
    S = stations()
    bm, info, rows = K.loft(S)
    last = len(S) - 1
    K.crease(bm, rows, .7, ring=0)
    K.crease(bm, rows, .7, ring=last)
    K.crease(bm, rows, .55, line=5)                       # shoulder
    K.crease(bm, rows, .3, line=2)                        # sill
    K.crease(bm, rows, .4, line=6, span=(0, COWL))        # bonnet edges
    K.crease(bm, rows, .4, line=6, span=(DECK, last))     # boot edges
    K.crease(bm, rows, .35, line=8, span=(ROOF_F, ROOF_R))  # roof drip line
    for f, (i, j, s) in info.items():
        f.material_index = UNDER if j == 0 else PAINT
    sel = lambda pred: [f for f, (i, j, s) in info.items() if pred(i, j, s)]
    K.window(bm, sel(lambda i, j, s: i == COWL and j in (7, 8)), CHROME, RUBBER, GLASS)
    K.window(bm, sel(lambda i, j, s: i in (ROOF_R, C_SLOPE) and j in (7, 8)), CHROME, RUBBER, GLASS)
    K.window(bm, sel(lambda i, j, s: i in (COWL, ROOF_F, ROOF_F + 1) and j == 6), CHROME, RUBBER, GLASS)
    K.window(bm, sel(lambda i, j, s: i in (B_LINE, ROOF_R, C_SLOPE) and j == 6), CHROME, RUBBER, GLASS, trim=.012)
    K.crease_material_borders(bm, .95)
    ob = K.mesh_from_bm('kadett.body', bm, mats, col, smooth=True, sharp=None)
    sub = ob.modifiers.new('sub', 'SUBSURF')
    sub.levels = sub.render_levels = 3
    ob = K.bake(ob)
    # wheel arches and panel gaps
    cut = []
    R, (fy, ry), ar = SPEC['R'], SPEC['axles'], SPEC['arch']
    for y in (fy, ry):
        for sx in (1, -1):
            cut.append(K.cylinder('arch', ar, .30, (sx * .70, y, R + .006), M['well'], rot=(0, radians(90), 0), segs=96))
    g = .0042
    for sx in (1, -1):
        for y in (-.615, .455):
            cut.append(K.box('gap', (.22, g, .66), (sx * .80, y, .545), M['gap'], bevel=0))
        cut.append(K.box('gap', (.22, 1.07, g), (sx * .80, -.08, .232), M['gap'], bevel=0))
        cut.append(K.box('gap', (g, 1.36, .16), (sx * .708, -1.39, .84), M['gap'], bevel=0))
        cut.append(K.box('gap', (g, .64, .16), (sx * .69, 1.76, .86), M['gap'], bevel=0))
    cut.append(K.box('gap', (1.42, g, .14), (0, -.71, .90), M['gap'], bevel=0))
    cut.append(K.box('gap', (1.38, g, .14), (0, 1.44, .91), M['gap'], bevel=0))
    cut.append(K.box('gap', (1.42, g, .1), (0, -2.035, .78), M['gap'], bevel=0))
    ob = K.boolean(ob, cut)
    K.shade(ob, True, 32)
    return ob


def arch_flares(B, M, col):
    """Rolled, slightly flared arch lips following the real cut-out edge."""
    R, ar = SPEC['R'], SPEC['arch']
    prof = [(-.006, -.004), (.024, -.004), (.03, .005), (.024, .016), (.01, .022), (-.003, .019), (-.008, .008)]
    for y0 in SPEC['axles']:
        for sx in (1, -1):
            zc = R + .006
            bm = bmesh.new()
            rings = []
            steps = 40
            for s in range(steps + 1):
                th = radians(14 + 152 * s / steps)
                d = Vector((0, -cos(th), sin(th)))
                y, z = y0 + (ar + .01) * d.y, zc + (ar + .01) * d.z
                p, _ = K.surface(B, (sx * 2, y, z), (-sx, 0, 0))
                base = Vector((p.x, y0 + ar * d.y, zc + ar * d.z))
                taper = min(1, s / 6, (steps - s) / 6)
                n = Vector((sx, 0, 0))
                rings.append([bm.verts.new(base + d * a * (.4 + .6 * taper) + n * b * taper) for a, b in prof])
            m = len(prof)
            for a, b in zip(rings, rings[1:]):
                for j in range(m):
                    bm.faces.new((a[j], a[(j + 1) % m], b[(j + 1) % m], b[j]))
            bm.faces.new(rings[0])
            bm.faces.new(list(reversed(rings[-1])))
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
            ob = K.mesh_from_bm(f'kadett.flare{sx}{y0}', bm, M['paint'], col, sharp=70)
            sub = ob.modifiers.new('sub', 'SUBSURF')
            sub.levels = 1
            K.bake(ob)


def details(B, M, col):
    S = K.surface
    # ---- front: grille panel with slats, headlamps, indicators
    yf = S(B, (0, -3, .60), (0, 1, 0))[0].y
    K.box('kadett.grille_panel', (1.22, .03, .2), (0, yf + .008, .598), M['black'], col, bevel=.008)
    for k in range(6):
        K.box(f'kadett.slat{k}', (.62, .012, .008), (0, yf - .01, .527 + k * .028), M['rubber'], col, bevel=.002)
    K.box('kadett.grille_bar', (.64, .014, .012), (0, yf - .014, .60), M['chrome'], col, bevel=.003)
    K.cylinder('kadett.badge', .022, .01, (0, yf - .02, .60), M['chrome'], col, rot=(radians(90), 0, 0), segs=32, bevel=.002)
    for sx in (1, -1):
        hx, hz = sx * .51, .598
        y0 = S(B, (hx, -3, hz), (0, 1, 0))[0].y
        lamp = K.empty(f'kadett.headlamp_{"L" if sx > 0 else "R"}', (hx, y0 - .036, hz), col)
        K.lathe('bezel', [(-.03, .094), (.004, .096), (.012, .092), (.014, .084), (.004, .080), (-.02, .080)], M['chrome'], col, lamp, segs=64, closed=True)
        K.lathe('reflector', [(.0, .079), (.012, .06), (.022, .03), (.026, .0001)], M['reflector'], col, lamp, segs=48)
        K.lathe('lens', [(.004, .0001), (.0055, .04), (.006, .07), (.004, .081)], M['lens'], col, lamp, segs=64)
        K.sphere('bulb', .012, (.025, 0, 0), M['chrome'], col, lamp)
        lamp.rotation_euler = (0, 0, radians(90))
        K.box(f'kadett.indicator{sx}', (.11, .02, .034), (sx * .55, yf - .004, .465), M['amber_lens'], col, bevel=.006)
    # ---- bumpers (chrome blades with black rubber insert)
    blade = K.rounded_rect(.032, .072, .012)
    rubber = K.rounded_rect(.012, .022, .005)

    def contour(z, off, front=True, side_ys=(1.80, 1.93)):
        sy = -1 if front else 1
        pts = [S(B, (-2, sy * y, z), (1, 0, 0), off)[0] for y in side_ys]
        pts.append(S(B, (-2, sy * 3.0, z), (1, -sy * 1.15, 0), off)[0])
        pts += [S(B, (x, sy * 3, z), (0, -sy, 0), off)[0] for x in (-.55, -.25, 0, .25, .55)]
        pts.append(S(B, (2, sy * 3.0, z), (-1, -sy * 1.15, 0), off)[0])
        pts += [S(B, (2, sy * y, z), (-1, 0, 0), off)[0] for y in reversed(side_ys)]
        return pts if front else list(reversed(pts))

    def bumper(name, z, front=True):
        sy = -1 if front else 1
        pts = contour(z, .028, front)
        K.sweep(name, pts, [(px + .012, pz) for px, pz in blade], M['chrome'], col)
        K.sweep(name + '_rubber', pts, [(px + .03, pz) for px, pz in rubber], M['rubber'], col)
        for sx in (1, -1):
            p = S(B, (sx * .36, sy * 3, z), (0, -sy, 0))[0]
            K.box(name + f'_guard{sx}', (.045, .07, .13), (p.x, p.y + sy * .05, z - .005), M['rubber'], col, bevel=.012)
    bumper('kadett.bumper_front', .418, True)
    bumper('kadett.bumper_rear', .43, False)
    # front spoiler lip following the nose, rear duck-tail
    lip = contour(.262, .0, True, side_ys=(1.72, 1.90))
    K.sweep('kadett.airdam', lip, [(-.02, .02), (.018, .02), (.03, -.035), (.026, -.045), (-.02, -.045)], M['black'], col)
    zt = S(B, (0, 2.03, 3), (0, 0, -1))[0].z
    K.box('kadett.ducktail', (1.30, .13, .035), (0, 2.02, zt + .022), M['black'], col, rot=(radians(-10), 0, 0), bevel=.012)
    # ---- rear lamps, plate area, exhaust
    yr = S(B, (0, 3, .62), (0, -1, 0))[0].y
    K.box('kadett.rear_panel', (1.26, .02, .17), (0, yr - .004, .628), M['black'], col, bevel=.006)
    for sx in (1, -1):
        cx = sx * .47
        K.box(f'kadett.tail_frame{sx}', (.34, .02, .135), (cx, yr + .004, .628), M['chrome'], col, bevel=.008)
        K.box(f'kadett.tail_red{sx}', (.22, .02, .112), (cx - sx * .045, yr + .012, .628), M['red_lens'], col, bevel=.006)
        K.box(f'kadett.tail_amber{sx}', (.075, .02, .112), (cx + sx * .115, yr + .012, .628), M['amber_lens'], col, bevel=.006)
        K.box(f'kadett.tail_rev{sx}', (.045, .021, .05), (cx - sx * .13, yr + .013, .628), M['white_lens'], col, bevel=.004)
    K.plate('kadett.plate_rear', 'AC BR 73', M, col, (0, yr + .016, .628), 'rear', w=.36, h=.088)
    pf = S(B, (0, -3, .35), (0, 1, 0))[0]
    K.plate('kadett.plate_front', 'AC BR 73', M, col, (0, pf.y - .008, .35), 'front', w=.40, h=.092)
    K.cylinder('kadett.exhaust', .027, .26, (-.42, 1.98, .235), M['chrome'], col, rot=(radians(90), 0, 0), segs=24)
    K.cylinder('kadett.exhaust_in', .021, .262, (-.42, 1.98, .235), M['black'], col, rot=(radians(90), 0, 0), segs=24)
    # ---- sides: chrome strip, handles, mirrors, fuel cap, aerial
    for sx in (1, -1):
        pts = [S(B, (sx * 2, y, .505), (-sx, 0, 0), .002)[0] for y in [-.86 + k * .1 for k in range(16)]]
        if sx < 0:
            pts.reverse()
        K.sweep(f'kadett.side_strip{sx}', pts, K.rounded_rect(.006, .016, .003), M['chrome'], col)
        p, n = S(B, (sx * 2, .33, .80), (-sx, 0, 0))
        K.box(f'kadett.handle{sx}', (.018, .12, .022), (p.x + sx * .006, p.y, p.z), M['chrome'], col, bevel=.006)
        p, n = S(B, (sx * 2, -.50, .855), (-sx, 0, 0))
        m = K.empty(f'kadett.mirror{sx}', (p.x, p.y, p.z), col)
        K.cylinder('stem', .008, .07, (sx * .03, 0, .03), M['chrome'], col, m, rot=(0, radians(sx * 50), 0), segs=12)
        K.sphere('head', .045, (sx * .07, .01, .06), M['chrome'], col, m, scale=(.75, 1.35, .75))
        K.cylinder('glass', .036, .004, (sx * .07, .048, .06), M['reflector'], col, m, rot=(radians(90), 0, 0), segs=24)
    p, n = S(B, (2, 1.32, .80), (-1, 0, 0))
    K.cylinder('kadett.fuel_cap', .045, .012, (p.x + .002, p.y, p.z), M['chrome'], col, rot=(0, radians(90), 0), segs=32, bevel=.003)
    p = S(B, (-.64, 1.62, 3), (0, 0, -1))[0]
    K.tube('kadett.aerial', [(p.x, p.y, p.z), (p.x - .02, p.y + .22, p.z + .62)], .0035, M['black'], col)
    for sx in (.3, -.2):
        p = S(B, (sx, -.70, 3), (0, 0, -1))[0]
        K.tube(f'kadett.wiper{sx}', [(p.x - .25, p.y + .05, p.z + .012), (p.x + .17, p.y + .02, p.z + .012)], .006, M['black'], col)
    # ---- interior
    K.box('kadett.dash', (1.40, .26, .17), (0, -.50, .73), M['dash'], col, bevel=.03)
    K.box('kadett.dash_top', (1.36, .22, .04), (0, -.45, .82), M['seat'], col, bevel=.015)
    for k in range(3):
        K.cylinder(f'kadett.gauge{k}', .038, .02, (.22 + k * .1, -.37, .77), M['chrome'], col, rot=(radians(75), 0, 0), segs=24)
    wheel = K.empty('kadett.steering', (.36, -.30, .80), col)
    K.tube('steer_ring', [(.185 * cos(a), .185 * sin(a), 0) for a in [2 * pi * s / 40 for s in range(41)]], .016, M['dash'], col, wheel)
    for a in (0, pi, -pi / 2):
        K.tube('spoke', [(0, 0, 0), (.17 * cos(a), .17 * sin(a), 0)], .012, M['chrome'], col, wheel)
    K.cylinder('boss', .04, .05, (0, 0, -.02), M['dash'], col, wheel, segs=24)
    wheel.rotation_euler = (radians(-62), 0, 0)
    K.tube('kadett.column', [(.36, -.31, .79), (.36, -.52, .68)], .022, M['dash'], col)
    for sx in (1, -1):
        x = sx * .34
        K.box(f'kadett.seat_base{sx}', (.46, .48, .14), (x, .10, .36), M['seat'], col, bevel=.05)
        K.box(f'kadett.seat_back{sx}', (.46, .12, .62), (x, .36, .66), M['seat'], col, rot=(radians(-14), 0, 0), bevel=.05)
        K.box(f'kadett.seat_stripe{sx}', (.12, .125, .58), (x, .355, .665), M['seat_accent'], col, rot=(radians(-14), 0, 0), bevel=.02)
        for bx in (.21, -.21):
            K.box(f'kadett.seat_bolster{sx}{bx}', (.06, .16, .55), (x + bx, .34, .62), M['seat'], col, rot=(radians(-14), 0, 0), bevel=.025)
    K.box('kadett.tunnel', (.24, 1.2, .12), (0, -.1, .30), M['dash'], col, bevel=.04)
    K.tube('kadett.shifter', [(0, -.20, .36), (0, -.16, .58)], .008, M['chrome'], col)
    K.sphere('kadett.shift_knob', .026, (0, -.16, .59), M['dash'], col)
    K.box('kadett.rear_bench', (1.2, .42, .2), (0, .85, .38), M['seat'], col, bevel=.05)
    y = .58
    hoop = [(.60, y, .24), (.60, y, 1.05), (.52, y, 1.19), (.30, y, 1.235), (-.30, y, 1.235), (-.52, y, 1.19), (-.60, y, 1.05), (-.60, y, .24)]
    K.tube('kadett.cage_hoop', K.catmull(hoop, 5), .021, M['cage'], col)
    K.tube('kadett.cage_diag', [(.60, y, .30), (-.42, y, 1.215)], .018, M['cage'], col)
    for sx in (1, -1):
        K.tube(f'kadett.cage_stay{sx}', [(sx * .55, y, 1.16), (sx * .56, 1.18, .62)], .018, M['cage'], col)
        K.tube(f'kadett.cage_a{sx}', K.catmull([(sx * .58, y, 1.12), (sx * .60, -.05, 1.22), (sx * .64, -.42, 1.02), (sx * .66, -.54, .72)], 6), .018, M['cage'], col)


def build():
    K.reset_scene()
    col = K.collection('kadett')
    M = materials()
    B = body(M, col)
    arch_flares(B, M, col)
    details(B, M, col)
    wm = dict(rubber=M['tyre'], rubber_side=M['tyre_side'], rim=M['rim'], lip=M['chrome'], chrome=M['chrome'],
              brake=M['brake'], brake_hat=M['brake_hat'], caliper=M['caliper'])
    proto = K.wheel('kadett.wheel', SPEC['R'], SPEC['W'], SPEC['rim'], wm, col, style='minilite', spokes=8)
    fy, ry = SPEC['axles']
    tx = SPEC['track'] / 2
    K.place_wheels(proto, [(tx, fy, SPEC['R']), (-tx, fy, SPEC['R']), (tx, ry, SPEC['R']), (-tx, ry, SPEC['R'])], col)
    return col


build()
