import * as THREE from 'three';

/** Large painted colour fields for the ground: mown lawns, lush pasture and
 * sun-dried meadow patches instead of one uniform green. Deterministic value
 * noise, so every world and every test sees the same village. */

function hash(x,z){const v=Math.sin(x*127.1+z*311.7)*43758.5453;return v-Math.floor(v);}
function smooth(t){return t*t*(3-2*t);}
export function valueNoise(x,z){
 const ix=Math.floor(x),iz=Math.floor(z),fx=smooth(x-ix),fz=smooth(z-iz);
 const a=hash(ix,iz),b=hash(ix+1,iz),c=hash(ix,iz+1),d=hash(ix+1,iz+1);
 return a+(b-a)*fx+(c-a)*fz+(a-b-c+d)*fx*fz;
}

const LUSH=[.76,.9,.62],PASTURE=[.48,.64,.40],DRY=[1.0,.88,.52],MOWN=[.9,1.0,.76];
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);

/** RGB multiplier (around 0.7..1.0) for a ground point in metres. */
export function groundTint(x,z){
 const fields=valueNoise(x/85+17.3,z/85-4.1),patch=valueNoise(x/28-9.7,z/28+2.2),fine=valueNoise(x/7.5,z/7.5);
 let c=mix(PASTURE,LUSH,smooth(Math.min(1,Math.max(0,fields*2.2-.6))));
 c=mix(c,DRY,Math.min(1,Math.max(0,patch-.58)*2.2));
 c=mix(c,MOWN,Math.max(0,.38-fields)*1.3);
 const f=.94+fine*.08;
 return c.map(v=>Math.min(1,v*f));
}

/** Multiply (or create) a geometry's colour attribute by the ground tint. */
export function tintGround(geometry,{offsetX=0,offsetZ=0}={}){
 const p=geometry.attributes.position,old=geometry.attributes.color,colors=new Float32Array(p.count*3);
 for(let i=0;i<p.count;i++){
  const t=groundTint(p.getX(i)+offsetX,p.getZ(i)+offsetZ);
  for(let k=0;k<3;k++)colors[i*3+k]=t[k]*(old?old.array[i*old.itemSize+k]:1);
 }
 geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
 return geometry;
}
