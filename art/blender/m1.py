"""BMW M1 Procar (white, motorsport stripes, gold wheels) — v2, curve-defined
body built against reference photos (Wikimedia Commons). No manufacturer logos.
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
import carbody as CB
importlib.reload(CB)
import bpy
from mathutils import Vector

C = CB.Curve
LOGO = os.path.join(HERE, '..', '..', 'assets', 'breuer-logo.png')
D = dict(
    id='m1', y0=-2.18, y1=2.18, R=.341, W=.30, rim=.205, axles=(-1.315, 1.245), track=1.64, arch=.362, arch_z=.0,
    top=C([(-2.18, .42), (-2.165, .50), (-2.12, .545), (-1.95, .59), (-1.60, .64), (-1.30, .675), (-1.00, .70), (-.78, .72),
           (-.50, .92), (-.20, 1.075), (-.02, 1.118), (.30, 1.138), (.62, 1.128), (.90, 1.0), (1.10, .905), (1.50, .88),
           (1.90, .86), (2.10, .83), (2.18, .76)]),
    belt=C([(-2.18, .42), (-2.12, .56), (-1.95, .625), (-1.60, .675), (-1.30, .705), (-1.00, .715), (-.60, .735), (0, .77),
            (.60, .82), (1.10, .85), (1.60, .862), (2.00, .842), (2.18, .78)]),
    sill=C([(-2.18, .30), (-2.10, .20), (-1.9, .17), (-1.0, .16), (1.0, .16), (1.9, .17), (2.15, .22), (2.18, .30)]),
    hw=C([(-2.18, .70), (-2.10, .80), (-1.9, .86), (-1.3, .88), (-.8, .86), (0, .86), (.8, .88), (1.3, .90), (1.9, .88), (2.18, .82)]),
    shoulder=C([(-2.3, .06), (-.8, .08), (0, .20), (.6, .24), (1.2, .10), (2.3, .06)]),
    rw=C([(-2.3, .50), (-.8, .56), (0, .58), (.6, .57), (1.0, .52), (2.3, .50)]),
    dip=C([(-2.3, .01), (-1.6, .03), (-1.3, .035), (-.9, .0), (2.3, .0)]),
    shoulder_crease=.7, char_crease=.45,
)
GLASS = dict(cowl=-.78, roof_f=-.02, b=.55, side_end=1.05, roof_r=.62, deck=1.10, quarter='black')


def sculpt(ob):
    CB.bulge(ob, -1.315, .34, .37, .72, .075, .6, top_fade=(.74, .86))
    CB.bulge(ob, 1.245, .34, .37, .80, .085, .6, top_fade=(.90, 1.0))


def body(M, col):
    g = .0042
    gaps = []
    for sx in (1, -1):
        gaps += [((.26, g, .62), (sx * .96, -.74, .48)), ((.26, g, .62), (sx * .96, .56, .52)),
                 ((.26, 1.26, g), (sx * .96, -.10, .225)),
                 ((g, 1.30, .16), (sx * .70, -1.45, .68)), ((g, .98, .16), (sx * .68, 1.62, .88)),
                 # kidneys and driving lamps in the nose (pockets)
                 ((.11, .16, .07), (sx * .07, -2.22, .43), .02), ((.25, .16, .075), (sx * .55, -2.18, .33), .02)]
    gaps += [((1.44, g, .14), (0, -.82, .72)), ((1.40, g, .14), (0, 1.12, .90))]
    return CB.build_body('m1', D, M | {'trim': M['rubber']}, col, GLASS, gaps, sculpt=sculpt, black_rear=True)


def details(B, M, col):
    S = K.surface
    # ---- nose: kidney bars and driving lamps inside their pockets
    for sx in (1, -1):
        kx = sx * .07
        y = S(B, (kx, -3, .43), (0, 1, 0))[0].y
        for k in range(6):
            K.box(f'm1.kidney_bar{sx}{k}', (.006, .02, .06), (kx - .037 + k * .015, y - .012, .43), M['chrome'], col, bevel=.002)
        p = S(B, (sx * .55, -3, .33), (0, 1, 0))[0]
        K.box(f'm1.drive_refl{sx}', (.22, .01, .06), (sx * .55, p.y - .004, .33), M['reflector'], col, bevel=.012)
        K.box(f'm1.drive_lamp{sx}', (.23, .006, .065), (sx * .55, p.y - .016, .33), M['lens'], col, bevel=.012)
        q = S(B, (sx * .78, -3, .40), (0, 1, 0))[0]
        K.box(f'm1.indicator{sx}', (.09, .02, .03), (sx * .78, q.y + .008, .40), M['amber_lens'], col, bevel=.008)
    K.sweep('m1.splitter', P.contour(B, .215, .025, True, side_ys=(1.84, 1.98)),
            [(-.05, .01), (.08, .01), (.095, 0), (.08, -.012), (-.05, -.012)], M['black'], col, taper=10)
    # ---- engine cover louvres, black tail with lamps, pipes, diffuser
    for k in range(10):
        y = 1.18 + k * .075
        p, n = S(B, (0, y, 3), (0, 0, -1))
        K.box(f'm1.louvre{k}', (1.0, .045, .012), (0, y, p.z + .008), M['black'], col, rot=(radians(-8), 0, 0), bevel=.004)
    yr = S(B, (0, 3, .58), (0, -1, 0))[0].y
    K.box('m1.tail_panel', (1.62, .03, .28), (0, yr + .006, .56), M['black'], col, bevel=.012)
    for k in range(7):
        K.box(f'm1.tail_slat{k}', (.86, .012, .01), (0, yr + .024, .45 + k * .034), M['rubber'], col, bevel=.003)
    for sx in (1, -1):
        cx = sx * .64
        K.box(f'm1.tail_red{sx}', (.27, .02, .13), (cx, yr + .026, .60), M['red_lens'], col, bevel=.012)
        K.box(f'm1.tail_amber{sx}', (.27, .02, .055), (cx, yr + .026, .49), M['amber_lens'], col, bevel=.008)
        K.cylinder(f'm1.exhaust{sx}', .036, .18, (sx * .16, yr + .03, .30), M['chrome'], col, rot=(radians(90), 0, 0), segs=24)
        K.cylinder(f'm1.exhaust_in{sx}', .03, .182, (sx * .16, yr + .03, .30), M['black'], col, rot=(radians(90), 0, 0), segs=24)
    K.box('m1.diffuser', (1.3, .30, .03), (0, 2.0, .20), M['black'], col, rot=(radians(-10), 0, 0), bevel=.008)
    # ---- Procar wing at deck height on short posts
    zt = S(B, (0, 2.0, 3), (0, 0, -1))[0].z
    wz = zt + .16
    wing = [(.17, .0), (.10, .03), (-.05, .042), (-.17, .016), (-.175, .0), (-.06, .008), (.08, -.006)]
    K.sweep('m1.wing', [(-.95, 2.06, wz), (0, 2.06, wz), (.95, 2.06, wz)], wing, M['paint'], col, smooth_steps=2)
    for sx in (1, -1):
        p = S(B, (sx * .55, 2.0, 3), (0, 0, -1))[0]
        K.box(f'm1.wing_post{sx}', (.03, .16, wz - p.z), (sx * .55, 2.02, (wz + p.z) / 2), M['black'], col, bevel=.008)
        K.box(f'm1.wing_plate{sx}', (.01, .42, .18), (sx * .955, 2.06, wz), M['black'], col, bevel=.004)
        P.logo_decal(f'm1.wing_logo{sx}', LOGO, .30, (sx * .962, 2.06, wz), (radians(90), 0, radians(90 if sx > 0 else -90)), col)
    # ---- sides: mirrors, number, lettering, stripes
    for sx in (1, -1):
        p, n = S(B, (sx * 3, -.58, .76), (-sx, 0, 0))
        m = K.empty(f'm1.mirror{sx}', (p.x, p.y, p.z), col)
        K.box('base', (.06, .07, .04), (sx * .02, 0, 0), M['black'], col, m, bevel=.01)
        K.sphere('shell', .065, (sx * .09, .02, .06), M['paint'], col, m, scale=(1, .55, .6))
        K.box('glass', (.1, .004, .055), (sx * .09, .055, .06), M['reflector'], col, m, bevel=.01)
        P.side_decal(B, f'm1.number{sx}', '12', .24, -.10, .48, sx, M['decal_black'], col, plate=.17, plate_mat=M['decal_white'])
        P.side_decal(B, f'm1.breuer{sx}', 'FAHRZEUGTECHNIK BREUER', .05, -.10, .26, sx, M['decal_black'], col)
    # pop-up headlamp covers: drawn shut lines (boolean cuts tore the thin deck)
    for sx in (1, -1):
        x0, x1 = sorted((sx * .36, sx * .70))
        P.surface_strip(B, f'm1.popup_l{sx}', x0, x0 + .006, [-1.94 + j * .04 for j in range(9)], M["gloss_black"], col, lift=.0012, cols=2)
        P.surface_strip(B, f'm1.popup_r{sx}', x1 - .006, x1, [-1.94 + j * .04 for j in range(9)], M["gloss_black"], col, lift=.0012, cols=2)
        for k, yy in enumerate((-1.94, -1.626)):
            P.surface_strip(B, f'm1.popup_t{sx}{k}', x0, x1, [yy, yy + .006], M['gloss_black'], col, lift=.0012, cols=8)
    P.side_stripes(B, 'm1', M, col, -1.88, 2.0, .38, gap=.034, width=.028)
    for k, mk in enumerate(('m_light', 'm_dark', 'm_red')):
        x0 = -.24 + k * .08
        P.surface_strip(B, f'm1.bonnet_stripe{k}', x0, x0 + .07, [-2.12 + j * .05 for j in range(27)], M[mk], col)
        P.surface_strip(B, f'm1.roof_stripe{k}', x0, x0 + .07, [.02 + j * .05 for j in range(12)], M[mk], col)
    ys = [-.22 + j * .03 for j in range(6)]
    P.surface_strip(B, 'm1.sunstrip', -.60, .60, ys, M['black'], col, lift=.003, cols=9)
    c, n = S(B, (0, -.145, 3), (0, 0, -1))
    P.logo_decal('m1.sunstrip_logo', LOGO, .32, c + n * .005, n.to_track_quat('Z', 'Y').to_euler(), col)
    P.interior('m1', M, col, dash_y=-.56, seat_y=.12, floor_z=.18, roof_z=1.13, half_w=.66, cage_y=.48, a_pillar_y=-.70, cowl_z=.72, a_bars=False)


def build():
    K.reset_scene()
    col = K.collection('m1')
    M = P.base_materials('m1', 0xf2f0e9, rim=(.78, .56, .2), rim_rough=.24)
    B = body(M, col)
    CB.arch_lips('m1', B, D, M, col, depth=.02, out=.01)
    details(B, M, col)
    CB.wheels2('m1', D, M, col, style='mesh', spokes=10, concave=.03, bolts=5)
    return col


build()
