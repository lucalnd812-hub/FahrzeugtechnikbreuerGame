import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Track} from '../src/race-core.js';
import {sampleGround} from '../src/tracks.js';
import {makeWorld} from '../src/world.js';
import {pointInside} from '../src/scenery.js';
import {COURSE_CLEARANCE} from '../src/front-gardens.js';

// Headless canvas: fences fall back to a solid painted panel, placement is identical.
globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({fillRect(){},fillText(){}})}),querySelector:()=>null};
const base=JSON.parse(fs.readFileSync(new URL('../src/tracks/base.json',import.meta.url)));
const totals=[];
for(const id of ['lammersdorf','bahnhof','kraemer']){
 const c=JSON.parse(fs.readFileSync(new URL('../src/tracks/'+id+'.json',import.meta.url)));
 const data=structuredClone({...base,...c,buildings:base.buildings.filter(b=>c.buildingIds.includes(b.id)),landAreas:base.landAreas.filter(a=>c.landAreaIds.includes(a.id))});
 const track=new Track(data.route);track.heightAt=(x,z)=>sampleGround(data,x,z);
 const world=makeWorld(data,track),s=world.stats,records=s.frontGardenRecords;
 assert.ok(s.frontGardenHouses>80,id+' front gardens for the houses along the course');
 assert.ok(s.frontGardenTrees>100,id+' round garden and avenue trees');
 assert.ok(s.frontGardenBeds>200,id+' flower beds');
 assert.ok(s.frontGardenFenceMetres>300,id+' fences, hedges and walls');
 for(const r of records){
  const cs=Math.cos(r.a),sn=Math.sin(r.a);
  for(const [lx,lz] of [[-r.w/2,-r.d/2],[r.w/2,-r.d/2],[r.w/2,r.d/2],[-r.w/2,r.d/2],[0,0]]){
   const x=r.x+cs*lx+sn*lz,z=r.z-sn*lx+cs*lz;
   assert.ok(track.nearest(x,z).distance>=COURSE_CLEARANCE-1e-6,id+' '+r.kind+' inside the race corridor');
   assert.ok(!data.buildings.some(b=>pointInside(x,z,b.points)),id+' '+r.kind+' inside a building');
  }
  for(const road of data.roads||[]){const limit=(road.width||6)/2+.45;for(let i=1;i<road.points.length;i++){const p=road.points[i-1],q=road.points[i],dx=q[0]-p[0],dz=q[1]-p[1],len=dx*dx+dz*dz;if(!len)continue;const t=Math.max(0,Math.min(1,((r.x-p[0])*dx+(r.z-p[1])*dz)/len));assert.ok(Math.hypot(r.x-p[0]-dx*t,r.z-p[1]-dz*t)>=limit-1e-6,id+' '+r.kind+' on a road');}}
 }
 totals.push({id,houses:s.frontGardenHouses,trees:s.frontGardenTrees,beds:s.frontGardenBeds,fence:s.frontGardenFenceMetres,records:records.length});
 world.dispose();
}
console.log('PASS Front gardens: fences, beds, trees and lawn planting stay clear of the race corridor, every mapped road and every building.');
console.log(JSON.stringify(totals));
