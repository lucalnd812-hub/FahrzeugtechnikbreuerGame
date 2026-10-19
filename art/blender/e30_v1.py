"""BMW E30 M3 (white, motorsport stripes, Breuer GP) — detailed Blender model.

Run inside Blender:  exec(open(r'<repo>/art/blender/e30.py').read())
Dimensions follow src/vehicle-models.js. No manufacturer logos are modelled.
"""
import sys, os, importlib
from math import radians, pi, sin, cos
HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else r'.'
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import carkit as K
importlib.reload(K)
import bpy, bmesh
from mathutils import Vector

SPEC = dict(id='e30', R=.329, W=.235, rim=.205, axles=(-1.307, 1.255), track=1.50, arch=.362, paint=0xf3f2ec)
FONT = 'C:/Windows/Fonts/bahnschrift.ttf'


def materials():
    M = {}
    M['paint'] = K.principled('e30_paint', K.lin(SPEC['paint']), rough=.28, coat=1, coat_rough=.02)
    M['under'] = K.principled('underbody', (.012, .012, .013), rough=.8)
    M['chrome'] = K.principled('chrome', (.92, .93, .95), metallic=1, rough=.06)
    M['rubber'] = K.principled('trim_rubber', (.012, .012, .014), rough=.55)
    M['glass'] = K.thin_glass('glass')
    M['black'] = K.principled('satin_black', (.016, .016, .018), rough=.42)
    M['gloss_black'] = K.principled('gloss_black', (.01, .01, .012), rough=.12, coat=1)
    M['gap'] = K.principled('panel_gap', (.004, .004, .004), rough=.9)
    M['well'] = K.principled('wheel_well', (.01, .01, .011), rough=.85)
    M['tyre'] = K.principled('tyre', (.022, .022, .024), rough=.82)
    M['tyre_side'] = K.principled('tyre_letters', (.05, .05, .052), rough=.7)
    M['rim'] = K.principled('rim_silver', (.62, .63, .65), metallic=1, rough=.28)
    M['brake'] = K.principled('brake_disc', (.35, .35, .36), metallic=1, rough=.38)
    M['brake_hat'] = K.principled('brake_hat', (.06, .06, .065), metallic=.6, rough=.5)
    M['caliper'] = K.principled('caliper_red', K.lin(0xc8102e), rough=.35, coat=.5)
    M['lens'] = K.thin_glass('headlamp_lens', tint=(.92, .93, .95), reflect=.05)
    M['reflector'] = K.principled('reflector', (.9, .9, .92), metallic=1, rough=.2, emission=(1, .96, .88), estrength=.22)
    M['red_lens'] = K.principled('tail_red', K.lin(0xb3061a), rough=.08, transmission=.6, emission=K.lin(0xff1020), estrength=.6)
    M['amber_lens'] = K.principled('indicator_amber', K.lin(0xff8a00), rough=.08, transmission=.6, emission=K.lin(0xff8a00), estrength=.35)
    M['smoke_lens'] = K.principled('smoke_lens', (.05, .05, .055), rough=.06, transmission=.4)
    M['white_lens'] = K.principled('reverse_white', (.85, .85, .85), rough=.06, transmission=.7)
    M['plate'] = K.principled('plate_white', (.86, .86, .84), rough=.45)
    M['eu'] = K.principled('plate_eu', K.lin(0x003399), rough=.45)
    M['m_light'] = K.principled('m_lightblue', K.lin(0x43b7e9), rough=.3, coat=1)
    M['m_dark'] = K.principled('m_darkblue', K.lin(0x142760), rough=.3, coat=1)
    M['m_red'] = K.principled('m_red', K.lin(0xe82c39), rough=.3, coat=1)
    M['decal_white'] = K.principled('decal_white', (.9, .9, .88), rough=.35, coat=1)
    M['decal_black'] = K.principled('decal_black', (.012, .012, .014), rough=.35, coat=1)
    M['seat'] = K.principled('seat_fabric', (.02, .02, .022), rough=.95)
    M['seat_accent'] = K.principled('seat_red', K.lin(0xb3122a), rough=.85)
    M['cage'] = K.principled('cage_white', (.85, .85, .83), rough=.3, coat=.6)
    M['dash'] = K.principled('dash', (.018, .018, .02), rough=.6)
    return M


