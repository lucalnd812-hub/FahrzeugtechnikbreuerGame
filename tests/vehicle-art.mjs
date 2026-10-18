import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {VehicleArtLibrary, frameIndexForAngle, closestLoadedFrame,vehicleArtPlacement} from '../src/vehicle-art.js';

assert.equal(frameIndexForAngle(0), 0);
assert.equal(frameIndexForAngle(Math.PI / 4), 2);
assert.equal(frameIndexForAngle(Math.PI * 2), 0);
assert.equal(frameIndexForAngle(-Math.PI / 8), 15);
assert.equal(frameIndexForAngle(NaN), 0);
assert.equal(closestLoadedFrame(new Map([[15, {}]]), 0), 15);
assert.equal(closestLoadedFrame(new Map(), 5), null);

const requested = [], loaded = [];
const images = [];
const library = new VehicleArtLibrary({
  baseUrl: '/test-vehicles',
  version: 'test',
  imageFactory() {
    const image = {naturalWidth: 640, naturalHeight: 400};
    Object.defineProperty(image, 'src', {set(value) { requested.push(value); }});
    images.push(image);
    return image;
  },
  onLoad(index, frame) { loaded.push([index, frame]); }
});

const first = library.load(1, {angle: Math.PI / 4, all: false});
const duplicate = library.loadFrame(1, 2);
assert.equal(requested.length, 1);
assert.equal(requested[0], '/test-vehicles/e30/02.webp?v=test');
images[0].onload();
assert.equal(await first, images[0]);
assert.equal(await duplicate, images[0]);
assert.deepEqual(loaded, [[1, 2]]);
assert.equal(library.get(1, -Math.PI / 8), images[0]);
assert.equal(library.has(0), false);

const commands = [];
const ctx = {globalAlpha: 1, save() {}, restore() {}, drawImage(...args) { commands.push(args); }};
assert.equal(library.draw(ctx, 1, Math.PI / 4, {x: 10, y: 20, width: 320, height: 300}), true);
assert.deepEqual(commands[0].slice(1), [10, 70, 320, 200]);
assert.equal(library.draw(ctx, 0, 0, {x: 0, y: 0, width: 320, height: 200}), false);
assert.equal(library.draw(ctx, 1, 0, {x: 0, y: 0, width: 0, height: 200}), false);
assert.throws(() => library.entry(9), RangeError);

const failed = library.loadFrame(2, 0);
images.at(-1).onerror();
await assert.rejects(failed, /could not be loaded/);
const retry = library.loadFrame(2, 0);
images.at(-1).onload();
assert.equal(await retry, images.at(-1));

const all = library.load(0, {all: true});
images.at(-1).onload();
await all;
assert.equal(library.entry(0).pending.size, 15);
for (const image of images.slice(-15)) image.onload();
await Promise.resolve();
assert.equal(library.entry(0).frames.size, 16);
assert.equal(library.entry(0).pending.size, 0);
const fixedCommands=[],fixedContext={globalAlpha:1,save(){},restore(){},drawImage(...args){fixedCommands.push(args);}};
for(let frame=0;frame<16;frame++){
 assert.equal(library.draw(fixedContext,0,frame*Math.PI/8,{x:0,y:0,width:640,height:400,fit:.88,contentFit:true}),true);
 const draw=fixedCommands.at(-1),p=vehicleArtPlacement(0,frame,{width:640,height:400});
 assert.ok(Math.abs(draw[7]/draw[3]-p.scale)<1e-9,'All angles use the same physical pixel scale');
 assert.ok(Math.abs(draw[5]+(p.sourceAnchor[0]-draw[1])*p.scale-p.groundX)<1e-7);
 assert.ok(Math.abs(draw[6]+(p.sourceAnchor[1]-draw[2])*p.scale-p.groundY)<1e-7);
}
console.log('Vehicle art: wrap, asynchronous loading, deduplication, retry, fallback and drawing PASS');

const cachedImages=[],bounded=new VehicleArtLibrary({imageFactory(){
 const image={naturalWidth:640,naturalHeight:400};
 Object.defineProperty(image,'src',{set(value){this.url=value;queueMicrotask(()=>this.onload());}});
 cachedImages.push(image);return image;
}});
await Promise.all(Array.from({length:5},(_,car)=>Array.from({length:16},(_,frame)=>bounded.loadFrame(car,frame))).flat());
const retainedReference=bounded.get(0,0);assert.equal(cachedImages.length,80);
assert.equal(bounded.trim({maxFrames:24,keepCar:4}),56);
assert.equal([...bounded.cars.values()].reduce((n,entry)=>n+entry.frames.size,0),24,'DOM garage limits old decoded image references');
assert.equal(bounded.entry(4).frames.size,16,'A complete selected turntable remains available for smooth rotation');
assert.ok(retainedReference.url,'Trimming must not invalidate an image currently painted by another consumer');
assert.equal(bounded.trim({maxFrames:24,keepCar:4}),0);

