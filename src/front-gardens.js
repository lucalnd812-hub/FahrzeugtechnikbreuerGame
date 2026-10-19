import * as THREE from 'three';
import {Batch,material,buildingIndex,safeVillageDetail} from './scenery.js';

/** Eifel front gardens for every house the race passes: the strip between the
 * street-facing facade and the road gets a picket fence, low hedge or stone
 * wall with a gate, a paved path to the door, flower beds along the fence,
 * rose bushes at the corners, a mailbox and, in deeper yards, a big round
 * garden tree. Everything is merged into a few chunked batches.
 * Placement never enters the race corridor, any mapped road, a building or a
 * footprint already reserved by course dressing or village gardens. */

const rand=n=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);};
const GREENS=[0x4f9a3a,0x67ad45,0x3f8a44,0x7dbb4f,0x5a9f55];
const BLOOMS=[0xe8344a,0xff8fb1,0xfff6ec,0xffd23f,0x9b6cdb,0xff7b2e,0xe84f9a];
// Barriers stand at 7.9 m and spectators at about 9.3 m from the course line.
export const COURSE_CLEARANCE=10.2;
const MAILBOX=[0xd8343f,0xf2c230,0x2f7d4f,0x2d5f9e];

function canvas(w,h){const c=globalThis.document?.createElement?.('canvas');if(!c)return null;c.width=w;c.height=h;const g=c.getContext?.('2d');return g?.fillRect&&g.strokeRect&&g.beginPath&&g.fill?{c,g}:null;}

/** One 1.2 m picket fence tile: pointed pickets, two rails, ink outline. */
export function drawPicketFence(g,w,h,{paint='#fbf7ec',ink='#3b3530'}={}){
 g.clearRect(0,0,w,h);
 const pickets=6,pw=w/pickets*.56,rail=h*.085;
 const shape=(grow)=>{
  g.beginPath();
  for(let i=0;i<pickets;i++){const cx=(i+.5)*w/pickets,l=cx-pw/2-grow,r=cx+pw/2+grow,top=h*.06-grow,shoulder=h*.2;g.moveTo(l,h);g.lineTo(l,shoulder);g.lineTo(cx,top);g.lineTo(r,shoulder);g.lineTo(r,h);g.closePath();}
  for(const y of [.36,.74])g.rect(0,h*y-rail/2-grow,w,rail+grow*2);
 };
 g.fillStyle=ink;shape(2.2);g.fill();
 g.fillStyle=paint;shape(0);g.fill();
 // A painted highlight stripe down each picket's sunny side.
 g.fillStyle='rgba(255,255,255,.35)';for(let i=0;i<pickets;i++){const cx=(i+.5)*w/pickets;g.fillRect(cx-pw/2+1,h*.24,pw*.22,h*.7);}
}

