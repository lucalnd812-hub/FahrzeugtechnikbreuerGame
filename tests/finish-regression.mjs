import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Track,CARS,makeVehicle,stepVehicle,resetVehicle,collideCars,clamp,angleDelta} from '../src/race-core.js';
import {normalizeRaceConfig} from '../src/race-config.js';
import {TRACKS,sampleGround} from '../src/tracks.js';
import {validateStateUpdate} from '../server/rooms.js';

const base=JSON.parse(fs.readFileSync(new URL('../src/tracks/base.json',import.meta.url)));
const courses=new Map(TRACKS.map(meta=>[meta.id,JSON.parse(fs.readFileSync(new URL('../src/tracks/'+meta.id+'.json',import.meta.url)))]));
const dt=1/60;
let verifiedPackets=0,largestPacketProgress=0;

function makeDriver(id,car=0,laps=2,rules='classic',slot=0){
 const config=normalizeRaceConfig({trackId:id,laps,rules,autoDrift:false,assist:false,opponents:0});
 const data={...base,...courses.get(id)},track=new Track(data.route,config);
 track.heightAt=(x,z)=>sampleGround(data,x,z);
 const vehicle=makeVehicle(track,car,slot,'Regression','driver-'+slot,config),near=track.nearest(vehicle.x,vehicle.z);
 return {vehicle,track,config,time:0,roadS:near.s,physicalProgress:track.delta(near.s,0),crossings:[],finishEvents:0,autoResets:0,maxDistance:near.distance,maxProjectionStep:0,vergeFrames:0,
  network:{steps:0,sequence:0,room:{start_at:1e6,track_length:track.length,config:JSON.stringify(config)},player:{id:vehicle.id,state:null,seen:1e6}}};
}

function publishState(driver){
 const {vehicle:v,network}=driver,state={};
 for(const key of ['x','z','angle','speed','progress','gate','finish','shield','boost','spin','drifting'])state[key]=v[key];
 Object.assign(state,{sequence:++network.sequence,raceTime:driver.time,oil:[]});
 if(v.finish!==null)state.finishRaceTime=v.finish;
 const previous=network.player.state?JSON.parse(network.player.state):null,now=network.room.start_at+driver.time*1000;
 const serialized=validateStateUpdate(state,network.player,network.room,now),accepted=JSON.parse(serialized);
 assert.equal(accepted.progress,v.progress,'Server rejected genuinely driven progress');
 assert.equal(accepted.gate,v.gate,'Server rejected an actual ordered checkpoint');
 assert.equal(accepted.finish,v.finish,'Server did not confirm an actual physical finish');
 if(previous)largestPacketProgress=Math.max(largestPacketProgress,Math.abs(accepted.progress-previous.progress));
 network.player.state=serialized;network.player.seen=now;verifiedPackets++;
}

// A small analogue waypoint driver supplies only the public gas/brake/steering
// inputs. Vehicle position, speed, progress, gates and finish are never assigned
// by a normal race test. Road projection below is independent lap evidence.
function analogueInput(driver,lane=0,direction=1){
 const {vehicle:v,track}=driver,near=track.nearest(v.x,v.z),target=track.at(near.s+direction*(7+v.speed*.42));
 target.x-=target.dz*lane;target.z+=target.dx*lane;
 const error=angleDelta(Math.atan2(target.x-v.x,target.z-v.z)-v.angle);
 const turn=Math.abs(angleDelta(track.at(near.s+direction*24).angle-near.angle));
 const max=(direction<0?9:Math.min(18,CARS[v.car].max*.65))/(1+turn*1.8);
 return {gas:v.speed<max?1:.08,brake:v.speed>max+1.5?1:0,steer:clamp(-error*2,-1,1),autoDrift:false};
}

