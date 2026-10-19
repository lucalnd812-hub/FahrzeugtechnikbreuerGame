/**
 * Writes assets/vehicles/manifest.json for the showroom turntables rendered by
 * art/blender/ai_sprites.py (one art/export/<id>/sprites_ai.json per car).
 *
 * node scripts/build-sprite-manifest.mjs
 *
 * Each car's `source` hashes its generated model (art/ai3d/<id>_tripo.glb) and
 * both Blender scripts, so stale renders fail tests/vehicle-art.mjs.
 */
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';

const root = new URL('../', import.meta.url);
const read = path => fs.readFile(new URL(path, root));
const IDS = ['kadett', 'e30', 'm1', 'm2', 'gt3rs'];
const NAMES = {kadett: 'Opel Kadett C Coupé', e30: 'BMW E30 M3 Gruppe A', m1: 'BMW M1 Procar', m2: 'BMW M2 Competition', gt3rs: 'Porsche 911 GT3 RS'};
const W = 1344, H = 752, FRAMES = 16;

export async function sourceHash(id) {
  const hash = createHash('sha256');
  for (const part of await Promise.all(['art/blender/ai_car.py', 'art/blender/ai_sprites.py', `art/ai3d/${id}_tripo.glb`].map(read))) hash.update(part);
  return hash.digest('hex').slice(0, 16);
}

const old = JSON.parse(await read('assets/vehicles/manifest.json'));
const fleet = createHash('sha256'), cars = [];
let anchor = null;
for (const id of IDS) {
  const spec = JSON.parse(await read(`art/export/${id}/sprites_ai.json`));
  if (spec.files.length !== FRAMES) throw new Error(`${id}: ${spec.files.length} views`);
  anchor ??= spec.groundAnchor;
  const files = [];
  for (const file of spec.files) {
    const bytes = await read(`assets/vehicles/${id}/${String(file.frame).padStart(2, '0')}.webp`);
    files.push({frame: file.frame, contentBounds: file.contentBounds, groundAnchor: spec.groundAnchor, visiblePixels: file.visiblePixels,
      bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex')});
  }
  const x0 = Math.min(...files.map(f => f.contentBounds[0])), y0 = Math.min(...files.map(f => f.contentBounds[1]));
  const x1 = Math.max(...files.map(f => f.contentBounds[0] + f.contentBounds[2])), y1 = Math.max(...files.map(f => f.contentBounds[1] + f.contentBounds[3]));
  const source = await sourceHash(id);
  fleet.update(source);
  cars.push({id, name: NAMES[id], source, framing: {bounds: [x0, y0, x1 - x0, y1 - y0], groundAnchor: spec.groundAnchor}, files});
}
const bounds = [Math.min(...cars.map(c => c.framing.bounds[0])), Math.min(...cars.map(c => c.framing.bounds[1]))];
bounds.push(Math.max(...cars.map(c => c.framing.bounds[0] + c.framing.bounds[2])) - bounds[0], Math.max(...cars.map(c => c.framing.bounds[1] + c.framing.bounds[3])) - bounds[1]);
const art = fleet.digest('hex').slice(0, 16);
const manifest = {
  version: 7, modelVersion: 'breuer-fleet-8', renderStyle: 'blender-cycles-showroom', geometryHash: art, artHash: art,
  textures: old.textures, colorManagement: {toneMapping: 'Standard', exposure: -.45, output: 'SRGBColorSpace'},
  renderer: 'Blender Cycles (art/blender/ai_sprites.py), Higgsfield/Tripo models, transparent WebP turntable',
  width: W, height: H, frames: FRAMES, samples: 20, quality: 2,
  camera: {projection: 'backdrop', backdrop: '/nextlevel/garage-showroom.webp', motion: 'fixed-camera-rotating-model', front: '+Z',
    frameZero: 'front', yawRadiansPerFrame: Math.PI * 2 / FRAMES, yawOffsetDegrees: 0, heightMetres: .738, distanceMetres: 4.624,
    focalPixels: 664, horizon: 372, groundAnchor: anchor, safeWidth: 860, pixelsPerMetre: 664 / 4.624},
  framing: {mode: 'backdrop-pixel-match', bounds, anchor: [anchor[0] / W, anchor[1] / H], sharedWorldScale: true},
  cars,
};
await fs.writeFile(new URL('assets/vehicles/manifest.json', root), JSON.stringify(manifest, null, 1) + '\n');
console.log('vehicle sprites', art, cars.map(c => c.id + ':' + c.files.reduce((s, f) => s + f.bytes, 0)).join(' '));
