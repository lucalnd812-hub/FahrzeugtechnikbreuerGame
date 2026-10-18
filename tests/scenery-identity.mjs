import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {Track} from '../src/race-core.js';
import {TRACKS} from '../src/tracks.js';
import {terrainHeightAt} from '../src/road-surface.js';
import {makeVillage,villageMaterials,orientedBounds} from '../src/scenery.js';
import {installLandmarks,modelBuildingIds} from '../src/landmarks.js';
import {disposeScene} from '../src/world.js';
import {buildingIdentity,facadeAtlasPixels} from '../src/village-identity.js';
import {upgradeVillageTextures} from '../src/village-textures.js';

globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({fillRect(){},fillText(){}})}),querySelector:()=>null};
const base=JSON.parse(fs.readFileSync(new URL('../src/tracks/base.json',import.meta.url)));
const sourceBytes=JSON.stringify(base);
const identities=base.buildings.map(b=>buildingIdentity(b,orientedBounds(b.points)));
assert.ok(new Set(identities.filter(p=>!p.industrial).map(p=>p.id)).size>=8);
assert.ok(new Set(identities.map(p=>p.signature)).size>80);
for(const b of base.buildings)assert.deepEqual(buildingIdentity(b,orientedBounds(b.points)),buildingIdentity(structuredClone(b),orientedBounds(b.points)));
const tagged={id:91,kind:'house',tags:{'building:material':'stone','addr:street':'Im Pohl'}};
assert.equal(buildingIdentity(tagged).wall,'stone');
assert.equal(buildingIdentity(base.buildings.find(b=>b.id===93722371)).id,'historic-village-school');

const atlas=facadeAtlasPixels(),tileHashes=[];
for(let t=0;t<12;t++){
 const pixels=[];for(let y=0;y<128;y++){const row=(Math.floor(t/4)*128+y)*512+(t%4)*128;pixels.push(atlas.data.subarray(row*4,(row+128)*4));}
 tileHashes.push(createHash('sha256').update(Buffer.concat(pixels)).digest('hex'));
}
assert.equal(new Set(tileHashes.slice(0,8)).size,8);assert.equal(new Set(tileHashes.slice(8)).size,4);
assert.deepEqual(atlas.data,facadeAtlasPixels().data);