function observeDriver(driver,events,previous){
 const {vehicle:v,track}=driver;
 const near=track.nearest(v.x,v.z),delta=track.delta(near.s,driver.roadS);
 assert.ok(Math.abs(delta)<=32,`${driver.config.trackId} car${v.car} ${driver.config.laps} laps ${driver.config.rules}: ordinary physics projected to a distant course segment; ${JSON.stringify({time:driver.time,delta,previous:driver.roadS,current:near.s,accepted:v.s,x:v.x,z:v.z,distance:near.distance,progress:v.progress})}`);
 assert.ok(events.includes('autoReset')||Math.hypot(v.x-previous.x,v.z-previous.z)<=Math.max(previous.speed,v.speed)*dt+3,'Ordinary course tracking accepted a physical teleport');
 driver.roadS=near.s;driver.physicalProgress+=delta;
 const lap=Math.floor(Math.max(0,driver.physicalProgress)/track.length);
 if(lap>(driver.crossings.at(-1)?.lap||0))driver.crossings.push({lap,time:driver.time,progress:v.progress,gate:v.gate});
 driver.finishEvents+=events.filter(event=>event==='finish').length;
 driver.autoResets+=events.filter(event=>event==='autoReset').length;
 driver.maxDistance=Math.max(driver.maxDistance,near.distance);
 driver.maxProjectionStep=Math.max(driver.maxProjectionStep,Math.abs(delta));
 if(near.distance>7.5)driver.vergeFrames++;
 assert.ok(Math.abs(v.progress-driver.physicalProgress)<1e-6,driver.config.trackId+': physically driven course metres were discarded');
 assert.ok(Math.abs(track.delta(near.s,v.s))<1e-6,driver.config.trackId+': accepted course position became stale');
 // Validate actual driver packets at the production 10 Hz send cadence,
 // including inside-corner projection changes and the final finish packet.
 if(++driver.network.steps%6===0||events.includes('finish'))publishState(driver);
 return events;
}

function tick(driver,input){
 const {vehicle:v,track}=driver,previous={x:v.x,z:v.z,speed:v.speed};
 driver.time+=dt;
 return observeDriver(driver,stepVehicle(v,track,input,dt,driver.time,driver.config),previous);
}

function tickPair(drivers,inputs){
 const previous=drivers.map(({vehicle:v})=>({x:v.x,z:v.z,speed:v.speed}));
 const events=drivers.map((driver,i)=>{driver.time+=dt;return stepVehicle(driver.vehicle,driver.track,inputs[i],dt,driver.time,driver.config);});
 const before=drivers.map(({vehicle:v})=>({s:v.s,x:v.x,z:v.z,progress:v.progress}));
 const collided=collideCars(drivers[0].vehicle,drivers[1].vehicle,drivers[0].track);
 drivers.forEach((driver,i)=>observeDriver(driver,events[i],previous[i]));
 return {collided,before,events};
}

function driveUntil(driver,predicate,lane=()=>0,seconds=30){
 const limit=driver.time+seconds;
 while(!predicate()&&driver.time<limit&&driver.vehicle.finish===null)tick(driver,analogueInput(driver,lane(driver.physicalProgress)));
 assert.ok(predicate(),`${driver.config.trackId}: driver failed to reach requested physical position in ${seconds} s`);
}

function runRace(id,car,laps,lane,rules='classic'){
 const driver=makeDriver(id,car,laps,rules),{vehicle:v,track}=driver;
 const limit=laps*190+40;
 while(v.finish===null&&driver.time<limit)tick(driver,analogueInput(driver,lane(driver.physicalProgress,driver.time)));
 assert.ok(v.finish!==null,`${id} car${car} ${laps} laps: race never finished`);
 assert.equal(driver.finishEvents,1,'Finish must be emitted exactly once');
 assert.equal(v.gate,laps*12,'Every requested lap must have twelve ordered gates');
 assert.equal(driver.crossings.length,laps,'Race required an extra physical circuit or finished too early');
 assert.ok(driver.physicalProgress>=laps*track.length&&driver.physicalProgress<laps*track.length+1,'Finish must coincide with the requested final start-line crossing');
 assert.ok(Math.abs(driver.crossings.at(-1).time-v.finish)<1e-8,'Finish was delayed past the physical final crossing');
 const stopped={x:v.x,z:v.z,s:v.s,progress:v.progress,gate:v.gate,finish:v.finish,speed:v.speed};
 for(let i=0;i<180;i++)assert.deepEqual(stepVehicle(v,track,{gas:1,steer:1,drift:true},dt,driver.time+i*dt,driver.config),[]);
 for(const [key,value]of Object.entries(stopped))assert.equal(v[key],value,'A finished vehicle changed '+key);
 return driver;
}

