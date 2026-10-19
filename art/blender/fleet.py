"""Build one car and export everything the game needs, inside Blender:

    bpy.app.driver_namespace['breuer_fleet']('m1')

Writes art/export/<id>/<id>-high.glb, <id>-low.glb, layout.json (wheel
track/radius/axles in game coordinates: game z = -Blender y) and the 16
garage sprites in art/export/<id>/sprites (sprites/done.txt when finished).
"""
import bpy, os, sys, json, importlib

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
EXPORT = os.path.join(os.path.dirname(HERE), 'export')
SCRIPTS = {'kadett': 'kadett.py', 'e30': 'e30.py', 'm1': 'm1.py', 'm2': 'm2.py', 'gt3rs': 'gt3rs.py'}
LODS = (('high', 60000, 5000), ('low', 9000, 700))


def layout(car_id):
    roots = [o for o in bpy.data.objects if o.type == 'EMPTY' and o.name.split('.')[0] == car_id
             and any(c.name.startswith(car_id + '.wheel') for c in o.children)]
    xs = sorted({round(abs(o.location.x), 4) for o in roots})
    zs = sorted({round(-o.location.y, 4) for o in roots})
    radius = max(o.location.z for o in roots)
    return {'track': round(2 * xs[-1], 4), 'radius': round(radius, 4), 'axles': zs}


def export_car(car_id, sprites=True, samples=48):
    import jobs, export
    importlib.reload(export)
    out = os.path.join(EXPORT, car_id)
    os.makedirs(out, exist_ok=True)
    marker = os.path.join(out, 'build_done.txt')

    def after(ns):
        ns['K'].studio()
        info = {'layout': layout(car_id), 'lods': []}
        for lod, body, wheel in LODS:
            info['lods'].append(export.export_glb(car_id, out, lod, body, wheel))
        json.dump(info, open(os.path.join(out, 'layout.json'), 'w'), indent=1)
        if sprites:
            export.queue_sprites(car_id, os.path.join(out, 'sprites'), os.path.join(out, 'sprites', 'done.txt'), samples)
    jobs.job(os.path.join(HERE, SCRIPTS[car_id]), None, marker, after=after)


bpy.app.driver_namespace['breuer_fleet'] = export_car


def export_queue(ids, sprites=True, samples=48):
    """Export several cars one after another (each waits for the previous
    car's sprites). Progress: art/export/queue.txt."""
    todo = list(ids)
    log = os.path.join(EXPORT, 'queue.txt')
    state = {'cur': None}

    def tick():
        cur = state['cur']
        if cur:
            out = os.path.join(EXPORT, cur)
            built = os.path.join(out, 'build_done.txt')
            done = os.path.join(out, 'sprites', 'done.txt') if sprites else built
            if os.path.exists(built) and open(built).read().strip() == 'error':
                open(log, 'a').write(f'{cur} error\n')
            elif not os.path.exists(done):
                return 5.0
            else:
                open(log, 'a').write(f'{cur} done\n')
        if not todo:
            open(log, 'a').write('all done\n')
            return None
        state['cur'] = todo.pop(0)
        for f in ('build_done.txt', os.path.join('sprites', 'done.txt')):
            p = os.path.join(EXPORT, state['cur'], f)
            if os.path.exists(p):
                os.remove(p)
        export_car(state['cur'], sprites, samples)
        return 5.0
    bpy.app.timers.register(tick, first_interval=.5)


bpy.app.driver_namespace['breuer_fleet_queue'] = export_queue


def review_queue(items, shots_for):
    """Build + render review shots for several scripts in turn:
    items = [(car_id, tag)], shots_for(tag) -> carkit shot tuples."""
    import jobs
    todo = list(items)
    renders = os.path.join(os.path.dirname(HERE), 'renders')
    state = {'marker': None}

    def tick():
        m = state['marker']
        if m and not os.path.exists(m):
            return 3.0
        if not todo:
            return None
        car_id, tag = todo.pop(0)
        state['marker'] = os.path.join(renders, tag + '_done.txt')
        jobs.job(os.path.join(HERE, SCRIPTS[car_id]), shots_for(tag), state['marker'])
        return 3.0
    bpy.app.timers.register(tick, first_interval=.5)


bpy.app.driver_namespace['breuer_review'] = review_queue
