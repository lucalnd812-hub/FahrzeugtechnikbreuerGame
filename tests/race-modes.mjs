import assert from 'node:assert/strict';
import {RecordStore,recordKey,recordCategory,GhostRecorder,GhostReplay,RaceTiming,BreuerCup,CUP_TRACKS,CUP_POINTS,challengeTargets,medal,bestMedal,PerformanceProbe} from '../src/race-modes.js';

class Storage{constructor(){this.values=new Map();}getItem(key){return this.values.get(key)??null;}setItem(key,value){this.values.set(key,String(value));}removeItem(key){this.values.delete(key);}}
const storage=new Storage(),config={trackId:'lammersdorf',trackVersion:'real-revision',car:0,laps:2,rules:'classic',mode:'race',difficulty:.91,opponents:5,assist:false,assists:{autoGas:false,autoDrift:true}};
assert.equal(recordKey({...config,assists:{autoDrift:true,autoGas:false}}),recordKey(config),'Object property order must not fork records');
assert.notEqual(recordKey({...config,raceType:'online'}),recordKey(config),'Online opponents must not overwrite solo best times or ghosts');
assert.notEqual(recordKey({...config,handlingVersion:'arcade-handling-3'}),recordKey(config),'Changed handling must never replay an old-physics ghost or overwrite its record');
assert.notEqual(recordKey({...config,handlingVersion:'arcade-handling-3'}),recordKey({...config,handlingVersion:'next-handling'}));
for(const change of [{trackId:'bahnhof'},{trackVersion:'next-revision'},{car:1},{laps:5},{rules:'action'},{mode:'time-trial'},{opponents:0},{difficulty:1.06},{assists:{autoGas:true,autoDrift:true}},{assists:{autoGas:false,autoDrift:false}}])assert.notEqual(recordKey({...config,...change}),recordKey(config));
assert.notEqual(recordKey({...config,assists:undefined,assist:true}),recordKey({...config,assists:undefined,assist:false}),'The public gas-assistant setting must isolate records even without an assists object');
assert.equal(recordCategory({...config,car:undefined,carId:'m1'}).car,'m1');
const recorder=new GhostRecorder();
for(let step=0;step<=120;step++){const time=step/60;recorder.sample(time,{x:time*2,z:time,angle:Math.PI-.04+time*.04,speed:4,progress:time*10,drifting:step>60});}
const ghost=recorder.finish(2,{x:4,z:2,angle:-Math.PI+.04,speed:4,progress:20,drifting:true});
assert.equal(ghost.duration,2);assert(ghost.samples.length/7>=39&&ghost.samples.length/7<=42);assert.equal(recorder.sample(3,{x:0,z:0,angle:0,speed:0,progress:0}),false);
const replay=new GhostReplay(ghost);assert.equal(replay.at(-1).started,false);assert.equal(replay.at(2).finished,true);assert(Math.abs(replay.at(1).x-2)<.011);assert.equal(replay.timeAtProgress(10),1);assert.equal(replay.timeAtProgress(21),null);assert.equal(replay.at(NaN),null);
const wrapped=new GhostReplay({version:1,stride:7,samples:[0,0,0,3100,100,0,0,1000,100,100,-3100,100,100,1]});
assert(Math.abs(Math.abs(wrapped.at(.5).angle)-Math.PI)<.001,'Ghost angles interpolate through the shortest arc');
const backward=new GhostReplay({version:1,stride:7,samples:[0,0,0,0,100,0,0,1000,100,0,0,100,1000,0,2000,50,0,0,100,500,0,3000,200,0,0,100,2000,0]});
assert.equal(backward.timeAtProgress(10),1);assert(Math.abs(backward.timeAtProgress(15)-(2+2/3))<1e-10,'A reverse drive cannot move an earlier crossing');
const long=new GhostRecorder({maxSamples:4});for(let time=0;time<=100;time+=.05)long.sample(time,{x:time,z:0,angle:0,speed:1,progress:time});
const longGhost=long.finish(100,{x:100,z:0,angle:0,speed:1,progress:100});assert(longGhost.decimated);assert(longGhost.samples.length/7<=4);assert.equal(longGhost.duration,100);assert(new GhostReplay(longGhost).count>0);
for(const broken of [null,{...ghost,samples:ghost.samples.slice(1)},{...ghost,version:2},{...ghost,samples:[-1,0,0,0,0,0,0]},{...ghost,samples:[0,0,0,0,0,0,2]},{...ghost,samples:[0,NaN,0,0,0,0,0]}])assert.equal(new GhostReplay(broken).at(1),null);

