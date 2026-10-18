// Position sample time stays monotone even when later response latency changes
// the HUD's server-clock estimate. The server independently bounds this value.
export class NetworkSampleClock{
 constructor({startAt,offset=0,priorRaceTime=null,now=()=>performance.now(),wallNow=()=>Date.now()}={}){
  if(!Number.isFinite(startAt)||!Number.isFinite(offset))throw TypeError('A server race start and clock offset are required.');
  this.now=now;this.began=now();
  const estimate=(wallNow()+offset-startAt)/1000;
  // A countdown starts with a negative origin. A stored zero is not evidence
  // that the race has started; a positive confirmed sample can anchor a resume.
  this.origin=Number.isFinite(priorRaceTime)&&priorRaceTime>0?Math.max(estimate,priorRaceTime):estimate;
  this.latest=0;
 }
 read(){
  this.latest=Math.max(this.latest,0,this.origin+Math.max(0,this.now()-this.began)/1000);
  return this.latest;
 }
 observe(raceTime){
  if(!Number.isFinite(raceTime)||raceTime<0||raceTime>7200)return;
  const current=this.read();
  if(raceTime>current){this.origin+=raceTime-current;this.latest=raceTime;}
 }
}
