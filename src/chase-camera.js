const wrap=value=>Math.atan2(Math.sin(value),Math.cos(value));

// Exact response to a target moving linearly between the two rendered frames.
// A plain lerp to the newest simulation state alternates its lag at 30/60 Hz.
function follow(value,previous,target,rate,dt){
 if(dt<=0)return value;
 const blend=-Math.expm1(-rate*dt),velocity=(target-previous)/dt;
 return value+(target-value)*blend+velocity*(dt*(1-blend)-blend/rate);
}

/** Eye and look point share one anchor, driven only by the visible car pose. */
export class ChaseCameraRig{
 constructor(){
  this.ready=false;
  this.output={position:{x:0,y:0,z:0},look:{x:0,y:0,z:0},fov:63};
 }
 reset(pose,speed=0,{top=false,reduced=false}={}){
  this.anchor={x:pose.x,y:pose.y,z:pose.z};
  this.previous={...pose};this.heading=pose.angle;this.previousHeading=pose.angle;
  this.overhead=top?1:0;this.fov=this.targetFov(speed,top,reduced);this.ready=true;
  return this.compose();
 }
 targetFov(speed,top,reduced){return top?55:63+(reduced?0:Math.min(Math.max(0,speed)*.14,6));}
 sample(pose,speed,seconds,{top=false,reduced=false}={}){
  if(!this.ready||Math.hypot(pose.x-this.previous.x,pose.z-this.previous.z)>24)return this.reset(pose,speed,{top,reduced});
  const dt=Math.max(0,Math.min(.25,seconds));
  for(const axis of ['x','y','z'])this.anchor[axis]=follow(this.anchor[axis],this.previous[axis],pose[axis],reduced?24:18,dt);
  const nextHeading=this.previousHeading+wrap(pose.angle-this.previousHeading);
  this.heading=follow(this.heading,this.previousHeading,nextHeading,reduced?16:10,dt);
  this.previousHeading=nextHeading;
  this.previous.x=pose.x;this.previous.y=pose.y;this.previous.z=pose.z;this.previous.angle=pose.angle;
  const blend=-Math.expm1(-8*dt);
  this.overhead+=((top?1:0)-this.overhead)*(-Math.expm1(-5*dt));
  this.fov+=(this.targetFov(speed,top,reduced)-this.fov)*blend;
  return this.compose();
 }
 compose(){
  const {anchor,heading,overhead,output}=this,sin=Math.sin(heading),cos=Math.cos(heading),chase=1-overhead;
  output.position.x=anchor.x-sin*11.8*chase;
  output.position.y=anchor.y+6+66*overhead;
  output.position.z=anchor.z-cos*11.8*chase-35*overhead;
  output.look.x=anchor.x+sin*8*chase;
  output.look.y=anchor.y+1.15*chase;
  output.look.z=anchor.z+cos*8*chase;
  output.fov=this.fov;
  return output;
 }
}
