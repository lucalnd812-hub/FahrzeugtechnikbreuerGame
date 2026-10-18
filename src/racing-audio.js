import {CARS} from './car-catalog.js';

// ElevenLabs samples are served by the game host. No provider API, credentials,
// audio fetch or AudioContext is involved until the player enables sound.
export const AUDIO_VERSION='eleven-racing-1';
export const AUDIO_BANK=Object.freeze({
 'engine-kadett':{loop:true,gain:.34},'engine-e30':{loop:true,gain:.46},
 'engine-m1':{loop:true,gain:.32},'engine-m2':{loop:true,gain:.34},'engine-gt3rs':{loop:true,gain:.3},
 drift:{loop:true,gain:.2},wind:{loop:true,gain:.1},crowd:{loop:true,gain:.13},
 impact:{gain:.62,cooldown:.24},'ui-click':{gain:.38,cooldown:.055},
 'ui-select':{gain:.42,cooldown:.1},'ui-back':{gain:.36,cooldown:.1},
 pickup:{gain:.58,cooldown:.25},boost:{gain:.43,cooldown:.2},shield:{gain:.46,cooldown:.35},
 oil:{gain:.48,cooldown:.25},countdown:{gain:.52,cooldown:.35},go:{gain:.58,cooldown:.8},
 finish:{gain:.56,cooldown:1.5},lap:{gain:.48,cooldown:1},reset:{gain:.42,cooldown:.5},
 'oil-hit':{gain:.44,cooldown:.5}
});
const clamp=(v,a,b)=>Math.min(b,Math.max(a,Number(v)||0));
const noop=()=>{};

