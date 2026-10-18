import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {RacingAudio,AUDIO_BANK,AUDIO_VERSION} from '../src/racing-audio.js';
import {CARS} from '../src/car-catalog.js';

class Param{
 constructor(value=0){this.value=value;this.calls=[];}
 setTargetAtTime(value,time,tau){this.value=value;this.calls.push({value,time,tau});}
}
class Node{
 constructor(){this.connections=[];this.disconnects=0;}
 connect(node){this.connections.push(node);return node;}
 disconnect(){this.disconnects++;this.connections=[];}
}
class Source extends Node{
 constructor(ctx){super();this.ctx=ctx;this.playbackRate=new Param(1);this.starts=0;this.stops=0;this.loop=false;}
 start(time){this.starts++;this.started=time;}
 stop(time){this.stops++;this.stopped=time;this.onended?.();}
}
class Context{
 constructor(){this.state='suspended';this.currentTime=0;this.destination=new Node();this.sources=[];this.decodes=0;this.resumes=0;this.suspends=0;this.closed=0;}
 createGain(){const node=new Node();node.gain=new Param();return node;}
 createDynamicsCompressor(){const node=new Node();for(const key of ['threshold','knee','ratio','attack','release'])node[key]=new Param();return node;}
 createStereoPanner(){const node=new Node();node.pan=new Param();return node;}
 createBufferSource(){const source=new Source(this);this.sources.push(source);return source;}
 async decodeAudioData(bytes){this.decodes++;const samples=new Float32Array(2048).fill(.3);return {duration:1,identity:new Uint8Array(bytes)[0],sampleRate:44100,numberOfChannels:1,getChannelData:()=>samples};}
 async resume(){this.resumes++;this.state='running';}
 async suspend(){this.suspends++;this.state='suspended';}
 async close(){this.closed++;this.state='closed';}
}
class Document{
 constructor(){this.hidden=false;this.listeners=new Set();}
 addEventListener(type,fn){assert.equal(type,'visibilitychange');this.listeners.add(fn);}
 removeEventListener(type,fn){assert.equal(type,'visibilitychange');this.listeners.delete(fn);}
 setHidden(value){this.hidden=value;for(const listener of this.listeners)listener();}
}
const wait=async audio=>{await Promise.all([...audio.loads.values()]);await Promise.resolve();await Promise.resolve();};
const requests=[],doc=new Document(),ctx=new Context();let car=0,created=0;
const changes=[],errors=[];
const audio=new RacingAudio({getCar:()=>car,documentTarget:doc,contextFactory:()=>{created++;return ctx;},onMuteChange:value=>changes.push(value),onError:(id,error)=>errors.push({id,error}),
 fetcher:async (url,options)=>{requests.push({url,options});return {ok:true,arrayBuffer:async()=>Uint8Array.of(requests.length).buffer};}});
