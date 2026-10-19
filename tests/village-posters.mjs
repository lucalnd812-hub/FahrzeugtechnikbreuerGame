import assert from 'node:assert/strict';
import * as THREE from 'three';
import {POSTERS,posterPlane,posterWrap,addVillagePosters} from '../src/village-posters.js';

// Every poster samples only its own atlas cell (4 columns × 3 rows).
for(let cell=0;cell<POSTERS.length;cell++){
 const c=cell%4,r=Math.floor(cell/4);
 for(const g of [posterPlane(cell,.7,1),posterWrap(cell,.56,0,1.9,1.5)]){
  const uv=g.attributes.uv;
  for(let i=0;i<uv.count;i++){
   const u=uv.getX(i),v=uv.getY(i);
   assert(u>=c/4-1e-6&&u<=(c+1)/4+1e-6,`poster ${cell} u inside its column`);
   assert(v>=1-(r+1)/3-1e-6&&v<=1-r/3+1e-6,`poster ${cell} v inside its row`);
  }
  g.dispose();
 }
}

// Straight 1.2 km test course: props go to the verge and every one is reserved.
const track={length:1200,at:s=>({x:0,z:s,dx:0,dz:1,angle:0})};
const added=[],reserved=[];
const batch={add:(g,m,x,y,z)=>{added.push({m,x,z});g.dispose();},box(){}};
const placed=addVillagePosters({batch,track,material:(c,o)=>new THREE.MeshStandardMaterial({color:c,...o}),rand:()=>.5,
 safe:(x,z,w,d,a,kind)=>{reserved.push({x,z,kind});return true;}});
assert(placed.some(p=>p.kind==='column')&&placed.some(p=>p.kind==='board'),'columns and boards are placed');
for(const p of placed){
 assert(Math.abs(p.x)>8,'props stand beyond the 8 m verge line');
 assert(reserved.some(r=>r.x===p.x&&r.z===p.z),'each prop reserved its footprint');
}
const posterMeshes=added.filter(a=>a.m.name==='village-posters');
assert(posterMeshes.length>=placed.length*2,'every prop carries posters');
// A refused footprint places nothing there.
const none=addVillagePosters({batch,track,material:(c,o)=>new THREE.MeshStandardMaterial({color:c,...o}),safe:()=>false});
assert.equal(none.length,0);
console.log(`PASS Village posters: ${POSTERS.length} atlas cells, ${placed.length} reserved verge props, ${posterMeshes.length} poster faces`);