def half(hw, zb, belt, kind, top=None, roof=None, rw=None, flare=0.):
    f = flare
    side = [(0, zb), (hw - .10 + f * .6, zb), (hw - .012 + f, zb + .055), (hw + f, zb + (belt - zb) * .40),
            (hw - .002 + f * .85, belt - .06), (hw - .016 + f * .35, belt)]
    if kind == 'deck':
        side += [(hw - .075, belt + .01), (hw * .64, top - .004), (hw * .3, top), (0, top + .001)]
    elif kind == 'cowl':
        side += [(hw - .07, belt + .015), (hw - .098, belt + .03), (hw * .42, top + .008), (0, top + .01)]
    else:
        side += [(hw - .072, belt + .02), (rw + .03, roof - .06), (rw - .018, roof - .008), (0, roof)]
    return side


COWL, ROOF_F, B_LINE, ROOF_R, C_SLOPE, DECK = 7, 8, 10, 11, 12, 13


def stations():
    S = []
    add = lambda y, *a, **k: S.append((y, half(*a, **k)))
    add(-2.175, .74, .31, .70, 'deck', top=.718)
    add(-2.165, .765, .29, .712, 'deck', top=.73)
    add(-2.13, .79, .255, .73, 'deck', top=.752)
    add(-2.00, .80, .23, .76, 'deck', top=.782, flare=.02)
    add(-1.70, .80, .22, .79, 'deck', top=.814, flare=.065)
    add(-1.31, .80, .22, .815, 'deck', top=.842, flare=.085)
    add(-.95, .80, .22, .835, 'deck', top=.862, flare=.06)
    add(-.76, .80, .22, .846, 'cowl', top=.872, flare=.0)         # 7 windscreen base
    add(-.30, .80, .22, .862, 'cabin', roof=1.345, rw=.655)        # 8 roof front
    add(.18, .80, .22, .87, 'cabin', roof=1.37, rw=.665)
    add(.50, .80, .22, .872, 'cabin', roof=1.368, rw=.665)         # 10 B line
    add(.68, .80, .22, .874, 'cabin', roof=1.352, rw=.66, flare=.02)   # 11 roof rear
    add(1.00, .80, .22, .878, 'cabin', roof=1.17, rw=.635, flare=.055)  # 12 C slope
    add(1.25, .80, .22, .882, 'cowl', top=.912, flare=.085)          # 13 boot start
    add(1.58, .80, .22, .878, 'deck', top=.91, flare=.07)
    add(1.92, .797, .23, .858, 'deck', top=.892, flare=.03)
    add(2.08, .79, .25, .83, 'deck', top=.866)
    add(2.155, .772, .28, .80, 'deck', top=.84)
    add(2.172, .748, .30, .778, 'deck', top=.818)
    return S


