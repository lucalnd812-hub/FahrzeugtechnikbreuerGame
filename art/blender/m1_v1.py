"""BMW M1 Procar (white, motorsport stripes, gold wheels) — detailed Blender model.
Run inside Blender: exec(open(r'<repo>/art/blender/m1.py').read())"""
import sys, os, importlib
from math import radians, pi
HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else r'.'
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import carkit as K
importlib.reload(K)
import carparts as P
importlib.reload(P)
import bpy
from mathutils import Vector

SPEC = dict(id='m1', R=.341, W=.30, rim=.205, axles=(-1.315, 1.245), track=1.64, arch=.378, paint=0xf2f0e9)
LOGO = os.path.join(HERE, '..', '..', 'assets', 'breuer-logo.png')
COWL, ROOF_F, B_LINE, ROOF_R, DECK = 7, 8, 10, 11, 12


def stations():
    S = []
    add = lambda y, *a, **k: S.append((y, P.half_section(*a, **k)))
    add(-2.18, .79, .27, .45, 'deck', top=.47)
    add(-2.17, .82, .25, .475, 'deck', top=.495)
    add(-2.12, .84, .225, .50, 'deck', top=.52, flare=.01)
    # raised front wings over the wheels, bonnet centre stays low (dip)
    add(-1.95, .84, .19, .62, 'deck', top=.64, flare=.08, dip=.075)
    add(-1.62, .84, .18, .705, 'deck', top=.725, flare=.125, dip=.125)
    add(-1.31, .84, .18, .735, 'deck', top=.755, flare=.13, dip=.13)
    add(-1.00, .84, .18, .725, 'deck', top=.745, flare=.09, dip=.09)
    add(-.74, .84, .18, .70, 'cowl', top=.70, flare=.02, dip=.01)            # 7 windscreen base
    add(-.05, .84, .18, .755, 'cabin', roof=1.115, rw=.60, flare=.0)        # 8 roof front
    add(.30, .84, .18, .80, 'cabin', roof=1.13, rw=.61)
    add(.52, .84, .18, .82, 'cabin', roof=1.135, rw=.61, flare=.03)         # 10 window end
    add(.70, .84, .18, .83, 'cabin', roof=1.13, rw=.60, flare=.07)          # 11 roof rear
    add(1.10, .84, .18, .84, 'cowl', top=.855, flare=.12)                   # 12 engine cover
    add(1.40, .84, .19, .84, 'deck', top=.848, flare=.13)
    add(1.75, .84, .20, .825, 'deck', top=.832, flare=.12)
    add(2.00, .84, .22, .80, 'deck', top=.808, flare=.08)
    add(2.15, .82, .26, .775, 'deck', top=.785, flare=.03)
    add(2.18, .80, .28, .755, 'deck', top=.765)
    return S


def body(M, col):
    S = stations()
    last = len(S) - 1
    windows = [
        (lambda i, j, s: i == COWL and j in (7, 8), 'rubber', 'rubber', 'glass', .012, .012),
        (lambda i, j, s: i in (COWL, ROOF_F, ROOF_F + 1) and j == 6, 'rubber', 'rubber', 'glass', .012, .012),
        (lambda i, j, s: i in (B_LINE, ROOF_R) and j == 6, 'rubber', 'black', 'black', .01, .01),
        (lambda i, j, s: i == ROOF_R and j in (7, 8), 'rubber', 'black', 'black', .012, .01),
    ]
    creases = [(.8, dict(ring=0)), (.8, dict(ring=last)), (.72, dict(line=5)), (.45, dict(line=3)),
               (.35, dict(line=2)), (.5, dict(line=6, span=(0, COWL))), (.5, dict(line=6, span=(DECK, last))),
               (.4, dict(line=8, span=(ROOF_F, ROOF_R)))]
    g = .0042
    gaps = []
    for sx in (1, -1):
        gaps += [((.26, g, .62), (sx * .92, -.70, .50)), ((.26, g, .62), (sx * .92, .50, .53)),
                 ((.26, 1.20, g), (sx * .92, -.10, .245)),
                 ((g, 1.30, .16), (sx * .72, -1.45, .64)), ((g, .98, .16), (sx * .70, 1.62, .86)),
                 ((g, .34, .14), (sx * .36, -1.80, .58)), ((g, .34, .14), (sx * .70, -1.80, .58)),
                 ((.34, g, .14), (sx * .53, -1.97, .55)), ((.34, g, .14), (sx * .53, -1.63, .60))]
    gaps += [((1.44, g, .14), (0, -.80, .70)), ((1.40, g, .14), (0, 1.12, .88))]
    return P.body_from_stations('m1', S, M, col, SPEC, windows, creases, gaps, arch_x=SPEC['track'] / 2)