let races=0,vergeRaces=0;
for(const meta of TRACKS){
 for(let car=0;car<CARS.length;car++)for(const laps of [2,3,5]){
  runRace(meta.id,car,laps,s=>2.6*Math.sin(s/67));races++;
 }
 // This is the exact former failure: drive beyond the old 7.5 m progress
 // radius for part of lap one, then return to the centre. It formerly finished
 // after the THIRD physical lap even though TWO laps had been selected.
 for(let car=0;car<CARS.length;car++)for(const side of [-1,1]){
  const result=runRace(meta.id,car,2,s=>s>180&&s<360?side*7.95:0,side>0?'action':'classic');
  assert.ok(result.vergeFrames>60,meta.id+': verge regression never entered the former dead zone');
  assert.ok(result.maxDistance<=8+1e-6,'Outer verge no longer prevents village shortcuts');
  vergeRaces++;races++;
 }
 const cornerTrack=new Track(courses.get(meta.id).route),turns=cornerTrack.segments.map((segment,i,segments)=>({s:segment.s,turn:Math.abs(angleDelta(Math.atan2(segment.dx,segment.dz)-Math.atan2(segments[(i+segments.length-1)%segments.length].dx,segments[(i+segments.length-1)%segments.length].dz)))})).sort((a,b)=>b.turn-a.turn);
 for(const side of [-1,1]){
  let began=null;
  const result=runRace(meta.id,1,2,(s,time)=>{if(began===null&&s>turns[0].s-70)began=time;return began!==null&&time-began<14?side*7.95:0;});
  assert.ok(result.vergeFrames>60);assert.ok(result.maxDistance<=8+1e-6);
  console.log(`${meta.id} sharp bend ${side<0?'left':'right'}: largest continuous centreline projection step ${result.maxProjectionStep.toFixed(3)} m; exactly two physical laps.`);
  vergeRaces++;races++;
 }
 console.log(`PASS ${meta.id}: every car finishes 2/3/5 laps on lateral analogue lines; both outer-verge approaches finish after exactly two real circuits.`);
}

