import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {Track,CARS} from '../src/race-core.js';
import {TRACKS,sampleGround} from '../src/tracks.js';
import {terrainHeightAt} from '../src/road-surface.js';
import {makeWorld,makeCar,setCarQuality,disposeScene,animateCar} from '../src/world.js';
import {FrameQuality,RENDER_PROFILES} from '../src/performance.js';

// Canvas is only used to populate procedural texture pixels. All measured
// geometry, visibility, transforms and disposal are the actual Three.js objects.
globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({fillRect(){},fillText(){}})}),querySelector:()=>null};
const base=JSON.parse(fs.readFileSync(new URL('../src/tracks/base.json',import.meta.url)));
function dataFor(id){const c=JSON.parse(fs.readFileSync(new URL('../src/tracks/'+id+'.json',import.meta.url)));return structuredClone({...base,...c,buildings:base.buildings.filter(b=>c.buildingIds.includes(b.id)),landAreas:base.landAreas.filter(a=>c.landAreaIds.includes(a.id))});}
function resources(root){
 const g=new Set(),m=new Set(),t=new Set(),instances=new Set();
 const addMaterial=x=>{if(!x?.isMaterial)return;m.add(x);for(const v of Object.values(x))if(v?.isTexture)t.add(v);};
 root.traverse(o=>{if(o.geometry)g.add(o.geometry);if(o.isInstancedMesh)instances.add(o);for(const material of Array.isArray(o.material)?o.material:o.material?[o.material]:[])addMaterial(material);const quality=o.userData?.qualityMaterials;if(Array.isArray(quality))quality.forEach(addMaterial);else if(quality?.values)for(const variant of quality.values())for(const material of Array.isArray(variant)?variant:[variant])addMaterial(material);});
 return {g,m,t,instances};
}
const sizes=r=>({geometries:r.g.size,materials:r.m.size,textures:r.t.size,instances:r.instances.size});
function pointSegment(x,z,a,b){const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/Math.max(1e-15,dx*dx+dz*dz)));return Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz);}
// Exact segment/rectangle distances independently verify placement sampling.
function rectangleDistance(track,r){
 const c=Math.cos(r.a),s=Math.sin(r.a),corners=[[-r.w/2,-r.d/2],[r.w/2,-r.d/2],[r.w/2,r.d/2],[-r.w/2,r.d/2]],local=p=>[(p[0]-r.x)*c-(p[1]-r.z)*s,(p[0]-r.x)*s+(p[1]-r.z)*c];let min=Infinity;
 for(const segment of track.segments){const a=local(segment.a),b=local(segment.b);let lo=0,hi=1;
  for(let axis=0;axis<2;axis++){const half=axis?r.d/2:r.w/2,d=b[axis]-a[axis];if(Math.abs(d)<1e-9){if(Math.abs(a[axis])>half){lo=2;break;}}else{let t0=(-half-a[axis])/d,t1=(half-a[axis])/d;if(t0>t1)[t0,t1]=[t1,t0];lo=Math.max(lo,t0);hi=Math.min(hi,t1);}}
  if(lo<=hi)return 0;
  for(let i=0;i<4;i++){const p=corners[i],q=corners[(i+1)%4];min=Math.min(min,pointSegment(...a,p,q),pointSegment(...b,p,q),pointSegment(...p,a,b),pointSegment(...q,a,b));}
 }return min;
}
function stats(scene,camera){
 camera.updateMatrixWorld(true);scene.updateMatrixWorld(true);
 const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
 let meshes=0,triangles=0;
 scene.traverse(o=>{if(!o.isMesh)return;for(let a=o;a;a=a.parent)if(a.visible===false)return;if(o.frustumCulled&&!frustum.intersectsObject(o))return;
  meshes++;triangles+=((o.geometry.index?.count??o.geometry.attributes.position.count)/3)*(o.isInstancedMesh?o.count:1);
 });return {meshes,triangles};
}
const heap=[],baselines=new Map(),samples=[];
for(let pass=0;pass<10;pass++){
 const meta=TRACKS[pass%TRACKS.length],data=dataFor(meta.id),track=new Track(data.route);track.heightAt=(x,z)=>sampleGround(data,x,z);
 const world=makeWorld(data,track),cars=[];
 if(pass<3){
  assert.ok(world.courseProps.length>100);assert.ok(world.kerbs.length>300);
  for(const r of world.courseProps)assert.ok(rectangleDistance(track,r)>=6.5,meta.id+' unsafe roadside '+r.kind);
  for(const r of world.kerbs)assert.ok(rectangleDistance(track,r)>=5.09,meta.id+' kerb intrudes into racing asphalt');
  const positions=world.scene.getObjectByName('course:asphalt').geometry.attributes.position;
  for(let i=0;i<positions.count;i++)assert.ok(Math.abs(positions.getY(i)-terrainHeightAt(data,positions.getX(i),positions.getZ(i))-.064)<1e-5,'course follows actual terrain triangles');
 }
 for(let i=0;i<6;i++){const car=makeCar(i%CARS.length,false,0),p=track.at(-12-Math.floor(i/2)*6);assert.equal(car.userData.modelId,CARS[i%CARS.length].id,'world must use the new selected model');car.position.set(p.x,track.heightAt(p.x,p.z),p.z);car.rotation.y=p.angle;world.scene.add(car);cars.push(car);}
 const original=resources(world.scene),camera=new THREE.PerspectiveCamera(56,16/9,.1,RENDER_PROFILES[0].far);
 for(let q=0;q<3;q++){
  world.setQuality(q);cars.forEach(car=>setCarQuality(car,q));camera.far=RENDER_PROFILES[q].far;camera.updateProjectionMatrix();
  assert.equal(world.sun.castShadow,true,'phones keep cel shadows');assert.equal(world.scene.environmentIntensity,q===0?.12:q===1?.25:.4);
  assert.equal(world.sun.shadow.mapSize.x,q===2?1024:q===1?768:512);
  for(const fraction of [0,.2,.4,.6,.8]){
   const p=track.at(track.length*fraction),look=track.at(track.length*fraction+14);
   camera.position.set(p.x-p.dx*11,track.heightAt(p.x,p.z)+7,p.z-p.dz*11);camera.lookAt(look.x,track.heightAt(look.x,look.z)+1,look.z);
   world.updateVisibility(camera,q);assert.ok(world.scene.fog.far<=camera.far*.96+1e-10);
   const s=stats(world.scene,camera);assert.ok(s.meshes>0&&s.triangles>0);assert.ok(s.triangles<600000,meta.id+' unexpected triangle explosion');
   if(pass<3)samples.push({track:meta.id,quality:q,position:fraction,...s});
  }
 }
 const warmed=resources(world.scene);
 for(let n=0;n<30;n++){const q=n%3;world.setQuality(q);cars.forEach(car=>setCarQuality(car,q));world.updateVisibility(camera,q);world.animate(n/20,false,{x:0,z:0});}
 const after=resources(world.scene);assert.deepEqual(after.g,warmed.g);assert.deepEqual(after.m,warmed.m);assert.deepEqual(after.t,warmed.t);
 if(baselines.has(meta.id))assert.deepEqual(sizes(after),baselines.get(meta.id),meta.id+' resource growth between fresh worlds');else baselines.set(meta.id,sizes(after));
 // At a genuinely distant camera, every ranged tile/detail must be culled.
 camera.position.set(20000,8,20000);camera.lookAt(20010,8,20010);world.updateVisibility(camera,0);
 let ranged=0;world.scene.traverse(o=>{if(Number.isFinite(o.userData.maxDistance)||Number.isFinite(o.userData.detailDistance)){ranged++;assert.equal(o.visible,false,'distant ranged object remained visible: '+o.name);}});assert.ok(ranged>30);
 const noticed=new Map(),all=[...after.g,...after.m,...after.t,...after.instances],listeners=new Map();
 for(const r of all){const listener=()=>noticed.set(r,(noticed.get(r)||0)+1);listeners.set(r,listener);r.addEventListener('dispose',listener);}
 const disposed=world.dispose();world.dispose();
 assert.equal(world.scene.children.length,0);assert.equal(disposed.geometries,after.g.size);assert.equal(disposed.materials,after.m.size);assert.equal(disposed.textures,after.t.size);
 for(const r of all){assert.equal(noticed.get(r),1,'an active or inactive resource was missed or disposed twice');r.removeEventListener('dispose',listeners.get(r));}
 original.g.clear();original.m.clear();original.t.clear();original.instances.clear();
 if(globalThis.gc){globalThis.gc();heap.push(process.memoryUsage().heapUsed);}
}
console.log('PASS Ten real world switches, six cars each, all three quality profiles, stable resources after 30 quality transitions, exact-once disposal of active/inactive objects.');
for(const meta of TRACKS)for(let q=0;q<3;q++){const rows=samples.filter(s=>s.track===meta.id&&s.quality===q);console.log(`${meta.id} Q${q}: ${Math.min(...rows.map(s=>s.triangles))}–${Math.max(...rows.map(s=>s.triangles))} visible triangles; ${Math.min(...rows.map(s=>s.meshes))}–${Math.max(...rows.map(s=>s.meshes))} submitted meshes (CPU scene count, not measured WebGL draw calls/FPS)`);}
if(heap.length){const range=heap.slice(2);console.log(`Explicit-GC Node heap over post-warmup switches: ${(Math.min(...range)/1048576).toFixed(1)}–${(Math.max(...range)/1048576).toFixed(1)} MB; not a GPU memory measurement.`);assert.ok(Math.max(...range)-Math.min(...range)<45*1048576,'retained Node heap grew unexpectedly');}

