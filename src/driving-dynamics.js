const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const response=(state,target,rate,dt)=>state+(target-state)*(1-Math.exp(-rate*dt));

// Responsive arcade handling: the steering input owns the line. A visible
// rear slip eases into a drift, then settles on release. Keep the gentle speed
// scaling of the original game; a road-car traction/yaw cap made these narrow
// village corners impossible to judge with binary phone controls.
export function updateSteering(v,car,requested,dt){
  const h=car.handling;
  const returning=Math.abs(requested)<Math.abs(v.steering)||requested*v.steering<0;
  const rate=returning?h.steerReturn:h.steerAttack/(1+v.speed*.004);
  v.steering=response(v.steering,requested,rate,dt);
  if(Math.abs(v.steering)<1e-7)v.steering=0;
}

export function updateDrivingDirection(v,car,drifting,brake,throttle,acceleration,dt){
  const h=car.handling,speed=Math.max(0,v.speed);
  const frontLoad=1+brake*.11+(throttle<.15&&speed>8?.035:0)-throttle*.025;
  const traction=h.traction*frontLoad*(1+h.downforce*(speed/car.max)**2)*(v.offroad?.55:1);
  const turnSpeed=2*car.grip*h.agility*Math.min(speed/8,1)/(1+speed*.006);
  const wanted=-v.steering*turnSpeed*(drifting?1.22:1)*(1+brake*.045);
  // A short response smooths an input edge without adding a second sluggish
  // steering filter. Grip still differentiates cars and informs body loading;
  // it does not silently cancel the driver's steering at racing speed.
  v.yawRate=response(v.yawRate||0,wanted,h.yawResponse,dt);
  if(speed<.05)v.yawRate=0;
  v.angle+=v.yawRate*dt;
  if(v.spin>0){v.angle+=dt*6.3;v.slip*=Math.exp(-12*dt);}
  else{
    const target=drifting?v.steering*h.driftAngle*(.9+clamp(speed/34,0,1)*.1):0;
    const settle=drifting?8:h.settle*(brake>0?1.15:1);
    // Do not re-inherit the previous velocity angle each frame: that fought
    // steering and made the line feel disconnected from the car's nose.
    v.slip=clamp(response(v.slip,target,settle,dt),-.48,.48);
  }
  v.gripLoss=response(v.gripLoss||0,clamp(Math.abs(v.slip)/h.driftAngle,0,1),10,dt);
  const load=clamp(v.yawRate*speed/traction,-1.15,1.15);
  v.lateralLoad=response(v.lateralLoad||0,load,10,dt);
  v.bodyRoll=response(v.bodyRoll||0,-v.lateralLoad*h.roll,12,dt);
  v.bodyPitch=response(v.bodyPitch||0,clamp(-acceleration/30,-1,1)*h.pitch,10,dt);
  // A small, predictable drift scrub keeps a charged exit rewarding without
  // imposing the old traction limit through the speed calculation instead.
  const scrub=Math.abs(v.steering)*.16+(drifting?.35:0)+Math.abs(v.slip)*.45;
  v.speed=Math.max(0,v.speed-scrub*dt);
  return v.angle+v.slip;
}