for(const meta of TRACKS){
 const driver=makeDriver(meta.id,1),{vehicle:v,track}=driver;
 driveUntil(driver,()=>driver.physicalProgress>180);
 driveUntil(driver,()=>track.nearest(v.x,v.z).distance>7.7,()=>7.95,25);
 const manual={progress:v.progress,gate:v.gate,safeS:v.safeS};
 resetVehicle(v,track);
 assert.equal(v.progress,manual.progress,'Manual reset awarded race progress');
 assert.equal(v.gate,manual.gate,'Manual reset awarded checkpoints');
 assert.ok(Math.abs(track.delta(v.s,manual.safeS))<1e-8);
 assert.ok(track.nearest(v.x,v.z).distance<1e-8,'Manual reset did not return to the road');
 driver.roadS=track.nearest(v.x,v.z).s;

 driveUntil(driver,()=>track.nearest(v.x,v.z).distance>7.7,()=>7.95,25);
 const resetStart=driver.autoResets;
 let stationaryFrames=0;
 for(let i=0;i<300&&driver.autoResets===resetStart;i++){
  const before={progress:v.progress,gate:v.gate,x:v.x,z:v.z},events=tick(driver,{gas:0,brake:1,steer:0,autoDrift:false});
  if(v.offroadStillTime>0)stationaryFrames++;
  if(events.includes('autoReset')){
   assert.equal(v.progress,before.progress,'Automatic recovery awarded race progress');
   assert.equal(v.gate,before.gate,'Automatic recovery awarded checkpoints');
   assert.ok(stationaryFrames>=119,'Recovery ran before two stationary seconds');
   assert.ok(track.nearest(v.x,v.z).distance<1e-8,'Automatic recovery did not return to the road');
  }
 }
 assert.equal(driver.autoResets,resetStart+1,'Stationary verge recovery never ran');
 while(v.finish===null&&driver.time<430)tick(driver,analogueInput(driver));
 assert.ok(v.finish!==null,meta.id+': reset made the finish unreachable');
 assert.equal(driver.crossings.length,2,'Reset added or discarded a real circuit');
 assert.equal(driver.finishEvents,1);

 // Fault injection for a lost local gate counter, after genuinely driving
 // beyond its old +24 m window. Continue with real physics; no progress is set.
 const delayed=makeDriver(meta.id);
 driveUntil(delayed,()=>delayed.physicalProgress>delayed.track.length/12+35);
 assert.equal(delayed.vehicle.gate,1);delayed.vehicle.gate=0;
 tick(delayed,analogueInput(delayed));
 assert.equal(delayed.vehicle.gate,1,'A missed gate window permanently blocked a valid driver');
 assert.equal(delayed.vehicle.finish,null,'Gate catch-up granted a finish');

 // An actual position teleport near the finish must not earn any of the
 // skipped course progress/gates, and reset returns to the confirmed location.
 const attack=makeDriver(meta.id),a=attack.vehicle;
 driveUntil(attack,()=>attack.physicalProgress>200);
 const confirmed={progress:a.progress,gate:a.gate,s:a.s},target=attack.track.at(attack.track.length-3);
 Object.assign(a,{x:target.x,z:target.z,angle:target.angle,speed:10});
 const teleportEvents=stepVehicle(a,attack.track,{gas:0},dt,attack.time+dt,attack.config);
 assert.equal(a.progress,confirmed.progress);assert.equal(a.gate,confirmed.gate);assert.equal(a.s,confirmed.s);
 assert.equal(a.finish,null);assert.ok(!teleportEvents.includes('finish'));
 resetVehicle(a,attack.track);assert.ok(Math.abs(attack.track.delta(attack.track.nearest(a.x,a.z).s,confirmed.s))<1e-8);

 const bendAttack=makeDriver(meta.id),b=bendAttack.vehicle;
 const bends=bendAttack.track.segments.map((segment,i,segments)=>({s:segment.s,turn:Math.abs(angleDelta(Math.atan2(segment.dx,segment.dz)-Math.atan2(segments[(i+segments.length-1)%segments.length].dx,segments[(i+segments.length-1)%segments.length].dz)))})).sort((left,right)=>right.turn-left.turn);
 const bend=bends[0];assert.ok(bend.turn>.7);
 driveUntil(bendAttack,()=>bendAttack.physicalProgress>bend.s-10,()=>0,meta.length/9+30);
 const beforeBend={progress:b.progress,gate:b.gate,s:b.s},afterBend=bendAttack.track.at(bend.s+11);
 assert.ok(Math.abs(bendAttack.track.delta(afterBend.s,b.s))>15);
 Object.assign(b,{x:afterBend.x,z:afterBend.z,angle:afterBend.angle,speed:10});
 stepVehicle(b,bendAttack.track,{gas:0},dt,bendAttack.time+dt,bendAttack.config);
 assert.equal(b.progress,beforeBend.progress,'A teleport used the local bend allowance');
 assert.equal(b.gate,beforeBend.gate);assert.equal(b.s,beforeBend.s);assert.equal(b.finish,null);

 const reverse=makeDriver(meta.id);
 driveUntil(reverse,()=>reverse.physicalProgress>140);
 const priorProgress=reverse.vehicle.progress,priorGate=reverse.vehicle.gate;
 for(let i=0;i<40*60;i++)tick(reverse,analogueInput(reverse,0,-1));
 assert.ok(reverse.vehicle.progress<priorProgress-40,'Reverse scenario did not physically drive backwards');
 assert.equal(reverse.vehicle.gate,priorGate,'Driving backwards awarded checkpoints');
 assert.equal(reverse.vehicle.finish,null,'Driving backwards or crossing the start backwards granted a finish');
 console.log(`PASS ${meta.id}: moving and stationary recovery preserve real lap distance, delayed gates recover, finish freezes once, and reverse/teleport shortcuts cannot finish.`);
}