export class RacingAudio{
 constructor({getCar=()=>0,onMuteChange=noop,onError=noop,contextFactory=null,
  fetcher=globalThis.fetch?.bind(globalThis),documentTarget=globalThis.document,
  assetBase='assets/audio/',maxVoices=8}={}){
  this.getCar=getCar;this.onMuteChange=onMuteChange;this.onError=onError;
  this.contextFactory=contextFactory;this.fetcher=fetcher;this.document=documentTarget;
  this.assetBase=assetBase;this.maxVoices=clamp(maxVoices,1,12);this.muted=true;
  this.ctx=null;this.master=null;this.compressor=null;this.disposed=false;this.paused=false;
  this.hidden=!!documentTarget?.hidden;this.epoch=0;this.carId=this._carId(getCar());
  this.buffers=new Map();this.loads=new Map();this.controllers=new Set();this.wants=new Map();
  this.loops=new Map();this.voices=new Set();this.cooldowns=new Map();this.failures=new Set();
  this.visibilityListener=()=>{this.hidden=!!this.document?.hidden;if(this.hidden)this.stop({suspend:true});
   else if(!this.muted&&!this.paused)this.resume();};
  documentTarget?.addEventListener?.('visibilitychange',this.visibilityListener);
 }
 _carId(value){return typeof value==='string'&&CARS.some(c=>c.id===value)?value:CARS[clamp(Math.trunc(value),0,CARS.length-1)]?.id||CARS[0].id;}
 init(){
  if(this.ctx||this.disposed)return this.ctx;
  try{
   const Context=globalThis.AudioContext||globalThis.webkitAudioContext;
   this.ctx=this.contextFactory?this.contextFactory():Context?new Context({latencyHint:'interactive'}):null;
   if(!this.ctx)return null;
   this.master=this.ctx.createGain();this.master.gain.value=.72;
   // Headroom and a gentle limiter keep simultaneous pickup/engine/impact sounds
   // controlled, without allocating any synthesis nodes every render frame.
   if(this.ctx.createDynamicsCompressor){this.compressor=this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value=-10;this.compressor.knee.value=8;this.compressor.ratio.value=6;
    this.compressor.attack.value=.003;this.compressor.release.value=.12;
    this.master.connect(this.compressor);this.compressor.connect(this.ctx.destination);
   }else this.master.connect(this.ctx.destination);
  }catch(error){this.ctx=null;this.onError('context',error);}
  return this.ctx;
 }
 resume(){
  if(this.disposed||this.hidden||this.paused)return Promise.resolve(false);
  const ctx=this.init();if(!ctx)return Promise.resolve(false);
  try{return Promise.resolve(ctx.resume?.()).then(()=>!this.disposed).catch(()=>false);}catch{return Promise.resolve(false);}
 }
 unlock(){
  // Must be called by the user's click/tap/key gesture. The first fetch happens
  // only after unmute, and each request/decode is shared by every caller.
  const pending=this.resume();
  if(!this.muted&&!this.hidden&&!this.paused){this.load('ui-click');this.load('engine-'+this.carId);}
  return pending;
 }
 toggle(){this.setMuted(!this.muted);return this.muted;}
 setMuted(value){
  const next=!!value;if(next===this.muted)return this.muted;this.muted=next;
  if(next)this.stop({suspend:true});else this.unlock();
  this.onMuteChange(this.muted);return this.muted;
 }
 setPaused(value){
  const next=!!value;if(next===this.paused)return;this.paused=next;
  if(next)this.stop({suspend:true});else if(!this.muted&&!this.hidden)this.resume();
 }
 _audible(){return !this.disposed&&!this.muted&&!this.paused&&!this.hidden&&!!this.ctx&&this.ctx.state==='running';}
 load(id){
  if(!AUDIO_BANK[id]||this.disposed||this.muted||!this.ctx)return Promise.resolve(null);
  if(this.buffers.has(id))return Promise.resolve(this.buffers.get(id));
  if(this.loads.has(id))return this.loads.get(id);
  if(this.failures.has(id)||!this.fetcher)return Promise.resolve(null);
  const controller=typeof AbortController==='function'?new AbortController():null;
  if(controller)this.controllers.add(controller);
  const loading=Promise.resolve().then(()=>this.fetcher(this.assetBase+id+'.mp3?v='+AUDIO_VERSION,{signal:controller?.signal,cache:'force-cache'}))
   .then(response=>{if(!response.ok)throw new Error('Audio asset unavailable');return response.arrayBuffer();})
   .then(bytes=>this.ctx?.decodeAudioData(bytes))
   .then(buffer=>{
    if(buffer&&!this.disposed){
     // MP3 synthesis can reintroduce tiny endpoint pre-ringing. Align the actual
     // browser-decoded loop boundary once, before caching (4 ms, no per-frame work).
     if(AUDIO_BANK[id].loop&&buffer.getChannelData){for(let channel=0;channel<buffer.numberOfChannels;channel++){
      const samples=buffer.getChannelData(channel),n=Math.min(Math.round(buffer.sampleRate*.004),Math.floor(samples.length/16));
      for(let i=0;i<n;i++){const envelope=i/Math.max(1,n-1);samples[i]*=envelope;samples[samples.length-1-i]*=envelope;}
     }}
     this.buffers.set(id,buffer);
    }
    return this.disposed?null:buffer;
   })
   .catch(error=>{if(!this.disposed&&error?.name!=='AbortError'){this.failures.add(id);this.onError(id,error);}return null;})
   .finally(()=>{this.loads.delete(id);if(controller)this.controllers.delete(controller);});
  this.loads.set(id,loading);return loading;
 }
 _param(param,value,tau=.06){
  if(!param||!this.ctx)return;
  if(param.setTargetAtTime)param.setTargetAtTime(value,this.ctx.currentTime,tau);else param.value=value;
 }
 _retire(slot){
  this.wants.delete(slot);const entry=this.loops.get(slot);if(!entry)return;
  this.loops.delete(slot);this._param(entry.gain.gain,0,.016);
  try{entry.source.stop(this.ctx.currentTime+.07);}catch{}
 }
 _loop(slot,id,volume,rate=1){
  const target=clamp(volume,0,1);if(target<.002||!this._audible()){this._retire(slot);return;}
  const current=this.wants.get(slot);
  if(current?.id===id){current.volume=target;current.rate=rate;
   const entry=this.loops.get(slot);if(entry){this._param(entry.gain.gain,target);this._param(entry.source.playbackRate,rate,.09);}return;}
  this._retire(slot);const wanted={id,volume:target,rate,epoch:this.epoch};this.wants.set(slot,wanted);
  this.load(id).then(buffer=>{
   if(!buffer||this.wants.get(slot)!==wanted||wanted.epoch!==this.epoch||!this._audible())return;
   const source=this.ctx.createBufferSource(),gain=this.ctx.createGain();source.buffer=buffer;source.loop=true;
   source.playbackRate.value=wanted.rate;gain.gain.value=0;source.connect(gain);gain.connect(this.master);
   const entry={id,source,gain};this.loops.set(slot,entry);
   source.onended=()=>{source.disconnect?.();gain.disconnect?.();if(this.loops.get(slot)===entry)this.loops.delete(slot);};
   source.start(0);this._param(gain.gain,wanted.volume,.035);
  }).catch(noop);
 }
 update(speed,active,drifting=false,{car=this.getCar(),race=false,crowd=1,boost=0}={}){
  this.carId=this._carId(car);
  if(!active||!this._audible()){for(const slot of [...this.wants.keys()])this._retire(slot);return;}
  const spec=CARS.find(c=>c.id===this.carId)||CARS[0],velocity=Math.abs(Number(speed)||0),n=clamp(velocity/spec.max,0,1.35);
  const id='engine-'+this.carId;
  this._loop('engine',id,AUDIO_BANK[id].gain*(.48+.52*Math.min(n,1)),clamp(.65+n*1.08+(boost>0?.1:0),.55,2.25));
  this._loop('drift','drift',race&&drifting?AUDIO_BANK.drift.gain*clamp(n,.25,1):0,.86+Math.min(n,1)*.25);
  this._loop('wind','wind',race?AUDIO_BANK.wind.gain*clamp((n-.2)/.8,0,1):0,.85+Math.min(n,1)*.18);
  this._loop('crowd','crowd',race?AUDIO_BANK.crowd.gain*clamp(crowd,0,1):0,1);
 }
 play(id,{volume=1,rate=1,pan=0}={}){
  const spec=AUDIO_BANK[id];if(!spec||spec.loop||!this._audible())return Promise.resolve(false);
  const now=this.ctx.currentTime,ready=this.cooldowns.get(id)??-Infinity;
  if(now<ready||this.voices.size>=this.maxVoices)return Promise.resolve(false);
  this.cooldowns.set(id,now+(spec.cooldown||.1));const epoch=this.epoch;
  return this.load(id).then(buffer=>{
   // Fetch/decode may finish after a user mutes, pauses or leaves the tab. A
   // pending request must never resurrect a sound after that lifecycle change.
   if(!buffer||epoch!==this.epoch||!this._audible()||this.voices.size>=this.maxVoices)return false;
   const source=this.ctx.createBufferSource(),gain=this.ctx.createGain();source.buffer=buffer;
   source.playbackRate.value=clamp(rate,.7,1.4);gain.gain.value=spec.gain*clamp(volume,0,1);
   let panner=null;source.connect(gain);
   if(pan&&this.ctx.createStereoPanner){panner=this.ctx.createStereoPanner();panner.pan.value=clamp(pan,-1,1);gain.connect(panner);panner.connect(this.master);}
   else gain.connect(this.master);
   const voice={source,gain,panner};this.voices.add(voice);
   source.onended=()=>{this.voices.delete(voice);source.disconnect?.();gain.disconnect?.();panner?.disconnect?.();};
   source.start(0);return true;
  }).catch(()=>false);
 }
 // Compatibility for old controller calls while event-specific integration
 // migrates. Every tone resolves to a generated sample, not an oscillator.
 tone(f=620){return this.play(f<300?'impact':f>950?'boost':f>700?'pickup':'ui-click');}
 stop({suspend=false}={}){
  this.epoch++;this.wants.clear();
  for(const entry of this.loops.values()){try{entry.source.stop();}catch{}entry.source.disconnect?.();entry.gain.disconnect?.();}
  this.loops.clear();
  for(const voice of this.voices){try{voice.source.stop();}catch{}voice.source.disconnect?.();voice.gain.disconnect?.();voice.panner?.disconnect?.();}
  this.voices.clear();this.cooldowns.clear();
  if(suspend&&this.ctx?.state==='running'){try{Promise.resolve(this.ctx.suspend?.()).catch(noop);}catch{}}
 }
 dispose(){
  if(this.disposed)return;this.disposed=true;this.stop({suspend:true});
  this.document?.removeEventListener?.('visibilitychange',this.visibilityListener);
  for(const controller of this.controllers)controller.abort();this.controllers.clear();
  this.buffers.clear();this.loads.clear();this.master?.disconnect?.();this.compressor?.disconnect?.();
  try{Promise.resolve(this.ctx?.close?.()).catch(noop);}catch{}
 }
}
