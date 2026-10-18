// Rendering quality never changes the race clock, input or car simulation.
// Start conservatively: the game must demonstrate spare time before adding detail.
export class FrameQuality{
 constructor({initialLevel=0,targetFps=60}={}){this.level=Math.max(0,Math.min(2,initialLevel));this.targetFps=targetFps;this.average=1000/targetFps;this.slow=0;this.fast=0;this.cooldown=0;this.samples=0;}
 resetTiming(){this.average=1000/this.targetFps;this.slow=this.fast=0;this.samples=0;}
 sample(ms){
  // An isolated background-tab suspension is not a GPU benchmark. Slow active
  // frames, including 90–1000 ms, must still be counted rather than discarded.
  if(!Number.isFinite(ms)||ms<2||ms>1500)return false;
  this.samples++;const dt=Math.min(.25,ms/1000),budget=1000/this.targetFps;
  this.average+=(Math.min(ms,500)-this.average)*.065;
  this.cooldown=Math.max(0,this.cooldown-dt);
  this.slow=this.average>budget*1.32?this.slow+dt:Math.max(0,this.slow-dt*2);
  this.fast=this.average<budget*1.055?this.fast+dt:0;
  if(this.level>0&&this.slow>1&&this.cooldown===0){this.level--;this.slow=this.fast=0;this.cooldown=3;return true;}
  if(this.level<2&&this.samples>120&&this.fast>(this.level===0?8:12)&&this.cooldown===0){this.level++;this.slow=this.fast=0;this.cooldown=10;return true;}
  return false;
 }
}

// Shared limits for game cameras and scenery. A tour may deliberately use a
// larger camera far plane; a race only needs the next few streets in view.
export const RENDER_PROFILES=Object.freeze([
 Object.freeze({far:260,fogNear:105,fogFar:285,detailScale:.62,shadowDistance:0,treeDistance:0,crowdHz:8}),
 Object.freeze({far:360,fogNear:150,fogFar:385,detailScale:.82,shadowDistance:90,treeDistance:110,crowdHz:14}),
 Object.freeze({far:480,fogNear:190,fogFar:465,detailScale:1,shadowDistance:125,treeDistance:150,crowdHz:20})
]);
