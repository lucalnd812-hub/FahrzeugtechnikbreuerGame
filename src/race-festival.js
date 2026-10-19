import * as THREE from 'three';
import {Batch,material,sign,buildingIndex,safeVillageDetail,beveledBoxGeometry} from './scenery.js';
import {clearOfCourse} from './course.js';

/** Race-day festival dressing: grandstands packed with fans near the start
 * and on the big corners, banner gantries across the course, chequered and
 * club flags on tall poles, balloon bunches and brightly painted toy cars
 * parked along the side streets. Everything is batched, chunked and placed
 * only on free ground (no course, road, building or reserved footprint). */

const rand=n=>{const v=Math.sin(n*91.345+17.17)*43758.5453;return v-Math.floor(v);};
const FANS=[0xe62c41,0xffc538,0xf6f2e6,0x3291d7,0x2fa36b,0xf27ea9,0xff8a2a,0x7b5cd6];
const SKIN=[0xf3c99e,0xd7a274,0xa66945];
const CARS=[0xe8343f,0x2d78d8,0xffc52e,0x2fae6a,0xff7a2b,0xf4f1ea,0x63d0c5,0x8b5cf6];

function tint(g,hex,{light=.25}={}){
 g=g.index?g.toNonIndexed():g;const p=g.attributes.position,c=new THREE.Color(hex),colors=new Float32Array(p.count*3);
 g.computeBoundingBox();const b=g.boundingBox,h=Math.max(.001,b.max.y-b.min.y);
 for(let i=0;i<p.count;i++){const t=(p.getY(i)-b.min.y)/h,k=1-light+light*t*2;colors[i*3]=Math.min(1,c.r*k);colors[i*3+1]=Math.min(1,c.g*k);colors[i*3+2]=Math.min(1,c.b*k);}
 g.setAttribute('color',new THREE.BufferAttribute(colors,3));return g;
}

/** A waving flag cloth with painted stripes or a chequer, vertex coloured. */
export function flagGeometry(kind,w=1.5,h=.95){
 const g=new THREE.PlaneGeometry(w,h,8,4).translate(w/2,0,0),p=g.attributes.position,colors=new Float32Array(p.count*3),c=new THREE.Color();
 for(let i=0;i<p.count;i++){
  const x=p.getX(i),y=p.getY(i),u=x/w,v=(y+h/2)/h;
  p.setZ(i,Math.sin(u*Math.PI*2.2)*.12*u);p.setY(i,y-u*.08);
  if(kind==='chequer')c.set(((Math.floor(u*6)+Math.floor(v*4))%2)?0x15161a:0xf7f7f2);
  else if(kind==='germany')c.set(v>.667?0x15161a:v>.333?0xd8262e:0xf6c21c);
  else if(kind==='breuer')c.set(v>.5?0xd8262e:0xf7f4ec);
  else if(kind==='eifel')c.set(u<.33?0x2d6db5:u<.66?0xf7f4ec:0x2fa36b);
  else c.set(0xffc52e);
  colors[i*3]=c.r;colors[i*3+1]=c.g;colors[i*3+2]=c.b;
 }
 g.setAttribute('color',new THREE.BufferAttribute(colors,3));g.computeVertexNormals();return g;
}