def body(M, col):
    mats = [M['paint'], M['under'], M['chrome'], M['rubber'], M['glass']]
    PAINT, UNDER, TRIM, RUBBER, GLASS = range(5)
    S = stations()
    bm, info, rows = K.loft(S)
    last = len(S) - 1
    K.crease(bm, rows, .8, ring=0)
    K.crease(bm, rows, .8, ring=last)
    K.crease(bm, rows, .75, line=5)        # sharp E30 shoulder
    K.crease(bm, rows, .45, line=3)        # flare belly line
    K.crease(bm, rows, .35, line=2)
    K.crease(bm, rows, .55, line=6, span=(0, COWL))
    K.crease(bm, rows, .55, line=6, span=(DECK, last))
    K.crease(bm, rows, .45, line=8, span=(ROOF_F, ROOF_R))
    for f, (i, j, s) in info.items():
        f.material_index = UNDER if j == 0 else PAINT
    sel = lambda pred: [f for f, (i, j, s) in info.items() if pred(i, j, s)]
    # E30 window surrounds are black, not chrome
    K.window(bm, sel(lambda i, j, s: i == COWL and j in (7, 8)), RUBBER, RUBBER, GLASS)
    K.window(bm, sel(lambda i, j, s: i in (ROOF_R, C_SLOPE) and j in (7, 8)), RUBBER, RUBBER, GLASS)
    K.window(bm, sel(lambda i, j, s: i in (COWL, ROOF_F, ROOF_F + 1) and j == 6), RUBBER, RUBBER, GLASS, trim=.012, rubber=.012)
    K.window(bm, sel(lambda i, j, s: i in (B_LINE, ROOF_R, C_SLOPE) and j == 6), RUBBER, RUBBER, GLASS, trim=.012, rubber=.01)
    K.crease_material_borders(bm, .95)
    ob = K.mesh_from_bm('e30.body', bm, mats, col, smooth=True, sharp=None)
    sub = ob.modifiers.new('sub', 'SUBSURF')
    sub.levels = sub.render_levels = 3
    ob = K.bake(ob)
    cut = []
    R, (fy, ry), ar = SPEC['R'], SPEC['axles'], SPEC['arch']
    for y in (fy, ry):
        for sx in (1, -1):
            cut.append(K.cylinder('arch', ar, .34, (sx * .76, y, R + .01), M['well'], rot=(0, radians(90), 0), segs=96))
    g = .0042
    for sx in (1, -1):
        for y in (-.735, .53):
            cut.append(K.box('gap', (.24, g, .66), (sx * .84, y, .555), M['gap'], bevel=0))
        cut.append(K.box('gap', (.24, 1.26, g), (sx * .84, -.10, .262), M['gap'], bevel=0))
        cut.append(K.box('gap', (g, 1.38, .16), (sx * .728, -1.47, .84), M['gap'], bevel=0))
        cut.append(K.box('gap', (g, .84, .16), (sx * .72, 1.72, .90), M['gap'], bevel=0))
    cut.append(K.box('gap', (1.46, g, .14), (0, -.80, .91), M['gap'], bevel=0))
    cut.append(K.box('gap', (1.44, g, .14), (0, 1.30, .95), M['gap'], bevel=0))
    cut.append(K.box('gap', (1.46, g, .12), (0, -2.10, .79), M['gap'], bevel=0))
    ob = K.boolean(ob, cut)
    K.shade(ob, True, 30)
    return ob


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
    for p in ob.data.polygons:
        if p.normal.z < 0:
            ob.data.flip_normals()
            break
    return ob


def side_decal(B, name, text, size, y, z, sx, mat, col, plate=None, plate_mat=None):
    p, n = K.surface(B, (sx * 3, y, z), (-sx, 0, 0))
    rot = (radians(90), 0, radians(90 if sx > 0 else -90))
    if plate:
        d = K.cylinder(name + '_disc', plate, .002, (p.x + sx * .0015, p.y, p.z), plate_mat, col, rot=(0, radians(90), 0), segs=64)
    t = K.text_mesh(name, text, size, mat, col, font=FONT, extrude=.0006)
    t.location = (p.x + sx * .003, p.y, p.z)
    t.rotation_euler = rot
    return t


