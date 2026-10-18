import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {TRACKS,sampleGround} from '../src/tracks.js';
import {Track} from '../src/race-core.js';
import {makeWorld} from '../src/world.js';
import {terrainHeightAt,surfaceHeightAt,roadSurfaceGeometries,makeOilDecal,SURFACE_LAYERS} from '../src/road-surface.js';

// The renderer draws two affine triangles per DGM cell, not a bilinear patch.
// A saddle cell makes the old surface-crossing error impossible to overlook.
const saddle={terrain:{origin:[0,0],step:10,width:2,height:2,values:[0,2,3,-1]}};
assert.equal(sampleGround(saddle,5,5),1);
assert.equal(terrainHeightAt(saddle,5,5),2.5);
assert.ok(Math.abs(terrainHeightAt(saddle,8,8)-.4)<1e-12);
assert.equal(terrainHeightAt(saddle,10,10),-1);

const flat={route:[[0,0],[30,0],[30,30],[0,30],[0,0]],roads:[{points:[[0,0],[30,0]],width:10},{points:[[0,0],[30,0]],width:10},{points:[[15,-15],[15,45]],width:8}],landAreas:[]};
const flatGeometry=roadSurfaceGeometries(flat),flatMaterial=new THREE.MeshBasicMaterial(),flatMeshes=[new THREE.Mesh(flatGeometry.course,flatMaterial),new THREE.Mesh(flatGeometry.background,flatMaterial)];
for(const mesh of flatMeshes)mesh.updateMatrixWorld();
function hits(meshes,x,z){return new THREE.Raycaster(new THREE.Vector3(x,100,z),new THREE.Vector3(0,-1,0),0,200).intersectObjects(meshes,false);}
for(const [x,z] of [[7.173,1.347],[15.731,.931],[14.913,12.731],[27.381,1.187]])assert.equal(hits(flatMeshes,x,z).length,1,'Duplicate road and junction strips must be unioned, not stacked at the same height');
for(const geometry of Object.values(flatGeometry))geometry.dispose();flatMaterial.dispose();

