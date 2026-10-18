import {courseObstacles,hitCourseObstacle} from './course.js';
import {DEFAULT_RACE_CONFIG,normalizeRaceConfig} from './race-config.js';
import {CARS} from './car-catalog.js';
import {updateSteering,updateDrivingDirection} from './driving-dynamics.js';
export {CARS} from './car-catalog.js';
export const LAPS = 2;
export const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export const angleDelta=a=>Math.atan2(Math.sin(a),Math.cos(a));
export const mod=(n,m)=>((n%m)+m)%m;
export const timeText=t=>`${Math.floor(t/60)}:${(t%60).toFixed(2).padStart(5,'0')}`;

export class Track {
  constructor(points,config){
    this.raceConfig=config?normalizeRaceConfig(config):DEFAULT_RACE_CONFIG;
    this.points=points; this.segments=[];this.length=0;this.cellSize=24;this.grid=new Map();
    for(let i=0;i<points.length-1;i++){
      const a=points[i],b=points[i+1],d=Math.hypot(b[0]-a[0],b[1]-a[1]);
      if(d<.01)continue;
      this.segments.push({a,b,d,s:this.length,dx:(b[0]-a[0])/d,dz:(b[1]-a[1])/d});this.length+=d;
    }
    // A local query covers a cell plus its neighbours; distant queries retain an exact fallback.
    for(const [index,p] of this.segments.entries()){
      const x0=Math.floor(Math.min(p.a[0],p.b[0])/this.cellSize)-1,x1=Math.floor(Math.max(p.a[0],p.b[0])/this.cellSize)+1;
      const z0=Math.floor(Math.min(p.a[1],p.b[1])/this.cellSize)-1,z1=Math.floor(Math.max(p.a[1],p.b[1])/this.cellSize)+1;
      for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++){const key=x+','+z;if(!this.grid.has(key))this.grid.set(key,new Set());this.grid.get(key).add(index);}
    }
    for(const [key,ids] of this.grid)this.grid.set(key,[...ids].sort((a,b)=>a-b));
    this.obstacles=courseObstacles(this);
  }
  at(distance){
    const s=mod(distance,this.length);
    let lo=0,hi=this.segments.length-1;
    while(lo<hi){const mid=(lo+hi)>>1;if(s<this.segments[mid].s+this.segments[mid].d)hi=mid;else lo=mid+1;}
    const seg=this.segments[lo];
    const t=(s-seg.s)/seg.d;
    return {x:seg.a[0]+(seg.b[0]-seg.a[0])*t,z:seg.a[1]+(seg.b[1]-seg.a[1])*t,angle:Math.atan2(seg.dx,seg.dz),dx:seg.dx,dz:seg.dz,s};
  }
  nearest(x,z){
    let best=null,min=Infinity,bestT=0;
    const visit=p=>{
      const t=clamp(((x-p.a[0])*p.dx+(z-p.a[1])*p.dz)/p.d,0,1);
      const qx=p.a[0]+p.dx*p.d*t,qz=p.a[1]+p.dz*p.d*t,dist2=(x-qx)**2+(z-qz)**2;
      if(dist2<min){min=dist2;best=p;bestT=t;}
    };
    const local=this.grid.get(Math.floor(x/this.cellSize)+','+Math.floor(z/this.cellSize));
    if(local)for(const index of local)visit(this.segments[index]);
    if(min>=this.cellSize*this.cellSize){best=null;min=Infinity;for(const p of this.segments)visit(p);}
    return {x:best.a[0]+best.dx*best.d*bestT,z:best.a[1]+best.dz*best.d*bestT,s:best.s+best.d*bestT,angle:Math.atan2(best.dx,best.dz),dx:best.dx,dz:best.dz,distance:Math.sqrt(min)};
  }
  delta(a,b){let d=a-b;if(d>this.length/2)d-=this.length;if(d<-this.length/2)d+=this.length;return d;}
}