function fenceMaterial(paint){
 const m=material(0xffffff,{roughness:.85,side:THREE.DoubleSide,alphaTest:.5});
 const cv=canvas(256,128);
 if(cv){try{drawPicketFence(cv.g,256,128,{paint});const t=new THREE.CanvasTexture(cv.c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=THREE.RepeatWrapping;t.anisotropy=4;m.map=t;}catch{}}
 if(!m.map)m.color.set(paint);
 m.name='garden:picket-fence';m.userData.keepUV=true;return m;
}

/** Fence panel along local z, uv repeating every 1.2 m. */
function fencePanel(length,height=.92){
 const g=new THREE.PlaneGeometry(length,height).translate(0,height/2,0).rotateY(Math.PI/2),uv=g.attributes.uv;
 for(let i=0;i<uv.count;i++)uv.setX(i,uv.getX(i)*length/1.2);
 return g;
}

/** Sphere with a painted top-light gradient baked into vertex colours. */
function blob(radius,hex,{sx=1,sy=1,sz=1,segments=7,light=.42}={}){
 const g=new THREE.SphereGeometry(radius,segments,Math.max(4,segments-2));g.scale(sx,sy,sz);
 const p=g.attributes.position,c=new THREE.Color(hex),colors=new Float32Array(p.count*3),r=radius*sy;
 for(let i=0;i<p.count;i++){const t=(p.getY(i)/r+1)/2,k=.62+light*t;colors[i*3]=Math.min(1,c.r*k);colors[i*3+1]=Math.min(1,c.g*k);colors[i*3+2]=Math.min(1,c.b*k);}
 g.setAttribute('color',new THREE.BufferAttribute(colors,3));return g;
}

/** A single blossom: an 8-triangle octahedron, flat colour (reads as a dot). */
function bloomDot(radius,hex){
 const g=new THREE.OctahedronGeometry(radius,0),c=new THREE.Color(hex),colors=new Float32Array(g.attributes.position.count*3);
 for(let i=0;i<colors.length;i+=3){colors[i]=c.r;colors[i+1]=c.g;colors[i+2]=c.b;}
 g.setAttribute('color',new THREE.BufferAttribute(colors,3));return g;
}

export function plantFrontGardens(scene,data,track,M,heightAt=()=>0,{reserved=[],skipBuildingIds=[],maxDistance=62}={}){
 const plants=new Batch({chunkSize:96,maxDistance:165,castShadow:true,vertexColors:true,heightAt,name:'front-gardens'});
 const hard=new Batch({chunkSize:96,maxDistance:115,castShadow:false,vertexColors:true,heightAt,name:'front-garden-hardscape'});
 const fences=new Batch({chunkSize:96,maxDistance:135,castShadow:false,heightAt,name:'front-garden-fences'});
 // One roughness for every untextured garden part: the batches then merge all
 // of them into a single vertex-coloured material per chunk (one draw call).
 const plain=hex=>material(hex,{roughness:.95});
 const leafy=material(0xffffff,{vertexColors:true,roughness:.95}),wood=plain(0x7a5236),soil=plain(0x6b4a33),post=plain(0x4a4f55);
 const stone=plain(0xc9bba0),cap=plain(0xe4dccb),path=plain(0xd9c9a8),hedgeTop=plain(0x93c96a),hedgeBody=plain(0x5a9c46);
 const fenceStyles={white:fenceMaterial('#fbf7ec'),wood:fenceMaterial('#c08a52'),green:fenceMaterial('#6f9e6a')};
 const index=buildingIndex(data.buildings),skip=new Set(skipBuildingIds),records=[];
 // Reserved footprints, hashed for quick overlap checks.
 const cell=12,grid=new Map(),key=(x,z)=>Math.floor(x/cell)+','+Math.floor(z/cell);
 const reserve=r=>{const rad=Math.hypot(r.w,r.d)/2;for(let i=Math.floor((r.x-rad)/cell);i<=Math.floor((r.x+rad)/cell);i++)for(let j=Math.floor((r.z-rad)/cell);j<=Math.floor((r.z+rad)/cell);j++){const k=i+','+j;if(!grid.has(k))grid.set(k,[]);grid.get(k).push({...r,rad});}};
 // Crowd barriers line the sidewalk in front of the gardens; they are kept
 // clear by the course clearance below rather than blocking whole yards.
 for(const r of reserved)if(Number.isFinite(r.x)&&Number.isFinite(r.z)&&r.kind!=='rail')reserve({x:r.x,z:r.z,w:r.w||1,d:r.d||1});
 // A house's own garden parts are laid out to fit together; only foreign
 // footprints (other houses, course dressing, village gardens) must not touch.
 const overlaps=(x,z,w,d,owner)=>{const rad=Math.hypot(w,d)/2;return (grid.get(key(x,z))||[]).some(r=>!(owner!=null&&r.owner===owner)&&Math.hypot(r.x-x,r.z-z)<r.rad+rad-.15);};
 const free=(x,z,w,d,a,owner)=>{
  const c=Math.cos(a),s=Math.sin(a);
  if([[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2],[0,0]].some(([lx,lz])=>index.contains(x+c*lx+s*lz,z-s*lx+c*lz)))return false;
  return !overlaps(x,z,w,d,owner)&&safeVillageDetail(data,track,x,z,w,d,a,COURSE_CLEARANCE);
 };
 const place=(x,z,w,d,a,kind,building)=>{if(!free(x,z,w,d,a,building))return false;const r={x,z,w,d,a,kind,buildingId:building};records.push(r);reserve({...r,owner:building});return true;};
 let houses=0,trees=0,beds=0,fenceMetres=0;
 for(const [bi,b] of data.buildings.entries()){
  if(skip.has(b.id)||['garage','garages','shed','hut','industrial','retail','commercial'].includes(b.kind))continue;
  const pts=b.points;if(!pts?.length)continue;
  const cx=pts.reduce((s,p)=>s+p[0],0)/pts.length,cz=pts.reduce((s,p)=>s+p[1],0)/pts.length,near=track.nearest(cx,cz);
  if(near.distance>maxDistance)continue;
  let area=0;pts.forEach((p,i)=>{const q=pts[(i+1)%pts.length];area+=p[0]*q[1]-q[0]*p[1];});
  // Street face: the longest-reaching edge whose outward normal looks at the course.
  let front=null;
  for(let i=0;i<pts.length;i++){
   const p=pts[i],q=pts[(i+1)%pts.length],dx=q[0]-p[0],dz=q[1]-p[1],len=Math.hypot(dx,dz);if(len<4)continue;
   const nx=(area>0?1:-1)*dz/len,nz=-(area>0?1:-1)*dx/len,mx=(p[0]+q[0])/2,mz=(p[1]+q[1])/2,f=track.nearest(mx,mz),toward=((f.x-mx)*nx+(f.z-mz)*nz)/Math.max(1,f.distance);
   if(toward<.45)continue;const score=toward*2+len*.08-f.distance*.02;
   if(!front||score>front.score)front={mx,mz,nx,nz,len,ux:dx/len,uz:dz/len,score};
  }
  if(!front)continue;
  // Yard depth: walk out from the facade until the street (or course) begins.
  let depth=0;for(let t=.8;t<=16;t+=.4){if(!safeVillageDetail(data,track,front.mx+front.nx*t,front.mz+front.nz*t,.4,.4,0,COURSE_CLEARANCE))break;depth=t;}
  if(depth<2.4)continue;
  const seed=b.id%100000+bi,a=Math.atan2(front.ux,front.uz),styleRoll=rand(seed+1);
  const style=styleRoll<.36?'white':styleRoll<.56?'wood':styleRoll<.66?'green':styleRoll<.86?'hedge':'wall';
  const line=Math.max(1.6,depth-.35),half=front.len/2+.5,gate=(rand(seed+2)-.5)*Math.min(2,front.len*.25),gateHalf=.6;
  const at=(along,out)=>[front.mx+front.ux*along+front.nx*out,front.mz+front.uz*along+front.nz*out];
  houses++;
  // Fence/hedge/wall pieces of at most 2.4 m on both sides of the gate.
  for(const [from,to] of [[-half,gate-gateHalf],[gate+gateHalf,half]]){
   const span=to-from;if(span<.6)continue;const pieces=Math.ceil(span/2.4),step=span/pieces;
   for(let k=0;k<pieces;k++){
    const mid=from+step*(k+.5),[x,z]=at(mid,line);
    if(!place(x,z,.35,step,a,'front-'+style,b.id))continue;fenceMetres+=step;
    if(style==='hedge'){plants.add(new THREE.BoxGeometry(.62,.82,step+.02),hedgeBody,x,.41,z,a);plants.add(new THREE.BoxGeometry(.66,.12,step+.06),hedgeTop,x,.86,z,a);}
    else if(style==='wall'){hard.add(new THREE.BoxGeometry(.38,.62,step),stone,x,.31,z,a);hard.add(new THREE.BoxGeometry(.48,.08,step+.04),cap,x,.66,z,a);}
    else{fences.add(fencePanel(step),fenceStyles[style],x,0,z,a);hard.add(new THREE.BoxGeometry(.11,1.02,.11),style==='white'?cap:wood,...at(mid-step/2,line),a);}
   }
  }
  // Gate posts, path to the door, mailbox.
  for(const side of [-1,1]){const [x,z]=at(gate+gateHalf*side,line);if(place(x,z,.2,.2,a,'gate-post',b.id))hard.add(new THREE.BoxGeometry(.16,1.12,.16),style==='wall'?stone:style==='white'?cap:wood,x,.56,z,a);}
  { const [x,z]=at(gate,line/2);if(place(x,z,line-.2,.95,a+Math.PI/2,'garden-path',b.id))hard.add(new THREE.BoxGeometry(.95,.05,line-.2),path,x,.035,z,a+Math.PI/2);}
  { const [x,z]=at(gate+gateHalf+.45,line-.25);if(place(x,z,.35,.35,a,'mailbox',b.id)){hard.add(new THREE.BoxGeometry(.07,1.05,.07),post,x,.52,z,a);hard.add(new THREE.BoxGeometry(.34,.26,.22),plain(MAILBOX[Math.floor(rand(seed+3)*MAILBOX.length)]),x,1.15,z,a);}}
  // Flower beds just inside the fence: soil, two shrubs, bright blooms.
  for(let along=-half+.9;along<half-.6;along+=1.25){
   if(Math.abs(along-gate)<gateHalf+.5)continue;
   const out=line-.62,[x,z]=at(along,out);if(!place(x,z,.7,1.1,a,'flowerbed',b.id))continue;beds++;
   hard.add(new THREE.BoxGeometry(.7,.12,1.15),soil,x,.06,z,a);
   for(let j=0;j<2;j++){
    const o=(j-.5)*.5,px=x+front.ux*o,pz=z+front.uz*o,g=GREENS[Math.floor(rand(seed+along*7+j)*GREENS.length)],s=.24+rand(seed+along+j*3)*.12;
    plants.add(blob(s,g,{sy:.85,segments:6}),leafy,px,.12+s*.8,pz);
    const bloom=BLOOMS[Math.floor(rand(seed*3+along*11+j)*BLOOMS.length)];
    for(let f=0;f<3;f++){const ang=f*2.1+j,fx=px+Math.cos(ang)*s*.6,fz=pz+Math.sin(ang)*s*.6;plants.add(bloomDot(.085,bloom),leafy,fx,.12+s*1.25+((f%2)*.06),fz);}
   }
  }
  // Rose bushes at the outer fence corners.
  for(const side of [-1,1]){
   const [x,z]=at(side*(half-.55),line-.75);if(!place(x,z,1,1,a,'rose-bush',b.id))continue;
   const s=.42+rand(seed+side)*.15;plants.add(blob(s,GREENS[2],{sy:.9}),leafy,x,s*.9,z);
   const rose=rand(seed+side*5)>.5?0xe8344a:0xff8fb1;for(let f=0;f<7;f++){const ang=f*.9,h=.3+(f%3)*.18,fx=x+Math.cos(ang)*s*.75,fz=z+Math.sin(ang)*s*.75;plants.add(bloomDot(.095,rose),leafy,fx,s*.9+h-.15,fz);}
  }
  // A big round garden tree in deeper yards: the comic silhouette the eye reads first.
  if(depth>4.8&&rand(seed+9)<.6){
   const side=rand(seed+10)>.5?1:-1,[x,z]=at(side*Math.min(half-1.6,front.len*.3),Math.min(line-1.8,depth*.5));
   if(place(x,z,2.6,2.6,0,'garden-tree',b.id)){
    trees++;const h=2.2+rand(seed+11)*1.2,green=GREENS[Math.floor(rand(seed+12)*GREENS.length)];
    plants.add(new THREE.CylinderGeometry(.13,.2,h+.6,7),wood,x,(h+.6)/2,z);
    const crowns=[[0,0,0,1.55],[.85,-.25,.3,1.05],[-.8,-.2,-.25,1.1],[.15,.55,-.6,.95],[-.2,.35,.75,.9]];
    for(const [ox,oy,oz,r] of crowns)plants.add(blob(r*(.85+rand(seed+r*13)*.3),green,{segments:6,light:.5}),leafy,x+ox,h+1.15+oy,z+oz);
   }
  }
 }
 // A continuous garden edge behind the spectators along the whole course:
 // each 30 m stretch keeps one style (fence with beds, hedge, stone wall or a
 // rose border), interrupted wherever a road, yard or building claims the spot.
 let verge=0;
 for(let sAlong=4;sAlong<track.length;sAlong+=2.4){
  const p=track.at(sAlong),stretch=Math.floor(sAlong/30);
  for(const side of [-1,1]){
   const roll=rand(stretch*7.3+side*3.1),style=roll<.34?'white':roll<.5?'wood':roll<.74?'hedge':roll<.86?'wall':'roses';
   const off=COURSE_CLEARANCE+.45,x=p.x+p.dz*off*side,z=p.z-p.dx*off*side;
   if(!place(x,z,.4,2.4,p.angle,'verge-'+style,null))continue;verge++;
   if(style==='hedge'){plants.add(new THREE.BoxGeometry(.62,.9,2.42),hedgeBody,x,.45,z,p.angle);plants.add(new THREE.BoxGeometry(.66,.12,2.46),hedgeTop,x,.94,z,p.angle);}
   else if(style==='wall'){hard.add(new THREE.BoxGeometry(.4,.62,2.4),stone,x,.31,z,p.angle);hard.add(new THREE.BoxGeometry(.5,.08,2.44),cap,x,.66,z,p.angle);}
   else if(style==='roses'){for(let j=0;j<2;j++){const o=(j-.5)*1.2,px=x+p.dx*o,pz=z+p.dz*o,r=.42+rand(sAlong+j)*.12;plants.add(blob(r,GREENS[2],{sy:.9,segments:6}),leafy,px,r*.9,pz);const rose=BLOOMS[(stretch+j)%3===0?1:0];for(let f=0;f<5;f++){const ang=f*1.25+j;plants.add(bloomDot(.09,rose),leafy,px+Math.cos(ang)*r*.75,r*.9+.12+(f%2)*.2,pz+Math.sin(ang)*r*.75);}}}
   else{fences.add(fencePanel(2.4),fenceStyles[style],x,0,z,p.angle);hard.add(new THREE.BoxGeometry(.11,1.02,.11),style==='white'?cap:wood,x-p.dx*1.2,.51,z-p.dz*1.2,p.angle);}
   // Avenue trees behind every few fence panels throw shade across the road.
   if(Math.floor(sAlong/2.4)%8===(side>0?0:4)){const tx=p.x+p.dz*(off+2.7)*side,tz=p.z-p.dx*(off+2.7)*side;if(place(tx,tz,2.6,2.6,0,'avenue-tree',null)){trees++;const h=2.8+rand(sAlong)*1.2,green=GREENS[Math.floor(rand(sAlong*3.7)*GREENS.length)];plants.add(new THREE.CylinderGeometry(.15,.24,h+.6,6),wood,tx,(h+.6)/2,tz);for(const [ox,oy,oz,r] of [[0,0,0,1.75],[.95,-.3,.4,1.2],[-.9,-.25,-.35,1.25],[.2,.65,-.75,1.05]])plants.add(blob(r,green,{segments:6,light:.5}),leafy,tx+ox,h+1.25+oy,tz+oz);}}
   // Beds behind fences and walls, bright and low so the fence still reads.
   if(style!=='hedge'&&style!=='roses'){
    const bx=x+p.dz*.75*side,bz=z-p.dx*.75*side;
    if(place(bx,bz,.8,2.2,p.angle,'verge-bed',null)){beds++;const g=GREENS[Math.floor(rand(sAlong*1.3)*GREENS.length)];plants.add(blob(.38,g,{sx:1,sy:.7,sz:2.6,segments:6}),leafy,bx,.22,bz,p.angle);
     for(let f=0;f<5;f++){const o=(f-2)*.42,bloom=BLOOMS[Math.floor(rand(sAlong*2.1+f)*BLOOMS.length)];plants.add(bloomDot(.09,bloom),leafy,bx+p.dx*o,.48+(f%2)*.05,bz+p.dz*o);}}
   }
  }
 }
 // The open lawns between the plots: scattered round trees, shrub groups and
 // flower islands along both sides of the course, densest near the road.
 let scattered=0;
 { const xs=data.route.map(p=>p[0]),zs=data.route.map(p=>p[1]),step=5.5,inner=COURSE_CLEARANCE+1.8,outer=48;
  for(let gx=Math.min(...xs)-outer;gx<=Math.max(...xs)+outer;gx+=step)for(let gz=Math.min(...zs)-outer;gz<=Math.max(...zs)+outer;gz+=step){
   const n=Math.floor(gx*.37+gz*1.91),x=gx+(rand(n+.3)-.5)*step*.8,z=gz+(rand(n+.7)-.5)*step*.8,near=track.nearest(x,z);
   if(near.distance<inner||near.distance>outer)continue;
   const density=1-(near.distance-inner)/(outer-inner)*.55,roll=rand(n+1.9)/density;
   if(roll<.27){
    if(!place(x,z,3,3,0,'lawn-tree',null))continue;trees++;scattered++;
    const h=2.4+rand(n+2.3)*1.6,green=GREENS[Math.floor(rand(n+2.9)*GREENS.length)],k=.9+rand(n+3.1)*.45;
    plants.add(new THREE.CylinderGeometry(.14*k,.22*k,h+.6,6),wood,x,(h+.6)/2,z);
    for(const [ox,oy,oz,r] of [[0,0,0,1.6],[.9,-.3,.35,1.1],[-.85,-.25,-.3,1.15],[.2,.6,-.7,1.0]])plants.add(blob(r*k,green,{segments:6,light:.5}),leafy,x+ox*k,h+1.2*k+oy*k,z+oz*k);
   }else if(roll<.56){
    if(!place(x,z,2.2,2.2,0,'shrubs',null))continue;scattered++;
    for(let j=0;j<3;j++){const ang=j*2.1+n,r=.35+rand(n+j*.7)*.3,px=x+Math.cos(ang)*.55,pz=z+Math.sin(ang)*.55;plants.add(blob(r,GREENS[(n+j)%GREENS.length],{sy:.8,segments:6}),leafy,px,r*.75,pz);}
   }else if(roll<.68){
    if(!place(x,z,1.8,1.8,0,'flower-island',null))continue;scattered++;beds++;
    plants.add(blob(.55,GREENS[1],{sy:.35,segments:6}),leafy,x,.12,z);
    const bloom=BLOOMS[Math.floor(rand(n+5.5)*BLOOMS.length)];for(let f=0;f<7;f++){const ang=f*.9,r=.15+(f%3)*.14;plants.add(bloomDot(.09,f%3?bloom:BLOOMS[(f+n)%BLOOMS.length]),leafy,x+Math.cos(ang)*r,.27,z+Math.sin(ang)*r);}
   }
  }
 }
 const meshes=[...plants.flush(scene),...hard.flush(scene),...fences.flush(scene)];
 return {houses,trees,beds,scattered,verge,fenceMetres:Math.round(fenceMetres),records,meshCount:meshes.length};
}
