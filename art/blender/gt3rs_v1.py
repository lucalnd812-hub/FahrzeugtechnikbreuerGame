"""Porsche 911 GT3 RS (992, blue) — detailed Blender model.
Run inside Blender: exec(open(r'<repo>/art/blender/gt3rs.py').read())
No manufacturer logos or crest are modelled."""
import sys, os, importlib
from math import radians, pi, sin, cos
HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else r'.'
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import carkit as K
importlib.reload(K)
import carparts as P
importlib.reload(P)
import bpy
from mathutils import Vector

SPEC = dict(id='gt3rs', R=.367, W=.29, rim=.245, axles=(-1.178, 1.279), track=1.58, arch=.392, paint=0x1f6fd6)
LOGO = os.path.join(HERE, '..', '..', 'assets', 'breuer-logo.png')
COWL, ROOF_F, B_LINE, ROOF_R, C_SLOPE, DECK = 7, 8, 10, 11, 12, 13


def stations():
    S = []
    add = lambda y, *a, **k: S.append((y, P.half_section(*a, **k)))
    add(-2.286, .66, .25, .45, 'deck', top=.47, soft=1.3)
    add(-2.27, .70, .23, .48, 'deck', top=.50, soft=1.3)
    add(-2.18, .74, .20, .535, 'deck', top=.555, dip=.02, soft=1.2)
    add(-2.00, .76, .18, .60, 'deck', top=.625, dip=.05, flare=.02, soft=1.2)
    add(-1.62, .78, .17, .755, 'deck', top=.785, dip=.15, flare=.09, soft=1.2)
    add(-1.18, .79, .17, .805, 'deck', top=.835, dip=.17, flare=.115, soft=1.2)
    add(-.97, .80, .17, .79, 'deck', top=.815, dip=.10, flare=.06, soft=1.2)
    add(-.88, .80, .17, .775, 'cowl', top=.785, flare=.02, dip=.02, soft=1.2)            # 7 windscreen base
    add(-.15, .80, .17, .80, 'cabin', roof=1.242, rw=.626, soft=1.2)            # 8 roof front
    add(.22, .80, .17, .82, 'cabin', roof=1.262, rw=.635, soft=1.2)
    add(.45, .80, .17, .83, 'cabin', roof=1.258, rw=.635, flare=.02, soft=1.2)  # 10 B line
    add(.70, .80, .17, .84, 'cabin', roof=1.24, rw=.632, flare=.07, soft=1.2)   # 11 roof rear
    add(1.10, .80, .17, .862, 'cabin', roof=1.06, rw=.60, flare=.13, soft=1.2)  # 12 C slope
    add(1.52, .80, .18, .875, 'cowl', top=.885, flare=.15, soft=1.2)            # 13 engine lid
    add(1.80, .80, .19, .855, 'deck', top=.866, flare=.13, soft=1.2)
    add(2.08, .80, .22, .79, 'deck', top=.80, flare=.08, soft=1.2)
    add(2.25, .78, .26, .72, 'deck', top=.735, flare=.03, soft=1.3)
    add(2.286, .76, .28, .70, 'deck', top=.712, soft=1.3)
    return S


def body(M, col):
    S = stations()
    last = len(S) - 1
    windows = [
        (lambda i, j, s: i == COWL and j in (7, 8), 'chrome', 'rubber', 'glass', .012, .01),
        (lambda i, j, s: i in (ROOF_R, C_SLOPE) and j in (7, 8), 'chrome', 'rubber', 'glass', .012, .01),
        (lambda i, j, s: i in (COWL, ROOF_F, ROOF_F + 1) and j == 6, 'chrome', 'rubber', 'glass', .011, .01),
        (lambda i, j, s: i in (B_LINE, ROOF_R, C_SLOPE) and j == 6, 'chrome', 'rubber', 'glass', .011, .01),
    ]
    creases = [(.5, dict(ring=0)), (.5, dict(ring=last)), (.45, dict(line=5)), (.3, dict(line=2)),
               (.45, dict(line=6, span=(0, COWL))), (.35, dict(line=6, span=(DECK, last)))]
    g = .0042
    gaps = []
    for sx in (1, -1):
        gaps += [((.26, g, .66), (sx * .88, -.84, .52)), ((.26, g, .66), (sx * .88, .52, .55)),
                 ((g, 1.30, .2), (sx * .58, -1.55, .70)), ((g, .62, .16), (sx * .56, 1.86, .86))]
    gaps += [((1.18, g, .16), (0, -.92, .76)), ((1.14, g, .14), (0, 1.55, .89)), ((1.18, g, .14), (0, -2.2, .54))]
    M_ = M | {'chrome': M['gloss_black']}
    return P.body_from_stations('gt3rs', S, M_, col, SPEC, windows, creases, gaps, arch_x=SPEC['track'] / 2)


