import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Track,CARS,makeVehicle,stepVehicle,resetVehicle,botInput,angleDelta} from '../src/race-core.js';
import {CARS as CATALOGUE,HANDLING_VERSION} from '../src/car-catalog.js';
import {normalizeRaceConfig} from '../src/race-config.js';
import {TRACKS,sampleGround} from '../src/tracks.js';

assert.equal(CARS,CATALOGUE,'Existing physics imports must share the rendering/validation catalogue');
assert.deepEqual(CARS.map(car=>car.id),['kadett','e30','m1','m2','gt3rs']);
assert.equal(CARS[3].color,0x70767f);assert.equal(CARS[4].color,0x267ddb);
assert.ok(Object.isFrozen(CARS)&&CARS.every(car=>Object.isFrozen(car)&&Object.isFrozen(car.handling)));
assert.equal(HANDLING_VERSION,'arcade-handling-4','Changed physics must use a fresh record/ghost namespace');
// Preserve saved vehicle identities and the original performance baselines.
assert.deepEqual(CARS.slice(0,3).map(car=>[car.max,car.accel,car.grip]),[[34,14,1.02],[31,12.5,1.22],[35,11.5,1.08]]);

const config=normalizeRaceConfig({rules:'classic',autoDrift:true,assist:false});
const straight=new Track([[0,0],[0,2000],[2000,2000],[2000,0],[0,0]],config),dt=1/60;
function start(car=0,speed=19){const v=makeVehicle(straight,car);Object.assign(v,{x:0,z:100,angle:0,s:100,safeS:100,progress:100,speed,zoneCooldown:10});return v;}
function drive(v,input,frames,time=0){const events=[];for(let frame=0;frame<frames;frame++)events.push(...stepVehicle(v,straight,input,dt,time+frame*dt,config));return events;}
function corner(car,speed,frames=21,brake=0){const v=start(car,speed);let travelled=0;for(let frame=0;frame<frames;frame++){const x=v.x,z=v.z;stepVehicle(v,straight,{gas:0,steer:1,brake,autoDrift:false},dt,frame*dt,config);travelled+=Math.hypot(v.x-x,v.z-z);}v.turnRadius=travelled/Math.abs(v.angle+v.slip);return v;}

for(let car=0;car<CARS.length;car++){
 const low=corner(car,10),high=corner(car,30),braked=corner(car,30,30,1),coast=corner(car,30,30,0);
 assert.ok(Math.abs(high.angle)<Math.abs(low.angle)&&Math.abs(high.angle)>Math.abs(low.angle)*.78,CARS[car].id+': racing speed must widen the line gently without cancelling steering');
 assert.ok(high.turnRadius<25,CARS[car].id+': the available steering must fit the village bends at racing speed');
 assert.ok(braked.speed<coast.speed-12,CARS[car].id+': braking must materially change entry speed');
 assert.ok(braked.turnRadius<coast.turnRadius*.75,CARS[car].id+': braking must tighten the actual travelled corner radius');
 assert.ok(braked.bodyPitch>0&&Math.abs(high.bodyRoll)>.008,'Tyre loading must produce usable visual weight-transfer feedback');
 assert.ok(Math.abs(high.slip)<.02,'Normal road steering must follow the car nose without an inherited velocity angle fighting the input');
 const tapped=start(car);drive(tapped,{gas:0,steer:1},6);assert.equal(tapped.drifting,false);assert.equal(tapped.drift,0);
 assert.ok(tapped.steering>0&&tapped.steering<.85,'A short binary press builds steering progressively');
 assert.ok(Math.abs(tapped.angle)<.09,'A short mobile press must not snap into a large yaw');
 const drifting=start(car),events=drive(drifting,{gas:0,steer:1},34);
 assert.ok(drifting.drifting&&drifting.drift>.45,'A deliberate sustained press charges a real drift');
 assert.ok(drifting.slip>.2&&drifting.slip<.65,'Visible drift angle must stay useful and recoverable');
 assert.ok(Math.abs(angleDelta(drifting.angle+drifting.slip))>.18,'Drifting must still steer the actual travel direction');
 events.push(...drive(drifting,{gas:0,steer:0},18,34*dt));
 assert.equal(events.filter(event=>event==='driftBoost').length,1,'Releasing a charged drift grants exactly one boost');
 assert.ok(drifting.boost>0&&Math.abs(drifting.slip)<.08,'A drift release must settle the rear without an unavoidable spin');
 drive(drifting,{gas:0,steer:-1,autoDrift:false},12,52*dt);
 for(const key of ['x','z','angle','speed','slip','yawRate','lateralLoad','bodyRoll','bodyPitch','gripLoss'])assert.ok(Number.isFinite(drifting[key]),'Countersteering produced a non-finite '+key);
 resetVehicle(drifting,straight);
 for(const key of ['speed','slip','steering','yawRate','lateralLoad','bodyRoll','bodyPitch','gripLoss','drift'])assert.equal(drifting[key],0,'Recovery retained stale '+key);
}
const gt3Turn=corner(4,30),kadettTurn=corner(0,30),gt3Brake=start(4,30),kadettBrake=start(0,30);
drive(gt3Brake,{gas:0,steer:0,brake:1},30);drive(kadettBrake,{gas:0,steer:0,brake:1},30);
assert.ok(Math.abs(gt3Turn.angle)>Math.abs(kadettTurn.angle)*1.2,'The GT3 RS must have a genuinely distinct high-speed grip personality');
assert.ok(gt3Brake.speed<kadettBrake.speed-2.5,'The GT3 RS must have a distinct braking advantage');
assert.ok(Math.abs(gt3Turn.bodyRoll)<Math.abs(kadettTurn.bodyRoll)*.55,'The low RS chassis must roll less than the lively classic');
console.log('PASS All five identities, responsive progressive binary steering, usable racing-speed turn radius, braking/front loading, charged/recoverable drift, countersteering, clean resets and distinct car personalities');

