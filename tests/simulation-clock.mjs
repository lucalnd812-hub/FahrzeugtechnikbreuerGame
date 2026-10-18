import assert from 'node:assert/strict';
import {SimulationClock,interpolatedPose} from '../src/simulation-clock.js';

const outputs=[];
for(const hz of [30,60,10]){
 const clock=new SimulationClock();let travelled=0,lastTime=0;
 for(let frame=0;frame<hz*10;frame++)clock.advance(1/hz,(step,time)=>{assert(time>lastTime);lastTime=time;travelled+=step*13;});
 assert.equal(clock.steps,600);assert(Math.abs(clock.time-10)<1e-10);assert(clock.debt<1e-9);outputs.push(travelled);
}
assert(Math.max(...outputs)-Math.min(...outputs)<1e-10,'Rendering frequency must not alter simulated distance');
const bounded=new SimulationClock({maxSteps:4});let steps=0;
bounded.advance(1,()=>steps++);assert.equal(steps,4);assert(bounded.overloaded);assert(bounded.debt>.9);
for(let frame=0;frame<14;frame++)bounded.advance(0,()=>steps++);
assert.equal(steps,60);assert.equal(bounded.overloaded,false);assert(Math.abs(bounded.time-1)<1e-10);assert(bounded.debt<1e-9);
const untouched=bounded.time;for(const value of [-1,NaN,Infinity])bounded.advance(value,()=>assert.fail('Invalid time must not run simulation'));assert.equal(bounded.time,untouched);
bounded.reset(7);assert.equal(bounded.time,7);assert.equal(bounded.steps,0);assert.equal(bounded.debt,0);
const previous={x:2,z:5,angle:Math.PI-.1},current={x:6,z:9,angle:-Math.PI+.1};
assert.deepEqual(interpolatedPose(previous,current,0),previous);
const middle=interpolatedPose(previous,current,.5);assert.equal(middle.x,4);assert.equal(middle.z,7);assert(Math.abs(middle.angle-Math.PI)<1e-10,'Interpolate through the angle boundary along the shorter arc');
assert.equal(interpolatedPose(null,current,.5),current);
assert.deepEqual(previous,{x:2,z:5,angle:Math.PI-.1});assert.deepEqual(current,{x:6,z:9,angle:-Math.PI+.1});
console.log('PASS Fixed simulation at 30/60/10 Hz, retained slow-frame debt, invalid timing, reset and angle-safe pose interpolation');
