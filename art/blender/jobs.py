"""Run a car build plus a list of renders inside Blender's own timer loop, so
long builds never block or time out the remote call. Writes <marker>.txt when
done and <marker>.log with any output/traceback."""
import bpy, os, sys, io, contextlib, traceback

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)


def job(script, shots, marker, after=None):
    log = marker.replace('.txt', '.log')
    if os.path.exists(marker):
        os.remove(marker)

    def run():
        buf = io.StringIO()
        try:
            with contextlib.redirect_stdout(buf):
                ns = {'__file__': script, '__name__': '__main__'}
                exec(compile(open(script, encoding='utf-8').read(), script, 'exec'), ns)
                if after:
                    after(ns)
            K = ns['K']
            if shots:
                rig = K.studio()
                K.queue_shots(rig, shots, marker)
            else:
                open(marker, 'w').write('done')
        except Exception:
            buf.write(traceback.format_exc())
            open(marker, 'w').write('error')
        open(log, 'w', encoding='utf-8').write(buf.getvalue())
        return None
    bpy.app.timers.register(run, first_interval=.2)


bpy.app.driver_namespace['breuer_job'] = job
