"""BMW M2 Competition (F87, grey metallic) — detailed Blender model.
Run inside Blender: exec(open(r'<repo>/art/blender/m2.py').read())"""
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

SPEC = dict(id='m2', R=.349, W=.255, rim=.235, axles=(-1.343, 1.35), track=1.59, arch=.382, paint=0x8e959b)
LOGO = os.path.join(HERE, '..', '..', 'assets', 'breuer-logo.png')
COWL, ROOF_F, B_LINE, ROOF_R, C_SLOPE, DECK = 7, 8, 10, 11, 12, 13


def stations():
    S = []
    add = lambda y, *a, **k: S.append((y, P.half_section(*a, **k)))
    add(-2.23, .76, .30, .56, 'deck', top=.58, soft=1.4)
    add(-2.215, .79, .27, .60, 'deck', top=.62, soft=1.4)
    add(-2.17, .815, .23, .67, 'deck', top=.69, soft=1.3)
    add(-2.08, .83, .21, .75, 'deck', top=.775, soft=1.3)
    add(-1.90, .84, .20, .82, 'deck', top=.848, flare=.025, soft=1.2)
    add(-1.34, .85, .19, .885, 'deck', top=.905, flare=.05, soft=1.2)
    add(-.97, .85, .19, .912, 'deck', top=.932, flare=.025, soft=1.2)
    add(-.77, .85, .19, .93, 'cowl', top=.948, soft=1.2)                     # 6 windscreen base
    add(-.27, .85, .19, .94, 'cabin', roof=1.365, rw=.642, soft=1.2)          # 7 roof front
    add(.20, .85, .19, .946, 'cabin', roof=1.395, rw=.656, soft=1.2)
    add(.45, .85, .19, .948, 'cabin', roof=1.39, rw=.656, flare=.01, soft=1.2)  # 9 B line
    add(.67, .85, .19, .95, 'cabin', roof=1.377, rw=.652, flare=.03, soft=1.2)  # 10 roof rear
    add(1.10, .85, .19, .955, 'cabin', roof=1.17, rw=.625, flare=.06, soft=1.2)  # 11 C slope
    add(1.48, .85, .19, .955, 'cowl', top=.972, flare=.075, soft=1.2)          # 12 boot
    add(1.85, .85, .20, .93, 'deck', top=.955, flare=.06, soft=1.2)
    add(2.10, .84, .22, .88, 'deck', top=.905, flare=.025, soft=1.3)
    add(2.205, .815, .26, .82, 'deck', top=.845, soft=1.4)
    add(2.23, .79, .29, .79, 'deck', top=.812, soft=1.4)
    return S


def body(M, col):
    S = stations()
    last = len(S) - 1
    windows = [
        (lambda i, j, s: i == COWL and j in (7, 8), 'gloss_black', 'rubber', 'glass', .014, .01),
        (lambda i, j, s: i in (ROOF_R, C_SLOPE) and j in (7, 8), 'gloss_black', 'rubber', 'glass', .014, .01),
        (lambda i, j, s: i in (COWL, ROOF_F, ROOF_F + 1) and j == 6, 'gloss_black', 'rubber', 'glass', .012, .01),
        (lambda i, j, s: i in (B_LINE, ROOF_R, C_SLOPE) and j == 6, 'gloss_black', 'rubber', 'glass', .012, .01),
    ]
    creases = [(.55, dict(ring=0)), (.55, dict(ring=last)), (.6, dict(line=5)), (.4, dict(line=4)),
               (.3, dict(line=2)), (.4, dict(line=6, span=(0, COWL))), (.4, dict(line=6, span=(DECK, last)))]
    g = .0042
    gaps = []
    for sx in (1, -1):
        gaps += [((.26, g, .70), (sx * .90, -.79, .58)), ((.26, g, .70), (sx * .90, .62, .60)),
                 ((g, 1.38, .16), (sx * .742, -1.52, .91)), ((g, .70, .16), (sx * .73, 1.86, .96))]
    gaps += [((1.5, g, .14), (0, -.84, .97)), ((1.46, g, .14), (0, 1.52, .99)), ((1.48, g, .14), (0, -2.04, .80))]
    M_ = dict(M)
    return P.body_from_stations('m2', S, M_ | {'chrome': M['gloss_black']}, col, SPEC, [(w[0], 'chrome' if w[1] == 'gloss_black' else w[1], w[2], w[3], w[4], w[5]) for w in windows], creases, gaps, arch_x=SPEC['track'] / 2)


