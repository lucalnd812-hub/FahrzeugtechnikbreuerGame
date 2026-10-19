"""Garage turntable views for the painted showroom (assets/nextlevel/garage-showroom.webp).

The camera is solved from the painted turntable's red ring (art/menu/garage_src.png,
1344x752): ring x 246..1089, far edge y 433, near edge y 574, horizon y ~372.
For a 3 m ring radius that is a level camera 0.79 m above the platform, 5.6 m
back, focal length 664 px (17.8 mm on a 36 mm sensor). Rendering every view at
exactly the backdrop's size means the game can draw a frame with the same
transform as the background and the tyres land on the platform.

Usage inside Blender (after ai_car.py has exported the GLBs):
    exec(open(ROOT + 'art/blender/ai_sprites.py').read())
    queue(['kadett', 'e30', 'm1', 'm2', 'gt3rs'])
"""
import bpy, os, json, math, hashlib
import numpy as np
from mathutils import Vector

ROOT = globals().get('ROOT')
W, H, FRAMES = 1344, 752, 16
SET_FORWARD = .6
THREADS = 4
PAUSE = 2.0
# Solved for a 2.8 m ring radius so a 4.5 m car fills the platform nicely.
CAM = dict(height=.738, distance=5.224, lens=17.78, horizon=372)


def _scene():
    sc = bpy.context.scene
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = 20
    sc.cycles.use_denoising = True
    # CPU with a few threads: GPU renders crashed the workstation twice.
    sc.cycles.device = 'CPU'
    sc.render.threads_mode = 'FIXED'
    sc.render.threads = THREADS
    sc.render.film_transparent = True
    sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = W, H, 100
    sc.render.image_settings.file_format = 'WEBP'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.render.image_settings.quality = 82
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.look = 'None'
    sc.view_settings.exposure = -.45
    # Comic ink to match the race renderer.
    # Freestyle traces the generated meshes' seams as scribbles: no ink here,
    # the texture already carries the comic shading.
    sc.render.use_freestyle = False
    sc.render.line_thickness_mode = 'ABSOLUTE'
    sc.render.line_thickness = 1.6
    vl = bpy.context.view_layer
    vl.use_freestyle = False
    fs = vl.freestyle_settings
    ls = fs.linesets[0] if fs.linesets else fs.linesets.new('ink')
    ls.select_by_visibility = True
    ls.select_silhouette = True; ls.select_border = True; ls.select_crease = False
    fs.crease_angle = math.radians(128)
    if ls.linestyle is None:
        ls.linestyle = bpy.data.linestyles.new('ink')
    ls.linestyle.color = (.05, .06, .08)
    ls.linestyle.thickness = 1.6
    world = sc.world or bpy.data.worlds.new('studio')
    sc.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes['Background']
    bg.inputs[0].default_value = (.86, .88, .92, 1)
    bg.inputs[1].default_value = .45
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    sc.collection.objects.link(cam)
    cam.data.sensor_fit = 'HORIZONTAL'
    cam.data.sensor_width = 36
    cam.data.lens = CAM['lens']
    cam.data.shift_y = (CAM['horizon'] - H / 2) / W
    cam.location = (0, -CAM['distance'], CAM['height'])
    cam.rotation_euler = (math.radians(90), 0, 0)
    sc.camera = cam

    def light(name, kind, energy, loc, rot=(0, 0, 0), size=1, color=(1, 1, 1)):
        l = bpy.data.objects.new(name, bpy.data.lights.new(name, kind))
        l.data.energy = energy; l.data.color = color
        if kind == 'AREA':
            l.data.size = size
        l.location = loc; l.rotation_euler = rot
        sc.collection.objects.link(l)
        return l
    # Warm workshop lamps overhead, bright daylight from the open door behind,
    # a soft front fill from the camera side.
    light('key', 'AREA', 420, (-1.6, -1.2, 4.0), (math.radians(18), math.radians(-20), 0), 1.4, (1, .93, .82))
    light('key2', 'AREA', 260, (2.2, 1.2, 4.0), (math.radians(-12), math.radians(22), 0), 2.0, (1, .92, .8))
    light('door', 'SUN', 1.4, (0, 8, 3), (math.radians(-24), 0, 0), color=(.92, .96, 1))
    light('fill', 'AREA', 140, (0, -5, 1.6), (math.radians(80), 0, 0), 4, (1, 1, 1))
    # The painted ring's visual centre sits nearer than its projected centre;
    # the car stands there, and only the platform catches its shadow.
    bpy.ops.mesh.primitive_circle_add(vertices=64, radius=2.7, fill_type='NGON', location=(0, -SET_FORWARD, 0))
    ground = bpy.context.active_object
    ground.name = 'catcher'
    ground.is_shadow_catcher = True
    pivot = bpy.data.objects.new('pivot', None)
    sc.collection.objects.link(pivot)
    pivot.location = (0, -SET_FORWARD, 0)
    return sc, cam, pivot


