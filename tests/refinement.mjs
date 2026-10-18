import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {Track,CARS,makeVehicle,stepVehicle,botInput,angleDelta} from '../src/race-core.js';
import {makeWorld} from '../src/world.js';
import {sampleGround} from '../src/tracks.js';
import {FrameQuality} from '../src/performance.js';
const base=JSON.parse(fs.readFileSync(new URL('../src/tracks/base.json',import.meta.url))),course=JSON.parse(fs.readFileSync(new URL('../src/tracks/lammersdorf.json',import.meta.url)));
const data={...base,...course,buildings:base.buildings.filter(b=>course.buildingIds.includes(b.id)),landAreas:base.landAreas.filter(a=>course.landAreaIds.includes(a.id))},track=new Track(data.route);
track.heightAt=(x,z)=>sampleGround(data,x,z);
const pointSegment=(x,z,a,b)=>{const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)));return Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz);};
function exhaustive(x,z){let distance=Infinity,s=0;for(const seg of track.segments){const dx=seg.b[0]-seg.a[0],dz=seg.b[1]-seg.a[1],t=Math.max(0,Math.min(1,((x-seg.a[0])*dx+(z-seg.a[1])*dz)/(dx*dx+dz*dz))),d=Math.hypot(x-seg.a[0]-t*dx,z-seg.a[1]-t*dz);if(d<distance){distance=d;s=seg.s+t*seg.d;}}return {distance,s};}
for(let i=0;i<900;i++){const p=track.at(i*19.173),offset=(i%31-15)*.8,x=i%4?p.x+p.dz*offset:(i%79-40)*21,z=i%4?p.z-p.dx*offset:(i%59-30)*27;const expected=exhaustive(x,z),actual=track.nearest(x,z);assert(Math.abs(actual.distance-expected.distance)<1e-7);assert(Math.abs(track.delta(actual.s,expected.s))<1e-6);}
console.log('PASS Spatial lookup matches an exhaustive search on the road, junctions and distant points');
function vehicle(s=95,offset=0,speed=0,car=0){const v=makeVehicle(track,car),p=track.at(s);return Object.assign(v,{x:p.x+p.dz*offset,z:p.z-p.dx*offset,angle:p.angle,s:p.s,safeS:p.s,progress:s,speed,zoneCooldown:10});}
const stopped=vehicle(95,7),progress=stopped.progress;assert(track.nearest(stopped.x,stopped.z).distance>6.8);
for(let i=0;i<119;i++){assert(!stepVehicle(stopped,track,{gas:0},1/60,i/60).includes('autoReset'));}
assert(stopped.resetRemaining>0&&stopped.resetRemaining<.02);assert(stepVehicle(stopped,track,{gas:0},1/60,2).includes('autoReset'));assert(track.nearest(stopped.x,stopped.z).distance<.001);assert(Math.abs(angleDelta(stopped.angle-track.at(stopped.s).angle))<.001);assert(Math.abs(stopped.progress-progress)<.001);assert.equal(stopped.resetRemaining,0);
const resumes=vehicle(95,7);for(let i=0;i<60;i++)stepVehicle(resumes,track,{gas:0},1/60,i/60);assert(resumes.resetRemaining>0);for(let i=0;i<25;i++)stepVehicle(resumes,track,{gas:1},1/60,1+i/60);assert.equal(resumes.resetRemaining,0);
const moving=vehicle(95,7,3),onRoad=vehicle();for(let i=0;i<180;i++){assert(!stepVehicle(moving,track,{gas:.2},1/60,i/60).includes('autoReset'));stepVehicle(onRoad,track,{gas:0},1/60,i/60);}assert.equal(moving.resetRemaining,0);assert.equal(onRoad.resetRemaining,0);
const blocked=vehicle(95,8,12);blocked.angle+=Math.PI/2;let recovered=false;for(let i=0;i<140;i++)recovered||=stepVehicle(blocked,track,{gas:1},1/60,i/60).includes('autoReset');assert(recovered,'A stationary car pushing against the outer verge must recover even with the accelerator held');
console.log('PASS Exactly two seconds offroad and stationary; movement cancels, road idling never resets, no progress is awarded');
for(let car=0;car<CARS.length;car++){
 const v=vehicle(95,0,19,car);for(let i=0;i<31;i++)stepVehicle(v,track,{gas:0,steer:1},1/60,i/60);assert(v.drifting);assert(v.slip>.2);const events=[];for(let i=0;i<18;i++)events.push(...stepVehicle(v,track,{gas:0,steer:0},1/60,.52+i/60));assert(events.includes('driftBoost'));assert(v.boost>0);
 const tap=vehicle(95,0,19,car);for(let i=0;i<6;i++)stepVehicle(tap,track,{gas:0,steer:1},1/60,i/60);assert(!tap.drifting);assert.equal(tap.drift,0);
}
console.log('PASS All five cars enter a drift through strong steering, charge and release a boost; a short tap does not drift');
assert.equal(track.obstacles.length,8);const h=track.obstacles[0],hit=vehicle(h.s,0,24);hit.x=h.x;hit.z=h.z;assert(stepVehicle(hit,track,{gas:0},1/60,1).includes('obstacleHit'));assert(hit.speed<15);
const shield=vehicle(h.s,0,24);Object.assign(shield,{x:h.x,z:h.z,shield:8});stepVehicle(shield,track,{gas:0},1/60,1);assert(shield.speed>23);
for(let car=0;car<CARS.length;car++){const v=makeVehicle(track,car);let hits=0;for(let i=0;i<140*60&&v.finish===null;i++)hits+=stepVehicle(v,track,botInput(v,track,.91),1/60,i/60).filter(e=>e==='obstacleHit').length;assert(v.finish!==null);assert.equal(hits,0,'AI should plan around the slaloms');}
console.log('PASS Eight real obstacles slow a collision, respect shields and are avoided by every AI car over two laps');
// Independent exact line-to-rectangle distance checks, rather than repeating the placement sampler.
function rectangleDistance(r){
 const c=Math.cos(r.a),s=Math.sin(r.a),corners=[[-r.w/2,-r.d/2],[r.w/2,-r.d/2],[r.w/2,r.d/2],[-r.w/2,r.d/2]],local=p=>[(p[0]-r.x)*c-(p[1]-r.z)*s,(p[0]-r.x)*s+(p[1]-r.z)*c];let min=Infinity;
 for(const segment of track.segments){const a=local(segment.a),b=local(segment.b);let lo=0,hi=1;for(let axis=0;axis<2;axis++){const half=axis?r.d/2:r.w/2,d=b[axis]-a[axis];if(Math.abs(d)<1e-9){if(Math.abs(a[axis])>half){lo=2;break;}}else{let t0=(-half-a[axis])/d,t1=(half-a[axis])/d;if(t0>t1)[t0,t1]=[t1,t0];lo=Math.max(lo,t0);hi=Math.min(hi,t1);}}if(lo<=hi)return 0;
  for(let i=0;i<4;i++){const p=corners[i],q=corners[(i+1)%4];min=Math.min(min,pointSegment(...a,p,q),pointSegment(...b,p,q),pointSegment(...p,a,b),pointSegment(...q,a,b));}
 }return min;
}
globalThis.document={createElement:()=>({getContext:()=>({fillRect(){},fillText(){}})})};const world=makeWorld(data,track);
for(const r of world.courseProps)assert(rectangleDistance(r)>=6.5,`Course intrusion: ${r.kind}`);for(const r of world.kerbs)assert(rectangleDistance(r)>=5.09,'A kerb crosses the asphalt corridor');
assert(world.courseProps.length>200);assert(world.kerbs.length>500);assert(world.scene.getObjectByName('breuer:open-workshop'));assert(world.scene.getObjectByName('breuer:lift-0'));assert(world.scene.getObjectByName('breuer:lift-2'));
const close=new THREE.PerspectiveCamera();close.position.set(10,10,12);world.updateVisibility(close);assert(world.scene.getObjectByName('breuer:open-workshop').visible);close.position.set(-600,6,-600);world.updateVisibility(close);assert(!world.scene.getObjectByName('breuer:open-workshop').visible);
world.dispose();delete globalThis.document;console.log('PASS Rails, posts, signs and kerbs clear the entire road; open workshop contains two lifts and distance detail');
const governor=new FrameQuality();for(let i=0;i<300;i++)governor.sample(35);assert.equal(governor.level,0);for(let i=0;i<1800;i++)governor.sample(16.6);assert.equal(governor.level,2);governor.sample(4000);assert.equal(governor.level,2);console.log('PASS Sustained slow frames reduce quality, recovery restores it, tab-sized stalls are ignored');