def led_ring(name, r, loc, M, col):
    ring = [(.006 * cos(t), r + .006 * sin(t)) for t in [2 * pi * k / 10 for k in range(10)]]
    o = K.lathe(name, ring, M['led'], col, segs=48, closed=True)
    o.location = loc
    o.rotation_euler = (0, 0, radians(90))
    return o


def details(B, M, col):
    S = K.surface
    yf = S(B, (0, -3, .60), (0, 1, 0))[0].y
    # ---- kidneys, headlamps with LED halos, three big intakes, splitter
    for sx in (1, -1):
        kx = sx * .125
        K.box(f'm2.kidney_frame{sx}', (.22, .04, .17), (kx, yf - .002, .60), M['gloss_black'], col, bevel=.045, segs=6)
        K.box(f'm2.kidney{sx}', (.19, .042, .14), (kx, yf - .006, .60), M['black'], col, bevel=.04, segs=6)
        for k in range(5):
            K.box(f'm2.kidney_bar{sx}{k}', (.012, .016, .13), (kx - .07 + k * .035, yf - .022, .60), M['gloss_black'], col, bevel=.004)
        hx = sx * .55
        p = S(B, (hx, -3, .665), (0, 1, 0))[0]
        K.box(f'm2.lamp_housing{sx}', (.44, .09, .13), (hx, p.y + .028, .67), M['gloss_black'], col, rot=(0, radians(-sx * 4), radians(sx * 12)), bevel=.03, segs=4)
        for k, ox in enumerate((-.10, .08)):
            led_ring(f'm2.halo{sx}{k}', .042, (hx + sx * ox, p.y - .02, .67), M, col)
            K.lathe(f'm2.proj{sx}{k}', [(.0, .03), (.012, .02), (.016, .0001)], M['reflector'], col).location = (hx + sx * ox, p.y - .012, .67)
        K.box(f'm2.lamp_lens{sx}', (.43, .012, .12), (hx, p.y - .028, .67), M['lens'], col, rot=(0, radians(-sx * 4), radians(sx * 12)), bevel=.03, segs=4)
        p = S(B, (sx * .63, -3, .42), (0, 1, 0))[0]
        K.box(f'm2.side_intake_frame{sx}', (.27, .03, .22), (sx * .63, p.y + .006, .43), M['gloss_black'], col, rot=(0, radians(sx * 8), 0), bevel=.04, segs=4)
        K.box(f'm2.side_intake{sx}', (.235, .03, .185), (sx * .63, p.y + .002, .43), M['black'], col, rot=(0, radians(sx * 8), 0), bevel=.035, segs=4)
        K.box(f'm2.curtain{sx}', (.06, .03, .12), (sx * .78, p.y + .03, .50), M['black'], col, bevel=.01)
    p = S(B, (0, -3, .36), (0, 1, 0))[0]
    K.box('m2.centre_intake_frame', (.86, .03, .16), (0, p.y + .006, .355), M['gloss_black'], col, bevel=.04, segs=4)
    K.box('m2.centre_intake', (.82, .03, .125), (0, p.y + .002, .355), M['black'], col, bevel=.035, segs=4)
    K.box('m2.centre_bar', (.80, .03, .018), (0, p.y - .004, .355), M['paint'], col, bevel=.006)
    K.sweep('m2.splitter', P.contour(B, .235, .02, True, side_ys=(1.86, 2.0)),
            [(-.05, .008), (.06, .008), (.07, 0), (.06, -.01), (-.05, -.01)], M['carbon'], col, taper=10)
    K.plate('m2.plate_front', 'AC BR 2', M, col, (0, S(B, (0, -3, .47), (0, 1, 0))[0].y - .01, .47), 'front', w=.40, h=.09)
    # ---- rear: L lamps, diffuser with quad pipes, boot lip
    yr = S(B, (0, 3, .80), (0, -1, 0))[0].y
    for sx in (1, -1):
        cx = sx * .56
        K.box(f'm2.tail_h{sx}', (.34, .02, .075), (cx, yr - .004, .86), M['red_led'], col, bevel=.012)
        K.box(f'm2.tail_v{sx}', (.08, .02, .16), (sx * .70, yr - .008, .80), M['red_led'], col, bevel=.012)
        K.box(f'm2.tail_smoke{sx}', (.36, .03, .19), (cx + sx * .04, yr - .012, .82), M['gloss_black'], col, bevel=.02)
        for dx in (-.065, .065):
            x = sx * .56 + dx
            K.cylinder(f'm2.pipe{sx}{dx}', .045, .16, (x, 2.22, .30), M['chrome'], col, rot=(radians(90), 0, 0), segs=32)
            K.cylinder(f'm2.pipe_in{sx}{dx}', .038, .162, (x, 2.22, .30), M['gloss_black'], col, rot=(radians(90), 0, 0), segs=32)
    K.box('m2.diffuser', (1.5, .26, .14), (0, 2.13, .29), M['black'], col, bevel=.02)
    for k in range(5):
        K.box(f'm2.diff_fin{k}', (.01, .24, .1), (-.3 + k * .15, 2.17, .27), M['black'], col, bevel=.003)
    K.plate('m2.plate_rear', 'AC BR 2', M, col, (0, S(B, (0, 3, .56), (0, -1, 0))[0].y + .012, .56), 'rear', w=.40, h=.09)
    zt = S(B, (0, 2.16, 3), (0, 0, -1))[0].z
    K.box('m2.boot_lip', (1.30, .07, .024), (0, 2.17, zt + .012), M['carbon'], col, rot=(radians(-12), 0, 0), bevel=.008)
    c, n = S(B, (0, .82, 3), (0, 0, -1))
    P.logo_decal('m2.rear_logo', LOGO, .30, c + n * .004, n.to_track_quat('Z', 'Y').to_euler(), col)
    # ---- sides: gills, handles, mirrors, skirts
    for sx in (1, -1):
        p, n = S(B, (sx * 3, -.86, .72), (-sx, 0, 0))
        K.box(f'm2.gill{sx}', (.02, .16, .05), (p.x, p.y, p.z), M['gloss_black'], col, bevel=.012)
        K.box(f'm2.gill_bar{sx}', (.024, .14, .008), (p.x + sx * .002, p.y, p.z), M['chrome'], col, bevel=.003)
        p, n = S(B, (sx * 3, .40, .88), (-sx, 0, 0))
        K.box(f'm2.handle{sx}', (.02, .14, .026), (p.x + sx * .007, p.y, p.z), M['paint'], col, bevel=.008)
        p, n = S(B, (sx * 3, -.66, 1.0), (-sx, 0, 0))
        m = K.empty(f'm2.mirror{sx}', (p.x, p.y, p.z), col)
        K.box('base', (.07, .1, .04), (sx * .02, 0, 0), M['gloss_black'], col, m, bevel=.012)
        K.sphere('shell', .075, (sx * .11, .02, .06), M['paint'], col, m, scale=(1, .6, .62))
        K.box('glass', (.13, .004, .07), (sx * .11, .06, .06), M['reflector'], col, m, bevel=.012)
        pts = [S(B, (sx * 3, y, .30), (-sx, 0, 0), .006)[0] for y in [-.90 + k * .1 for k in range(19)]]
        if sx < 0:
            pts.reverse()
        K.sweep(f'm2.skirt{sx}', pts, [(-.01, .035), (.018, .035), (.026, .0), (.018, -.045), (-.01, -.045)], M['carbon'], col)
    p = S(B, (.0, -.82, 3), (0, 0, -1))[0]
    for sx in (.32, -.2):
        q = S(B, (sx, -.86, 3), (0, 0, -1))[0]
        K.tube(f'm2.wiper{sx}', [(q.x - .27, q.y + .05, q.z + .012), (q.x + .2, q.y + .02, q.z + .012)], .006, M['black'], col)
    q = S(B, (0, .55, 3), (0, 0, -1))[0]
    K.box('m2.shark_fin', (.05, .16, .05), (0, .55, q.z + .022), M['gloss_black'], col, bevel=.02)
    # ---- interior (road car: no cage, rear seats)
    P.interior('m2', M, col, dash_y=-.62, seat_y=.0, floor_z=.22, roof_z=1.39, half_w=.80, cage_y=.6, a_pillar_y=-.72, cowl_z=.93, cage=False)
    K.box('m2.rear_bench', (1.2, .44, .2), (0, .78, .44), M['seat'], col, bevel=.06)
    K.box('m2.rear_back', (1.2, .12, .5), (0, 1.0, .72), M['seat'], col, rot=(radians(-20), 0, 0), bevel=.05)


def build():
    K.reset_scene()
    col = K.collection('m2')
    M = P.base_materials('m2', SPEC['paint'], rim=(.035, .036, .04), rim_metal=.6, rim_rough=.3, paint_rough=.24, metallic_paint=.55)
    B = body(M, col)
    details(B, M, col)
    P.finish_wheels('m2', SPEC, M, col, 'minilite', 10)
    return col


build()