export function makeVehicle(track,car=0,slot=0,name='Du',id='you',config){
  const progress=-12-Math.floor(slot/2)*6,p=track.at(progress),offset=slot%2?1.65:-1.65;
  return {id,car,name,raceConfig:config?normalizeRaceConfig(config):track.raceConfig||DEFAULT_RACE_CONFIG,x:p.x-p.dz*offset,z:p.z+p.dx*offset,angle:p.angle,speed:0,progress,s:p.s,safeS:p.s,gate:0,boost:0,shield:0,spin:0,drift:0,wasDrifting:false,item:null,itemCooldown:0,zoneCooldown:0,collisionCooldown:0,obstacleCooldown:0,finish:null,wrongWay:false,drifting:false,offroad:false,steering:0,steerTime:0,slip:0,yawRate:0,lateralLoad:0,bodyRoll:0,bodyPitch:0,gripLoss:0,offroadStillTime:0,resetRemaining:0};
}

export function resetVehicle(v,track,distance=v.safeS){
  const p=track.at(distance);Object.assign(v,{x:p.x,z:p.z,angle:p.angle,speed:0,spin:0,s:p.s,drift:0,slip:0,steering:0,steerTime:0,yawRate:0,lateralLoad:0,bodyRoll:0,bodyPitch:0,gripLoss:0,offroadStillTime:0,resetRemaining:0,offroad:false,wrongWay:false,wasDrifting:false,drifting:false});
}

export function botInput(v,track,difficulty=1){
  const p=track.nearest(v.x,v.z),target=track.at(p.s+7+v.speed*.43);
  const hazard=(v.raceConfig||track.raceConfig||DEFAULT_RACE_CONFIG).rules==='action'?track.obstacles.find(h=>mod(h.s-p.s,track.length)<36):null;
  if(hazard){const offset=-hazard.side*2.1;target.x+=target.dz*offset;target.z-=target.dx*offset;}
  const want=Math.atan2(target.x-v.x,target.z-v.z),error=angleDelta(want-v.angle);
  const turn=Math.abs(angleDelta(track.at(p.s+24).angle-p.angle));
  const targetSpeed=(CARS[v.car].max-1.5)*difficulty/(1+turn*1.4)*(hazard?.78:1);
  return {gas:v.speed<targetSpeed?1:.08,brake:v.speed>targetSpeed+2?1:0,steer:clamp(-error*2,-1,1),drift:Math.abs(error)>.28&&Math.abs(error)<.9&&v.speed>16&&!hazard,autoDrift:false};
}

// The driveable verge ends at 8 m, so confirmed progress stays continuous over
// that whole corridor. A local inside bend may change the nearest centreline
// by >15 m despite a tiny physical movement. Only a bounded transition from an
// already confirmed start projection can use that allowance; teleports cannot.
function confirmCourseMovement(v,track,near,current,physicalStep,maxPhysicalStep){
  const delta=track.delta(current.s,v.s);
  const localBend=Math.abs(delta)<=32&&Math.abs(track.delta(near.s,v.s))<1e-6&&near.distance<=8+1e-6&&Math.abs(angleDelta(current.angle-near.angle))>.25&&physicalStep<=maxPhysicalStep;
  if(current.distance>8+1e-6||!(Math.abs(delta)<15||localBend))return null;
  v.progress+=delta;v.s=current.s;v.safeS=current.s;return delta;
}

function advanceCourseGates(v,track,laps){
  const gateSize=track.length/12;
  // Ordered boundaries of confirmed physical progress recover a delayed gate
  // instead of becoming permanently impossible beyond an arbitrary +24 m.
  while(v.gate<laps*12&&v.progress>=(v.gate+1)*gateSize)v.gate++;
}

