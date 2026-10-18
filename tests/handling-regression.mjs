import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {Track,CARS,makeVehicle,stepVehicle,botInput,angleDelta} from '../src/race-core.js';
import {HANDLING_VERSION} from '../src/car-catalog.js';
import {normalizeRaceConfig} from '../src/race-config.js';
import {TRACKS,sampleGround} from '../src/tracks.js';

const dt=1/60,config=normalizeRaceConfig({rules:'classic',autoDrift:true,assist:false});
const bend=new Track([[0,0],[0,100],[-100,100],[-100,0],[0,0]],config);
function enter(car){
  const v=makeVehicle(bend,car);
  Object.assign(v,{x:0,z:91,s:91,safeS:91,progress:91,angle:0,speed:19,zoneCooldown:10});
  for(let frame=0;frame<34;frame++)stepVehicle(v,bend,{gas:0,steer:1},dt,frame*dt,config);
  assert.ok(v.drifting&&!v.offroad&&v.drift>.45,'A deliberate corner hold must charge a usable drift');
  return v;
}

const releases=[];
for(let car=0;car<CARS.length;car++){
  const v=enter(car),before=v.angle+v.slip,events=stepVehicle(v,bend,{gas:0,steer:0},dt,34*dt,config);
  assert.equal(v.drifting,false,'Lifting a phone finger must release the drift in that physics step');
  assert.deepEqual(events,['driftBoost'],'A charged release must award one immediate exit boost');
  const directionStep=Math.abs(angleDelta(v.angle+v.slip-before));
  assert.ok(directionStep<.13,'Release must recover through a bounded direction change');
  for(let frame=0;frame<17;frame++)events.push(...stepVehicle(v,bend,{gas:0,steer:0},dt,(35+frame)*dt,config));
  assert.equal(events.filter(event=>event==='driftBoost').length,1,'Holding the release must not repeatedly recharge boost');
  assert.ok(v.boost>.5&&Math.abs(v.slip)<.04&&!v.offroad,'The exit must settle on the road while keeping its reward');

  const counter=enter(car),counterEvents=stepVehicle(counter,bend,{gas:0,steer:-1},dt,34*dt,config);
  assert.equal(counter.drifting,false,'Opposite steering must end the old drift rather than carry its latch across');
  assert.equal(counter.drift,0,'Opposite steering must clear the old charge');
  assert.equal(counterEvents.filter(event=>event==='driftBoost').length,1);
  let reversedAt=null;
  for(let frame=0;frame<12;frame++){
    stepVehicle(counter,bend,{gas:0,steer:-1},dt,(35+frame)*dt,config);
    assert.equal(counter.drifting,false,'Countersteering must get a fresh hold delay before a new automatic drift');
    if(counter.yawRate>0&&reversedAt===null)reversedAt=(frame+1)*dt;
  }
  assert.ok(reversedAt!==null&&reversedAt<=.15,'Countersteering must reverse rotation promptly');
  releases.push({car:CARS[car].id,releaseDirectionStepRad:directionStep,settledSlipRad:v.slip,counterRotationReversedAfterSeconds:reversedAt,boostEvents:1});
}
console.log('PASS All five cars: immediate finger release, one exit boost, settled on-road exits, prompt countersteering and no inherited opposite drift');

// Real binary phone-like input, sampled at 10 Hz: auto gas stays on; only
// left/right and the brake are available. This is actual stepVehicle movement
// over the surveyed route, not checkpoint assignment or a teleport test.
const base=JSON.parse(fs.readFileSync(new URL('../src/tracks/base.json',import.meta.url)));
const races=[];let totalSteps=0,totalBoosts=0,maxCentrelineDistance=0;
for(const meta of TRACKS){
  const course=JSON.parse(fs.readFileSync(new URL('../src/tracks/'+meta.id+'.json',import.meta.url))),data={...base,...course};
  for(let car=0;car<CARS.length;car++)for(const rules of ['classic','action']){
    const raceConfig=normalizeRaceConfig({trackId:meta.id,laps:2,rules,autoDrift:true,assist:false,difficulty:1.06});
    const track=new Track(course.route,raceConfig);track.heightAt=(x,z)=>sampleGround(data,x,z);
    const v=makeVehicle(track,car,0,'Binary handling QA','binary-'+car,raceConfig);
    let input={},resets=0,boosts=0,finishes=0,offroadSteps=0,maxDistance=0,physical=track.delta(track.nearest(v.x,v.z).s,0),roadS=v.s,frames=0;
    for(;frames<60*480&&v.finish===null;frames++){
      if(frames%6===0){
        const guide=botInput(v,track,1);
        input={gas:1,brake:guide.brake,steer:Math.abs(guide.steer)>.12?Math.sign(guide.steer):0,autoDrift:true};
      }
      const events=stepVehicle(v,track,input,dt,frames*dt,raceConfig),near=track.nearest(v.x,v.z);
      physical+=track.delta(near.s,roadS);roadS=near.s;
      resets+=events.filter(event=>event==='autoReset').length;
      boosts+=events.filter(event=>event==='driftBoost').length;
      finishes+=events.filter(event=>event==='finish').length;
      offroadSteps+=v.offroad?1:0;maxDistance=Math.max(maxDistance,near.distance);
    }
    assert.ok(v.finish!==null,`${meta.id} ${CARS[car].id} ${rules}: binary controls failed to finish`);
    assert.equal(finishes,1);assert.equal(resets,0);assert.equal(v.gate,24);
    assert.ok(Math.abs(physical-v.progress)<1e-6&&physical>=2*track.length&&physical<2*track.length+1,'Finish must match actual physical course distance');
    assert.ok(offroadSteps/frames<.005,'Binary inputs must stay on the course rather than finish through repeated verge clamping');
    races.push({track:meta.id,car:CARS[car].id,rules,laps:2,finished:true,seconds:v.finish,steps:frames,autoResets:resets,driftBoosts:boosts,maxCentrelineDistance:maxDistance,offroadFraction:offroadSteps/frames,orderedGates:v.gate});
    totalSteps+=frames;totalBoosts+=boosts;maxCentrelineDistance=Math.max(maxCentrelineDistance,maxDistance);
  }
}
assert.ok(totalBoosts>50,'The binary-course runs must exercise real charged drift exits');
console.log(`PASS ${races.length} actual two-lap races with binary phone steering and fixed auto gas; ${totalSteps} physics steps, ${totalBoosts} drift boosts, no auto resets`);
const evidenceArg=process.argv.find(arg=>arg.startsWith('--evidence='));
if(evidenceArg){
  const destination=path.resolve(evidenceArg.slice('--evidence='.length));
  fs.mkdirSync(path.dirname(destination),{recursive:true});
  fs.writeFileSync(destination,JSON.stringify({passed:true,handlingVersion:HANDLING_VERSION,creditsSpent:0,method:'Actual fixed-step vehicle simulation on surveyed routes. Binary steering/braking is sampled at 10 Hz with fixed auto gas. No GPU/browser/human usability or FPS claim.',releases,races,summary:{binaryRaces:races.length,lapsPerRace:2,physicsSteps:totalSteps,driftBoosts:totalBoosts,autoResets:0,maxCentrelineDistance}},null,2)+'\n');
}