const store=new RecordStore(storage);const saved=store.save(config,{time:10,sectors:[3,3,4],ghost});assert(saved.saved&&saved.isBest&&saved.ghostSaved);
assert.equal(new RecordStore(storage).get(config).time,10);assert.equal(store.get({...config,laps:5}),null);
assert.equal(store.get({...config,opponents:0}),null);store.save({...config,opponents:0},{time:20,ghost});assert.equal(store.get(config).time,10);assert.equal(new RecordStore(storage).get({...config,opponents:0}).time,20);
const sectorImproved=store.save(config,{time:11,sectors:[2.8,3.2,5]});assert(sectorImproved.saved);assert(!sectorImproved.isBest);assert.equal(sectorImproved.record.time,10);assert.equal(sectorImproved.record.bestSectors[0],2.8);assert.equal(sectorImproved.record.ghost,ghost);
assert(!store.save(config,{time:11,sectors:[3.1,4,4.5]}).saved);for(const time of [0,-1,Infinity,NaN,'3'])assert(!store.save(config,{time}).saved);
assert(store.remove(config));assert.equal(store.get(config),null);
const quotaStorage={getItem:()=>null,setItem(){throw new Error('quota');}},sessionStore=new RecordStore(quotaStorage);const quota=sessionStore.save(config,{time:12,sectors:[4,4,4],ghost});assert(!quota.saved&&quota.isBest&&quota.error);assert.equal(sessionStore.get(config).time,12);
const compactStorage=new Storage();compactStorage.setItem=function(key,value){if(JSON.parse(value).ghost)throw new Error('quota');this.values.set(key,String(value));};
const compact=new RecordStore(compactStorage).save(config,{time:12,ghost});assert(compact.saved&&!compact.ghostSaved);assert.equal(new RecordStore(compactStorage).get(config).ghost,null);
storage.setItem(recordKey(config),'{broken-json');assert.equal(new RecordStore(storage).get(config),null);
storage.setItem(recordKey(config),JSON.stringify({version:2,time:10,config:recordCategory({...config,car:2})}));assert.equal(new RecordStore(storage).get(config),null);

const timing=new RaceTiming({length:300,laps:2});const first=timing.update(150,15);assert.deepEqual(first.map(event=>event.type),['sector']);assert.equal(first[0].time,10);
timing.update(100,16);assert.equal(timing.update(150,20).length,0);const end=timing.update(600,60);assert.equal(end.filter(event=>event.type==='lap').length,2);assert(timing.finished);assert.equal(timing.completedLaps,2);assert.equal(timing.lapTimes.length,2);assert.equal(timing.update(900,90).length,0);assert.equal(timing.update(NaN,100).length,0);
for(const hz of [30,60,10]){const t=new RaceTiming({length:300,laps:5});for(let step=0;step<=hz*150;step++)t.update(step/hz*10,step/hz);assert.equal(t.completedLaps,5);assert(t.lapTimes.every(time=>Math.abs(time-30)<1e-8));assert(t.sectorTimes.every(time=>Math.abs(time-10)<1e-8));}
const ghostTiming=new RaceTiming({length:30,ghost:replay});assert(Math.abs(ghostTiming.deltaGhost(10,1.2)-.2)<1e-12);assert.equal(ghostTiming.deltaGhost(99,2),null);
assert.throws(()=>new RaceTiming({length:0}),TypeError);

