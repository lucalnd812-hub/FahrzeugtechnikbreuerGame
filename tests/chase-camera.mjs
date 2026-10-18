import assert from 'node:assert/strict';
import {ChaseCameraRig} from '../src/chase-camera.js';
import {interpolatedPose} from '../src/simulation-clock.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const straight=t=>({x:t*6,y:540+t*1.5,z:t*24,angle:.25});
const run=fps=>{const rig=new ChaseCameraRig();rig.reset(straight(0),25);for(let n=1;n<=fps*2;n++)rig.sample(straight(n/fps),25,1/fps);return structuredClone(rig.output);};
const at30=run(30),at60=run(60),at120=run(120);
for(const result of [at30,at120]){
 assert(distance(result.position,at60.position)<1e-9,'Camera lag must not depend on render FPS');
 assert(distance(result.look,at60.look)<1e-9,'Look point follows the same continuous anchor');
}

const previous={x:1,z:10,angle:Math.PI-.02},current={x:2,z:11,angle:-Math.PI+.02};
for(const alpha of [.25,.5,.75]){
 const visible=interpolatedPose(previous,current,alpha),rig=new ChaseCameraRig();rig.reset({...previous,y:540},0);
 rig.sample({...visible,y:540},20,1/60);
 assert.equal(rig.previous.x,visible.x);assert.equal(rig.previous.z,visible.z);assert.equal(rig.previous.angle,visible.angle);
 assert(Math.abs(rig.heading-Math.PI)<.03,'Wrapped heading must not rotate the camera around the car');
}

const rig=new ChaseCameraRig();rig.reset({x:0,y:540,z:0,angle:Math.PI-.02});
let last=structuredClone(rig.output),largestMove=0;
for(let n=1;n<=120;n++){
 const t=n/60,view=rig.sample({x:Math.sin(t)*8,y:540+Math.sin(t)*.4,z:t*12,angle:Math.PI-.02+t*.04},18,1/60,{top:n>60});
 largestMove=Math.max(largestMove,distance(view.position,last.position));
 assert(Object.values(view.position).every(Number.isFinite));
 assert(Object.values(view.look).every(Number.isFinite));
 assert(view.fov>=55&&view.fov<=69);last=structuredClone(view);
}
assert(largestMove<9,'View switch is blended rather than jumping 66 metres vertically');
const afterReset=rig.sample({x:250,y:541,z:220,angle:0},0,1/60);
assert.equal(afterReset.position.x,250,'Respawn clears camera lag');assert.equal(afterReset.position.z,208.2);
const stable=structuredClone(afterReset);for(let n=0;n<60;n++)rig.sample({x:250,y:541,z:220,angle:0},0,1/60);
assert(distance(rig.output.position,stable.position)<1e-9,'Stationary car has a stationary camera');
console.log('PASS Shared rendered-pose camera anchor; equal 30/60/120 Hz motion, angle wrapping, smooth view switch, respawn and stationary stability');