def _load_car(car_id, pivot):
    # Full-resolution source mesh and 4K texture: the showroom is a close-up.
    exec(open(ROOT + 'art/blender/ai_car.py', encoding='utf8').read(), globals())
    body = _import(ROOT + f'art/ai3d/{car_id}_tripo.glb')
    normalise(body, car_id, '+X')
    w = find_wheels(body, car_id)
    wheel = split_wheels(body, w)
    lay = {'track': 2 * abs(w['hub_x']), 'radius': w['radius'], 'axles': [-w['rear_y'], -w['front_y']]}
    for p in body.data.polygons:
        p.use_smooth = True
    for p in wheel.data.polygons:
        p.use_smooth = True
    new = [body, wheel]
    for o in new:
        o.parent = pivot
    for z in lay['axles']:
        for side in (-1, 1):
            c = wheel.copy(); bpy.context.scene.collection.objects.link(c)
            c.parent = pivot
            c.location = (side * lay['track'] / 2, -z, lay['radius'])
            c.rotation_euler = wheel.rotation_euler
            c.scale = (side, 1, 1)
    wheel.hide_render = True
    return lay


def ground_anchor(cam):
    from bpy_extras.object_utils import world_to_camera_view
    p = world_to_camera_view(bpy.context.scene, cam, Vector((0, -SET_FORWARD, 0)))
    return [round(p.x * W, 3), round((1 - p.y) * H, 3)]


def alpha_bounds(path):
    img = bpy.data.images.load(path, check_existing=False)
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    bpy.data.images.remove(img)
    a = px.reshape(h, w, 4)[::-1, :, 3] > .02
    ys, xs = np.nonzero(a)
    if not len(xs):
        return [0, 0, 0, 0], 0
    return [int(xs.min()), int(ys.min()), int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1)], int(a.sum())


def _existing(car_id, upto):
    """Records for views rendered in an earlier, interrupted run."""
    files = []
    for k in range(upto):
        path = ROOT + f'assets/vehicles/{car_id}/{k:02d}.webp'
        bounds, visible = alpha_bounds(path)
        data = open(path, 'rb').read()
        files.append({'frame': k, 'file': f'assets/vehicles/{car_id}/{k:02d}.webp', 'contentBounds': bounds,
                      'visiblePixels': visible, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
    return files


def queue(cars, marker=None, start=0):
    marker = marker or ROOT + 'art/export/sprites_ai_done.txt'
    if os.path.exists(marker):
        os.remove(marker)
    state = {'car': 0, 'k': start, 'files': [], 'cam': None, 'pivot': None, 'report': {}}

    def tick():
        if state['car'] >= len(cars):
            open(marker, 'w').write(json.dumps(state['report']))
            return None
        car_id = cars[state['car']]
        if 'cam' not in state or state['cam'] is None or state.get('loaded') != state['car']:
            sc, cam, pivot = _scene()
            state['loaded'] = state['car']
            state['cam'], state['pivot'] = cam, pivot
            _load_car(car_id, pivot)
            state['files'] = [] if state['k'] == 0 else _existing(car_id, state['k'])
        k = state['k']
        out = ROOT + f'assets/vehicles/{car_id}'
        os.makedirs(out, exist_ok=True)
        state['pivot'].rotation_euler = (0, 0, -math.radians(k * 360 / FRAMES))
        path = f'{out}/{k:02d}.webp'
        bpy.context.scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        bounds, visible = alpha_bounds(path)
        data = open(path, 'rb').read()
        state['files'].append({'frame': k, 'file': f'assets/vehicles/{car_id}/{k:02d}.webp', 'contentBounds': bounds,
                               'visiblePixels': visible, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
        state['k'] += 1
        if state['k'] >= FRAMES:
            state['report'][car_id] = {'groundAnchor': ground_anchor(state['cam']), 'files': state['files']}
            json.dump(state['report'][car_id], open(ROOT + f'art/export/{car_id}/sprites_ai.json', 'w'), indent=1)
            state['car'] += 1
            state['k'] = 0
        return PAUSE
    bpy.app.timers.register(tick, first_interval=.1)