// The former accidental pair trajectory depended on one specific steering
// model. Exercise its exact geometric boundary directly instead. Rotate only
// the start of the SAME surveyed closed route so makeVehicle supplies the
// confirmed -12 m origin automatically. No progress, gate or finish is set.
function deterministicCornerCollision(){
 const original=new Track(courses.get('kraemer').route),startS=265.8,start=original.at(startS);
 const points=[[start.x,start.z],...original.segments.filter(segment=>segment.s>startS).map(segment=>segment.a),...original.segments.filter(segment=>segment.s<=startS).map(segment=>segment.a),[start.x,start.z]];
 const config=normalizeRaceConfig({trackId:'kraemer',laps:2,rules:'classic',autoDrift:false,assist:false}),track=new Track(points,config);
 assert.ok(Math.abs(track.length-original.length)<1e-8,'Collision fixture altered the actual course geometry');
 const a=makeVehicle(track,0),b=makeVehicle(track,0,0,'Visible collider','collider',config),p=track.at(-12),u=Math.SQRT1_2,impulse=.3,separation=2.1-impulse/.52;
 // Initial poses describe two stopped cars on the inside verge. The second
 // is server-owned, as it can be in a live race; only the local car confirms
 // its own course movement. Both cars receive the real collideCars impulse.
 Object.assign(a,{x:p.x+p.dz*7.95,z:p.z-p.dx*7.95,speed:0});
 Object.assign(b,{x:a.x-separation*u,z:a.z-separation*u,speed:0,remote:true});
 const before={x:a.x,z:a.z,s:a.s,progress:a.progress,gate:a.gate,finish:a.finish},near=track.nearest(a.x,a.z),remote={progress:b.progress,gate:b.gate,s:b.s};
 assert.ok(Math.abs(track.delta(near.s,a.s))<1e-8,'Initial collision pose was not on its already confirmed projection');
 assert.ok(near.distance<=8&&track.nearest(b.x,b.z).distance<=8,'Collision fixture began outside the driveable verge');
 assert.equal(collideCars(a,b,track),true,'Deterministic physical corner collision was not exercised');
 const physicalImpulse=Math.hypot(a.x-before.x,a.z-before.z),after=track.nearest(a.x,a.z),jump=track.delta(after.s,before.s);
 assert.ok(Math.abs(physicalImpulse-.3)<1e-8,'The targeted regression requires an actual 0.30 m physical impulse');
 assert.ok(physicalImpulse<=2.2,'Collision correction exceeded its trusted physical bound');
 assert.ok(jump>15&&jump<18,'Small 0.30 m collision / 17 m centreline switch regression was not exercised');
 assert.ok(after.distance<=8&&Math.abs(angleDelta(after.angle-near.angle))>.25,'The local bend allowance was not the cause of the projection switch');
 assert.ok(Math.abs(a.progress-before.progress-jump)<1e-8,'A real small collision discarded confirmed course movement');
 assert.ok(Math.abs(track.delta(a.s,after.s))<1e-8,'A real small collision left the course projection stale');
 assert.equal(a.gate,before.gate,'The local start crossing awarded an unearned whole-lap checkpoint');
 assert.equal(a.finish,before.finish,'The local start crossing fabricated a finish');
 for(const[key,value]of Object.entries(remote))assert.equal(b[key],value,'Physical collision overwrote server-owned remote '+key);
 const confirmed={x:a.x,z:a.z,progress:a.progress,s:a.s,gate:a.gate};
 assert.ok(!stepVehicle(a,track,{gas:0,brake:1,steer:0},dt,dt,config).includes('finish'),'The step after the local collision fabricated a finish');
 for(const[key,value]of Object.entries(confirmed))assert.equal(a[key],value,'A stationary step discarded or duplicated the known collision: '+key);
 console.log(`PASS A deterministic ${physicalImpulse.toFixed(2)} m physical collision confirms a ${jump.toFixed(3)} m real-corner projection switch without fabricated progress, checkpoints or finish.`);
 return 1;
}

