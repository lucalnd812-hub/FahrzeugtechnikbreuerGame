import * as THREE from 'three';

/** Comic race effects from two pooled instanced meshes (no allocation while
 * racing): round smoke puffs behind the rear wheels when drifting (white) or
 * ploughing through grass (earthy dust), and a confetti burst over the start
 * gate when the lights go out and around the car when it crosses the line. */

const CONFETTI=[0xe8343f,0xffc52e,0x2d78d8,0x2fae6a,0xf27ea9,0xffffff,0xff7a2b];

export function createRaceEffects(scene,{heightAt=()=>0,start={x:0,z:0,angle:0}}={}){
 const puffCount=72,confettiCount=240,dummy=new THREE.Object3D(),color=new THREE.Color(),hidden=new THREE.Matrix4().makeScale(0,0,0);
 const puffs=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),new THREE.MeshStandardMaterial({color:0xffffff,roughness:1}),puffCount);
 const confetti=new THREE.InstancedMesh(new THREE.PlaneGeometry(.16,.1),new THREE.MeshStandardMaterial({color:0xffffff,roughness:.7,side:THREE.DoubleSide}),confettiCount);
 for(const mesh of [puffs,confetti]){mesh.frustumCulled=false;mesh.castShadow=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);for(let i=0;i<mesh.count;i++){mesh.setMatrixAt(i,hidden);mesh.setColorAt(i,color.set(0xffffff));}mesh.name=mesh===puffs?'effects:puffs':'effects:confetti';scene.add(mesh);}
 const puff=Array.from({length:puffCount},()=>({born:-99,life:.8,x:0,y:0,z:0,vx:0,vz:0,size:1}));
 const bits=Array.from({length:confettiCount},(_,i)=>({x:0,y:-99,z:0,vx:0,vy:0,vz:0,spin:0,phase:i*.37,until:-99}));
 let head=0,lastPuff=-1,lastTime=-Infinity,finishBurst=false;
 const burst=(x,y,z,spread,time)=>{bits.forEach((b,i)=>{const r=Math.random;b.x=x+(r()-.5)*spread;b.y=y+r()*4;b.z=z+(r()-.5)*spread;b.vx=(r()-.5)*1.4;b.vz=(r()-.5)*1.4;b.vy=-(1.1+r()*.9);b.spin=4+r()*8;b.until=time+7;confetti.setColorAt(i,color.set(CONFETTI[i%CONFETTI.length]));});confetti.instanceColor.needsUpdate=true;};
 const update=(v,time)=>{
  // A new race restarts the clock: clear the pools, then burst when the lights go out.
  if(time<lastTime){puff.forEach(p=>p.born=-99);bits.forEach(b=>b.until=-99);finishBurst=false;lastPuff=-1;lastTime=-Infinity;}
  const dt=Number.isFinite(lastTime)?time-lastTime:0;
  if(time>=0&&time<2&&!(lastTime>=0))burst(start.x,heightAt(start.x,start.z)+7,start.z,14,time);
  lastTime=time;
  if(v){
   if(v.finish!=null&&!finishBurst){finishBurst=true;burst(v.x,heightAt(v.x,v.z)+6,v.z,10,time);}
   const dusty=v.offroad&&v.speed>6,smoky=v.drifting&&v.speed>9;
   if((dusty||smoky)&&time-lastPuff>.045){lastPuff=time;
    for(const side of [-1,1]){const p=puff[head++%puffCount],x=v.x-Math.sin(v.angle)*1.5+Math.cos(v.angle)*side*.85,z=v.z-Math.cos(v.angle)*1.5-Math.sin(v.angle)*side*.85;
     Object.assign(p,{born:time,life:.65+Math.random()*.35,x,y:heightAt(x,z)+.35,z,vx:-Math.sin(v.angle)*1.2+(Math.random()-.5),vz:-Math.cos(v.angle)*1.2+(Math.random()-.5),size:smoky?.55+Math.random()*.25:.45+Math.random()*.2});
     puffs.setColorAt((head-1)%puffCount,color.set(smoky?0xf4f4f0:0xc9b083));}
    puffs.instanceColor.needsUpdate=true;}
  }
  for(let i=0;i<puffCount;i++){const p=puff[i],a=(time-p.born)/p.life;
   if(a<0||a>1){puffs.setMatrixAt(i,hidden);continue;}
   const grow=Math.sin(Math.min(1,a*2.2)*Math.PI/2)*(1-a*a*a);dummy.position.set(p.x+p.vx*a*p.life,p.y+a*.9,p.z+p.vz*a*p.life);dummy.rotation.set(a*2,a*3,0);dummy.scale.setScalar(p.size*(.5+grow));if(grow<.05)dummy.scale.setScalar(0);dummy.updateMatrix();puffs.setMatrixAt(i,dummy.matrix);}
  puffs.instanceMatrix.needsUpdate=true;
  let active=false;
  for(let i=0;i<confettiCount;i++){const b=bits[i];if(time>b.until){confetti.setMatrixAt(i,hidden);continue;}active=true;
   const step=Math.min(.05,Math.max(0,dt));b.x+=(b.vx+Math.sin(time*3+b.phase)*.6)*step;b.z+=b.vz*step;const ground=heightAt(b.x,b.z)+.03;b.y=Math.max(ground,b.y+b.vy*step);
   dummy.position.set(b.x,b.y,b.z);dummy.rotation.set(time*b.spin+b.phase,b.phase,time*b.spin*.7);dummy.scale.setScalar(b.y<=ground+.01?.9:1);dummy.updateMatrix();confetti.setMatrixAt(i,dummy.matrix);}
  if(active||confetti.userData.wasActive)confetti.instanceMatrix.needsUpdate=true;confetti.userData.wasActive=active;
 };
 return {update,puffs,confetti};
}
