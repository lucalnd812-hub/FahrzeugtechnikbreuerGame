"""Copy finished Blender exports (art/export/<id>) into the game, run inside
Blender because it has the WebP codec:

* assets/vehicles3d/<id>-high.glb, <id>-low.glb and manifest.json
  ({cars: {id: {track, radius, axles}}}, game coordinates)
* garage turntables (only with sprites=True, and only for the full fleet so
  the garage keeps one scale): 16 transparent WebP per car at SPRITE_W x
  SPRITE_H, and assets/vehicles/manifest.json with bounds and hashes.
"""
import bpy, os, json, shutil, hashlib, math
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
EXPORT = os.path.join(REPO, 'art', 'export')
FLEET = ['kadett', 'e30', 'm1', 'm2', 'gt3rs']
SOURCES = ['carkit.py', 'carparts.py', 'carbody.py', 'export.py']
SPRITE_W, SPRITE_H, QUALITY = 960, 600, 80
ORTHO, ELEV, TARGET_Z = 6.26, 18.0, .66


def sha(data):
    return hashlib.sha256(data).hexdigest()


def source_hash(car_id):
    h = hashlib.sha256()
    for name in SOURCES + [car_id + '.py']:
        h.update(open(os.path.join(HERE, name), 'rb').read())
    return h.hexdigest()[:16]


def glbs(ids):
    out = os.path.join(REPO, 'assets', 'vehicles3d')
    os.makedirs(out, exist_ok=True)
    path = os.path.join(out, 'manifest.json')
    man = json.load(open(path)) if os.path.exists(path) else {'version': 1, 'cars': {}}
    for car_id in ids:
        src = os.path.join(EXPORT, car_id)
        info = json.load(open(os.path.join(src, 'layout.json')))
        for lod in ('high', 'low'):
            shutil.copyfile(os.path.join(src, f'{car_id}-{lod}.glb'), os.path.join(out, f'{car_id}-{lod}.glb'))
        tris = dict(man['cars'].get(car_id, {}).get('tris', {}))   # keep LODs not re-exported
        tris.update({l['lod']: l['bodyTris'] + 4 * l['wheelTris'] for l in info['lods']})
        man['cars'][car_id] = dict(info['layout'], source=source_hash(car_id), tris=tris)
    json.dump(man, open(path, 'w'), indent=1)
    return man


def _scaled(path, dst):
    img = bpy.data.images.load(path, check_existing=False)
    img.scale(SPRITE_W, SPRITE_H)
    px = np.empty(SPRITE_W * SPRITE_H * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    # The shadow catcher leaves a faint haze over the whole frame; drop it so
    # only the car and its contact shadow count (smaller files, tight bounds).
    v = px.reshape(-1, 4)
    v[:, 3] = np.clip((v[:, 3] - .07) / .93, 0, 1)   # soft remap, no hard edge
    # Keep the contact shadow close to the car only: fade it out 8-26 px
    # away from the opaque body (box-filter dilation via an integral image).
    a = v[:, 3].reshape(SPRITE_H, SPRITE_W)
    body = (a > .96).astype(np.float32)
    def near(r):
        s = np.pad(body, r + 1).cumsum(0).cumsum(1)
        n = SPRITE_H, SPRITE_W
        k = 2 * r + 1
        box = s[k:k + n[0], k:k + n[1]] - s[:n[0], k:k + n[1]] - s[k:k + n[0], :n[1]] + s[:n[0], :n[1]]
        return box > 0
    keep = np.where(near(8), 1.0, np.where(near(16), .5, np.where(near(26), .15, 0.0)))
    v[:, 3] *= keep.reshape(-1)
    v[v[:, 3] <= 0] = 0
    img.pixels.foreach_set(px)
    img.filepath_raw = dst
    img.file_format = 'WEBP'
    sc = bpy.context.scene.render.image_settings
    old = sc.quality
    sc.quality = QUALITY
    img.save_render(dst)
    sc.quality = old
    bpy.data.images.remove(img)
    a = px.reshape(SPRITE_H, SPRITE_W, 4)[::-1, :, 3] > .02
    ys, xs = np.nonzero(a)
    return [int(xs.min()), int(ys.min()), int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1)], int(a.sum())


def sprites(ids=FLEET):
    path = os.path.join(REPO, 'assets', 'vehicles', 'manifest.json')
    man = json.load(open(path, encoding='utf-8'))
    ppm = SPRITE_W / ORTHO
    anchor = [SPRITE_W / 2, round(SPRITE_H / 2 + TARGET_Z * math.cos(math.radians(ELEV)) * ppm, 6)]
    sc = bpy.context.scene
    sc.render.image_settings.file_format = 'WEBP'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.look = 'None'
    by_id = {c['id']: c for c in man['cars']}
    for car_id in ids:
        car = by_id[car_id]
        dst_dir = os.path.join(REPO, 'assets', 'vehicles', car_id)
        files = []
        for k in range(16):
            dst = os.path.join(dst_dir, f'{k:02d}.webp')
            bounds, visible = _scaled(os.path.join(EXPORT, car_id, 'sprites', f'{k:02d}.webp'), dst)
            data = open(dst, 'rb').read()
            files.append({'frame': k, 'contentBounds': bounds, 'groundAnchor': anchor, 'visiblePixels': visible,
                          'bytes': len(data), 'sha256': sha(data)})
        car['files'] = files
        car['source'] = source_hash(car_id)
        xs = [f['contentBounds'] for f in files]
        car['framing'] = {'bounds': [min(b[0] for b in xs), min(b[1] for b in xs),
                                     max(b[0] + b[2] for b in xs) - min(b[0] for b in xs),
                                     max(b[1] + b[3] for b in xs) - min(b[1] for b in xs)], 'groundAnchor': anchor}
    allb = [f['contentBounds'] for c in man['cars'] for f in c['files']]
    x0, y0 = min(b[0] for b in allb), min(b[1] for b in allb)
    man['framing']['bounds'] = [x0, y0, max(b[0] + b[2] for b in allb) - x0, max(b[1] + b[3] for b in allb) - y0]
    man.update(width=SPRITE_W, height=SPRITE_H, renderer='Blender Cycles (art/blender), transparent WebP turntable',
               renderStyle='blender-cycles-studio', modelVersion='breuer-fleet-7', version=6)
    man['camera'].update(pixelsPerMetre=ppm, groundAnchor=anchor)
    art = hashlib.sha256()
    for c in man['cars']:
        art.update(c['source'].encode())
    man['artHash'] = man['geometryHash'] = art.hexdigest()[:16]
    json.dump(man, open(path, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    return man
