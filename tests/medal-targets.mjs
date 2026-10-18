import assert from 'node:assert/strict';
import {TRACKS} from '../src/tracks.js';
import {CARS,HANDLING_VERSION} from '../src/car-catalog.js';
import {LAMMERSDORF_MEDAL_TIMES,medalTargets,challengeTargets,medal,bestMedal,RecordStore,recordKey} from '../src/race-modes.js';

const lammersdorf=TRACKS.find(track=>track.id==='lammersdorf');
assert(Object.isFrozen(LAMMERSDORF_MEDAL_TIMES));
assert.deepEqual(LAMMERSDORF_MEDAL_TIMES,{gold:35,silver:40,bronze:50});
for(const input of [undefined,null,{},'lammersdorf',lammersdorf,{trackId:'lammersdorf',routeLength:1200}])assert.deepEqual(medalTargets(input),{gold:35,silver:40,bronze:50});
for(const laps of [1,2,3,5,10]){
 const expected={gold:35*laps,silver:40*laps,bronze:50*laps};
 assert.deepEqual(medalTargets(lammersdorf,{laps}),expected);
 assert.deepEqual(medalTargets('lammersdorf',{laps:String(laps)}),expected);
 for(const car of CARS)assert.deepEqual(challengeTargets(lammersdorf,car,laps),expected,'The selected car must not silently move the stated medal goals');
}
assert.deepEqual(challengeTargets({...lammersdorf,referenceLapTime:120,challengeFactor:2.6},{max:8},1),{gold:35,silver:40,bronze:50},'Old pace estimates must not soften the new Lammersdorf goals');
console.log('PASS Lammersdorf has exactly 35/40/50-second goals per lap for every car, multiplied cleanly for 1/2/3/5/10 laps');

const expectedByCourse={bahnhof:{gold:47.29,silver:54.04,bronze:67.55},kraemer:{gold:46.91,silver:53.61,bronze:67.02}};
for(const [id,expected] of Object.entries(expectedByCourse)){
 const track=TRACKS.find(item=>item.id===id),snapshot=structuredClone(track);
 assert.deepEqual(medalTargets(track),expected);assert.deepEqual(medalTargets(id),expected);assert.deepEqual(medalTargets(undefined,{trackId:id}),expected);
 for(const laps of [2,3,5,10]){
  const targets=medalTargets(track,{laps});
  for(const award of ['gold','silver','bronze'])assert.equal(Math.round(targets[award]*100),Math.round(expected[award]*100)*laps,'A multi-lap goal must equal that many displayed lap goals');
 }
 assert.deepEqual(track,snapshot,'Reading targets must not mutate the shared course catalogue');
}
assert.deepEqual(medalTargets({length:lammersdorf.length*2}),{gold:70,silver:80,bronze:100});
assert.deepEqual(medalTargets({routeLength:lammersdorf.length/2},{laps:3}),{gold:52.5,silver:60,bronze:75});
for(const length of [0,-1,NaN,Infinity])assert.deepEqual(medalTargets({length}),{gold:35,silver:40,bronze:50});
assert.deepEqual(medalTargets('missing',null),{gold:35,silver:40,bronze:50});
console.log('PASS Other courses scale against the real Lammersdorf length; displayed hundredths remain consistent across multiple laps and invalid inputs stay finite');

const single=medalTargets('lammersdorf');
for(const [time,expected] of [[34.99,'gold'],[35,'gold'],[35.01,'silver'],[39.99,'silver'],[40,'silver'],[40.01,'bronze'],[49.99,'bronze'],[50,'bronze'],[50.01,null]])assert.equal(medal(time,single),expected);
const five=medalTargets('lammersdorf',{laps:5});
for(const [time,expected] of [[175,'gold'],[175.01,'silver'],[200,'silver'],[200.01,'bronze'],[250,'bronze'],[250.01,null]])assert.equal(medal(time,five),expected);
for(const time of [0,-1,NaN,Infinity,'35',null])assert.equal(medal(time,single),null);
for(const id of ['bahnhof','kraemer']){const targets=medalTargets(id);assert.equal(medal(targets.gold,targets),'gold');assert.equal(medal(targets.gold+.001,targets),'silver');assert.equal(medal(targets.silver,targets),'silver');assert.equal(medal(targets.silver+.001,targets),'bronze');assert.equal(medal(targets.bronze,targets),'bronze');assert.equal(medal(targets.bronze+.001,targets),null);}
console.log('PASS Faster is better: exact gold/silver/bronze boundaries award the medal, and a slower time falls into the next category');

const values=new Map(),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
const legacy={trackId:'lammersdorf',trackVersion:lammersdorf.version,car:0,laps:1,rules:'classic',mode:'challenge',assist:false};
const current={...legacy,handlingVersion:HANDLING_VERSION},store=new RecordStore(storage);
store.save(legacy,{time:45,sectors:[15,15,15]});store.save(current,{time:42,sectors:[14,14,14]});
const before=[...values.entries()];medalTargets(lammersdorf,{laps:5});challengeTargets(lammersdorf,CARS[0],1);
assert.deepEqual([...values.entries()],before);assert.notEqual(recordKey(legacy),recordKey(current));
assert.equal(new RecordStore(storage).get(legacy).time,45);assert.equal(new RecordStore(storage).get(current).time,42);
assert.equal(bestMedal('gold',medal(45,single)),'gold','A stricter new goal must not erase a medal already earned');
console.log('PASS New challenge goals preserve existing records, separate handling versions and previously earned gold medals');
