import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {Track} from '../src/race-core.js';
import {makeWorld} from '../src/world.js';
import {softWallBand} from '../src/scenery.js';
import {roadSurfaceGeometries,terrainNormalAt,terrainHeightAt,surfaceHeightAt} from '../src/road-surface.js';

globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({fillRect(){},fillText(){}})}),querySelector:()=>null};
const base=JSON.parse(fs.readFileSync(new URL('../src/tracks/base.json',import.meta.url)));
const geo=softWallBand([[0,0],[8,0],[8,5],[0,5]],.35,6,0xffffff,6),normal=geo.attributes.normal;
assert.ok(Array.from(normal.array).some((n,i)=>i%3!==1&&Math.abs(n)>.1&&Math.abs(n)<.9),'illumination corners actually have bevel normals');
assert.ok(new Set(Array.from(geo.attributes.color.array).map(v=>v.toFixed(4))).size>1,'wall bands need shaded depth');
for(let i=0;i<geo.attributes.position.count;i++)assert.ok(geo.attributes.position.getX(i)>=0&&geo.attributes.position.getX(i)<=8&&geo.attributes.position.getZ(i)>=0&&geo.attributes.position.getZ(i)<=5,'softening must preserve the source silhouette');
geo.dispose();
const totals=[];
for(const id of ['lammersdorf','bahnhof','kraemer']){
 const config=JSON.parse(fs.readFileSync(new URL('../src/tracks/'+id+'.json',import.meta.url))),data=structuredClone({...base,...config,buildings:base.buildings.filter(b=>config.buildingIds.includes(b.id)),landAreas:base.landAreas.filter(a=>config.landAreaIds.includes(a.id))}),surfaces=roadSurfaceGeometries(data),seams=new Map();let vertices=0;
 for(const g of Object.values(surfaces)){const p=g.attributes.position,n=g.attributes.normal;for(let i=0;i<p.count;i++){const v=new THREE.Vector3(n.getX(i),n.getY(i),n.getZ(i)),expected=terrainNormalAt(data,p.getX(i),p.getZ(i)),key=p.getX(i)+','+p.getZ(i);assert.ok(v.dot(expected)>.999999,'clipped surface illumination differs from surveyed terrain');if(seams.has(key))assert.ok(v.dot(seams.get(key))>.999999,'same-position road/sidewalk normals break a visible seam');else seams.set(key,v);vertices++;}g.dispose();}
 const first=makeWorld(data,new Track(data.route));first.scene.updateMatrixWorld(true);
 const crowns=[];first.scene.traverse(o=>{if(o.name.startsWith('trees:painted-'))crowns.push(o);});
 assert.ok(crowns.length>3,'painted crowns remain spatially instanced');
 const tones=new Set();for(const crown of crowns){assert.ok(crown.isInstancedMesh&&crown.instanceColor?.count===crown.count,'every crown tint must be per-instance');assert.ok(crown.geometry.attributes.color,'leaf shading must use vertex colours without a second pass');assert.ok(Math.max(...crown.geometry.attributes.color.array)-Math.min(...crown.geometry.attributes.color.array)>.2,'leaf shading should soften the undersides');for(let i=0;i<crown.instanceColor.array.length;i+=3)tones.add(Array.from(crown.instanceColor.array.subarray(i,i+3)).map(n=>n.toFixed(3)).join(','));}
 assert.ok(tones.size>=6,'trees should use different consistent regional greens');
 assert.ok(first.courseProps.filter(r=>r.kind==='roundabout-planting').length>8,'roundabout planting needs several road-clear clusters');
 const owned=new Set();first.workshop.traverse(o=>{for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[])for(const value of Object.values(m))if(value?.isTexture)owned.add(value);});
 let courts=0;for(const [group,points] of [[first.workshop,[[1.1,.88],[-4,4]]],[first.school,[[-2,23.6],[5,24]]]])for(const [x,z] of points){
  const p=group.localToWorld(new THREE.Vector3(x,0,z)),ground=terrainHeightAt(data,p.x,p.z),hits=new THREE.Raycaster(new THREE.Vector3(p.x,ground+.4,p.z),new THREE.Vector3(0,-1,0),0,2).intersectObject(group,true).filter(h=>h.face.normal.y>.5);assert.ok(hits.length>0,'landmark court vanished');assert.ok(hits.some(h=>Math.abs(h.point.y-surfaceHeightAt(data,p.x,p.z))<.00002),'landmark court floats above the measured slope');courts++;
 }
 first.dispose();
 const second=makeWorld(data,new Track(data.route));second.workshop.traverse(o=>{for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[])for(const value of Object.values(m))if(value?.isTexture)assert.ok(!owned.has(value),'landmark reused a texture disposed with the previous world');});second.dispose();
 totals.push({track:id,continuousShadingVertices:vertices,terrainCourtRays:courts});
}
delete globalThis.document;
console.log('PASS Measured silhouettes with bevel illumination, road/sidewalk normals continuous across every shared vertex, actual sloped forecourt rays and independent texture ownership across track changes.');
console.log(JSON.stringify(totals));