def details(B, M, col):
    S = K.surface
    # ---- front: black grille band, four round lamps, kidneys, M3 bumper with splitter
    yf = S(B, (0, -3, .60), (0, 1, 0))[0].y
    K.box('e30.front_band', (1.50, .03, .19), (0, yf + .006, .615), M['gloss_black'], col, bevel=.01)
    for k in range(5):
        K.box(f'e30.band_slat{k}', (1.10, .008, .006), (0, yf - .010, .55 + k * .03), M['black'], col, bevel=.002)
    for sx in (1, -1):
        for hx, r in ((.60, .085), (.405, .074)):
            y0 = S(B, (sx * hx, -3, .615), (0, 1, 0))[0].y
            lamp = K.empty(f'e30.lamp{sx}{hx}', (sx * hx, y0 - .032, .615), col)
            K.lathe('bezel', [(-.022, r + .01), (.004, r + .012), (.01, r + .006), (.004, r - .004), (-.012, r - .004)], M['chrome'], col, lamp, segs=64, closed=True)
            K.lathe('reflector', [(.0, r - .005), (.012, r * .7), (.02, r * .35), (.024, .0001)], M['reflector'], col, lamp, segs=48)
            K.lathe('lens', [(.002, .0001), (.0035, r * .5), (.004, r * .85), (.002, r - .004)], M['lens'], col, lamp, segs=64)
            lamp.rotation_euler = (0, 0, radians(90))
        # kidney
        kx = sx * .068
        K.box(f'e30.kidney_frame{sx}', (.115, .03, .185), (kx, yf - .018, .625), M['chrome'], col, bevel=.03, segs=5)
        K.box(f'e30.kidney{sx}', (.095, .032, .165), (kx, yf - .022, .625), M['gloss_black'], col, bevel=.026, segs=5)
        for k in range(6):
            K.box(f'e30.kidney_bar{sx}{k}', (.006, .01, .15), (kx - .036 + k * .0145, yf - .036, .625), M['chrome'], col, bevel=.002)
    # body-colour bumper with black rub strip and fog lamps
    def contour(z, off, front=True, side_ys=(1.86, 2.0), xs=(-.62, -.3, 0, .3, .62), side_off=None):
        sy = -1 if front else 1
        so = off if side_off is None else side_off
        pts = [S(B, (-3, sy * y, z), (1, 0, 0), so)[0] for y in side_ys]
        pts.append(S(B, (-2.2, sy * 3.0, z), (1, -sy * 1.1, 0), off)[0])
        pts += [S(B, (x, sy * 3, z), (0, -sy, 0), off)[0] for x in xs]
        pts.append(S(B, (2.2, sy * 3.0, z), (-1, -sy * 1.1, 0), off)[0])
        pts += [S(B, (3, sy * y, z), (-1, 0, 0), so)[0] for y in reversed(side_ys)]
        return pts if front else list(reversed(pts))
    body_bumper = [(-.03, .11), (.035, .11), (.05, .09), (.055, -.02), (.045, -.1), (.02, -.13), (-.03, -.13)]
    K.sweep('e30.bumper_front', contour(.42, .0, True, side_ys=(1.92, 2.05), side_off=-.03), body_bumper, M['paint'], col, taper=14)
    K.sweep('e30.bumper_front_strip', contour(.455, .055, True, side_ys=(1.98, 2.07), side_off=.0), K.rounded_rect(.016, .03, .006), M['black'], col)
    K.sweep('e30.splitter', contour(.27, .03, True, side_ys=(1.84, 1.98)), [(-.04, .008), (.06, .008), (.07, 0), (.06, -.008), (-.04, -.008)], M['black'], col)
    for sx in (1, -1):
        p = S(B, (sx * .5, -3, .35), (0, 1, 0))[0]
        K.box(f'e30.fog{sx}', (.16, .03, .055), (sx * .5, p.y - .05, .35), M['black'], col, bevel=.012)
        K.box(f'e30.fog_lens{sx}', (.13, .01, .04), (sx * .5, p.y - .066, .35), M['lens'], col, bevel=.008)
        K.box(f'e30.indicator{sx}', (.12, .02, .035), (sx * .64, p.y - .05, .46), M['amber_lens'], col, bevel=.008)
        K.box(f'e30.brake_duct{sx}', (.14, .03, .06), (sx * .25, p.y - .05, .33), M['black'], col, bevel=.01)
    # ---- rear: lamps, black panel, bumper, wing, exhaust
    yr = S(B, (0, 3, .66), (0, -1, 0))[0].y
    K.box('e30.rear_panel', (1.0, .02, .13), (0, yr - .002, .67), M['black'], col, bevel=.006)
    for sx in (1, -1):
        cx = sx * .56
        K.box(f'e30.tail_frame{sx}', (.40, .022, .18), (cx, yr + .002, .67), M['black'], col, bevel=.01)
        K.box(f'e30.tail_red{sx}', (.20, .02, .155), (cx + sx * .08, yr + .01, .67), M['red_lens'], col, bevel=.008)
        K.box(f'e30.tail_amber{sx}', (.09, .02, .155), (cx - sx * .07, yr + .01, .67), M['amber_lens'], col, bevel=.008)
        K.box(f'e30.tail_rev{sx}', (.06, .021, .155), (cx - sx * .15, yr + .011, .67), M['white_lens'], col, bevel=.008)
    K.sweep('e30.bumper_rear', contour(.42, .0, False, side_ys=(1.92, 2.05), side_off=-.03), body_bumper, M['paint'], col, taper=14)
    K.sweep('e30.bumper_rear_strip', contour(.455, .055, False, side_ys=(1.96, 2.06), side_off=.0), K.rounded_rect(.016, .03, .006), M['black'], col)
    K.plate('e30.plate_rear', 'AC BR 87', M, col, (0, yr + .02, .57), 'rear', w=.40, h=.09)
    pf = S(B, (0, -3, .40), (0, 1, 0))[0]
    K.plate('e30.plate_front', 'AC BR 87', M, col, (0, pf.y - .058, .40), 'front', w=.40, h=.09)
    for dx in (0, -.075):
        K.cylinder(f'e30.exhaust{dx}', .03, .2, (-.48 + dx, 2.14, .25), M['chrome'], col, rot=(radians(90), 0, 0), segs=24)
        K.cylinder(f'e30.exhaust_in{dx}', .024, .202, (-.48 + dx, 2.14, .25), M['black'], col, rot=(radians(90), 0, 0), segs=24)
    # bridge wing on the boot lid
    zt = S(B, (0, 1.95, 3), (0, 0, -1))[0].z
    wing = [(.11, .0), (.06, .022), (-.04, .03), (-.11, .012), (-.115, .0), (-.04, .006), (.06, -.004)]
    K.sweep('e30.wing', [(-.70, 1.98, zt + .17), (0, 1.98, zt + .17), (.70, 1.98, zt + .17)], wing, M['paint'], col, smooth_steps=2)
    for sx in (1, -1):
        p = S(B, (sx * .48, 1.98, 3), (0, 0, -1))[0]
        K.box(f'e30.wing_post{sx}', (.03, .12, p.z and (zt + .17 - p.z)), (sx * .48, 1.99, (zt + .17 + p.z) / 2), M['black'], col, bevel=.008)
        K.box(f'e30.wing_plate{sx}', (.008, .26, .1), (sx * .705, 1.98, zt + .18), M['black'], col, bevel=.003)
    K.box('e30.boot_lip', (1.36, .06, .018), (0, 2.12, S(B, (0, 2.1, 3), (0, 0, -1))[0].z + .01), M['black'], col, bevel=.006)
    # ---- sides: skirts, handles, aero mirrors, fuel flap, aerial, wipers
    for sx in (1, -1):
        pts = [S(B, (sx * 3, y, .29), (-sx, 0, 0), .008)[0] for y in [-.88 + k * .1 for k in range(16)]]
        if sx < 0:
            pts.reverse()
        K.sweep(f'e30.skirt{sx}', pts, [(-.01, .04), (.02, .04), (.03, .0), (.02, -.05), (-.01, -.05)], M['paint'], col)
        p, n = S(B, (sx * 3, .32, .80), (-sx, 0, 0))
        K.box(f'e30.handle{sx}', (.02, .13, .026), (p.x + sx * .007, p.y, p.z), M['black'], col, bevel=.007)
        p, n = S(B, (sx * 3, -.62, .885), (-sx, 0, 0))
        m = K.empty(f'e30.mirror{sx}', (p.x, p.y, p.z), col)
        K.box('base', (.05, .08, .05), (sx * .02, 0, .0), M['black'], col, m, bevel=.01)
        K.sphere('shell', .07, (sx * .1, .02, .07), M['paint'], col, m, scale=(1, .55, .6))
        K.box('glass', (.11, .004, .06), (sx * .1, .055, .07), M['reflector'], col, m, bevel=.01)
        side_decal(B, f'e30.number{sx}', '27', .22, -.12, .60, sx, M['decal_black'], col, plate=.17, plate_mat=M['decal_white'])
        side_decal(B, f'e30.breuer{sx}', 'FAHRZEUGTECHNIK BREUER', .055, -.12, .36, sx, M['decal_black'], col)
        # tri-colour M stripes low on the flanks
        for k, mk in enumerate(('m_light', 'm_dark', 'm_red')):
            z = .47 - k * .032
            pts = [S(B, (sx * 3, y, z), (-sx, 0, 0), .0012)[0] for y in [-.82 + j * .08 for j in range(17)]]
            if sx < 0:
                pts.reverse()
            K.sweep(f'e30.stripe{sx}{k}', pts, [(0, .013), (.0015, .013), (.0015, -.013), (0, -.013)], M[mk], col, smooth_steps=3)
    p, n = S(B, (-3, 1.5, .80), (1, 0, 0))
    K.cylinder('e30.fuel_flap', .05, .006, (p.x - .001, p.y, p.z), M['paint'], col, rot=(0, radians(90), 0), segs=32, bevel=.002)
    p = S(B, (.6, 1.75, 3), (0, 0, -1))[0]
    K.tube('e30.aerial', [(p.x, p.y, p.z), (p.x, p.y + .2, p.z + .6)], .0035, M['black'], col)
    for sx in (.32, -.18):
        p = S(B, (sx, -.82, 3), (0, 0, -1))[0]
        K.tube(f'e30.wiper{sx}', [(p.x - .26, p.y + .05, p.z + .012), (p.x + .18, p.y + .02, p.z + .012)], .006, M['black'], col)
    # roof/bonnet/boot M stripes, offset to the driver side like a works car
    for k, mk in enumerate(('m_light', 'm_dark', 'm_red')):
        x0 = .16 + k * .07
        surface_strip(B, f'e30.bonnet_stripe{k}', x0, x0 + .06, [-2.10 + j * .05 for j in range(26)], M[mk], col)
        surface_strip(B, f'e30.roof_stripe{k}', x0, x0 + .06, [-.22 + j * .05 for j in range(17)], M[mk], col)
        surface_strip(B, f'e30.boot_stripe{k}', x0, x0 + .06, [1.33 + j * .05 for j in range(14)], M[mk], col)
    # ---- interior
    K.box('e30.dash', (1.44, .28, .18), (0, -.60, .76), M['dash'], col, bevel=.03)
    K.box('e30.binnacle', (.36, .16, .08), (.36, -.50, .88), M['dash'], col, bevel=.03)
    wheel = K.empty('e30.steering', (.36, -.38, .83), col)
    K.tube('steer_ring', [(.175 * cos(a), .175 * sin(a), 0) for a in [2 * pi * s / 40 for s in range(41)]], .017, M['dash'], col, wheel)
    for a in (0, pi, -pi / 2):
        K.tube('spoke', [(0, 0, 0), (.16 * cos(a), .16 * sin(a), 0)], .014, M['dash'], col, wheel)
    K.cylinder('boss', .045, .05, (0, 0, -.02), M['seat_accent'], col, wheel, segs=24)
    wheel.rotation_euler = (radians(-64), 0, 0)
    for sx in (1, -1):
        x = sx * .35
        K.box(f'e30.seat_base{sx}', (.46, .48, .14), (x, .02, .37), M['seat'], col, bevel=.05)
        K.box(f'e30.seat_back{sx}', (.46, .12, .66), (x, .29, .69), M['seat'], col, rot=(radians(-12), 0, 0), bevel=.05)
        K.box(f'e30.seat_stripe{sx}', (.12, .125, .6), (x, .285, .695), M['seat_accent'], col, rot=(radians(-12), 0, 0), bevel=.02)
        for bx in (.21, -.21):
            K.box(f'e30.seat_bolster{sx}{bx}', (.06, .16, .58), (x + bx, .27, .65), M['seat'], col, rot=(radians(-12), 0, 0), bevel=.025)
    K.box('e30.tunnel', (.24, 1.3, .12), (0, -.15, .32), M['dash'], col, bevel=.04)
    K.tube('e30.shifter', [(0, -.25, .38), (0, -.21, .60)], .008, M['chrome'], col)
    K.sphere('e30.shift_knob', .028, (0, -.21, .61), M['dash'], col)
    y = .62
    hoop = [(.62, y, .26), (.62, y, 1.12), (.54, y, 1.26), (.30, y, 1.31), (-.30, y, 1.31), (-.54, y, 1.26), (-.62, y, 1.12), (-.62, y, .26)]
    K.tube('e30.cage_hoop', K.catmull(hoop, 5), .021, M['cage'], col)
    K.tube('e30.cage_diag', [(.62, y, .32), (-.44, y, 1.29)], .018, M['cage'], col)
    for sx in (1, -1):
        K.tube(f'e30.cage_stay{sx}', [(sx * .56, y, 1.22), (sx * .58, 1.35, .70)], .018, M['cage'], col)
        K.tube(f'e30.cage_a{sx}', K.catmull([(sx * .60, y, 1.2), (sx * .62, -.1, 1.30), (sx * .66, -.55, 1.06), (sx * .68, -.68, .76)], 6), .018, M['cage'], col)


def build():
    K.reset_scene()
    col = K.collection('e30')
    M = materials()
    B = body(M, col)
    details(B, M, col)
    wm = dict(rubber=M['tyre'], rubber_side=M['tyre_side'], rim=M['rim'], lip=M['chrome'], chrome=M['chrome'],
              brake=M['brake'], brake_hat=M['brake_hat'], caliper=M['caliper'])
    proto = K.wheel('e30.wheel', SPEC['R'], SPEC['W'], SPEC['rim'], wm, col, style='bbs', spokes=10)
    fy, ry = SPEC['axles']
    tx = SPEC['track'] / 2
    K.place_wheels(proto, [(tx, fy, SPEC['R']), (-tx, fy, SPEC['R']), (tx, ry, SPEC['R']), (-tx, ry, SPEC['R'])], col)
    return col


build()