// Release artwork must be from this exact model and render pipeline, not an old mockup.
const manifest = JSON.parse(await readFile(new URL('../assets/vehicles/manifest.json', import.meta.url), 'utf8'));
const modelSource = await readFile(new URL('../src/vehicle-models.js', import.meta.url));
const renderSource = await readFile(new URL('../scripts/render-vehicles.mjs', import.meta.url));
assert.equal(manifest.geometryHash, createHash('sha256').update(modelSource).digest('hex').slice(0, 16), 'Artwork matches current 3D geometry');
const expectedArtHash = createHash('sha256').update(modelSource).update(renderSource).update(JSON.stringify({width: manifest.width, height: manifest.height, frames: manifest.frames, samples: manifest.samples, quality: manifest.quality, selectedIds: manifest.cars.map(car=>car.id),elevation:manifest.camera.elevationDegrees,yawOffset:manifest.camera.yawOffsetDegrees,textures:manifest.textures})).digest('hex').slice(0, 16);
assert.equal(manifest.artHash, expectedArtHash, 'Artwork matches current lighting and camera pipeline');
assert.equal(manifest.renderStyle, 'sculpted-soft-matcap-arcade');
assert.equal(manifest.modelVersion,'breuer-fleet-6');
assert.equal(manifest.quality,2);
assert.equal(manifest.version,5);
assert.deepEqual(manifest.colorManagement,{toneMapping:'NeutralToneMapping',exposure:1.05,output:'SRGBColorSpace'},'Garage sprites use the actual game renderer colour management');
assert.equal(manifest.camera.yawOffsetDegrees,0,'Release turntables start at the true front view');
for(const [kind,name] of [['matcap','car-finish'],['details','car-details']]){
 const record=manifest.textures[kind];assert.equal(record.path,`assets/nextlevel/${name}.webp`);
 const bytes=await readFile(new URL('../'+record.path,import.meta.url));
 assert.ok(bytes.length>1000,'The bundled vehicle finish asset is valid and non-empty');
 assert.equal(bytes.length,record.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),record.sha256,'Baked sprites match the actual bundled finish texture');
 assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WEBP');
}
assert.equal(manifest.camera.elevationDegrees,18,'Approved garage comparison uses an 18-degree eye, not an overhead view');
assert.equal(manifest.samples,3,'Final silhouettes use 3x supersampling');
assert.equal(manifest.framing.mode,'fixed-scale-ground-pivot');
assert.equal(manifest.framing.sharedWorldScale,true);
assert.equal(manifest.camera.motion,'fixed-camera-rotating-model','Workshop lighting must remain on the fixed garage side');
assert.equal(manifest.frames, 16);
assert.equal(manifest.width, 640);
assert.equal(manifest.height, 400);
assert.deepEqual(manifest.cars.map(car => car.id), ['kadett', 'e30', 'm1', 'm2', 'gt3rs']);
let total = 0;
for (const car of manifest.cars) {
  const directory = new URL(`../assets/vehicles/${car.id}/`, import.meta.url);
  assert.equal((await readdir(directory)).filter(name => name.endsWith('.webp')).length, 16);
  for (const frame of car.files) {
    const bytes = await readFile(new URL(`${String(frame.frame).padStart(2, '0')}.webp`, directory));
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
    assert.equal(bytes.toString('ascii', 12, 16), 'VP8X', 'Transparent WebP container');
    assert.equal(bytes.readUIntLE(24, 3) + 1, 640);
    assert.equal(bytes.readUIntLE(27, 3) + 1, 400);
    assert.equal(bytes.length, frame.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), frame.sha256);
    assert.ok(frame.visiblePixels > 640 * 400 * .03, 'Car is visible');
    assert.deepEqual(frame.groundAnchor,car.framing.groundAnchor,'Every view projects the same world-floor pivot');
    const [x,y,w,h]=frame.contentBounds,[fx,fy,fw,fh]=car.framing.bounds;
    assert.ok(x>=fx&&y>=fy&&x+w<=fx+fw&&y+h<=fy+fh,'Every view fits the one common projection envelope');
    total += bytes.length;
  }
}
assert.ok(total < 2_500_000, 'All five cars remain below 2.5 MB for the lightweight renderer');
console.log(`Vehicle art: 80 current transparent frames, dimensions and file integrity PASS (${total} bytes)`);
