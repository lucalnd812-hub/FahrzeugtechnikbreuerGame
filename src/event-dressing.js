import * as THREE from 'three';

/** Village-race dressing in the comic style: see-through crowd barriers
 * ("Absperrgitter") instead of solid slabs, straw bales on the outside of
 * corners and bunting strung over the course. Geometry only goes to the
 * caller's batches; every footprint is reserved through dressCourse's safe(). */

function canvas(w,h){const c=globalThis.document?.createElement?.('canvas');if(!c)return null;c.width=w;c.height=h;const g=c.getContext?.('2d');return g?.fillRect&&g.strokeRect?{c,g}:null;}

/** Galvanised crowd barrier: frame and vertical bars with a dark ink outline. */
export function drawBarrier(g,w,h){
 g.clearRect(0,0,w,h);
 const ink='#4c5459',metal='#d9dee0',bar=Math.max(2,w*.012),edge=w*.022;
 const rect=(x,y,rw,rh,c)=>{g.fillStyle=c;g.fillRect(x,y,rw,rh);};
 // ink first, metal on top: every bar keeps a dark rim like a drawn line
 for(const [c,grow] of [[ink,2],[metal,0]]){
  rect(edge-grow,h*.08-grow,w-edge*2+grow*2,edge+grow*2,c);          // top rail
  rect(edge-grow,h*.84-grow,w-edge*2+grow*2,edge+grow*2,c);          // bottom rail
  rect(edge-grow,h*.08-grow,edge+grow*2,h*.92+grow,c);               // posts with feet
  rect(w-edge*2-grow,h*.08-grow,edge+grow*2,h*.92+grow,c);
  for(let x=edge*2+w*.035;x<w-edge*2.5;x+=w*.047)rect(x-grow,h*.08,bar+grow*2,h*.78,c);
 }
}

let shared=null;
export function barrierMaterial(){
 if(shared)return shared;
 const m=new THREE.MeshStandardMaterial({color:0xd9dee0,roughness:.5,metalness:.35,side:THREE.DoubleSide,alphaTest:.5,transparent:false});
 const cv=canvas(512,160);
 if(cv){try{drawBarrier(cv.g,512,160);const t=new THREE.CanvasTexture(cv.c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;m.map=t;m.color.set(0xffffff);}catch{}}
 // Without a canvas (tests, very old devices) a thin solid rail stays readable.
 m.name='event:crowd-barrier';m.userData.keepUV=true;shared=m;
 m.addEventListener('dispose',()=>{m.map?.dispose();if(shared===m)shared=null;});
 return m;
}

/** One 3.5 m barrier element facing the course at the verge. */
export function barrierGeometry(length=3.5,height=1.12){
 return new THREE.PlaneGeometry(length,height).translate(0,height/2+.02,0).rotateY(Math.PI/2);
}

/** Straw bales with a banded cap, the classic soft corner protection. */
export function addStrawBales(batch,straw,band,x,z,a,count=3){
 for(let i=0;i<count;i++){
  const off=(i-(count-1)/2)*1.25,px=x+Math.sin(a)*off,pz=z+Math.cos(a)*off;
  batch.box(.62,.5,1.18,straw,px,.25,pz,a);
  if(i%2===0)batch.box(.64,.06,1.2,band,px,.52,pz,a);
 }
 if(count>=3)batch.box(.62,.5,1.18,straw,x,.75,z,a);
}

/** A sagging pennant line between two posts. */
export function buntingGeometry(p,q,{flags=18,sag=.9,size=.42}={}){
 const positions=[],colors=[],palette=[0xe63946,0xffffff,0xf4c430,0x2a9d8f,0x3a86ff].map(c=>new THREE.Color(c));
 const at=t=>[p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t-Math.sin(Math.PI*t)*sag,p[2]+(q[2]-p[2])*t];
 for(let i=0;i<flags;i++){
  const t0=(i+.1)/flags,t1=(i+.9)/flags,a=at(t0),b=at(t1),tip=at((t0+t1)/2);tip[1]-=size;
  const c=palette[i%palette.length];
  for(const v of [a,tip,b]){positions.push(...v);colors.push(c.r,c.g,c.b);}
 }
 // the line itself: a thin dark ribbon
 for(let i=0;i<24;i++){const a=at(i/24),b=at((i+1)/24);for(const v of [a,[a[0],a[1]-.025,a[2]],b,b,[a[0],a[1]-.025,a[2]],[b[0],b[1]-.025,b[2]]]){positions.push(...v);colors.push(.12,.12,.13);}}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
 g.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(positions.length/3*2),2));g.computeVertexNormals();return g;
}
