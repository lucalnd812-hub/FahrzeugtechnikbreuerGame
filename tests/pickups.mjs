import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Track,CARS,makeVehicle,stepVehicle,botInput,collectPickup,pickupAvailable,useItem} from '../src/race-core.js';
import {normalizeRaceConfig} from '../src/race-config.js';
import {TRACKS} from '../src/tracks.js';

const config=normalizeRaceConfig({rules:'action',laps:2,opponents:0});
const straight=new Track([[0,0],[0,2000],[2000,2000],[2000,0],[0,0]],config);
function driver(car=0){
 const v=makeVehicle(straight,car,0,'Pickup QA','pickup-'+car,config);
 return Object.assign(v,{x:0,z:100,angle:0,s:100,safeS:100,progress:100,speed:CARS[car].max*1.35,boost:3,zoneCooldown:10});
}

// Actual physics at racing speed passes the circle's outer edge entirely
// between samples. Both sampled centres miss; the driven segment must collect.
let edgeCrossings=0;
for(let car=0;car<CARS.length;car++)for(const dt of [1/60,.05]){
 const v=driver(car),previous={x:v.x,z:v.z};
 stepVehicle(v,straight,{gas:1,steer:0,autoDrift:false},dt,1,config);
 const crate={x:2.399,z:(previous.z+v.z)/2,available:0};
 assert.ok(Math.hypot(previous.x-crate.x,previous.z-crate.z)>2.4,'The old starting point must miss this regression');
 assert.ok(Math.hypot(v.x-crate.x,v.z-crate.z)>2.4,'The old ending point must miss this regression');
 const result=collectPickup(v,[crate],1,previous,()=>.5);
 assert.equal(result?.type,'shield',CARS[car].id+': fast grazing crossing lost its pickup');
 assert.equal(v.item,'shield');assert.equal(v.itemCooldown,3);assert.equal(crate.available,6);edgeCrossings++;
}
console.log(`PASS ${edgeCrossings} real boosted car movements across a crate between physics samples, all five vehicles at 60 Hz and a 50 ms step`);

// Eligibility, competition and activation use the shipped inventory logic.
const v=driver(),crate={x:v.x,z:v.z,available:0},oils=[];
for(const [change,message] of [
 [{item:'oil'},'A full inventory'],[{itemCooldown:2},'An active inventory cooldown'],
 [{remote:true},'A network-owned vehicle'],[{finish:12},'A finished vehicle'],
 [{raceConfig:normalizeRaceConfig({rules:'classic'})},'Classic rules']
]){
 const blocked={...v,...change};
 assert.equal(collectPickup(blocked,[crate],1,null,()=>0),null,message+' collected a crate');
 assert.equal(crate.available,0,message+' consumed a crate');
}
assert.equal(collectPickup(v,[{...crate,available:2}],1),null,'A spent crate was collected before its respawn');
const first=collectPickup(v,[crate],1,null,()=>0);assert.equal(first.type,'boost');
const other=driver(1);assert.equal(collectPickup(other,[crate],1),null,'A second car collected the same crate in the same step');
assert.equal(pickupAvailable(crate,5.999),false);assert.equal(pickupAvailable(crate,6),true);assert.equal(pickupAvailable(crate,6,'classic'),false);
assert.equal(useItem(v,oils,1),'boost');assert.equal(v.item,null);assert.ok(v.boost>=3);
assert.equal(collectPickup(v,[{...crate,available:0}],1),null,'Using an item immediately bypassed the inventory cooldown');
v.itemCooldown=0;assert.equal(collectPickup(v,[crate],6,null,()=>.999).type,'oil');
assert.equal(useItem(v,oils,6),'oil');assert.equal(oils.length,1);
const resetCar=driver(),resetCrate={x:0,z:90,available:0};
assert.equal(collectPickup(resetCar,[resetCrate],1,{x:0,z:60}),null,'A reset collected a crate along its teleport path');
assert.equal(collectPickup(driver(),[{x:2.41,z:100,available:0}],1),null,'A car outside the existing pickup radius collected a crate');
console.log('PASS Rules, finished/remote ownership, full inventory, cooldown, one claimant, exact respawn, gadget use and reset-path rejection');

// Exercise actual course routes and crate placement with the same shared
// collection function used by the browser, instead of copying its old check.
let coursePickups=0,courseUses=0;
for(const meta of TRACKS){
 const data=JSON.parse(fs.readFileSync(new URL('../src/tracks/'+meta.id+'.json',import.meta.url)));
 const raceConfig=normalizeRaceConfig({trackId:meta.id,rules:'action',laps:1,opponents:0});
 const track=new Track(data.route,raceConfig),v=makeVehicle(track,0,0,'Course Pickup QA','course-pickup',raceConfig);
 const crates=[];
 for(let s=85;s<track.length-30;s+=145){const p=track.at(s);for(const offset of [-2.2,2.2])crates.push({x:p.x-p.dz*offset,z:p.z+p.dx*offset,available:0});}
 let count=0;
 for(let step=0;step<190*60&&v.finish===null;step++){
  const time=step/60,previous={x:v.x,z:v.z};
  const events=stepVehicle(v,track,botInput(v,track,.91),1/60,time,raceConfig);
  if(collectPickup(v,crates,time,events.includes('autoReset')?null:previous,()=>.5)){count++;coursePickups++;assert.equal(useItem(v,[],time),'shield');courseUses++;}
 }
 assert.ok(v.finish!==null,meta.id+': pickup race did not finish');assert.ok(count>0,meta.id+': no crate could actually be collected');
 console.log(`PASS ${meta.id}: ${count} actual driven pickups and activations before finishing the selected course`);
}
assert.equal(coursePickups,courseUses);