export function dressFestival(scene,data,track,M,heightAt=()=>0,{reserved=[]}={}){
 const big=new Batch({chunkSize:96,maxDistance:320,castShadow:true,vertexColors:true,heightAt,name:'festival'});
 const fans=new Batch({chunkSize:96,maxDistance:200,castShadow:false,vertexColors:true,heightAt,name:'festival-fans'});
 const cloth=new Batch({chunkSize:96,maxDistance:260,castShadow:false,vertexColors:true,heightAt,name:'festival-flags'});
 const parked=new Batch({chunkSize:96,maxDistance:170,castShadow:true,vertexColors:true,heightAt,name:'festival-parked-cars'});
 const paint=material(0xffffff,{vertexColors:true,roughness:.8}),flagCloth=material(0xffffff,{vertexColors:true,roughness:.9,side:THREE.DoubleSide});
 const index=buildingIndex(data.buildings),records=[],L=track.length;
 const taken=[...reserved.filter(r=>Number.isFinite(r.x)).map(r=>({x:r.x,z:r.z,rad:Math.hypot(r.w||1,r.d||1)/2}))];
 const free=(x,z,w,d,a,clearance)=>{
  const c=Math.cos(a),s=Math.sin(a),rad=Math.hypot(w,d)/2;
  for(const [lx,lz] of [[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2],[0,0],[0,-d/4],[0,d/4]])if(index.contains(x+c*lx+s*lz,z-s*lx+c*lz))return false;
  if(taken.some(r=>Math.hypot(r.x-x,r.z-z)<r.rad+rad-.2))return false;
  return safeVillageDetail(data,track,x,z,w,d,a,clearance);
 };
 const keep=(x,z,w,d,a,kind)=>{const r={x,z,w,d,a,kind};records.push(r);taken.push({x,z,rad:Math.hypot(w,d)/2});return r;};
 // ---------------------------------------------------------------- grandstands
 let stands=0,standFans=0;const standAt=[];
 const candidates=[];
 for(let s=0;s<L;s+=8){const p=track.at(s),turn=Math.abs(Math.atan2(Math.sin(track.at(s+20).angle-track.at(s-20).angle),Math.cos(track.at(s+20).angle-track.at(s-20).angle)));const startNear=Math.min(s,L-s);candidates.push({s,score:(startNear<140?3-startNear/70:0)+turn*1.5});}
 candidates.sort((a,b)=>b.score-a.score);
 for(const {s} of candidates){
  if(stands>=5)break;if(standAt.some(t=>Math.abs(track.delta(t,s))<90))continue;
  const p=track.at(s);
  for(const side of [1,-1]){
   const len=13,depth=4.6,off=11.4+depth/2,x=p.x+p.dz*off*side,z=p.z-p.dx*off*side,a=p.angle+(side<0?Math.PI:0);
   if(!free(x,z,depth,len,a,10.6))continue;
   keep(x,z,depth,len,a,'grandstand');stands++;standAt.push(s);
   const lx=(u,v)=>[x+Math.cos(a)*u+Math.sin(a)*v,z-Math.sin(a)*u+Math.cos(a)*v];
   // Stepped seating rows (front row toward the course), back wall and posts.
   for(let r=0;r<4;r++){const [rx,rz]=lx(-depth/2+.55+r*1.05,0);big.add(tint(new THREE.BoxGeometry(1.05,.5+r*.62,len),r%2?0x8c99a6:0x9fabb8,{light:.15}),paint,rx,(.5+r*.62)/2,rz,a);}
   { const [bx,bz]=lx(depth/2,0);big.add(tint(new THREE.BoxGeometry(.18,4.2,len),0x5d6a78),paint,bx,2.1,bz,a); }
   for(let k=0;k<=4;k++){const [px,pz]=lx(-depth/2-.1,-len/2+k*len/4);big.add(tint(new THREE.CylinderGeometry(.08,.08,4.5,6),0xd8dde2),paint,px,2.25,pz);}
   // Striped canopy, slightly tilted, red and white like a race paddock.
   for(let k=0;k<9;k++){const v=-len/2+(k+.5)*len/9,[cx,cz]=lx(-.2,v),g=new THREE.BoxGeometry(depth+1.2,.14,len/9+.01);g.rotateZ(-.12);big.add(tint(g,k%2?0xf7f4ec:0xd8262e,{light:.1}),paint,cx,4.55,cz,a);}
   // Sponsor boards along the front rail.
   const board=sign(rand(s)>.5?'FAHRZEUGTECHNIK BREUER':'BREUER GRAND PRIX',len*.92,'#ffffff','#d8262e',.085);const [fx,fz]=lx(-depth/2-.12,0);board.position.set(fx,heightAt(fx,fz)+.62,fz);board.rotation.y=a-Math.PI/2;scene.add(board);
   // Packed fans on every row.
   for(let r=0;r<4;r++)for(let v=-len/2+.45;v<len/2-.3;v+=.62){
    const n=s*13+r*7+v*3+side,[hx,hz]=lx(-depth/2+.55+r*1.05,v+(rand(n)-.5)*.15),y=.5+r*.62,shirt=FANS[Math.floor(rand(n+1)*FANS.length)],skin=SKIN[Math.floor(rand(n+2)*SKIN.length)];
    if(rand(n+3)<.08)continue;standFans++;
    fans.add(tint(new THREE.CylinderGeometry(.17,.21,.55,5,1,true),shirt,{light:.2}),paint,hx,y+.27,hz);
    fans.add(tint(new THREE.SphereGeometry(.17,6,4),skin,{light:.2}),paint,hx,y+.7,hz);
    if(rand(n+4)<.45)fans.add(tint(new THREE.CylinderGeometry(.05,.05,.5,4,1,true),shirt),paint,hx+Math.cos(a)*.02,y+.95,hz+.0,0);
    if(rand(n+5)<.18){const flag=flagGeometry(['chequer','breuer','germany'][Math.floor(rand(n+6)*3)],.55,.36);fans.add(flag,flagCloth,hx,y+1.15,hz,a+Math.PI/2);}
   }
   // Balloon bunches at both ends.
   for(const end of [-1,1]){const [bx,bz]=lx(-depth/2-.3,end*(len/2+.4));for(let k=0;k<5;k++){const ang=k*1.26,col=FANS[(k+stands)%FANS.length];cloth.add(tint(new THREE.SphereGeometry(.32,8,6).scale(1,1.2,1),col,{light:.35}),paint,bx+Math.cos(ang)*.35,5.3+(k%2)*.35,bz+Math.sin(ang)*.35);}cloth.add(tint(new THREE.CylinderGeometry(.01,.01,4.8,3),0xffffff),paint,bx,2.4,bz);}
   break;
  }
 }
 // ------------------------------------------------------------ banner gantries
 let banners=0;const texts=['BREUER GRAND PRIX','LAMMERSDORF','VOLLGAS!','FAHRZEUGTECHNIK BREUER'];
 for(let s=110;s<L-40;s+=230){
  const p=track.at(s),half=8.7,l=[p.x+p.dz*half,p.z-p.dx*half],r=[p.x-p.dz*half,p.z+p.dx*half];
  if([l,r].some(q=>index.contains(...q)||!clearOfCourse(track,q[0],q[1],.4,.4,p.angle,6.55)))continue;
  for(const q of [l,r]){big.add(tint(new THREE.CylinderGeometry(.13,.16,6.6,8),0xd8262e,{light:.2}),paint,q[0],3.3,q[1]);big.add(tint(new THREE.SphereGeometry(.2,8,5),0xffc52e),paint,q[0],6.7,q[1]);keep(q[0],q[1],.5,.5,p.angle,'banner-pole');}
  const y=(heightAt(...l)+heightAt(...r))/2+5.3,text=texts[banners%texts.length];
  for(const back of [0,1]){const b=sign(text,half*2-.6,'#ffffff',back?'#1f2a44':'#d8262e',.11);b.position.set(p.x,y,p.z);b.rotation.y=p.angle+(back?0:Math.PI);b.position.x+=Math.sin(p.angle)*(back?.04:-.04);b.position.z+=Math.cos(p.angle)*(back?.04:-.04);scene.add(b);}
  banners++;
 }
 // -------------------------------------------------------------------- flags
 let flags=0;
 for(let s=36;s<L;s+=27){
  const p=track.at(s),off=10.35;let side=Math.floor(s/27)%2?1:-1,x=p.x+p.dz*off*side,z=p.z-p.dx*off*side;
  if(!free(x,z,.5,.5,p.angle,10.1)){side=-side;x=p.x+p.dz*off*side;z=p.z-p.dx*off*side;if(!free(x,z,.5,.5,p.angle,10.1))continue;}keep(x,z,.5,.5,p.angle,'flag-pole');flags++;
  big.add(tint(new THREE.CylinderGeometry(.05,.07,6,6),0xe9edf0,{light:.2}),paint,x,3,z);big.add(tint(new THREE.SphereGeometry(.11,6,4),0xffc52e),paint,x,6.05,z);
  const kind=['chequer','breuer','germany','breuer','chequer'][flags%5];
  cloth.add(flagGeometry(kind,1.7,1.05),flagCloth,x,5.35,z,p.angle+(side>0?Math.PI/2:-Math.PI/2)+.5);
 }
 // -------------------------------------------------------------- parked cars
 let cars=0;
 for(const road of data.roads||[]){
  const pts=road.points,width=road.width||6;
  for(let i=1;i<pts.length&&cars<70;i++){
   const a0=pts[i-1],b0=pts[i],dx=b0[0]-a0[0],dz=b0[1]-a0[1],len=Math.hypot(dx,dz);if(len<6)continue;
   for(let t=3;t<len-3&&cars<70;t+=13){
    const n=i*31+t+(road.id||0)%997;if(rand(n)>.42)continue;
    const side=rand(n+1)>.5?1:-1,ux=dx/len,uz=dz/len,off=width/2+1.7,x=a0[0]+ux*t+uz*off*side,z=a0[1]+uz*t-ux*off*side,a=Math.atan2(ux,uz);
    if(!free(x,z,2,4.3,a,10.4))continue;
    // Parked on the verge beside, never on, the mapped carriageway.
    const limitOk=(data.roads||[]).every(r=>{const lim=(r.width||6)/2+.2;for(let k=1;k<r.points.length;k++){const p=r.points[k-1],q=r.points[k],ex=q[0]-p[0],ez=q[1]-p[1],l2=ex*ex+ez*ez;if(!l2)continue;const tt=Math.max(0,Math.min(1,((x-p[0])*ex+(z-p[1])*ez)/l2));if(Math.hypot(x-p[0]-ex*tt,z-p[1]-ez*tt)<lim+1.05)return false;}return true;});
    if(!limitOk)continue;
    keep(x,z,2,4.3,a,'parked-car');cars++;
    const col=CARS[Math.floor(rand(n+2)*CARS.length)],c=Math.cos(a),sn=Math.sin(a),at=(u,v)=>[x+c*u+sn*v,z-sn*u+c*v];
    parked.add(tint(beveledBoxGeometry(1.75,.62,3.9,.16),col,{light:.25}),paint,x,.62,z,a);
    { const [cx,cz]=at(0,-.25);parked.add(tint(beveledBoxGeometry(1.5,.5,2.1,.14),0x2a3442,{light:.4}),paint,cx,1.15,cz,a);parked.add(tint(beveledBoxGeometry(1.42,.12,1.9,.05),col),paint,cx,1.43,cz,a); }
    for(const [u,v] of [[-.82,1.25],[.82,1.25],[-.82,-1.25],[.82,-1.25]]){const [wx,wz]=at(u,v),w=new THREE.CylinderGeometry(.34,.34,.26,10);w.rotateZ(Math.PI/2);parked.add(tint(w,0x1d1f24,{light:.1}),paint,wx,.34,wz,a);}
    for(const u of [-.55,.55]){const [hx,hz]=at(u,1.96);parked.add(tint(new THREE.BoxGeometry(.32,.16,.05),0xfff4c4),paint,hx,.72,hz,a);}
   }
  }
 }
 big.flush(scene);fans.flush(scene);cloth.flush(scene);parked.flush(scene);
 return {stands,standFans,banners,flags,cars,records};
}