function pointSegment(x,z,a,b){const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/Math.max(1e-15,dx*dx+dz*dz)));return Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz);}
function rectangleDistance(segments,r){
 const c=Math.cos(r.a),s=Math.sin(r.a),local=p=>[(p[0]-r.x)*c-(p[1]-r.z)*s,(p[0]-r.x)*s+(p[1]-r.z)*c],corners=[[-r.w/2,-r.d/2],[r.w/2,-r.d/2],[r.w/2,r.d/2],[-r.w/2,r.d/2]];let distance=Infinity;
 for(const segment of segments){const a=local(segment.a),b=local(segment.b);let lo=0,hi=1;
  for(let axis=0;axis<2;axis++){const half=axis?r.d/2:r.w/2,d=b[axis]-a[axis];if(Math.abs(d)<1e-10){if(Math.abs(a[axis])>half){lo=2;break;}}else{let u=(-half-a[axis])/d,v=(half-a[axis])/d;if(u>v)[u,v]=[v,u];lo=Math.max(lo,u);hi=Math.min(hi,v);}}
  if(lo<=hi)return 0;
  for(let i=0;i<4;i++){const p=corners[i],q=corners[(i+1)%4];distance=Math.min(distance,pointSegment(...a,p,q),pointSegment(...b,p,q),pointSegment(...p,a,b),pointSegment(...q,a,b));}
 }return distance;
}
const totals=[];
for(const meta of TRACKS){
 const course=JSON.parse(fs.readFileSync(new URL('../src/tracks/'+meta.id+'.json',import.meta.url))),data={...base,...course,buildings:base.buildings.filter(b=>course.buildingIds.includes(b.id))},track=new Track(data.route),scene=new THREE.Scene(),M=villageMaterials(),heightAt=(x,z)=>terrainHeightAt(data,x,z);
 const village=makeVillage(scene,data,track,M,modelBuildingIds,heightAt),landmarks=installLandmarks(scene,data,track,2,{materials:M,sampleGround:terrainHeightAt});
 assert.ok(Object.keys(village.villageStyleCounts).length>=8,meta.id+' needs several visible local facade families');
 assert.ok(village.doorCount>20&&village.shutterCount>20&&village.solarRoofCount>10);
 assert.ok(village.gardenDetails.length>10);
 assert.ok(village.gardenDetails.filter(r=>r.kind==='flowerbed').length>=20,meta.id+' needs individually planted near-street gardens');
 const facades=[];scene.traverse(o=>{if(o.isMesh&&o.name.startsWith('facades:'))facades.push(o);});
 assert.ok(facades.length>1);
 for(const facade of facades){assert.equal(facade.castShadow,false);assert.ok(facade.userData.maxDistance<=215);assert.equal(facade.userData.rangeKind,'detail');}
 const atlasMeshes=facades.filter(o=>o.material.map?.image?.data===M.facade.map.image.data);
 assert.ok(atlasMeshes.length>3);assert.equal(new Set(atlasMeshes.map(o=>o.material)).size,1,'all window designs must share one material, not a material per house');
 for(const record of village.gardenDetails){assert.ok(rectangleDistance(track.segments,record)>6.5,meta.id+' garden in race corridor');for(const road of data.roads||[]){const segments=road.points.slice(1).map((p,i)=>({a:road.points[i],b:p}));assert.ok(rectangleDistance(segments,record)>(road.width||6)/2+.25,meta.id+' garden on ordinary street');}}
 // Validate the actual buffers after batching: every rendered surveyed roof
 // vertex must come from that house's NRW surface at the original height/x/z.
 // This permits Earcut to remove collinear/zero-area contour points without
 // incorrectly expecting those points to become independent roof triangles.
 const roofSamplesByBuilding=new Map(),sourceRoofPoints=data.buildings.map(b=>{if(!b.geodata?.roofSurfaces?.length)return null;const ground=b.points.reduce((sum,p)=>sum+heightAt(...p),0)/b.points.length;return b.geodata.roofSurfaces.flat().map(p=>[p[0],p[1]+ground,p[2]]);});let roofSamples=0;
 scene.traverse(o=>{if(!o.isMesh||o.material!==M.houseRoof)return;const p=o.geometry.attributes.position,source=o.geometry.attributes.sourceBuilding;assert.ok(source);for(let i=0;i<p.count;i++){const index=source.getX(i);if(index<0)continue;const actual=[p.getX(i),p.getY(i),p.getZ(i)];assert.ok(sourceRoofPoints[index]?.some(expected=>Math.hypot(...expected.map((value,axis)=>value-actual[axis]))<.0002),'A rendered roof was moved or invented: '+data.buildings[index]?.id);roofSamplesByBuilding.set(index,(roofSamplesByBuilding.get(index)||0)+1);roofSamples++;}});
 const replacementIds=new Set([...modelBuildingIds,...data.pois.filter(p=>['church','atm'].includes(p.id)).map(p=>p.buildingId)]);
 for(const [index,b] of data.buildings.entries())if(!replacementIds.has(b.id)&&b.geodata?.roofSurfaces?.length)assert.ok(roofSamplesByBuilding.get(index)>=3,'A mapped roof vanished completely: '+b.id);
 assert.ok(roofSamples>1000);
 assert.ok(landmarks.byId.breuer.getObjectByName('breuer:open-workshop'));assert.ok(landmarks.byId.school.userData.visualEvidence.includes('Municipality'));
 let geometry=0,triangles=0;scene.traverse(o=>{if(o.isMesh){geometry++;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;}});
 assert.ok(geometry<700&&triangles<600000,'unbounded scenery detail');
 totals.push({track:meta.id,styles:Object.keys(village.villageStyleCounts).length,identities:new Set(village.villageIdentities.map(v=>v.signature)).size,windows:village.windowCount,doors:village.doorCount,shutters:village.shutterCount,gardens:village.gardenDetails.length,solarRoofs:village.solarRoofCount,meshes:geometry,triangles,unchangedRoofVertices:roofSamples});
 disposeScene(scene);
}
assert.equal(JSON.stringify(base),sourceBytes,'Scenery must never mutate map footprints/heights');

// Delayed generated pixels share one decoded image, but never share Texture
// ownership or revive a world that has already been torn down.
const pending=[],requests=[];
class MockImage{
 set src(url){requests.push(url);pending.push(this);}get width(){return 512;}get height(){return 512;}
}
const first=new THREE.CanvasTexture({fallback:1}),second=new THREE.CanvasTexture({fallback:2}),third=new THREE.CanvasTexture({fallback:3}),failure=new THREE.CanvasTexture({fallback:4}),missing=new THREE.CanvasTexture({fallback:5});
const p1=upgradeVillageTextures({stone:first},{root:'/qa-scenery-/',ImageType:MockImage}),p2=upgradeVillageTextures({stone:second},{root:'/qa-scenery-/',ImageType:MockImage}),p3=upgradeVillageTextures({slate:third},{root:'/qa-scenery-/',ImageType:MockImage}),p4=upgradeVillageTextures({brick:failure},{root:'/qa-scenery-/',ImageType:MockImage});
assert.equal(requests.length,3);first.dispose();
pending[0].onload();pending[1].onload();pending[2].onerror();
const results=await Promise.all([p1,p2,p3,p4]);
assert.equal(first.image.fallback,1);assert.equal(second.image,pending[0]);assert.equal(third.image,pending[1]);assert.equal(failure.image.fallback,4);assert.equal(results[0][0].disposed,true);assert.equal(results[1][0].loaded,true);assert.equal(results[3][0].loaded,false);
assert.notEqual(first,second);assert.deepEqual(await upgradeVillageTextures({plaster:missing},{ImageType:null}),[]);
for(const texture of [second,third,failure,missing])texture.dispose();
delete globalThis.document;
console.log('PASS Deterministic local styles, eight different windows/four doors in one atlas, measured roof vertices unchanged, all gardens off every race/ordinary road, bounded culled batches and late-texture ownership.');
for(const total of totals)console.log(JSON.stringify(total));
