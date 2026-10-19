"""Porsche 911 GT3 RS (992, blue) — v2, curve-defined body.
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
import carbody as CB
importlib.reload(CB)
import bpy
from mathutils import Vector

C = CB.Curve
LOGO = os.path.join(HERE, '..', '..', 'assets', 'breuer-logo.png')
D = dict(
    id='gt3rs', y0=-2.286, y1=2.286, R=.367, W=.29, rim=.245, axles=(-1.178, 1.279), track=1.58, arch=.396, arch_z=.012,
    top=C([(-2.286, .36), (-2.262, .455), (-2.20, .525), (-2.05, .585), (-1.60, .652), (-1.20, .70), (-.95, .735),
           (-.60, .96), (-.30, 1.15), (-.10, 1.232), (.28, 1.262), (.64, 1.236), (1.00, 1.13), (1.40, .985), (1.62, .905),
           (1.90, .872), (2.12, .83), (2.24, .77), (2.286, .67)]),
    belt=C([(-2.286, .40), (-2.25, .55), (-2.10, .665), (-1.95, .735), (-1.80, .77), (-1.30, .81), (-1.00, .80), (0, .82), (.6, .85),
            (1.2, .88), (1.6, .885), (2.0, .845), (2.2, .785), (2.286, .70)]),
    sill=C([(-2.286, .30), (-2.20, .205), (-1.9, .165), (-1.0, .15), (1.0, .15), (1.9, .175), (2.2, .225), (2.286, .30)]),
    hw=C([(-2.286, .60), (-2.25, .70), (-2.15, .765), (-1.9, .80), (-1.2, .82), (-.6, .83), (.4, .84), (1.2, .855), (1.9, .84),
          (2.2, .80), (2.286, .74)]),
    shoulder=C([(-2.3, .06), (-1.3, .07), (-.95, .10), (0, .14), (1.0, .18), (1.6, .19), (2.3, .10)]),
    rw=C([(-2.3, .50), (-.9, .58), (0, .62), (.6, .62), (1.2, .55), (1.6, .48), (2.3, .45)]),
    dip=C([(-2.3, .02), (-2.1, .07), (-1.8, .10), (-1.4, .095), (-1.05, .06), (-.92, .0), (2.3, .0)]),
    shoulder_crease=.45, char_crease=.2,
)
GLASS = dict(cowl=-.95, roof_f=-.12, b=.44, side_end=.98, roof_r=.62, deck=1.58)


def sculpt(ob):
    CB.bulge(ob, -1.178, .38, .40, .78, .06, .55, top_fade=(.84, .98))
    CB.bulge(ob, 1.279, .40, .42, 1.0, .095, .5, top_fade=(.95, 1.08))


def body(M, col):
    g = .0042
    gaps = []
    for sx in (1, -1):
        gaps += [((.24, g, .64), (sx * .92, -.90, .52)), ((.24, g, .64), (sx * .92, .44, .54)),
                 ((.24, 1.32, g), (sx * .92, -.23, .225)),
                 ((g, 1.10, .2), (sx * .565, -1.55, .73)), ((g, .56, .16), (sx * .52, 1.93, .86))]
    # real openings in the nose for the three intakes (pockets, honeycomb sits inside)
    gaps += [((.78, .22, .14), (0, -2.30, .27), .03), ((.30, .2, .15), (.58, -2.24, .36), .03), ((.30, .2, .15), (-.58, -2.24, .36), .03)]
    # big radiator exit vent in the front lid
    gaps += [((.66, .44, .12), (0, -1.62, D['top'](-1.62)), .04)]
    gaps += [((1.14, g, .16), (0, -1.0, .76)), ((1.06, g, .14), (0, 1.66, .90)), ((1.14, g, .14), (0, -2.12, .62))]
    return CB.build_body('gt3rs', D, M | {'trim': M['gloss_black']}, col, GLASS, gaps, sculpt=sculpt)


def details(B, M, col):
    S = K.surface
    # ---- headlamps: oval LED units on the wing fronts
    for sx in (1, -1):
        # upright round lamps facing forward at the very front of the tall wings
        hx, hz = sx * .585, .64
        p2, n2 = S(B, (hx, -3, hz), (0, 1, 0))
        nn = Vector((sx * .1, -1, .66)).normalized()
        lamp = K.empty(f'gt3rs.lamp{sx}', p2 + nn * .012 + Vector((0, .02, 0)), col)
        lamp.rotation_euler = nn.to_track_quat('Z', 'Y').to_euler()
        parts = [K.lathe('ring', [(-.05, .14), (.008, .14), (.016, .131), (.008, .123), (-.03, .123)], M['paint'], col, lamp, segs=72, closed=True),
                 K.lathe('bezel', [(-.01, .122), (.006, .122), (.006, .113), (-.01, .113)], M['gloss_black'], col, lamp, segs=72, closed=True),
                 K.lathe('drl', [(.004, .109), (.009, .109), (.009, .101), (.004, .101)], M['led'], col, lamp, segs=72, closed=True),
                 K.lathe('lens', [(.018, .0001), (.022, .07), (.016, .12)], M['lens'], col, lamp, segs=72),
                 K.lathe('bowl', [(-.004, .10), (-.018, .07), (-.028, .0001)], M['reflector'], col, lamp, segs=48)]
        for o in parts:
            o.rotation_euler = (0, radians(-90), 0)
        for k in range(4):
            a = pi / 4 + k * pi / 2
            K.cylinder(f'led{k}', .018, .006, (.042 * cos(a), .042 * sin(a), .0), M['led'], col, lamp, segs=24)
            K.cylinder(f'led_ring{k}', .022, .004, (.042 * cos(a), .042 * sin(a), -.002), M['gloss_black'], col, lamp, segs=24)
    # ---- nose: three honeycomb intakes, splitter with canards, tow strap
    yc = S(B, (0, -3, .31), (0, 1, 0))[0].y
    for sx, w, hh, x, z in ((0, .74, .12, 0, .27), (1, .28, .13, .58, .36), (-1, .28, .13, -.58, .36)):
        y = S(B, (x, -3, z), (0, 1, 0))[0].y
        hc = CB.honeycomb(f'gt3rs.intake_mesh{sx}', w - .02, hh - .02, .024, .02, M['black'], col, back_mat=M['under'])
        hc.location = (x, y - .024, z)
    for sx in (1, -1):
        for k, (cz, ln) in enumerate(((.24, .16), (.29, .12))):
            q = S(B, (sx * 3, -2.0 + k * .05, cz), (-sx, 0, 0))[0]
            K.box(f'gt3rs.canard{sx}{k}', (.12, ln, .006), (q.x + sx * .05, q.y, q.z), M['carbon'], col,
                  rot=(radians(-8), 0, radians(sx * -14)), bevel=.003)
    K.sweep('gt3rs.splitter', P.contour(B, .20, .03, True, side_ys=(1.95, 2.1)),
            [(-.07, .008), (.09, .008), (.10, 0), (.09, -.01), (-.07, -.01)], M['carbon'], col, taper=10)
    K.box('gt3rs.tow_strap', (.04, .01, .07), (.25, yc - .02, .25), M['breuer_red'], col, bevel=.004)
    # bonnet exit vent and wing-top louvres
    q = S(B, (0, -1.62, 3), (0, 0, -1))[0]   # floor of the lid vent pocket
    hv = CB.honeycomb('gt3rs.bonnet_vent', .60, .38, .03, .02, M['black'], col, back_mat=M['under'])
    hv.location, hv.rotation_euler = (0, -1.62, q.z + .024), (radians(-90), 0, 0)
    for sx in (1, -1):
        K.box(f'gt3rs.vent_fin{sx}', (.012, .42, .06), (sx * .11, -1.62, q.z + .03), M['carbon'], col, bevel=.004)
    for sx in (1, -1):
        for k in range(7):
            y = -1.06 + k * .05
            q, nq = S(B, (sx * .70, y, 3), (0, 0, -1))
            K.box(f'gt3rs.wing_louvre{sx}{k}', (.17, .03, .008), (sx * .70, y, q.z + .004), M['carbon'], col, rot=(radians(-14), 0, 0), bevel=.003)
    # carbon front lid and roof, like the works-look RS
    P.surface_strip(B, 'gt3rs.carbon_lid', -.36, .36, [-2.04 + j * .05 for j in range(21)], M['carbon'], col, lift=.0018, cols=9)
    P.surface_strip(B, 'gt3rs.carbon_roof', -.40, .40, [-.05 + j * .05 for j in range(14)], M['carbon'], col, lift=.0018, cols=9)
    for sx in (1, -1):  # arch exit gills behind the front wheels
        p, n = S(B, (sx * 3, -.76, .58), (-sx, 0, 0))
        for k in range(5):
            K.box(f'gt3rs.gill{sx}{k}', (.02, .012, .20), (p.x - sx * .004, p.y - .05 + k * .028, p.z), M['black'], col, rot=(0, 0, radians(sx * 25)), bevel=.003)
    for sx in (1, -1):  # small roof fins
        q = S(B, (sx * .44, .3, 3), (0, 0, -1))[0]
        K.box(f'gt3rs.roof_fin{sx}', (.008, .55, .03), (sx * .44, .3, q.z + .012), M['carbon'], col, bevel=.003)
    # ---- rear: light bar, louvred lid, third brake light, diffuser, pipes, swan-neck wing
    yr = S(B, (0, 3, .745), (0, -1, 0))[0].y
    K.box('gt3rs.light_bar', (1.48, .02, .022), (0, yr - .008, .745), M['red_led'], col, bevel=.007)
    for sx in (1, -1):
        K.box(f'gt3rs.tail{sx}', (.26, .03, .055), (sx * .66, yr - .014, .745), M['red_led'], col, bevel=.015)
        K.box(f'gt3rs.tail_frame{sx}', (.28, .03, .07), (sx * .66, yr - .02, .745), M['gloss_black'], col, bevel=.018)
    for k in range(11):
        y = 1.70 + k * .042
        q = S(B, (0, y, 3), (0, 0, -1))[0]
        K.box(f'gt3rs.lid_louvre{k}', (.62, .026, .009), (0, y, q.z + .004), M['black'], col, bevel=.003)
    q = S(B, (0, 1.62, 3), (0, 0, -1))[0]
    K.box('gt3rs.third_brake', (.32, .02, .012), (0, 1.62, q.z + .006), M['red_led'], col, bevel=.004)
    K.box('gt3rs.diffuser', (1.50, .32, .16), (0, 2.16, .26), M['carbon'], col, bevel=.02)
    for k in range(7):
        K.box(f'gt3rs.diff_fin{k}', (.008, .30, .12), (-.54 + k * .18, 2.2, .25), M['carbon'], col, bevel=.003)
    for sx in (1, -1):
        K.cylinder(f'gt3rs.pipe{sx}', .052, .14, (sx * .085, 2.27, .345), M['brake'], col, rot=(radians(90), 0, 0), segs=32)
        K.cylinder(f'gt3rs.pipe_in{sx}', .045, .142, (sx * .085, 2.27, .345), M['gloss_black'], col, rot=(radians(90), 0, 0), segs=32)
    K.plate('gt3rs.plate_rear', 'AC BR 911', M, col, (0, S(B, (0, 3, .52), (0, -1, 0))[0].y + .012, .52), 'rear', w=.42, h=.09)
    K.plate('gt3rs.plate_front', 'AC BR 911', M, col, (0, S(B, (0, -3, .42), (0, 1, 0))[0].y - .01, .42), 'front', w=.42, h=.09)
    wz = 1.32
    wing = [(.21, .0), (.12, .036), (-.06, .046), (-.21, .018), (-.215, .0), (-.07, .01), (.10, -.008)]
    K.sweep('gt3rs.wing', [(-.85, 2.05, wz), (0, 2.05, wz + .005), (.85, 2.05, wz)], wing, M['carbon'], col, smooth_steps=2)
    K.sweep('gt3rs.wing_flap', [(-.83, 1.86, wz + .075), (0, 1.86, wz + .08), (.83, 1.86, wz + .075)],
            [(.09, 0), (.04, .02), (-.08, .025), (-.09, 0), (-.03, .004)], M['carbon'], col, smooth_steps=2)
    for sx in (1, -1):
        q = S(B, (sx * .36, 1.95, 3), (0, 0, -1))[0]
        K.tube(f'gt3rs.swan{sx}', K.catmull([(sx * .36, 1.93, q.z), (sx * .36, 1.88, q.z + .2), (sx * .36, 1.96, wz + .15), (sx * .36, 2.08, wz + .07)], 6), .02, M['carbon'], col)
        K.box(f'gt3rs.endplate{sx}', (.01, .48, .24), (sx * .855, 1.99, wz + .05), M['carbon'], col, bevel=.004)
        P.logo_decal(f'gt3rs.endplate_logo{sx}', LOGO, .32, (sx * .862, 1.99, wz + .05), (radians(90), 0, radians(90 if sx > 0 else -90)), col)
    # ---- sides: mirrors, handles, rear intakes, lettering, skirts
    for sx in (1, -1):
        p, n = S(B, (sx * 3, -.74, .84), (-sx, 0, 0))
        m = K.empty(f'gt3rs.mirror{sx}', (p.x, p.y, p.z), col)
        K.box('arm', (.12, .03, .02), (sx * .06, .0, .02), M['carbon'], col, m, bevel=.008)
        K.sphere('shell', .072, (sx * .13, .02, .07), M['paint'], col, m, scale=(1, .55, .58))
        K.box('glass', (.12, .004, .065), (sx * .13, .056, .07), M['reflector'], col, m, bevel=.012)
        p, n = S(B, (sx * 3, .28, .74), (-sx, 0, 0))
        K.box(f'gt3rs.handle{sx}', (.008, .16, .024), (p.x + sx * .002, p.y, p.z), M['gloss_black'], col, bevel=.006)
        p, n = S(B, (sx * 3, .76, .64), (-sx, 0, 0))
        K.box(f'gt3rs.rear_intake{sx}', (.03, .26, .12), (p.x - sx * .004, p.y, p.z), M['black'], col, rot=(0, 0, radians(-sx * 10)), bevel=.03)
        P.side_decal(B, f'gt3rs.breuer{sx}', 'FAHRZEUGTECHNIK BREUER', .06, -.22, .34, sx, M['decal_white'], col)
        pts = [S(B, (sx * 3, y, .25), (-sx, 0, 0), .006)[0] for y in [-.80 + k * .1 for k in range(15)]]
        if sx < 0:
            pts.reverse()
        K.sweep(f'gt3rs.skirt{sx}', pts, [(-.01, .035), (.018, .035), (.026, .0), (.018, -.045), (-.01, -.045)], M['carbon'], col)
    c, n = S(B, (0, 1.08, 3), (0, 0, -1))
    P.logo_decal('gt3rs.rear_logo', LOGO, .32, c + n * .004, n.to_track_quat('Z', 'Y').to_euler(), col)
    for sx in (.3, -.18):
        q = S(B, (sx, -.98, 3), (0, 0, -1))[0]
        K.tube(f'gt3rs.wiper{sx}', [(q.x - .24, q.y + .04, q.z + .012), (q.x + .2, q.y + .02, q.z + .012)], .006, M['black'], col)
    P.interior('gt3rs', M, col, dash_y=-.72, seat_y=.05, floor_z=.18, roof_z=1.25, half_w=.70, cage_y=.55, a_pillar_y=-.76, cowl_z=.78, a_bars=False)


def build():
    K.reset_scene()
    col = K.collection('gt3rs')
    M = P.base_materials('gt3rs', 0x1f6fd6, rim=(.16, .17, .19), rim_metal=.9, rim_rough=.28, paint_rough=.2, metallic_paint=.35,
                         cage=K.lin(0xc8102e))
    B = body(M, col)
    CB.arch_lips('gt3rs', B, D, M, col, depth=.02, out=.008)
    details(B, M, col)
    CB.wheels2('gt3rs', D, M, col, style='ten', spokes=10, concave=.045, centerlock=True)
    return col


build()
