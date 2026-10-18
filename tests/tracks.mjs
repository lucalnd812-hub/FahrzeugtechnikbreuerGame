import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {TRACKS,WORLD_VERSION,loadTrack,sampleGround} from '../src/tracks.js';
import {Track} from '../src/race-core.js';

const files=new Map(await Promise.all(['base',...TRACKS.map(track=>track.id)].map(async id=>[id,JSON.parse(await fs.readFile(new URL(`../src/tracks/${id}.json`,import.meta.url),'utf8'))])));
const previousFetch=globalThis.fetch,calls=[],failures=new Set(),wrongVersions=new Set();
globalThis.fetch=async (url,options={})=>{
 const parsed=new URL(url,'https://game.test'),id=parsed.pathname.split('/').at(-1).replace('.json','');calls.push({url:String(url),id,signal:options.signal});
 if(options.signal?.aborted)throw options.signal.reason;
 if(failures.has(String(url))){failures.delete(String(url));return {ok:false,status:503};}
 const data=structuredClone(files.get(id));assert(data,'Unexpected data request: '+url);
 if(wrongVersions.has(parsed.pathname))data.trackVersion='old-track';
 return {ok:true,status:200,json:async()=>data};
};
try{
 assert(Object.isFrozen(TRACKS)&&Object.isFrozen(TRACKS[0])&&Object.isFrozen(TRACKS[0].preview));
 assert.deepEqual(TRACKS.map(track=>track.id),['lammersdorf','bahnhof','kraemer']);
 const baseUrl='/cache-'+Date.now()+'/';
 const [first,duplicate]=await Promise.all([loadTrack('lammersdorf',{baseUrl}),loadTrack('lammersdorf',{baseUrl})]);
 assert.equal(calls.length,2,'Concurrent requests must share world and course promises');
 assert.notEqual(first,duplicate);assert.notEqual(first.buildings[0],duplicate.buildings[0]);
 first.route[0][0]=999;first.terrain.values[0]=999;first.buildings[0].test='mutated';
 assert.notEqual(duplicate.route[0][0],999);assert.notEqual(duplicate.terrain.values[0],999);assert.equal(duplicate.buildings[0].test,undefined);
 for(const meta of TRACKS){
  const map=await loadTrack(meta.id,{baseUrl}),course=files.get(meta.id),track=new Track(map.route,{heightAt:(x,z)=>sampleGround(map,x,z)});
  assert.equal(map.trackId,meta.id);assert.equal(map.trackVersion,meta.version);
  assert(Math.abs(track.length-meta.length)<.05,`${meta.id}: catalog length differs from actual route`);
  assert.deepEqual(map.route[0],map.route.at(-1),'The route must close at the starting line');
  assert.equal(map.buildings.length,course.buildingIds.length);assert.equal(map.landAreas.length,course.landAreaIds.length);
  assert(map.buildings.every(building=>course.buildingIds.includes(building.id)));
  assert(map.landAreas.every(area=>course.landAreaIds.includes(area.id)));
  assert(map.buildings.length<files.get('base').buildings.length,'Load only the course building corridor');
  for(let index=0;index<map.route.length;index++)assert(map.route[index].every(Number.isFinite));
  for(let distance=0;distance<track.length;distance+=23){const p=track.at(distance);assert(Number.isFinite(sampleGround(map,p.x,p.z)));}
 }
 assert.equal(calls.filter(call=>call.id==='base').length,1,'One shared world, independent course data');
 assert.equal(calls.length,4);
 assert(calls.some(call=>call.url.includes('base.json?v='+WORLD_VERSION)));
 const count=calls.length;await assert.rejects(loadTrack('not-a-course',{baseUrl}),/Unbekannte Strecke/);assert.equal(calls.length,count);

 const retryBase='/retry/';failures.add(retryBase+'bahnhof.json?v='+TRACKS[1].version);
 await assert.rejects(loadTrack('bahnhof',{baseUrl:retryBase}),/503/);
 await loadTrack('bahnhof',{baseUrl:retryBase});
 assert.equal(calls.filter(call=>call.url.startsWith(retryBase)&&call.id==='base').length,1,'Retry the failed course without reloading a successful world');
 assert.equal(calls.filter(call=>call.url.startsWith(retryBase)&&call.id==='bahnhof').length,2);
 const staleBase='/stale/';wrongVersions.add(staleBase+'kraemer.json');
 await assert.rejects(loadTrack('kraemer',{baseUrl:staleBase}),/aktualisiert/);
 const aborted=new AbortController();aborted.abort(new Error('cancelled'));
 await assert.rejects(loadTrack('bahnhof',{baseUrl:'/abort/',signal:aborted.signal}),/cancelled/);
 const controller=new AbortController();await loadTrack('bahnhof',{baseUrl:'/abort/',signal:controller.signal});
 assert(calls.filter(call=>call.url.startsWith('/abort/')).every(call=>call.signal),'Signals must propagate to both requests');

 const synthetic={terrain:{origin:[10,20],step:2,width:2,height:2,values:[0,2,4,6]}};
 assert.equal(sampleGround(synthetic,11,21),3);assert.equal(sampleGround(synthetic,12,22),6);assert.equal(sampleGround(synthetic,10,20),0);
 for(const [x,z] of [[9,20],[10,19],[13,21],[11,23],[NaN,20],[10,Infinity]])assert.equal(sampleGround(synthetic,x,z),0);
 assert.equal(sampleGround({terrain:{...synthetic.terrain,values:[0,2,NaN,6]}},11,21),0);
 assert.equal(sampleGround(null,0,0),0);
 console.log('PASS Track catalog, route closure/lengths, corridor filtering, shared cache, isolated maps, failed-request retry, revision guard, abort and terrain interpolation');
}finally{globalThis.fetch=previousFetch;}