const originalDocument=globalThis.document;
globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({fillRect(){},fillText(){}})}),querySelector:()=>null};
const base=JSON.parse(fs.readFileSync(new URL('../src/tracks/base.json',import.meta.url)));
function dataFor(id){const c=JSON.parse(fs.readFileSync(new URL('../src/tracks/'+id+'.json',import.meta.url)));return structuredClone({...base,...c,buildings:base.buildings.filter(b=>c.buildingIds.includes(b.id)),landAreas:base.landAreas.filter(a=>c.landAreaIds.includes(a.id))});}
let roadRays=0,oilRays=0,oilItems=0;
const budgets=[];
try{
 for(const meta of TRACKS){
  const data=dataFor(meta.id),track=new Track(data.route),started=performance.now(),world=makeWorld(data,track),worldBuild=performance.now()-started;
  try{
   // Follow the renderer's ordinary matrix-update predicate. This also verifies
   // newly inserted decals without masking the previous frozen-scene bug.
   if(world.scene.matrixWorldAutoUpdate===true)world.scene.updateMatrixWorld();
   const asphalt=world.scene.getObjectByName('course:asphalt'),ground=[],asphaltMeshes=[];
   world.scene.traverse(object=>{
    if(!object.isMesh||object.visible===false)return;
    if(/^(course:asphalt|course:sidewalk|course:markings|roads:|terrain:|land-use:|race:start-surfaces:|roundabout:surfaces:)/.test(object.name))ground.push(object);
    if(object.name.startsWith('course:asphalt')||object.name.startsWith('roads:')&&object.material.map===asphalt.material.map)asphaltMeshes.push(object);
   });
   assert.ok(ground.length>15&&asphaltMeshes.length>2);
   assert.ok(world.courseTiles.length>=18,meta.id+': full loop must use culled terrain-preserving tiles');
   for(const tile of world.courseTiles.filter(tile=>tile.name.startsWith('course:asphalt'))){const position=tile.geometry.attributes.position;
    for(let i=0;i<position.count;i++)assert.ok(Math.abs(position.getY(i)-terrainHeightAt(data,position.getX(i),position.getZ(i))-SURFACE_LAYERS.asphalt)<.000025,meta.id+': all asphalt tiles must share exact ground triangles');
   }
   for(let s=.731;s<track.length;s+=17.173)for(const lane of [-3.413,.217,3.271]){
    const p=track.at(s),x=p.x-p.dz*lane,z=p.z+p.dx*lane,roadHits=hits(asphaltMeshes,x,z),groundHits=hits(ground,x,z);
    assert.ok(roadHits.length>=1,`${meta.id} s=${s}: no racing asphalt under a legal lane`);
    const separated=new Set(roadHits.map(hit=>Math.round(hit.point.y*10000)));
    assert.equal(separated.size,1,`${meta.id} s=${s}: competing interpolated asphalt decks`);
    assert.ok(roadHits.length===1,`${meta.id} s=${s}: duplicate coplanar asphalt triangles`);
    assert.ok(Math.abs(surfaceHeightAt(data,x,z)-groundHits[0].point.y)<.00004,`${meta.id} s=${s}: vehicle height ignores a visible ground surface`);roadRays++;
   }
   // Start graphics, the steepest measured road sections, regular bends, and
   // both borders of the roundabout apron must all remain visible under oil.
   const samples=[.41,4.37,8.17,12.33,...Array.from({length:13},(_,i)=>track.length*(i+.417)/13)];
   const slopes=[];for(let s=0;s<track.length;s+=6){const a=track.at(s),b=track.at(s+3);slopes.push({s,change:Math.abs(terrainHeightAt(data,a.x,a.z)-terrainHeightAt(data,b.x,b.z))});}
   samples.push(...slopes.sort((a,b)=>b.change-a.change).slice(0,5).map(v=>v.s+.419));
   const centres=samples.map((s,i)=>{const p=track.at(s),lane=i%3===0?-3.13:i%3===1?0:3.17;return [p.x-p.dz*lane,p.z+p.dx*lane];});
   const rc=data.roundabout.center,outer=Math.max(2,data.roundabout.radius-5.15);
   for(const a of [.713,2.137,3.913,5.317])centres.push([rc[0]+Math.cos(a)*(outer+1.6),rc[1]+Math.sin(a)*(outer+1.6)]);
   const oils=[];
   for(const [x,z] of centres){
    const oil=makeOilDecal(data,x,z);world.scene.add(oil);oils.push(oil);
    if(world.scene.matrixWorldAutoUpdate===true)world.scene.updateMatrixWorld();
    assert.equal(oil.material.depthTest,true,'Oil must remain occluded by cars and buildings');assert.equal(oil.material.depthWrite,false);
    const p=oil.geometry.attributes.position;
    for(let i=0;i<p.count;i+=3){
     const ax=p.getX(i)+x,az=p.getZ(i)+z,bx=p.getX(i+1)+x,bz=p.getZ(i+1)+z,cx=p.getX(i+2)+x,cz=p.getZ(i+2)+z;
     if(Math.abs((bx-ax)*(cz-az)-(bz-az)*(cx-ax))<.0000003)continue;
     const mx=(ax+bx+cx)/3,mz=(az+bz+cz)/3,my=(p.getY(i)+p.getY(i+1)+p.getY(i+2))/3,top=hits(ground,mx,mz)[0];
     assert.ok(top,meta.id+': oil has no actual underlying ground mesh');
     assert.ok(Math.abs(my-top.point.y-SURFACE_LAYERS.oilClearance)<.0001,`${meta.id}: oil hidden or floating at ${mx},${mz}; separation=${my-top.point.y}; mesh=${top.object.name}; area=${Math.abs((bx-ax)*(cz-az)-(bz-az)*(cx-ax))}; triangle=${JSON.stringify([[ax,az],[bx,bz],[cx,cz]])}; lookup=${surfaceHeightAt(data,mx,mz)}`);
     const oilHit=hits([oil],mx,mz)[0];assert.ok(oilHit,meta.id+': oil triangle is backfacing or has stale transform');assert.ok(oilHit.point.y>top.point.y+.006,meta.id+': oil loses depth clearance');oilRays++;
    }
    oilItems++;
   }
   // The shared CPU model cannot grow with each frame or decal creation.
   const lookupStart=performance.now();let checksum=0;
   for(let i=0;i<20000;i++){const p=track.at(i*1.731);checksum+=surfaceHeightAt(data,p.x,p.z);}
   const lookupMs=performance.now()-lookupStart;assert.ok(Number.isFinite(checksum));
   budgets.push({track:meta.id,worldBuildMs:Number(worldBuild.toFixed(1)),heightLookups20000Ms:Number(lookupMs.toFixed(1)),oilItems:oils.length});
   const geometryDisposals=new Map();for(const oil of oils)oil.geometry.addEventListener('dispose',()=>geometryDisposals.set(oil,(geometryDisposals.get(oil)||0)+1));
   world.dispose();world.dispose();for(const oil of oils)assert.equal(geometryDisposals.get(oil),1,'World teardown must own each new decal geometry exactly once');
  }finally{world.dispose();}
 }
}finally{if(originalDocument===undefined)delete globalThis.document;else globalThis.document=originalDocument;}
console.log(`PASS ${roadRays} real road rays across all 3 courses; ${oilRays} terrain-clipped oil triangle rays from ${oilItems} splashes, including start pads, slopes and roundabout apron. No duplicate coplanar asphalt; decals remain 1 cm above the actual local surface with depth testing enabled.`);
console.log(JSON.stringify({cpuBudgets:budgets,note:'CPU geometry/lookup costs, not measured browser GPU FPS.'}));