let collisionRaces=0,confirmedCornerCollisions=0;
for(const meta of TRACKS)for(let car=0;car<CARS.length;car++){
 const exactCorner=meta.id==='kraemer'&&car===0;
 const drivers=[makeDriver(meta.id,car),makeDriver(meta.id,car,2,'classic',exactCorner?4:1)];
 let collisions=0,cornerCollisions=exactCorner?deterministicCornerCollision():0;
 while(drivers.some(driver=>driver.vehicle.finish===null)&&drivers[0].time<430){
  // After a real nudge, recover on the centre line as a driver would. The
  // exact >15 m boundary above is independent of this pair's driving style;
  // these drivers must still collide and physically complete both circuits.
  const recover=collisions>0;
  const inputs=drivers.map((driver,i)=>{const s=driver.track.nearest(driver.vehicle.x,driver.vehicle.z).s;return analogueInput(driver,!recover&&s>(i===0||!exactCorner?180:220)&&s<360?(i===0||exactCorner?-7.95:-6.75):0);});
  const {collided,before}=tickPair(drivers,inputs);
  if(collided){
   collisions++;
   for(const [i,driver]of drivers.entries())if(Math.abs(driver.track.delta(driver.vehicle.s,before[i].s))>15){
    assert.ok(Math.hypot(driver.vehicle.x-before[i].x,driver.vehicle.z-before[i].z)<=2.2,'Collision correction exceeded its trusted physical bound');
    cornerCollisions++;
   }
  }
 }
 assert.ok(collisions>0,meta.id+': paired drivers never collided');
 for(const driver of drivers){assert.ok(driver.vehicle.finish!==null,meta.id+': a real collision made the finish unreachable '+JSON.stringify({car,time:driver.time,physical:driver.physicalProgress,progress:driver.vehicle.progress,gate:driver.vehicle.gate,speed:driver.vehicle.speed,pose:[driver.vehicle.x,driver.vehicle.z,driver.vehicle.angle],near:driver.track.nearest(driver.vehicle.x,driver.vehicle.z),resets:driver.autoResets,collisions}));assert.equal(driver.crossings.length,2);assert.equal(driver.finishEvents,1);assert.equal(driver.vehicle.gate,24);}
 if(meta.id==='kraemer'&&car===0)assert.ok(cornerCollisions>0,'Small 0.30 m collision / 17 m centreline switch regression was not exercised');
 confirmedCornerCollisions+=cornerCollisions;collisionRaces+=2;
}
assert.ok(confirmedCornerCollisions>0);
console.log(`PASS ${collisionRaces} additional real driver races with collisions after the physics step; ${confirmedCornerCollisions} trusted small impulses switch the centreline by more than 15 m without losing course progress.`);

