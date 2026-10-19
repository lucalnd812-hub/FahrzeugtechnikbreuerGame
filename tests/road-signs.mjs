import assert from 'node:assert/strict';
import * as THREE from 'three';
import {addRoundaboutSigns,drawRoundaboutSign,ROUNDABOUT_DESTINATIONS} from '../src/road-signs.js';

// The board shows the destinations from the Kirchstraße Street View photo.
const texts=[];const ctx=new Proxy({fillText:t=>texts.push(t)},{get:(o,k)=>k in o?o[k]:()=>{},set:()=>true});
drawRoundaboutSign(ctx,512,410);
for(const t of Object.values(ROUNDABOUT_DESTINATIONS).flat())assert(texts.includes(t),'sign names '+t);

// One post per approach, only where the verge reservation succeeds.
const added=[],reserved=[];
const batch={add:(g,m,x,y,z)=>{added.push({m});g.dispose();},box(){}};
const metal=new THREE.MeshStandardMaterial();
const placed=addRoundaboutSigns({batch,center:[0,0],radius:17,arms:[1.32,3.45,5.53],metal,safe:(x,z,w,d,a,kind)=>{reserved.push({x,z,kind});return Math.hypot(x,z)>40;}});
assert.equal(placed.length,3,'every approach gets a signpost');
for(const p of placed)assert(reserved.some(r=>r.x===p.x&&r.z===p.z&&r.kind==='roundabout-sign'),'signpost footprint reserved');
assert.equal(added.filter(a=>a.m.name==='roundabout-sign').length,3);
assert.equal(addRoundaboutSigns({batch,center:[0,0],radius:17,arms:[1],metal,safe:()=>false}).length,0,'no space, no sign');
console.log('PASS Roundabout signs: 3 reserved approach signposts with the real destinations');