for(let i=0;i<3;i++){
 const car=makeCar(i,false,0);let lowCalls=0;car.traverse(o=>{if(!o.isMesh)return;for(let a=o;a;a=a.parent)if(a.visible===false)return;lowCalls++;});assert.ok(lowCalls<=8,'low-profile car exceeds draw budget');
 animateCar(car,20,.5,0,true,1);animateCar(car,20,.5,.05,true,1);
 for(const w of car.userData.wheels){assert.ok(Math.abs(w.spinning.rotation.x)>0);assert.equal(w.group.rotation.y,w.front?.16:0);}assert.equal(car.userData.sparks.visible,true);
 disposeScene(car);
}
// Owner-managed environment textures are never destroyed by scene teardown.
const independent=new THREE.Scene(),env=new THREE.Texture(),owned=new THREE.Texture(),geometry=new THREE.BoxGeometry(),original=new THREE.MeshStandardMaterial({map:owned}),inactive=new THREE.MeshLambertMaterial({map:owned}),multi=new THREE.Mesh(geometry,[original,original]);
independent.environment=env;multi.userData.qualityMaterials=new Map([[0,[inactive]],[2,[original]]]);independent.add(multi);
const disposals=new Map();for(const r of [env,owned,geometry,original,inactive])r.addEventListener('dispose',()=>disposals.set(r,(disposals.get(r)||0)+1));
disposeScene(independent);assert.equal(disposals.get(env),undefined);for(const r of [owned,geometry,original,inactive])assert.equal(disposals.get(r),1);env.dispose();

const quality=new FrameQuality({initialLevel:2});for(let n=0;n<80;n++)quality.sample(100);assert.equal(quality.level,0);
for(let n=0;n<2200;n++)quality.sample(16.6);assert.equal(quality.level,2);for(const invalid of [0,NaN,Infinity,4000])quality.sample(invalid);assert.equal(quality.level,2);
delete globalThis.document;
console.log('PASS Wheel animation, low-car budget, shared environment ownership and adaptive quality hysteresis. Real device FPS remains a separate browser check.');
