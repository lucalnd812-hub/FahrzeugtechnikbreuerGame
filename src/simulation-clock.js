// Fixed-step simulation. Long active frames retain their debt instead of losing driving time.
export class SimulationClock {
 constructor({step=1/60,maxSteps=120}={}){this.step=step;this.maxSteps=maxSteps;this.reset();}
 reset(time=0){this.time=time;this.debt=0;this.steps=0;this.overloaded=false;}
 advance(seconds,simulate){
  if(!Number.isFinite(seconds)||seconds<0)return 0;
  this.debt+=seconds;let count=0;
  while(this.debt+1e-10>=this.step&&count<this.maxSteps){this.time+=this.step;simulate(this.step,this.time);this.debt-=this.step;count++;this.steps++;}
  this.debt=Math.max(0,this.debt);this.overloaded=this.debt>=this.step;
  return Math.min(1,this.debt/this.step);
 }
}
export function interpolatedPose(previous,current,alpha){
 if(!previous)return current;
 const da=Math.atan2(Math.sin(current.angle-previous.angle),Math.cos(current.angle-previous.angle));
 return {x:previous.x+(current.x-previous.x)*alpha,z:previous.z+(current.z-previous.z)*alpha,angle:previous.angle+da*alpha};
}
