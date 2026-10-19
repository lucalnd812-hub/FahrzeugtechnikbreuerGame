import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {Track} from '../src/race-core.js';
import {makeWorld} from '../src/world.js';
import {beveledBoxGeometry,windowReveal,atlasPane,paintedAtlasMaterial} from '../src/scenery.js';

// Geometry and the installed Three shader sources are real. Canvas/Image below
// only emulate asynchronous image ownership; this does not compile GLSL or
// claim GPU frame rates. Real decoded texture previews are separate QA output.
const draws=[],requests=[];
function canvas(){const c={width:0,height:0};c.getContext=()=>({fillRect(){},fillText(){},drawImage(...args){draws.push({canvas:c,args});}});return c;}
globalThis.document={createElement:canvas,querySelector:()=>null};
class SourceImage{
 width=1024;height=1024;
 set src(url){const path=new URL('../assets/'+url.replace(/^\.\//,''),import.meta.url);const bytes=fs.readFileSync(path);assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WEBP');assert.ok(bytes.length>10000,'Art asset is empty/truncated: '+url);requests.push(url);queueMicrotask(()=>this.onload?.());}
}
globalThis.Image=SourceImage;
const bevel=beveledBoxGeometry(2,3,1,.08);bevel.computeBoundingBox();
assert.equal(bevel.attributes.position.count/3,44,'A broad chamfer should not become a dense rounded cube');
assert.deepEqual(bevel.boundingBox.min.toArray(),[-1,-1.5,-.5]);assert.deepEqual(bevel.boundingBox.max.toArray(),[1,1.5,.5]);
const normals=bevel.attributes.normal;let sloped=0;
for(let i=0;i<normals.count;i++){const n=[normals.getX(i),normals.getY(i),normals.getZ(i)];assert.ok(Math.abs(Math.hypot(...n)-1)<1e-6);if(n.filter(v=>Math.abs(v)>.1).length>1)sloped++;}
assert.ok(sloped>40,'The mesh must contain physical edge/corner normals');bevel.dispose();
const reveal=windowReveal(1,1.3);reveal.computeBoundingBox();assert.ok(reveal.boundingBox.max.z-reveal.boundingBox.min.z>.06);assert.equal(reveal.attributes.position.count/3,16);reveal.dispose();
for(let slot=0;slot<16;slot++){const p=atlasPane(slot,1,1),uv=p.attributes.uv;for(let i=0;i<uv.count;i++){assert.equal(Math.floor(uv.getX(i)*4),slot%4);assert.equal(Math.floor((1-uv.getY(i))*4),Math.floor(slot/4));}p.dispose();}

const sourceShaderHash=createHash('sha256').update(THREE.ShaderChunk.map_fragment).digest('hex');
for(const grid of [2,4]){
 const material=paintedAtlasMaterial(new THREE.MeshStandardMaterial(),grid),shader={vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
 material.onBeforeCompile(shader);
 assert.match(shader.vertexShader,/attribute float paintTile/);assert.match(shader.vertexShader,/vPaintTile = paintTile/);assert.match(shader.fragmentShader,/fract\(vMapUv\)/);assert.match(shader.fragmentShader,/textureGrad/);assert.match(shader.fragmentShader,/dFdx\(vMapUv\)/);assert.equal((shader.fragmentShader.match(/textureGrad\( map,/g)||[]).length,1,'One diffuse sample, no extra material pass');assert.ok(!shader.fragmentShader.includes('#include <map_fragment>'));
 assert.match(material.customProgramCacheKey(),new RegExp('atlas-'+grid));material.dispose();
}
assert.equal(createHash('sha256').update(THREE.ShaderChunk.map_fragment).digest('hex'),sourceShaderHash,'Shader injection must not alter shared Three sources');

const base=JSON.parse(fs.readFileSync(new URL('../src/tracks/base.json',import.meta.url))),course=JSON.parse(fs.readFileSync(new URL('../src/tracks/lammersdorf.json',import.meta.url))),data=structuredClone({...base,...course,buildings:base.buildings.filter(b=>course.buildingIds.includes(b.id)),landAreas:base.landAreas.filter(a=>course.landAreaIds.includes(a.id))}),original=JSON.stringify(data),track=new Track(data.route),world=makeWorld(data,track);
await new Promise(resolve=>setImmediate(resolve));
const far=[],near=[],fades=[],lowWalls=[],highWalls=[];world.scene.traverse(o=>{if(o.name.startsWith('trees:far:'))far.push(o);if(o.userData.treeTile)near.push(o);if(o.name.startsWith('ground-transitions:'))fades.push(o);if(o.name.startsWith('buildings-low-walls:'))lowWalls.push(o);if(o.userData.minimumQuality===1&&o.geometry?.attributes.paintTile)highWalls.push(o);});
assert.ok(world.scene.userData.treeRecords.length>1000);assert.ok(far.length>10&&near.length>10);
assert.equal(far.reduce((sum,o)=>sum+o.geometry.attributes.position.count/3,0),world.scene.userData.treeRecords.length*8,'Distant trees: two crown and two trunk quads, with no separate trunk submissions');
assert.equal(new Set(far.map(o=>o.material)).size,1);const foliage=far[0].material;assert.ok(foliage.alphaTest>=.4);assert.equal(foliage.transparent,false);assert.equal(foliage.depthWrite,true);assert.equal(foliage.side,THREE.DoubleSide);assert.deepEqual(foliage.map.userData.plainSwatch,[.0015,.9985]);assert.ok(!foliage.userData.paintAtlas,'Q0 cutout trees use ordinary supported map sampling');
const before=far.map(o=>new Float32Array(o.geometry.attributes.position.array));near[0].userData.setNear(true);assert.ok(far.some((o,i)=>o.geometry.attributes.position.array.some((v,k)=>v!==before[i][k])),'Near crowns must replace, rather than overlap, the distant cards');
const versions=far.map(o=>o.geometry.attributes.position.version);near[0].userData.setNear(true);assert.deepEqual(far.map(o=>o.geometry.attributes.position.version),versions,'An unchanged LOD state must not reupload geometry');near[0].userData.setNear(false);far.forEach((o,i)=>assert.deepEqual(o.geometry.attributes.position.array,before[i]));
assert.ok(fades.length>5);for(const o of fades){assert.equal(o.material.forceSinglePass,true);assert.equal(o.material.depthWrite,false);assert.equal(o.userData.minimumQuality,1);assert.equal(o.renderOrder,1);}
assert.ok(highWalls.length>5&&lowWalls.length>5);world.setQuality(2);world.scene.traverse(o=>{if(!o.isMesh||!o.material?.userData.paintAtlas)return;const tile=o.geometry.attributes.paintTile;assert.ok(tile&&tile.count===o.geometry.attributes.position.count,'Every shader-atlas vertex needs its own source tile');for(let i=0;i<tile.count;i+=3){assert.equal(tile.getX(i),tile.getX(i+1));assert.equal(tile.getX(i),tile.getX(i+2));}});world.setQuality(0);assert.ok(draws.some(r=>r.args.length===9),'Painted low maps are cropped from real decoded atlas sources');
const allTextures=new Set();world.scene.traverse(o=>{for(const a of o.userData.qualityMaterials?.values?.()||[])for(const m of a)if(m.map)allTextures.add(m.map);});
for(const kind of ['village-facades','village-ground','artisan-windows','artisan-workshop','artisan-roadside','artisan-roofs','artisan-foliage'])assert.ok([...allTextures].some(t=>t.userData.generatedDiffuse===kind||t.userData.generatedDiffuse?.startsWith(kind+':')),'Missing real map asset '+kind);
assert.equal(world.scene.userData.skyTexture.userData.generatedDiffuse,'artisan-sky');
const camera=new THREE.PerspectiveCamera(56,16/9,.1,260),start=track.at(0);camera.position.set(start.x,8,start.z);camera.lookAt(start.x+start.dx*10,1,start.z+start.dz*10);camera.updateProjectionMatrix();
for(const q of [0,1,2,0]){
 world.setQuality(q);
 for(const o of highWalls)assert.equal(o.visible,q>0,'High atlas wall batches must be exclusive to medium/high');
 for(const o of lowWalls)assert.equal(o.visible,q===0,'Low walls must replace, rather than overlap, high atlas walls');
 world.updateVisibility(camera,q);
 world.scene.traverse(o=>{if(!o.isMesh)return;for(let p=o;p;p=p.parent)if(!p.visible)return;for(const m of Array.isArray(o.material)?o.material:[o.material])if(q===0){assert.ok(!m.userData.paintAtlas,'The conservative low profile must not require custom shader injection');if(m.isMeshLambertMaterial&&o.geometry.attributes.sourceBuilding)assert.notEqual(m.map?.name,'artisan:roof-atlas','Q0 measured roofs use a normal cropped tile');}});
 // The painted sky is a single background texture, so phones get it as well.
 assert.equal(world.scene.background,world.scene.userData.skyTexture);
}
// Every world owns its Texture handles, including late atlas crops and sky.
const owned=new Map();for(const t of [...allTextures,world.scene.userData.skyTexture]){owned.set(t,0);t.addEventListener('dispose',()=>owned.set(t,owned.get(t)+1));}world.dispose();world.dispose();for(const count of owned.values())assert.equal(count,1,'Texture disposal exactly once');
assert.equal(JSON.stringify(data),original,'Art must preserve authored roads, footprints, roof surfaces and coordinates');
assert.equal(new Set(requests).size,requests.length,'Decoded source images are shared across material crops');
delete globalThis.Image;delete globalThis.document;
console.log('PASS Artisan map: 44-triangle bounded chamfers, 3D window reveals, installed Three shader-source contracts (not GPU compilation), low-profile ordinary map fallback, eight real WebP art sources, one cutout forest batch per tile, non-overlapping near LOD without unchanged-state buffer uploads, single-pass oil-safe ground fades, immutable map data and exact-once texture disposal.');
console.log(JSON.stringify({trees:world.scene.userData.treeRecords.length,farForestBatches:far.length,farTriangles:far.reduce((sum,o)=>sum+o.geometry.attributes.position.count/3,0),nearTiles:near.length,atlasSourceRequests:requests.length,groundFadeBatches:fades.length}));