def details(B, M, col):
    S = K.surface
    # ---- headlamps on the wing tops: chrome ring, lens, four LED dots
    for sx in (1, -1):
        hx = sx * .585
        p, n = S(B, (hx, -1.97, 3), (0, 0, -1))
        p2, n2 = S(B, (hx, -3, .60), (0, 1, 0))
        c = (p + p2) / 2
        nn = (n + n2).normalized()
        lamp = K.empty(f'gt3rs.lamp{sx}', c + nn * .014, col)
        lamp.rotation_euler = nn.to_track_quat('Z', 'Y').to_euler()
        K.lathe('ring', [(-.02, .118), (.012, .118), (.016, .11), (.006, .104)], M['gloss_black'], col, lamp, segs=64)
        r = K.lathe('lens', [(.012, .0001), (.016, .06), (.014, .105)], M['lens'], col, lamp, segs=64)
        K.lathe('bowl', [(-.01, .102), (-.02, .06), (-.025, .0001)], M['reflector'], col, lamp, segs=48)
        for o in lamp.children:
            o.rotation_euler = (0, radians(-90), 0)
        for k in range(4):
            a = pi / 4 + k * pi / 2
            K.sphere(f'led{k}', .014, (.045 * cos(a), .045 * sin(a), .0), M['led'], col, lamp, scale=(1, 1, .4))
    # ---- nose: three intakes, splitter, bonnet exit vent, wing-top louvres
    for sx in (1, -1):
        p = S(B, (sx * .55, -3, .33), (0, 1, 0))[0]
        K.box(f'gt3rs.side_intake_frame{sx}', (.34, .03, .17), (sx * .55, p.y + .004, .33), M['gloss_black'], col, bevel=.04, segs=4)
        K.box(f'gt3rs.side_intake{sx}', (.30, .03, .135), (sx * .55, p.y + .0, .33), M['black'], col, bevel=.035, segs=4)
        K.box(f'gt3rs.indicator{sx}', (.12, .02, .03), (sx * .55, p.y - .006, .43), M['led'], col, bevel=.008)
    p = S(B, (0, -3, .31), (0, 1, 0))[0]
    K.box('gt3rs.centre_intake_frame', (.56, .03, .15), (0, p.y + .004, .31), M['gloss_black'], col, bevel=.04, segs=4)
    K.box('gt3rs.centre_intake', (.52, .03, .12), (0, p.y, .31), M['black'], col, bevel=.035, segs=4)
    K.sweep('gt3rs.splitter', P.contour(B, .205, .02, True, side_ys=(1.92, 2.08)),
            [(-.06, .008), (.08, .008), (.09, 0), (.08, -.01), (-.06, -.01)], M['carbon'], col, taper=10)
    for k in range(8):
        y = -1.72 + k * .07
        q = S(B, (0, y, 3), (0, 0, -1))[0]
        K.box(f'gt3rs.bonnet_vent{k}', (.62, .045, .012), (0, y, q.z + .004), M['carbon'], col, rot=(radians(-10), 0, 0), bevel=.004)
    K.box('gt3rs.bonnet_vent_frame', (.70, .62, .02), (0, -1.48, S(B, (0, -1.48, 3), (0, 0, -1))[0].z - .004), M['black'], col, rot=(radians(-6), 0, 0), bevel=.02)
    for sx in (1, -1):
        for k in range(6):
            y = -1.05 + k * .055
            q, nq = S(B, (sx * .70, y, 3), (0, 0, -1))
            K.box(f'gt3rs.wing_louvre{sx}{k}', (.20, .035, .01), (sx * .70, y, q.z + .004), M['carbon'], col, rot=(radians(-12), 0, 0), bevel=.004)
    # ---- rear: light bar, engine lid louvres, diffuser, centre pipes, swan-neck wing
    yr = S(B, (0, 3, .74), (0, -1, 0))[0].y
    K.box('gt3rs.light_bar', (1.46, .02, .028), (0, yr - .006, .745), M['red_led'], col, bevel=.008)
    for sx in (1, -1):
        K.box(f'gt3rs.tail{sx}', (.24, .03, .06), (sx * .66, yr - .012, .745), M['red_led'], col, bevel=.015)
    for k in range(9):
        y = 1.62 + k * .05
        q = S(B, (0, y, 3), (0, 0, -1))[0]
        K.box(f'gt3rs.lid_louvre{k}', (.66, .03, .01), (0, y, q.z + .004), M['black'], col, bevel=.003)
    K.box('gt3rs.diffuser', (1.48, .30, .16), (0, 2.16, .26), M['carbon'], col, bevel=.02)
    for k in range(6):
        K.box(f'gt3rs.diff_fin{k}', (.01, .28, .12), (-.5 + k * .2, 2.2, .25), M['carbon'], col, bevel=.003)
    for sx in (1, -1):
        K.cylinder(f'gt3rs.pipe{sx}', .05, .14, (sx * .08, 2.27, .34), M['brake'], col, rot=(radians(90), 0, 0), segs=32)
        K.cylinder(f'gt3rs.pipe_in{sx}', .043, .142, (sx * .08, 2.27, .34), M['gloss_black'], col, rot=(radians(90), 0, 0), segs=32)
    K.plate('gt3rs.plate_rear', 'AC BR 911', M, col, (0, S(B, (0, 3, .52), (0, -1, 0))[0].y + .012, .52), 'rear', w=.42, h=.09)
    K.plate('gt3rs.plate_front', 'AC BR 911', M, col, (0, S(B, (0, -3, .40), (0, 1, 0))[0].y - .01, .40), 'front', w=.42, h=.09)
    wz = 1.33
    wing = [(.20, .0), (.11, .035), (-.06, .045), (-.20, .018), (-.205, .0), (-.07, .01), (.10, -.008)]
    K.sweep('gt3rs.wing', [(-.84, 2.06, wz), (0, 2.06, wz + .005), (.84, 2.06, wz)], wing, M['carbon'], col, smooth_steps=2)
    K.sweep('gt3rs.wing_flap', [(-.82, 1.88, wz + .07), (0, 1.88, wz + .075), (.82, 1.88, wz + .07)],
            [(.09, 0), (.04, .02), (-.08, .025), (-.09, 0), (-.03, .004)], M['carbon'], col, smooth_steps=2)
    for sx in (1, -1):
        q = S(B, (sx * .36, 1.95, 3), (0, 0, -1))[0]
        K.tube(f'gt3rs.swan{sx}', K.catmull([(sx * .36, 1.95, q.z), (sx * .36, 1.90, q.z + .2), (sx * .36, 1.96, wz + .14), (sx * .36, 2.08, wz + .07)], 6), .02, M['carbon'], col)
        K.box(f'gt3rs.endplate{sx}', (.01, .46, .22), (sx * .845, 2.0, wz + .05), M['carbon'], col, bevel=.004)
    c, n = S(B, (0, 1.05, 3), (0, 0, -1))
    P.logo_decal('gt3rs.rear_logo', LOGO, .30, c + n * .004, n.to_track_quat('Z', 'Y').to_euler(), col)
    # ---- sides: mirrors, flush handles, rear intakes, lettering
    for sx in (1, -1):
        p, n = S(B, (sx * 3, -.70, .82), (-sx, 0, 0))
        m = K.empty(f'gt3rs.mirror{sx}', (p.x, p.y, p.z), col)
        K.box('arm', (.12, .03, .02), (sx * .06, .0, .02), M['carbon'], col, m, bevel=.008)
        K.sphere('shell', .07, (sx * .13, .02, .07), M['paint'], col, m, scale=(1, .55, .58))
        K.box('glass', (.12, .004, .065), (sx * .13, .055, .07), M['reflector'], col, m, bevel=.012)
        p, n = S(B, (sx * 3, .30, .74), (-sx, 0, 0))
        K.box(f'gt3rs.handle{sx}', (.008, .16, .024), (p.x + sx * .002, p.y, p.z), M['gloss_black'], col, bevel=.006)
        p, n = S(B, (sx * 3, .80, .62), (-sx, 0, 0))
        K.box(f'gt3rs.rear_intake{sx}', (.03, .26, .12), (p.x - sx * .004, p.y, p.z), M['black'], col, rot=(0, 0, radians(-sx * 10)), bevel=.03)
        P.side_decal(B, f'gt3rs.breuer{sx}', 'FAHRZEUGTECHNIK BREUER', .06, -.15, .33, sx, M['decal_white'], col)
        pts = [S(B, (sx * 3, y, .27), (-sx, 0, 0), .006)[0] for y in [-.82 + k * .1 for k in range(15)]]
        if sx < 0:
            pts.reverse()
        K.sweep(f'gt3rs.skirt{sx}', pts, [(-.01, .035), (.018, .035), (.026, .0), (.018, -.045), (-.01, -.045)], M['carbon'], col)
    q = S(B, (0, .4, 3), (0, 0, -1))[0]
    P.interior('gt3rs', M, col, dash_y=-.70, seat_y=.05, floor_z=.18, roof_z=1.25, half_w=.70, cage_y=.55, a_pillar_y=-.74, cowl_z=.76)


def build():
    K.reset_scene()
    col = K.collection('gt3rs')
    M = P.base_materials('gt3rs', SPEC['paint'], rim=(.2, .21, .23), rim_metal=.9, rim_rough=.3, paint_rough=.22, metallic_paint=.35,
                         cage=K.lin(0xc8102e))
    B = body(M, col)
    details(B, M, col)
    P.finish_wheels('gt3rs', SPEC, M, col, 'minilite', 10)
    return col


build()