// A displayed remote car receives the same physical nudge, but its server-
// owned progress, checkpoints and accepted phase cannot be amended locally.
const onlineDrivers=[makeDriver('kraemer'),makeDriver('kraemer',0,2,'classic',4)];
let remoteCollision=false;
for(let frame=0;frame<60*60&&!remoteCollision;frame++){
 const previous=onlineDrivers.map(({vehicle:v})=>({x:v.x,z:v.z,speed:v.speed}));
 const events=onlineDrivers.map((driver,i)=>{driver.time+=dt;const s=driver.track.nearest(driver.vehicle.x,driver.vehicle.z).s;return stepVehicle(driver.vehicle,driver.track,analogueInput(driver,s>(i===0?180:220)&&s<360?-7.95:0),dt,driver.time,driver.config);});
 const remote={...onlineDrivers[1].vehicle,remote:true},owned={progress:remote.progress,gate:remote.gate,s:remote.s};
 remoteCollision=collideCars(onlineDrivers[0].vehicle,remote,onlineDrivers[0].track);
 for(const [key,value]of Object.entries(owned))assert.equal(remote[key],value,'A local collision overwrote server-owned remote '+key);
 onlineDrivers.forEach((driver,i)=>observeDriver(driver,events[i],previous[i]));
}
assert.equal(remoteCollision,true,'Remote ownership collision was not exercised');
console.log('PASS Remote collision preserves server-owned progress, gates and accepted phase.');

// Both cars genuinely drive two laps, then brake just before the final line.
// A normal later collision can push the stationary leader over that line.
// The next step must emit finish even with braking/zero forward displacement.
const goalDrivers=[makeDriver('kraemer'),makeDriver('kraemer',0,2,'classic',4)],goal=goalDrivers[0].track.length*2;
function stopAt(driver,target){
 const input=analogueInput(driver),gap=target-driver.physicalProgress;
 if(gap<15){const targetSpeed=Math.sqrt(36*Math.max(0,gap));input.gas=gap>.03&&driver.vehicle.speed<targetSpeed?1:0;input.brake=gap<=.03||driver.vehicle.speed>targetSpeed?1:0;}
 return input;
}
let crossedByCollision=false,finishPose=null;
while(!crossedByCollision&&goalDrivers[0].time<430){
 const result=tickPair(goalDrivers,[stopAt(goalDrivers[0],goal-.12),stopAt(goalDrivers[1],goal-.45)]),leader=goalDrivers[0].vehicle;
 crossedByCollision=result.collided&&result.before[0].progress<goal&&leader.progress>=goal&&leader.finish===null;
 assert.ok(leader.finish===null,'Goal-stop driver finished without the intended final collision');
 if(crossedByCollision){finishPose={};for(const key of ['x','z','s','progress','gate','speed'])finishPose[key]=leader[key];}
}
assert.equal(crossedByCollision,true,'Naturally driven/stopped cars never exercised a final-line collision');
assert.equal(goalDrivers[0].vehicle.gate,24);
const finalTick=tickPair(goalDrivers,[{gas:0,brake:1,steer:1},stopAt(goalDrivers[1],goal-.45)]);
assert.ok(finalTick.events[0].includes('finish'),'A stationary confirmed goal crossing never emitted finish');
assert.equal(goalDrivers[0].finishEvents,1);assert.equal(goalDrivers[0].crossings.length,2);
for(const [key,value]of Object.entries(finishPose))assert.equal(goalDrivers[0].vehicle[key],value,'Vehicle moved after a collision had confirmed the final line: '+key);
console.log('PASS A physically driven final-line collision finishes on the next step while braking, without an additional metre or lap.');

console.log(`PASS: ${races} individual race cases (${vergeRaces} explicit former grass-edge failures), ${collisionRaces} collision-race finishers and a stationary final-line collision; all three tracks and ${CARS.length} cars, 2/3/5 laps, analogue lateral trajectories, action obstacles, manual/two-second recovery and ordered-gate/shortcut regressions; ${verifiedPackets} actual 10 Hz packets accepted by the shared server validator, largest packet progress delta ${largestPacketProgress.toFixed(3)} m. Actual production physics; no fabricated finishing progress and no rendering/FPS claim.`);