assert.equal(audio.muted,true);
assert.equal(created,0,'Creating the audio bank must not create a context or request audio');
audio.update(20,true,true,{race:true});assert.equal(await audio.play('ui-click'),false);
assert.equal(requests.length,0);
audio.init();assert.equal(created,1);assert.equal(requests.length,0,'Race initialization while muted must not fetch the bank');
assert.equal(audio.toggle(),false);await wait(audio);
assert.deepEqual(changes,[false]);assert.equal(ctx.state,'running');
assert.deepEqual(requests.map(r=>r.url.split('/').at(-1).split('?')[0]).sort(),['engine-kadett.mp3','ui-click.mp3']);
assert.ok(requests.every(r=>r.options.cache==='force-cache'&&r.url.endsWith('?v='+AUDIO_VERSION)));
audio.update(12,true);await wait(audio);assert.equal(audio.loops.size,1);assert.equal(audio.loops.get('engine').id,'engine-kadett');
const firstEngine=audio.loops.get('engine').source,initialRate=firstEngine.playbackRate.value;
for(let i=0;i<600;i++)audio.update(24,true,false,{race:false});
assert.equal(audio.loops.size,1);assert.equal(ctx.sources.length,1,'Rendering frames must only automate the existing source, not allocate new nodes');
assert.ok(firstEngine.playbackRate.value>initialRate);assert.equal(requests.length,2);
for(car=1;car<CARS.length;car++){audio.update(15,true);await wait(audio);assert.equal(audio.loops.get('engine').id,'engine-'+CARS[car].id);}
assert.equal(requests.filter(r=>r.url.includes('/engine-')).length,5,'All five cars must request five genuinely different generated engine files');
assert.ok(firstEngine.stops>0,'Changing cars must retire the former engine');
car=4;audio.update(32,true,true,{race:true,crowd:.6,boost:1});await wait(audio);
assert.deepEqual([...audio.loops.keys()].sort(),['crowd','drift','engine','wind']);
assert.ok(audio.loops.get('drift').source.loop&&audio.loops.get('wind').source.loop&&audio.loops.get('crowd').source.loop);
assert.ok(audio.loops.get('crowd').gain.gain.value<AUDIO_BANK.crowd.gain);
for(const {source} of audio.loops.values()){const pcm=source.buffer.getChannelData(0);assert.equal(pcm[0],0);assert.equal(pcm.at(-1),0,'Actual browser-decoded loops meet at zero after the one-time MP3 seam guard');}
const sourcesBefore=ctx.sources.length,decodedBefore=ctx.decodes;
for(let i=0;i<600;i++)audio.update(32,true,true,{race:true,crowd:.6});
assert.equal(ctx.sources.length,sourcesBefore);assert.equal(ctx.decodes,decodedBefore);
assert.equal(await audio.play('pickup'),true);assert.equal(await audio.play('pickup'),false,'Pickup cooldown blocks duplicate physics-step sounds');
ctx.currentTime+=1;assert.equal(await audio.play('impact',{pan:-.8}),true);assert.equal(audio.voices.size,2);
assert.equal([...audio.voices].at(-1).panner.pan.value,-.8);
audio.update(32,true,false,{race:false});assert.deepEqual([...audio.loops.keys()],['engine'],'Showroom revs must never play crowd/wind/skid');
audio.setPaused(true);assert.equal(ctx.state,'suspended');assert.equal(audio.loops.size,0);assert.equal(audio.voices.size,0);
assert.equal(await audio.play('finish'),false);
audio.setPaused(false);await Promise.resolve();audio.update(20,true,true,{race:true});await wait(audio);assert.equal(audio.loops.size,4);
doc.setHidden(true);assert.equal(audio.loops.size,0);assert.equal(audio.voices.size,0);assert.equal(ctx.state,'suspended');
const fetchesBeforeHidden=requests.length;audio.update(20,true,true,{race:true});assert.equal(await audio.play('shield'),false);assert.equal(requests.length,fetchesBeforeHidden);
doc.setHidden(false);await Promise.resolve();audio.update(20,true);await wait(audio);assert.equal(audio.loops.size,1);
audio.setMuted(true);assert.equal(audio.loops.size,0);assert.equal(ctx.state,'suspended');audio.update(20,true);assert.equal(await audio.play('lap'),false);
audio.setMuted(false);await wait(audio);const mutedSources=ctx.sources.length;
audio.update(0,false);assert.equal(audio.loops.size,0);assert.equal(ctx.sources.length,mutedSources);

// A decode that resolves after pause/mute cannot resurrect either a loop or a
// one-shot. A second request for the same asset must share fetch and decode.
let resolveFetch;const pendingContext=new Context(),pendingDocument=new Document(),pendingRequests=[];
const pending=new RacingAudio({documentTarget:pendingDocument,contextFactory:()=>pendingContext,
 fetcher:url=>{pendingRequests.push(url);if(url.includes('pickup'))return new Promise(resolve=>resolveFetch=resolve);
 return Promise.resolve({ok:true,arrayBuffer:async()=>Uint8Array.of(1).buffer});}});