export function stepVehicle(v,track,input,dt,time,config){
  if(v.finish!==null)return [];
  const rules=config||v.raceConfig||track.raceConfig||DEFAULT_RACE_CONFIG;
  const laps=rules.laps||LAPS;
  // A confirmed collision can carry a car across its final start line after
  // the previous physics step. Finish before further movement, including when
  // the driver brakes or the next displacement is zero.
  if(v.progress>=laps*track.length&&v.gate>=laps*12){v.finish=time;return ['finish'];}
  const events=[];dt=clamp(dt,0,.05);const car=CARS[v.car];
  for(const key of ['boost','shield','spin','itemCooldown','zoneCooldown','collisionCooldown','obstacleCooldown'])v[key]=Math.max(0,v[key]-dt);
  const oldX=v.x,oldZ=v.z,oldSpeed=v.speed;
  const near=track.nearest(v.x,v.z);v.offroad=near.distance>5.7;
  const requested=clamp(input.steer||0,-1,1),reversing=requested*v.steering<0;
  updateSteering(v,car,requested,dt);
  const steer=v.steering;v.steerTime=Math.abs(requested)>.78&&!reversing?v.steerTime+dt:0;
  const autoDrift=input.autoDrift===undefined?rules.autoDrift:input.autoDrift;
  const automatic=autoDrift!==false&&v.steerTime>.22&&Math.abs(steer)>.65;
  // A release or an opposite button ends the current drift immediately. A
  // second direction has to build its own deliberate hold; the old latch let
  // a charged slide continue through a reversal and fought countersteering.
  const followingInput=requested*steer>0&&!reversing;
  const continuing=v.wasDrifting&&autoDrift!==false&&Math.abs(requested)>.22&&Math.abs(steer)>.3;
  const drifting=followingInput&&(!!input.drift||automatic||continuing)&&Math.abs(steer)>.16&&v.speed>11&&!v.offroad&&v.spin===0;
  if(drifting){v.drift=Math.min(2.5,v.drift+dt*1.65);}
  else if(v.wasDrifting){if(v.drift>.45&&!v.offroad&&v.spin===0){v.boost=Math.max(v.boost,.6+v.drift*.65);events.push('driftBoost');}v.drift=0;}
  v.wasDrifting=drifting;v.drifting=drifting;
  const max=car.max*(v.boost>0?1.35:1)*(v.offroad?.38:1)*(v.spin>0?.3:1);
  const throttle=clamp(input.gas||0,0,1),brake=clamp(input.brake||0,0,1);
  let grade=0;
  if(typeof track.heightAt==='function'){
    const dx=Math.sin(v.angle),dz=Math.cos(v.angle),rise=track.heightAt(v.x+dx,v.z+dz)-track.heightAt(v.x-dx,v.z-dz);
    if(Number.isFinite(rise))grade=clamp(rise/2,-.35,.35);
  }
  const acceleration=throttle*car.accel*(v.boost>0?1.5:1)-2.3-brake*car.handling.brake-9.81*grade;
  v.speed=clamp(v.speed+acceleration*dt,0,Math.max(max,v.speed));
  if(v.speed>max)v.speed=Math.max(max,v.speed-(v.offroad?35:10)*dt);
  const movingAngle=updateDrivingDirection(v,car,drifting,brake,throttle,acceleration,dt);
  v.x+=Math.sin(movingAngle)*v.speed*dt;v.z+=Math.cos(movingAngle)*v.speed*dt;
  if(rules.rules==='action'&&hitCourseObstacle(v,track.obstacles))events.push('obstacleHit');
  let current=track.nearest(v.x,v.z);
  // Grass slows the car; the outer verge prevents cutting across the village.
  if(current.distance>8){v.x=current.x+(v.x-current.x)*8/current.distance;v.z=current.z+(v.z-current.z)*8/current.distance;v.speed*=.985;current=track.nearest(v.x,v.z);}
  const physicalStep=Math.hypot(v.x-oldX,v.z-oldZ);
  const delta=confirmCourseMovement(v,track,near,current,physicalStep,Math.max(oldSpeed,v.speed)*dt+3);
  v.offroad=current.distance>5.7;
  const movement=dt>0?physicalStep/dt:Infinity;
  v.offroadStillTime=v.offroad&&movement<.35?v.offroadStillTime+dt:0;
  v.resetRemaining=v.offroadStillTime>0?Math.max(0,2-v.offroadStillTime):0;
  if(v.offroadStillTime>=2-1e-8){resetVehicle(v,track,v.safeS);events.push('autoReset');}
  v.wrongWay=angleDelta(v.angle-current.angle)>1.8||angleDelta(v.angle-current.angle)<-1.8;
  if(delta!==null&&delta>0)advanceCourseGates(v,track,laps);
  if(v.progress>=laps*track.length&&v.gate>=laps*12){v.finish=time;events.push('finish');}
  if(rules.rules==='action'&&(current.s<20||current.s>track.length-5)&&v.zoneCooldown===0&&v.speed>4){v.boost=Math.max(v.boost,2.4);v.zoneCooldown=12;events.push('breuerBoost');}
  if(v.offroad)events.push('offroad');
  return events;
}

