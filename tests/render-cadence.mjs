import assert from 'node:assert/strict';
import {RenderCadence} from '../src/render-cadence.js';
import {SimulationClock} from '../src/simulation-clock.js';

for(const rafHz of [60,90,120,144])for(const target of [30,60]){
 const cadence=new RenderCadence(),clock=new SimulationClock(),renders=[];
 for(let frame=1;frame<=rafHz*20;frame++){
  const timestamp=frame*1000/rafHz;clock.advance(1/rafHz,()=>{});
  if(cadence.take(timestamp,target))renders.push(timestamp);
  assert.equal(cadence.take(timestamp,target),false,'A second check in the same RAF must not submit another render');
 }
 assert(Math.abs(renders.length-target*20)<=1,`${rafHz} Hz RAF lost render slots for ${target} Hz target: ${renders.length}`);
 assert.equal(clock.steps,1200,'Rendering cadence must not change the fixed simulation clock');
 for(let i=1;i<renders.length;i++)assert(renders[i]>renders[i-1]);
 if(rafHz===90&&target===60){
  const intervals=renders.slice(1).map((time,i)=>time-renders[i]);
  assert(intervals.some(ms=>ms<15)&&intervals.some(ms=>ms>20),'90 Hz needs alternating RAF spacings rather than a permanently throttled 45 Hz schedule');
 }
}
const jittered=new RenderCadence();let time=0,count=0;
for(let frame=0;frame<1200;frame++){time+=[14,19,15,18][frame%4];if(jittered.take(time,60))count++;}
assert(Math.abs(count-time/1000*60)<=2,'Normal RAF jitter must retain fractional render time');
const paused=new RenderCadence();let pausedRenders=0;
for(let frame=1;frame<=600;frame++)if(paused.take(frame*1000/60,2))pausedRenders++;
assert.equal(pausedRenders,20,'The offline pause cadence is two render submissions per second');
assert(paused.take(10010,60),'Resuming the normal cadence renders immediately');
const dirty=new RenderCadence();assert(dirty.take(0,2));assert(!dirty.take(100,2));assert(dirty.take(100,2,true));assert(!dirty.take(100,60,true));assert(!dirty.take(499,2));assert(dirty.take(500,2),'An early dirty frame must not delay the regular next deadline');
const stalled=new RenderCadence();assert(stalled.take(0,60));assert(stalled.take(5000,60));assert(!stalled.take(5000,60));assert(!stalled.take(5001,60),'A suspension must not create a burst of catch-up renders');assert(stalled.take(5017,60));
const old=stalled.nextAt;for(const invalid of [NaN,Infinity,-Infinity])assert(!stalled.take(invalid,60));assert.equal(stalled.nextAt,old);assert(stalled.take(20,60),'A fresh monotonic clock origin resets scheduling safely');
stalled.reset();assert.equal(stalled.nextAt,null);assert.equal(stalled.lastAt,null);assert(stalled.take(0,NaN));
console.log('PASS Actual render scheduler: retained 30/60 Hz deadlines on 60/90/120/144 Hz RAF, normal jitter, one submission per callback, no suspension catch-up burst, dirty two-Hz offline pause and unchanged fixed simulation steps. Controlled timing, not browser/device FPS.');
