"""BMW M2 Competition (F87, Hockenheim-silver style) — v2, curve-defined body
built against reference photos (Wikimedia Commons). No manufacturer logos.
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
import carbody as CB
importlib.reload(CB)
import bpy
from mathutils import Vector

C = CB.Curve
LOGO = os.path.join(HERE, '..', '..', 'assets', 'breuer-logo.png')
D = dict(
    id='m2', y0=-2.2305, y1=2.2305, R=.349, W=.255, rim=.24, axles=(-1.343, 1.35), track=1.59, arch=.382, arch_z=.012,
    top=C([(-2.2305, .60), (-2.222, .69), (-2.19, .755), (-2.12, .795), (-1.80, .845), (-1.30, .895), (-.85, .935), (-.62, .952),
           (-.40, 1.13), (-.20, 1.32), (-.05, 1.385), (.30, 1.41), (.70, 1.392), (.90, 1.33), (1.15, 1.20), (1.38, 1.08), (1.52, 1.035),
           (1.90, 1.02), (2.12, .99), (2.205, .935), (2.2305, .84)]),
    belt=C([(-2.2305, .58), (-2.15, .735), (-1.9, .815), (-1.3, .87), (-.8, .91), (0, .93), (.8, .955), (1.4, .98), (1.9, .97),
            (2.15, .925), (2.2305, .82)]),
    sill=C([(-2.2305, .32), (-2.15, .22), (-1.9, .19), (-1.0, .20), (1.0, .20), (1.9, .21), (2.15, .26), (2.2305, .34)]),
    hw=C([(-2.2305, .62), (-2.18, .74), (-2.0, .82), (-1.5, .86), (-.8, .865), (0, .86), (.8, .87), (1.3, .88), (1.9, .86),
          (2.15, .82), (2.2305, .75)]),
    shoulder=C([(-2.3, .06), (-1.0, .09), (-.8, .10), (0, .13), (1.0, .18), (1.5, .15), (2.3, .08)]),
    rw=C([(-2.3, .50), (-.8, .62), (0, .66), (.6, .655), (1.2, .60), (2.3, .55)]),
    dip=C([(-2.3, .0), (2.3, .0)]),
    char=C([(-2.3, 0), (-1.6, .006), (-.5, .012), (1.2, .012), (2.0, .006), (2.3, 0)]),
    shoulder_crease=.6, char_crease=.6, cab_lo=.03, cab_hi=.15,
)
GLASS = dict(cowl=-.62, roof_f=-.07, b=.52, side_end=1.22, roof_r=.88, deck=1.50)


def sculpt(ob):
    CB.bulge(ob, -1.343, .36, .39, .76, .045, .62, top_fade=(.88, 1.0))
    CB.bulge(ob, 1.35, .36, .40, .85, .06, .6, top_fade=(.98, 1.1))
    for side in (1,):
        CB.groove(ob, [(-1.05, .78), (.4, .815), (1.95, .86)], .03, .009, .7)
        CB.groove(ob, [(-.95, .40), (1.0, .41)], .025, .006, .7)


def body(M, col):
    g = .0042
    gaps = []
    for sx in (1, -1):
        gaps += [((.26, g, .70), (sx * .94, -.64, .58)), ((.26, g, .70), (sx * .94, .70, .60)),
                 ((g, 1.30, .18), (sx * .74, -1.48, .88)), ((g, .62, .16), (sx * .72, 1.84, 1.0)),
                 # side intakes and air curtains (pockets)
                 ((.30, .24, .21), (sx * .60, -2.26, .42), .03), ((.05, .2, .13), (sx * .80, -2.18, .52), .015),
                 # kidney openings
                 ((.25, .2, .125), (sx * .14, -2.25, .70), .045)]
    gaps += [((.74, .26, .17), (0, -2.30, .39), .04),       # big centre intake
             ((1.5, g, .14), (0, -.68, .97)), ((1.46, g, .14), (0, 1.52, 1.03)), ((1.48, g, .14), (0, -2.10, .80))]
    return CB.build_body('m2', D, M | {'trim': M['gloss_black']}, col, GLASS, gaps, sculpt=sculpt)


def led_ring(name, r, loc, rot, M, col, parent=None):
    ring = [(.005 * cos(t), r + .005 * sin(t)) for t in [2 * pi * k / 8 for k in range(8)]]
    o = K.lathe(name, ring, M['led'], col, parent, segs=6, closed=True)   # hexagonal LED icons
    o.location, o.rotation_euler = loc, rot
    return o


def details(B, M, col):
    S = K.surface
    # ---- kidneys inside their openings: black double bars
    for sx in (1, -1):
        kx = sx * .14
        y = S(B, (kx, -3, .70), (0, 1, 0))[0].y
        K.box(f'm2.kidney_back{sx}', (.24, .01, .12), (kx, y - .004, .70), M['black'], col, bevel=0)
        for k in range(9):
            for dx in (-.004, .004):
                K.box(f'm2.kidney_bar{sx}{k}{dx}', (.006, .03, .11), (kx - .1 + k * .025 + dx, y - .03, .70), M['gloss_black'], col, bevel=.002)
    # ---- slim angular headlamps with two hexagonal LED icons and a DRL brow
    for sx in (1, -1):
        hx = sx * .53
        p, n = S(B, (hx, -3, .745), (0, 1, 0))
        lamp = K.empty(f'm2.lamp{sx}', (hx, p.y - .004, .745), col)
        lamp.rotation_euler = (radians(-12), radians(-sx * 9), radians(sx * 16))
        K.box('housing', (.40, .06, .10), (0, .02, 0), M['gloss_black'], col, lamp, bevel=.03, segs=4)
        K.box('lens', (.40, .01, .10), (0, -.012, 0), M['lens'], col, lamp, bevel=.03, segs=4)
        K.box('brow', (.36, .012, .012), (sx * .01, -.008, .042), M['led'], col, lamp, bevel=.004)
        for k, ox in enumerate((-.08, .07)):
            led_ring(f'icon{k}', .036, (sx * ox, -.002, -.005), (0, 0, radians(90)), M, col, lamp)
            K.lathe(f'proj{k}', [(.0, .026), (.01, .018), (.014, .0001)], M['reflector'], col, lamp).location = (sx * ox, .01, -.005)
        K.box('indicator', (.10, .01, .02), (sx * .14, -.009, -.035), M['amber_lens'], col, lamp, bevel=.006)
    # ---- intakes: honeycomb inside the pockets, black lip, front plate on the centre intake
    for name, w, h, x, z in (('centre', .70, .14, 0, .39), ('side1', .26, .18, .60, .42), ('side-1', .26, .18, -.60, .42)):
        y = S(B, (x, -3, z), (0, 1, 0))[0].y
        hc = CB.honeycomb(f'm2.mesh_{name}', w, h, .022, .02, M['black'], col, back_mat=M['under'])
        hc.location = (x, y - .024, z)
    K.sweep('m2.lip', P.contour(B, .235, .012, True, side_ys=(1.9, 2.05)),
            [(-.05, .008), (.05, .008), (.06, 0), (.05, -.012), (-.05, -.012)], M['gloss_black'], col, taper=10)
    K.plate('m2.plate_front', 'AC BR 2', M, col, (0, S(B, (0, -3, .52), (0, 1, 0))[0].y - .02, .50), 'front', w=.40, h=.09)
    # ---- rear: L lamps, diffuser with quad pipes, boot lip, plate
    yr = S(B, (0, 3, .86), (0, -1, 0))[0].y
    for sx in (1, -1):
        cx = sx * .56
        K.box(f'm2.tail_smoke{sx}', (.38, .03, .16), (cx + sx * .04, yr - .006, .86), M['gloss_black'], col, bevel=.03)
        K.box(f'm2.tail_h{sx}', (.30, .02, .02), (cx, yr - .016, .90), M['red_led'], col, bevel=.006)
        K.box(f'm2.tail_v{sx}', (.02, .02, .10), (sx * .70, yr - .02, .85), M['red_led'], col, bevel=.006)
        K.box(f'm2.tail_low{sx}', (.22, .02, .015), (cx - sx * .02, yr - .016, .82), M['red_led'], col, bevel=.005)
        for dx in (-.065, .065):
            x = sx * .56 + dx
            K.cylinder(f'm2.pipe{sx}{dx}', .045, .16, (x, 2.22, .30), M['chrome'], col, rot=(radians(90), 0, 0), segs=32)
            K.cylinder(f'm2.pipe_in{sx}{dx}', .038, .162, (x, 2.22, .30), M['gloss_black'], col, rot=(radians(90), 0, 0), segs=32)
    K.box('m2.diffuser', (1.5, .26, .14), (0, 2.13, .29), M['black'], col, bevel=.02)
    for k in range(5):
        K.box(f'm2.diff_fin{k}', (.01, .24, .1), (-.3 + k * .15, 2.17, .27), M['black'], col, bevel=.003)
    K.plate('m2.plate_rear', 'AC BR 2', M, col, (0, S(B, (0, 3, .60), (0, -1, 0))[0].y + .012, .60), 'rear', w=.40, h=.09)
    zt = S(B, (0, 2.12, 3), (0, 0, -1))[0].z
    K.box('m2.boot_lip', (1.26, .06, .02), (0, 2.13, zt + .01), M['carbon'], col, rot=(radians(-12), 0, 0), bevel=.008)
    c, n = S(B, (0, 1.0, 3), (0, 0, -1))
    P.logo_decal('m2.rear_logo', LOGO, .28, c + n * .004, n.to_track_quat('Z', 'Y').to_euler(), col)
    # ---- sides: gills, handles, M-style mirrors, skirts, aerial fin
    for sx in (1, -1):
        p, n = S(B, (sx * 3, -.98, .76), (-sx, 0, 0))
        K.box(f'm2.gill{sx}', (.02, .17, .055), (p.x, p.y, p.z), M['gloss_black'], col, bevel=.014)
        K.box(f'm2.gill_bar{sx}', (.024, .15, .008), (p.x + sx * .002, p.y, p.z), M['chrome'], col, bevel=.003)
        p, n = S(B, (sx * 3, .30, .88), (-sx, 0, 0))
        K.box(f'm2.handle{sx}', (.02, .14, .026), (p.x + sx * .007, p.y, p.z), M['paint'], col, bevel=.008)
        p, n = S(B, (sx * 3, -.52, .965), (-sx, 0, 0))
        m = K.empty(f'm2.mirror{sx}', (p.x, p.y, p.z), col)
        K.box('stalk', (.07, .05, .02), (sx * .03, .02, .02), M['paint'], col, m, bevel=.008)
        K.sphere('shell', .075, (sx * .11, .03, .07), M['paint'], col, m, scale=(1, .6, .6))
        K.box('glass', (.13, .004, .07), (sx * .11, .07, .07), M['reflector'], col, m, bevel=.012)
        pts = [S(B, (sx * 3, y, .28), (-sx, 0, 0), .006)[0] for y in [-.90 + k * .1 for k in range(19)]]
        if sx < 0:
            pts.reverse()
        K.sweep(f'm2.skirt{sx}', pts, [(-.01, .035), (.018, .035), (.026, .0), (.018, -.045), (-.01, -.045)], M['gloss_black'], col)
    q = S(B, (0, .62, 3), (0, 0, -1))[0]
    K.box('m2.shark_fin', (.05, .16, .05), (0, .62, q.z + .022), M['gloss_black'], col, bevel=.02)
    for sx in (.32, -.2):
        q = S(B, (sx, -.84, 3), (0, 0, -1))[0]
        K.tube(f'm2.wiper{sx}', [(q.x - .27, q.y + .05, q.z + .012), (q.x + .2, q.y + .02, q.z + .012)], .006, M['black'], col)
    P.interior('m2', M, col, dash_y=-.48, seat_y=.12, floor_z=.22, roof_z=1.39, half_w=.78, cage_y=.6, a_pillar_y=-.6, cowl_z=.95, cage=False)
    K.box('m2.rear_bench', (1.2, .44, .2), (0, .86, .44), M['seat'], col, bevel=.06)
    K.box('m2.rear_back', (1.2, .12, .5), (0, 1.08, .72), M['seat'], col, rot=(radians(-20), 0, 0), bevel=.05)


def build():
    K.reset_scene()
    col = K.collection('m2')
    M = P.base_materials('m2', 0x8e959b, rim=(.03, .031, .035), rim_metal=.6, rim_rough=.3, paint_rough=.22, metallic_paint=.55)
    B = body(M, col)
    CB.arch_lips('m2', B, D, M, col, depth=.016, out=.006)
    details(B, M, col)
    CB.wheels2('m2', D, M, col, style='y5', spokes=5, concave=.05, bolts=5)
    return col


build()