const cupStore=new Storage(),cup=new BreuerCup(cupStore),started=cup.start({car:2,laps:1},[{id:'you',name:'Du',car:2},{id:'same',name:'Max'},{id:'same',name:'Lea'}]);
assert.equal(started.entrants.length,6);assert.equal(new Set(started.entrants.map(entrant=>entrant.id)).size,6);const ids=started.entrants.map(entrant=>entrant.id);
assert(!cup.recordRace('bahnhof',ids).ok);assert(!cup.recordRace('lammersdorf',ids.slice(0,5)).ok);assert(!cup.recordRace('lammersdorf',[...ids.slice(0,5),ids[0]]).ok);
const a=cup.recordRace(CUP_TRACKS[0],ids.map((id,index)=>({id,time:20+index})));assert(a.ok&&!a.completed);assert.equal(a.nextTrack,CUP_TRACKS[1]);assert.deepEqual(a.state.races[0].results.map(result=>result.points),CUP_POINTS);
assert(cup.recordRace(CUP_TRACKS[0],ids).duplicate);assert.equal(cup.state.races.length,1);
const resumed=new BreuerCup(cupStore);assert.deepEqual(resumed.resume().entrants,started.entrants);assert.equal(resumed.state.index,1);
resumed.recordRace(CUP_TRACKS[1],[...ids].reverse());const final=resumed.recordRace(CUP_TRACKS[2],ids);assert(final.ok&&final.completed);assert.equal(final.nextTrack,null);assert.equal(resumed.state.races.length,3);assert.equal(resumed.standings()[0].id,ids[0]);
assert.equal(resumed.standings().reduce((sum,entrant)=>sum+entrant.points,0),CUP_POINTS.reduce((sum,points)=>sum+points,0)*3);assert.equal(new BreuerCup(cupStore).resume().status,'completed');
assert(resumed.abandon());assert.equal(new BreuerCup(cupStore).resume(),null);
const malformed=new Storage();malformed.setItem('breuer-cup:v1',JSON.stringify({...started,entrants:[...started.entrants.slice(0,5),started.entrants[0]]}));assert.equal(new BreuerCup(malformed).resume(),null);
const sessionCup=new BreuerCup(quotaStorage);sessionCup.start();assert(sessionCup.lastError);assert(sessionCup.recordRace('lammersdorf',sessionCup.state.entrants.map(entrant=>entrant.id)).ok);assert.equal(sessionCup.resume().index,1);

const targets=challengeTargets({length:1200,referenceLapTime:70},{max:35},1);assert(targets.gold<targets.silver&&targets.silver<targets.bronze);assert.equal(medal(targets.gold,targets),'gold');assert.equal(medal(targets.gold+.1,targets),'silver');assert.equal(medal(targets.silver+.1,targets),'bronze');assert.equal(medal(targets.bronze+.1,targets),null);assert.equal(medal(-1,targets),null);assert(challengeTargets({length:1200},{max:35},5).gold>challengeTargets({length:1200},{max:35},1).gold*4);
assert.equal(bestMedal('gold','bronze'),'gold');assert.equal(bestMedal('gold',null),'gold');assert.equal(bestMedal('silver','none'),'silver');assert.equal(bestMedal('bronze','gold'),'gold');assert.equal(bestMedal('invalid',null),'none');

const probe=new PerformanceProbe({windowSeconds:1,targetFPS:60});for(let frame=0;frame<100;frame++)probe.sample(20,{render:{calls:10,triangles:100},memory:{geometries:4,textures:2},programs:[{}]});
const measurements=probe.summary();assert.equal(measurements.overallFPS,50);assert.equal(measurements.p95Ms,20);assert.equal(measurements.drawCalls,10);assert.equal(measurements.geometryDelta,0);assert(measurements.frames<=50);assert.equal(probe.sample(NaN),false);probe.reset();assert.equal(probe.summary().frames,0);
// An intentional 30 FPS cap is not a stream of missed 60 FPS frames. Each
// sample retains the cap used for that frame when automatic quality changes.
const capped=new PerformanceProbe();for(let i=0;i<10;i++)capped.sample(1000/30,{},30);assert.equal(capped.summary().targetFPS,30);assert.equal(capped.summary().slowFrames,0);assert.equal(capped.summary().droppedFrames,0);for(let i=0;i<10;i++)capped.sample(1000/60,{},60);assert.equal(capped.summary().targetFPS,60);assert.equal(capped.summary().slowFrames,0);assert.equal(capped.summary().droppedFrames,0);capped.sample(100,{},30);assert.equal(capped.summary().droppedFrames,2);
console.log('PASS Category-scoped records, quota fallback, bounded ghosts and replay, FPS-independent lap/sectors, persistent three-race Cup, medals and measured-frame report calculations');
