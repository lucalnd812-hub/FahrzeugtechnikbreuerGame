import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Track,CARS,makeVehicle,stepVehicle,botInput,collideCars,ranking,useItem,collectPickup} from '../src/race-core.js';
import {normalizeRaceConfig} from '../src/race-config.js';
import {TRACKS,sampleGround} from '../src/tracks.js';
import {SimulationClock} from '../src/simulation-clock.js';

const world=JSON.parse(fs.readFileSync(new URL('../src/tracks/base.json',import.meta.url)));
const readCourse=id=>JSON.parse(fs.readFileSync(new URL('../src/tracks/'+id+'.json',import.meta.url)));

// Run the shipped physics and AI at different presentation rates. These are
// deterministic simulation checks, not a browser/GPU performance measurement.
function race(meta,{rules='classic',fps=60,laps=1,difficulty=.91,seconds=null,items=false}={}){
 const config=normalizeRaceConfig({trackId:meta.id,laps,rules,difficulty,opponents:5});
 const data={...world,...readCourse(meta.id)},track=new Track(data.route,config);
 track.heightAt=(x,z)=>sampleGround(data,x,z);
 const cars=Array.from({length:6},(_,i)=>makeVehicle(track,i%CARS.length,i,'Fahrer '+i,'car-'+i,config));
 const clock=new SimulationClock(),oils=[],counts={finish:0,obstacleHit:0,autoReset:0,oilHit:0,pickup:0,useItem:0};
 const crates=[];
 for(let s=85;s<track.length-30;s+=145){const p=track.at(s);for(const offset of [-2.2,2.2])crates.push({x:p.x-p.dz*offset,z:p.z+p.dx*offset,available:0});}
 let seed=0x29f8ac3b;
 const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296;};
 const update=(dt,time)=>{
  for(const v of cars){
   if(v.finish!==null)continue;
   const previous={x:v.x,z:v.z},events=stepVehicle(v,track,botInput(v,track,difficulty),dt,time,config);
   for(const e of events)if(Object.hasOwn(counts,e))counts[e]++;
   if(items&&rules==='action'){
    if(collectPickup(v,crates,time,events.includes('autoReset')?null:previous,random))counts.pickup++;
    if(v.item&&random()<dt*.22){assert.ok(useItem(v,oils,time));counts.useItem++;}
    for(const oil of oils)if(oil.owner!==v.id&&oil.expires>time&&v.shield===0&&v.spin===0&&Math.hypot(v.x-oil.x,v.z-oil.z)<2.3){v.spin=1.1;v.speed*=.35;counts.oilHit++;}
   }
  }
  for(let i=0;i<cars.length;i++)for(let j=i+1;j<cars.length;j++)collideCars(cars[i],cars[j],track);
  for(let i=oils.length-1;i>=0;i--)if(oils[i].expires<=time)oils.splice(i,1);
 };
 const limit=seconds??(laps*190+30);
 for(let frame=0;frame<Math.round(limit*fps)&&(seconds!==null||cars.some(v=>v.finish===null));frame++)clock.advance(1/fps,update);
 for(const v of cars){for(const k of ['x','z','angle','speed','progress','s','gate'])assert.ok(Number.isFinite(v[k]),meta.id+' non-finite '+k);}
 return {cars,track,clock,counts};
}

for(const meta of TRACKS){
 const a=race(meta,{seconds:10,fps:30}),b=race(meta,{seconds:10,fps:60}),slow=race(meta,{seconds:10,fps:10});
 for(const candidate of [a,b,slow]){assert.equal(candidate.clock.steps,600);assert.ok(Math.abs(candidate.clock.time-10)<1e-10);assert.ok(candidate.clock.debt<1e-9);}
 for(let i=0;i<6;i++)for(const key of ['x','z','angle','speed','progress','gate']){assert.ok(Math.abs(a.cars[i][key]-b.cars[i][key])<1e-9);assert.ok(Math.abs(slow.cars[i][key]-b.cars[i][key])<1e-9);}
 for(const rules of ['classic','action']){
  const result=race(meta,{rules,fps:30}),reference=race(meta,{rules,fps:60});
  assert.equal(result.counts.finish,6,meta.id+' '+rules+' missing finish events');
  assert.equal(result.counts.autoReset,0,meta.id+' '+rules+' a bot became stuck');
  if(rules==='classic')assert.equal(result.counts.obstacleHit,0);
  for(let i=0;i<6;i++){
   const v=result.cars[i];assert.ok(v.finish!==null&&v.finish>20&&v.finish<190,meta.id+' '+rules+' unfinished car '+i);
   assert.equal(v.gate,12);assert.ok(v.progress>=result.track.length&&v.progress<result.track.length+2);
   assert.ok(Math.abs(v.finish-reference.cars[i].finish)<1e-9);assert.ok(Math.abs(v.progress-reference.cars[i].progress)<1e-9);
  }
  assert.deepEqual(ranking(result.cars).map(v=>v.id),ranking(reference.cars).map(v=>v.id));
  console.log(`PASS ${meta.id} ${rules}: six finishers, ${Math.min(...result.cars.map(v=>v.finish)).toFixed(2)}–${Math.max(...result.cars.map(v=>v.finish)).toFixed(2)} s, 30/60 Hz identical, ${result.counts.obstacleHit} obstacle hits`);
 }
 const armed=race(meta,{rules:'action',items:true,fps:30});
 assert.equal(armed.counts.finish,6,meta.id+' item race missing finishers');assert.ok(armed.counts.pickup>0);assert.ok(armed.counts.useItem>0);
 const long=race(meta,{rules:'classic',laps:5,fps:30,difficulty:.76});
 assert.equal(long.counts.finish,6,meta.id+' five-lap race incomplete');
 for(const v of long.cars){assert.equal(v.gate,60);assert.ok(v.progress>=long.track.length*5);assert.ok(v.finish>120);}
 console.log(`PASS ${meta.id}: real pickups/items/oil (${armed.counts.pickup}/${armed.counts.useItem}/${armed.counts.oilHit}) and six five-lap finishers on the slow difficulty`);
}

const debt=new SimulationClock({maxSteps:4});debt.advance(1,()=>{});assert.equal(debt.steps,4);assert.ok(debt.overloaded);
while(debt.overloaded)debt.advance(0,()=>{});assert.equal(debt.steps,60);assert.ok(Math.abs(debt.time-1)<1e-10);
console.log('PASS Fixed-step overload retains and repays all active simulation time. No renderer FPS claim.');