const base=JSON.parse(fs.readFileSync(new URL('../src/tracks/base.json',import.meta.url)));
let races=0,physicsSteps=0,maxVerge=0;
const began=performance.now();
for(const meta of TRACKS){
 const course=JSON.parse(fs.readFileSync(new URL('../src/tracks/'+meta.id+'.json',import.meta.url))),data={...base,...course};
 for(let car=0;car<CARS.length;car++)for(const laps of [2,3,5])for(const rules of ['classic','action']){
  const raceConfig=normalizeRaceConfig({trackId:meta.id,laps,rules,autoDrift:true,assist:false,difficulty:1.06}),track=new Track(course.route,raceConfig);
  track.heightAt=(x,z)=>sampleGround(data,x,z);
  const v=makeVehicle(track,car,0,'Handling QA','handling-'+car,raceConfig);
  let finishes=0,resets=0,physical=track.delta(track.nearest(v.x,v.z).s,0),roadS=v.s;
  for(let frame=0;frame<60*(laps*190+30)&&v.finish===null;frame++){
   const events=stepVehicle(v,track,botInput(v,track,1.06),dt,frame*dt,raceConfig),near=track.nearest(v.x,v.z);
   physical+=track.delta(near.s,roadS);roadS=near.s;maxVerge=Math.max(maxVerge,near.distance);physicsSteps++;
   finishes+=events.filter(event=>event==='finish').length;resets+=events.filter(event=>event==='autoReset').length;
  }
  assert.ok(v.finish!==null,`${meta.id} ${CARS[car].id} ${rules} ${laps}: AI failed to finish`);
  assert.equal(finishes,1);assert.equal(resets,0,'High difficulty AI became stuck at a narrow bend');
  assert.equal(v.gate,laps*12);assert.ok(Math.abs(physical-v.progress)<1e-6,'AI finish lost real physical course distance');
  assert.ok(physical>=laps*track.length&&physical<laps*track.length+1,'AI required an extra lap');
  races++;
 }
 console.log(`PASS ${meta.id}: all five cars complete 2/3/5 actual laps in Classic and Action at the highest AI difficulty`);
}
console.log(`PASS ${races} independently driven AI races, ${physicsSteps} actual fixed steps, maximum centreline distance ${maxVerge.toFixed(2)} m; ${(performance.now()-began).toFixed(0)} ms CPU test time. This is a physics measurement, not a browser/GPU FPS claim.`);