function confirmCollisionMovement(v,track,near,oldX,oldZ){
  let current=track.nearest(v.x,v.z);
  if(current.distance>8){v.x=current.x+(v.x-current.x)*8/current.distance;v.z=current.z+(v.z-current.z)*8/current.distance;current=track.nearest(v.x,v.z);}
  // Each car is pushed by at most 1.092 m. Clamping a push at the outer verge
  // can add at most the same correction, hence the explicit 2.2 m bound.
  const physicalStep=Math.hypot(v.x-oldX,v.z-oldZ);
  const delta=physicalStep<=2.2?confirmCourseMovement(v,track,near,current,physicalStep,2.2):null;
  if(delta!==null&&delta>0)advanceCourseGates(v,track,(v.raceConfig||track.raceConfig||DEFAULT_RACE_CONFIG).laps||LAPS);
}

export function collideCars(a,b,track=null){
  if(a.finish!==null||b.finish!==null||a.collisionCooldown>0||b.collisionCooldown>0)return false;
  const dx=a.x-b.x,dz=a.z-b.z,d=Math.hypot(dx,dz);
  if(d>2.1||d<.001)return false;
  const oldAX=a.x,oldAZ=a.z,oldBX=b.x,oldBZ=b.z;
  const nearA=track&&!a.remote?track.nearest(a.x,a.z):null,nearB=track&&!b.remote?track.nearest(b.x,b.z):null;
  const n=(2.1-d)*.52;a.x+=dx/d*n;a.z+=dz/d*n;b.x-=dx/d*n;b.z-=dz/d*n;
  if(a.shield===0)a.speed*=.77;if(b.shield===0)b.speed*=.77;
  // Collisions happen after stepVehicle. Confirm this known physical impulse
  // immediately so a centreline switch at a bend cannot stale the next step.
  // Remote progress is owned by its driver/server and is never amended here.
  if(nearA)confirmCollisionMovement(a,track,nearA,oldAX,oldAZ);
  if(nearB)confirmCollisionMovement(b,track,nearB,oldBX,oldBZ);
  a.collisionCooldown=b.collisionCooldown=.65;return true;
}

export function useItem(v,oil,clock){
  if((v.raceConfig||DEFAULT_RACE_CONFIG).rules==='classic')return null;
  if(!v.item)return null;
  const type=v.item;v.item=null;
  if(type==='boost')v.boost=Math.max(v.boost,3);
  if(type==='shield')v.shield=8;
  if(type==='oil')oil.push({id:`${v.id}-${clock}`,owner:v.id,x:v.x-Math.sin(v.angle)*5,z:v.z-Math.cos(v.angle)*5,expires:clock+14});
  return type;
}

/** Logical availability is independent of a renderer's distance culling. */
export function pickupAvailable(crate,time,rules='action'){
  return rules==='action'&&Number.isFinite(time)&&Number(crate.available||0)<=time;
}

/**
 * Test the movement between fixed physics samples, rather than only the car's
 * centre at the end. A fast car can cross the narrow outer edge of a crate's
 * pickup circle between samples. Never sweep a reset or a network-owned car.
 */
export function collectPickup(v,crates,time,previous=null,random=Math.random){
  const rules=(v.raceConfig||DEFAULT_RACE_CONFIG).rules;
  if(v.remote||v.finish!=null||v.item||v.itemCooldown>0||rules!=='action'||!Number.isFinite(time))return null;
  let fromX=v.x,fromZ=v.z;
  if(Number.isFinite(previous?.x)&&Number.isFinite(previous?.z)&&Math.hypot(v.x-previous.x,v.z-previous.z)<=4){fromX=previous.x;fromZ=previous.z;}
  const dx=v.x-fromX,dz=v.z-fromZ,length2=dx*dx+dz*dz,radius2=2.4**2;
  for(const crate of crates){
    if(!pickupAvailable(crate,time,rules))continue;
    const t=length2?clamp(((crate.x-fromX)*dx+(crate.z-fromZ)*dz)/length2,0,1):0;
    if((fromX+dx*t-crate.x)**2+(fromZ+dz*t-crate.z)**2>radius2)continue;
    const type=['boost','shield','oil'][Math.floor(clamp(random(),0,.999999)*3)];
    v.item=type;v.itemCooldown=3;crate.available=time+5;
    return {type,crate};
  }
  return null;
}

export function ranking(vehicles){
  return [...vehicles].sort((a,b)=>a.finish!==null&&b.finish!==null?a.finish-b.finish:a.finish!==null?-1:b.finish!==null?1:b.progress-a.progress);
}
