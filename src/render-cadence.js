/** A deadline preserves the fractional RAF interval on 90/144 Hz displays.
 * Small jitter retains its remainder; long stalls skip missed slots. A callback
 * can submit at most one new frame and never enters a render catch-up loop. */
export class RenderCadence{
 constructor(){this.reset();}
 reset(){this.nextAt=null;this.lastAt=null;this.lastSeen=null;this.targetFPS=null;}
 take(timestamp,targetFPS=60,force=false){
  if(!Number.isFinite(timestamp))return false;
  if(timestamp===this.lastAt)return false;
  const fps=Number.isFinite(targetFPS)?Math.max(1,Math.min(240,targetFPS)):60;
  if(this.lastSeen!==null&&timestamp<this.lastSeen)this.reset();
  this.lastSeen=timestamp;
  if(this.nextAt===null||fps!==this.targetFPS){this.nextAt=timestamp;this.targetFPS=fps;}
  if(!force&&timestamp+1e-7<this.nextAt)return false;
  this.lastAt=timestamp;
  if(timestamp+1e-7>=this.nextAt){
   const interval=1000/fps;this.nextAt+=interval;
   if(timestamp-this.nextAt>=interval)this.nextAt+=(Math.floor((timestamp-this.nextAt+1e-7)/interval)+1)*interval;
  }
  return true;
 }
}