def details(B, M, col):
    S = K.surface
    # ---- nose: tiny kidneys, spoiler with driving lamps, indicators
    yf = S(B, (0, -3, .40), (0, 1, 0))[0].y
    for sx in (1, -1):
        kx = sx * .07
        K.box(f'm1.kidney_frame{sx}', (.12, .03, .085), (kx, yf - .005, .41), M['chrome'], col, bevel=.025, segs=5)
        K.box(f'm1.kidney{sx}', (.10, .032, .068), (kx, yf - .009, .41), M['gloss_black'], col, bevel=.02, segs=5)
        for k in range(6):
            K.box(f'm1.kidney_bar{sx}{k}', (.006, .01, .06), (kx - .037 + k * .015, yf - .02, .41), M['chrome'], col, bevel=.002)
        p = S(B, (sx * .55, -3, .33), (0, 1, 0))[0]
        K.box(f'm1.drive_lamp_frame{sx}', (.26, .03, .085), (sx * .55, p.y - .006, .33), M['black'], col, bevel=.012)
        K.box(f'm1.drive_lamp{sx}', (.22, .012, .06), (sx * .55, p.y - .02, .33), M['lens'], col, bevel=.01)
        K.box(f'm1.drive_refl{sx}', (.21, .01, .055), (sx * .55, p.y - .012, .33), M['reflector'], col, bevel=.01)
        K.box(f'm1.indicator{sx}', (.09, .02, .03), (sx * .79, p.y + .01, .40), M['amber_lens'], col, bevel=.008)
    K.sweep('m1.splitter', P.contour(B, .225, .025, True, side_ys=(1.82, 1.96)),
            [(-.05, .01), (.07, .01), (.085, 0), (.07, -.012), (-.05, -.012)], M['black'], col, taper=10)
    K.sweep('m1.nose_strip', P.contour(B, .27, .0, True, side_ys=(1.9, 2.02), side_off=-.02),
            [(-.02, .03), (.02, .03), (.028, 0), (.02, -.03), (-.02, -.03)], M['black'], col, taper=12)
    # ---- engine cover louvres and rear deck
    for k in range(9):
        y = 1.18 + k * .085
        p, n = S(B, (0, y, 3), (0, 0, -1))
        K.box(f'm1.louvre{k}', (1.02, .05, .014), (0, y, p.z + .01), M['black'], col, rot=(radians(-8), 0, 0), bevel=.004)
    yr = S(B, (0, 3, .55), (0, -1, 0))[0].y
    K.box('m1.tail_panel', (1.60, .03, .26), (0, yr + .004, .55), M['black'], col, bevel=.01)
    for k in range(7):
        K.box(f'm1.tail_slat{k}', (.86, .012, .01), (0, yr + .02, .45 + k * .032), M['rubber'], col, bevel=.003)
    for sx in (1, -1):
        cx = sx * .64
        K.box(f'm1.tail_red{sx}', (.26, .02, .13), (cx, yr + .022, .58), M['red_lens'], col, bevel=.01)
        K.box(f'm1.tail_amber{sx}', (.26, .02, .055), (cx, yr + .022, .47), M['amber_lens'], col, bevel=.008)
    for sx in (1, -1):
        K.cylinder(f'm1.exhaust{sx}', .036, .18, (sx * .16, yr + .03, .30), M['chrome'], col, rot=(radians(90), 0, 0), segs=24)
        K.cylinder(f'm1.exhaust_in{sx}', .03, .182, (sx * .16, yr + .03, .30), M['black'], col, rot=(radians(90), 0, 0), segs=24)
    K.box('m1.diffuser', (1.3, .30, .03), (0, 1.98, .21), M['black'], col, rot=(radians(-10), 0, 0), bevel=.008)
    # ---- big Procar wing
    zt = S(B, (0, 1.98, 3), (0, 0, -1))[0].z
    wz = zt + .30
    wing = [(.16, .0), (.09, .03), (-.05, .04), (-.16, .016), (-.165, .0), (-.06, .008), (.08, -.006)]
    K.sweep('m1.wing', [(-.92, 2.02, wz), (0, 2.02, wz), (.92, 2.02, wz)], wing, M['paint'], col, smooth_steps=2)
    for sx in (1, -1):
        p = S(B, (sx * .55, 1.95, 3), (0, 0, -1))[0]
        K.box(f'm1.wing_post{sx}', (.03, .16, wz - p.z), (sx * .55, 1.97, (wz + p.z) / 2), M['black'], col, bevel=.008)
        K.box(f'm1.wing_plate{sx}', (.01, .40, .16), (sx * .925, 2.02, wz + .01), M['black'], col, bevel=.004)
        P.logo_decal(f'm1.wing_logo{sx}', LOGO, .30, (sx * .932, 2.02, wz + .01), (radians(90), 0, radians(90 if sx > 0 else -90)), col)
    # ---- sides: mirrors, number, lettering, stripes, side intake grilles
    for sx in (1, -1):
        p, n = S(B, (sx * 3, -.50, .72), (-sx, 0, 0))
        m = K.empty(f'm1.mirror{sx}', (p.x, p.y, p.z), col)
        K.box('base', (.06, .07, .04), (sx * .02, 0, 0), M['black'], col, m, bevel=.01)
        K.sphere('shell', .065, (sx * .09, .02, .06), M['paint'], col, m, scale=(1, .55, .6))
        K.box('glass', (.1, .004, .055), (sx * .09, .055, .06), M['reflector'], col, m, bevel=.01)
        P.side_decal(B, f'm1.number{sx}', '12', .24, -.15, .50, sx, M['decal_black'], col, plate=.17, plate_mat=M['decal_white'])
        P.side_decal(B, f'm1.breuer{sx}', 'FAHRZEUGTECHNIK BREUER', .05, -.15, .27, sx, M['decal_black'], col)
        p, n = S(B, (sx * 3, 1.25, .55), (-sx, 0, 0))
        K.box(f'm1.intake{sx}', (.03, .34, .16), (p.x - sx * .005, p.y, p.z), M['black'], col, bevel=.02)
        for k in range(4):
            K.box(f'm1.intake_bar{sx}{k}', (.035, .32, .008), (p.x, p.y, p.z - .055 + k * .036), M['rubber'], col, bevel=.002)
    P.side_stripes(B, 'm1', M, col, -1.88, 2.0, .40, gap=.034, width=.028)
    for k, mk in enumerate(('m_light', 'm_dark', 'm_red')):
        x0 = -.24 + k * .08
        P.surface_strip(B, f'm1.bonnet_stripe{k}', x0, x0 + .07, [-2.14 + j * .05 for j in range(28)], M[mk], col)
        P.surface_strip(B, f'm1.roof_stripe{k}', x0, x0 + .07, [.0 + j * .05 for j in range(13)], M[mk], col)
    # sun strip with the Breuer logo across the top of the windscreen
    ys = [-.30 + j * .03 for j in range(6)]
    P.surface_strip(B, 'm1.sunstrip', -.66, .66, ys, M['black'], col, lift=.003, cols=9)
    c, n = S(B, (0, -.225, 3), (0, 0, -1))
    rot = n.to_track_quat('Z', 'Y').to_euler()
    P.logo_decal('m1.sunstrip_logo', LOGO, .34, c + n * .005, rot, col)
    # ---- interior and wheels
    P.interior('m1', M, col, dash_y=-.50, seat_y=.10, floor_z=.20, roof_z=1.13, half_w=.74, cage_y=.48, a_pillar_y=-.66, cowl_z=.70)


def build():
    K.reset_scene()
    col = K.collection('m1')
    M = P.base_materials('m1', SPEC['paint'], rim=(.78, .56, .2), rim_rough=.24)
    B = body(M, col)
    details(B, M, col)
    P.finish_wheels('m1', SPEC, M, col, 'bbs', 12)
    return col


build()