pending.setMuted(false);await wait(pending);const one=pending.play('pickup');const same=pending.load('pickup');await Promise.resolve();
assert.equal(pendingRequests.filter(url=>url.includes('pickup')).length,1);
pending.setMuted(true);resolveFetch({ok:true,arrayBuffer:async()=>Uint8Array.of(7).buffer});
assert.equal(await one,false);await same;assert.equal(pendingContext.sources.length,0);
pending.dispose();assert.equal(pendingDocument.listeners.size,0);assert.equal(pendingContext.closed,1);

// Bound all overlapping voices even when independent event decodes finish at
// once. No render-frame allocations are needed to maintain these limits.
ctx.currentTime+=5;
const events=Object.entries(AUDIO_BANK).filter(([id,spec])=>!spec.loop).map(([id])=>id);
await Promise.all(events.map(id=>audio.play(id)));
assert.equal(audio.voices.size,audio.maxVoices);audio.stop();assert.equal(audio.voices.size,0);
const fetchesBeforeDispose=requests.length;audio.dispose();audio.dispose();assert.equal(doc.listeners.size,0);assert.equal(ctx.closed,1);
assert.equal(await audio.play('ui-click'),false);audio.update(20,true,true,{race:true});assert.equal(requests.length,fetchesBeforeDispose);assert.deepEqual(errors,[]);

// Failure of one audio file is isolated, reported once, and leaves the game
// silent instead of retrying provider requests indefinitely.
const badCtx=new Context(),badErrors=[];let badRequests=0;
const bad=new RacingAudio({contextFactory:()=>badCtx,documentTarget:new Document(),onError:id=>badErrors.push(id),fetcher:async()=>{badRequests++;return {ok:false};}});
bad.setMuted(false);await wait(bad);await bad.load('ui-click');await bad.load('ui-click');assert.equal(badRequests,2);assert.deepEqual(badErrors.sort(),['engine-kadett','ui-click']);bad.dispose();

const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../assets/audio'),manifest=JSON.parse(fs.readFileSync(path.join(base,'manifest.json')));
assert.equal(manifest.version,AUDIO_VERSION);assert.equal(manifest.effects,22);assert.equal(Object.keys(AUDIO_BANK).length,22);
assert.equal(manifest.provider,'ElevenLabs');assert.equal(manifest.model,'eleven_text_to_sound_v2');
assert.ok(manifest.totalBytes<1_000_000,'Runtime bank should stay comfortably below 1 MB for mobile');
const engineHashes=new Set();let total=0;
for(const item of manifest.assets){
 assert.ok(AUDIO_BANK[item.id],item.id);const bytes=fs.readFileSync(path.join(base,item.file));total+=bytes.length;
 assert.equal(bytes.length,item.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sha256);
 assert.equal(item.channels,1);assert.equal(item.sampleRate,44100);assert.equal(item.clippedSamples,0);
 assert.ok(item.decodedPeak>.005&&item.decodedPeak<.96,item.id+' has audible samples and safe headroom');
 assert.ok(item.rmsDbFS>-45&&item.rmsDbFS<-6,item.id+' is audible and normalized');
 assert.ok(item.durationSeconds>0&&item.durationSeconds<7);assert.equal(item.loop,!!AUDIO_BANK[item.id].loop);
 if(item.loop)assert.ok(item.loopBoundaryJump<.05,item.id+' has no large encoded seam; the actual browser decoder boundary is guarded separately');
 if(item.id.startsWith('engine-'))engineHashes.add(item.sha256);
}
assert.equal(total,manifest.totalBytes);assert.equal(engineHashes.size,CARS.length,'Every car engine is a separately generated recording');
console.log(`PASS: 22 verified ElevenLabs files (${total} bytes), five distinct engine recordings; lazy user-gesture unlock, shared fetch/decode, smooth source reuse, bounded voices, event cooldowns, car crossfades, pause/hidden/mute/dispose cancellation, no clipped samples, no startup audio fetch. Mock WebAudio lifecycle tests; physical-device hearing/latency is a browser QA task.`);
