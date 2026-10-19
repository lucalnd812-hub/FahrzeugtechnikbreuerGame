import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as Three from 'three';
import * as Core from '../src/race-core.js';
import * as Tracks from '../src/tracks.js';
import * as Rules from '../src/race-config.js';
import * as Modes from '../src/race-modes.js';
import * as Clock from '../src/simulation-clock.js';
import {TouchControls} from '../src/touch-controls.js';
import {StartBriefing} from '../src/start-briefing.js';
import {EntryScreen} from '../src/entry-screen.js';
import {HANDLING_VERSION} from '../src/car-catalog.js';
import {FrameQuality} from '../src/performance.js';
import {NetworkSampleClock} from '../src/network-clock.js';
import {createGarageFlow} from '../src/garage-flow.js';
import {makePremiumShowroom} from '../src/premium-showroom.js';
import {frameShowroom} from '../src/showroom-framing.js';
import {RacingAudio} from '../src/racing-audio.js';
import {drawGarageCourse} from '../src/garage-course-preview.js';
import {ChaseCameraRig} from '../src/chase-camera.js';
import {surfaceHeightAt,makeOilDecal} from '../src/road-surface.js';
import {OnlineRecords} from '../src/online-records.js';
import {createDriverProfileUI} from '../src/driver-profile-ui.js';
import {createGarageCarousel} from '../src/garage-carousel.js';
import {createGarageVehiclePreview} from '../src/garage-vehicle-preview.js';
import {installInteractionGuard} from '../src/interaction-guard.js';
import {RenderCadence} from '../src/render-cadence.js';
import {loadVehicleFinishes} from '../src/vehicle-finish.js';
import {createMiniMap,drawRaceMinimap} from '../src/minimap.js';

// Executes the actual controller/physics with a small DOM and mock renderer.
// These are functional regression checks, not browser/GPU performance results.
const registry=new Map(),elements=new Set(),renders=[],errors=[],disposedWorlds=[];
let domMutations=0;
const context2d=new Proxy({globalAlpha:1,measureText:text=>({width:String(text).length*6}),createLinearGradient:()=>({addColorStop(){}})},{get:(target,key)=>target[key]??(()=>{}),set:(target,key,value)=>{target[key]=value;return true;}});
class Target{
 constructor(){this.listeners=new Map();}
 addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(fn);}
 removeEventListener(type,fn){this.listeners.get(type)?.delete(fn);}
 emit(type,values={}){const event={target:this,preventDefault(){this.prevented=true;},stopImmediatePropagation(){},stopPropagation(){},...values},outputs=[];if(typeof this['on'+type]==='function')outputs.push(this['on'+type](event));for(const fn of this.listeners.get(type)||[])outputs.push(fn(event));return outputs;}
}
let document;
class Element extends Target{
 constructor(tag,attrs=''){
  super();this.tagName=tag.toUpperCase();this.children=[];this.parentElement=null;const counted=()=>new Proxy({},{set:(target,key,value)=>{domMutations++;target[key]=value;return true;}});this.style=counted();this.dataset=counted();this.attrs={};this.classes=new Set();this.textContent='';this._value='';this.checked=/\bchecked\b/.test(attrs);this.hidden=/\bhidden\b/.test(attrs);this.disabled=/\bdisabled\b/.test(attrs);this.selected=/\bselected\b/.test(attrs);this.width=0;this.height=0;this.clientWidth=500;this.clientHeight=300;this.captures=new Set();this.ownerDocument=document;this.isConnected=true;
  for(const match of attrs.matchAll(/([\w-]+)(?:="([^"]*)")?/g)){const [_,name,raw]=match,value=raw??'';this.attrs[name]=value;if(name==='id'){this.id=value;registry.set(value,this);}if(name==='class')value.split(' ').forEach(item=>this.classes.add(item));if(name.startsWith('data-'))this.dataset[name.slice(5).replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase())]=value;if(name==='value')this._value=value;}
  this.classList={add:name=>this.classes.add(name),remove:name=>this.classes.delete(name),contains:name=>this.classes.has(name),toggle:(name,force)=>{domMutations++;if(force??!this.classes.has(name))this.classes.add(name);else this.classes.delete(name);}};elements.add(this);
 }
 get textContent(){return this._textContent||'';}set textContent(value){domMutations++;this._textContent=String(value);}
 get hidden(){return this._hidden;}set hidden(value){domMutations++;this._hidden=!!value;}
 get disabled(){return this._disabled;}set disabled(value){domMutations++;this._disabled=!!value;}
 get value(){return this._value;}set value(value){this._value=String(value);}
 get className(){return [...this.classes].join(' ');}set className(value){this.classes=new Set(String(value).split(/\s+/).filter(Boolean));}
 appendChild(child){child.parentElement=this;child.isConnected=this.isConnected;this.children.push(child);return child;}
 remove(){const parent=this.parentElement;if(parent)parent.children=parent.children.filter(child=>child!==this);this.parentElement=null;this.isConnected=false;}
 contains(node){return node===this||this.descendants().includes(node);}
 setAttribute(name,value){this.attrs[name]=String(value);if(name==='id'){this.id=String(value);registry.set(this.id,this);}if(name.startsWith('data-'))this.dataset[name.slice(5).replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase())]=String(value);}getAttribute(name){return this.attrs[name]??null;}
 removeAttribute(name){delete this.attrs[name];if(name.startsWith('data-'))delete this.dataset[name.slice(5).replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase())];}
 matches(selector){return selector.split(',').some(value=>{
  value=value.trim();if(value.includes(':not([disabled])')&&this.disabled)return false;value=value.replace(':not([disabled])','');
  if(value.includes(' ')){const parts=value.split(/\s+/);if(!this.matches(parts.pop()))return false;let parent=this.parentElement;while(parts.length){const part=parts.pop();while(parent&&!parent.matches(part))parent=parent.parentElement;if(!parent)return false;parent=parent.parentElement;}return true;}
  if(value.startsWith('.'))return this.classes.has(value.slice(1));if(value.startsWith('#'))return this.id===value.slice(1);
  const attr=value.match(/^([a-z]*)\[([\w-]+)(?:="([^"]*)")?\]$/i);if(attr){if(attr[1]&&this.tagName!==attr[1].toUpperCase())return false;return attr[2] in this.attrs&&(attr[3]===undefined||this.attrs[attr[2]]===attr[3]);}
  return this.tagName===value.toUpperCase();
 });}
 closest(selector){return this.matches(selector)?this:this.parentElement?.closest(selector)||null;}
 descendants(){return this.children.flatMap(child=>[child,...child.descendants()]);}
 querySelectorAll(selector){return this.descendants().filter(element=>element.matches(selector));}querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
 set innerHTML(html){for(const old of this.descendants()){elements.delete(old);if(old.id&&registry.get(old.id)===old)registry.delete(old.id);old.isConnected=false;}this.children=[];this._html=html;parse(html,this);}
 get innerHTML(){return this._html||'';}
 focus(){document.activeElement=this;}getContext(){return context2d;}
 getBoundingClientRect(){return {left:620,top:90,width:660,height:680,bottom:770};}
 setPointerCapture(id){this.captures.add(id);}hasPointerCapture(id){return this.captures.has(id);}releasePointerCapture(id){this.captures.delete(id);}
 click(){this.emit('click');}toBlob(fn){fn(new Blob(['mock-image'],{type:'image/png'}));}
}
function parse(html,parent){
 const stack=[parent],voidTags=new Set(['AREA','BASE','BR','COL','EMBED','HR','IMG','INPUT','LINK','META','PARAM','SOURCE','TRACK','WBR']);
 for(const match of html.matchAll(/<\/?([a-z][\w-]*)\b([^>]*)>/gi)){
  if(match[0][1]==='/'){const index=stack.findLastIndex(element=>element?.tagName===match[1].toUpperCase());if(index>0)stack.splice(index);continue;}
  const element=new Element(match[1],match[2]);element.parentElement=stack.at(-1)||null;element.parentElement?.children.push(element);
  if(element.tagName==='OPTION'&&element.parentElement?.tagName==='SELECT'&&(element.selected||element.parentElement.children.length===1))element.parentElement.value=element.value;
  if(!voidTags.has(element.tagName)&&!match[0].endsWith('/>'))stack.push(element);
 }
}
document=new Target();document.getElementById=id=>registry.get(id)||null;document.querySelectorAll=selector=>[...elements].filter(element=>element.matches(selector));document.querySelector=selector=>document.querySelectorAll(selector)[0]||null;document.createElement=tag=>new Element(tag);document.activeElement=null;document.hidden=false;document.documentElement=new Element('html');document.body=new Element('body');
parse(fs.readFileSync(new URL('../src/game.html',import.meta.url),'utf8'),document.body);
const window=new Target();window.document=document;window.screen={width:1280,height:800};window.BREUER_OFFLINE=true;document.defaultView=window;
const query=new Target();query.matches=false;window.matchMedia=()=>query;
class Renderer{
 constructor(){this.shadowMap={};this.info={render:{calls:1,triangles:12},memory:{geometries:1,textures:0},programs:[]};this.renderLists={dispose(){}};}
 setPixelRatio(value){this.pixelRatio=value;}getPixelRatio(){return this.pixelRatio;}setSize(){}setViewport(...values){assert(values.every(Number.isFinite));}setScissor(...values){assert(values.every(Number.isFinite));}setScissorTest(){}setClearColor(){}clear(){}render(scene,camera){this.frameCount=(this.frameCount||0)+1;renders.push({scene,camera});if(renders.length>50)renders.shift();}
}
class PMREM{fromScene(){return {texture:new Three.Texture()};}dispose(){}}
class RoomEnvironment{dispose(){}}
const audioParam={setTargetAtTime(){},setValueAtTime(){},exponentialRampToValueAtTime(){}};
class AudioContext{constructor(){this.currentTime=0;this.destination={};}resume(){}createOscillator(){return {frequency:audioParam,connect(){},start(){},stop(){}};}createGain(){return {gain:audioParam,connect(){}};}createBiquadFilter(){return {frequency:audioParam,connect(){}};}}
window.AudioContext=AudioContext;
function makeCar(){const group=new Three.Group();group.userData={shield:new Three.Group(),flames:new Three.Group()};return group;}
function makeShowroom(){const scene=new Three.Scene(),cars=Core.CARS.map(()=>makeCar());for(const car of cars)scene.add(car);return {scene,cars};}
function makeWorld(map,track){
 const scene=new Three.Scene(),sun={position:new Three.Vector3(),target:{position:new Three.Vector3()}},courseHighlight=new Three.Group();scene.add(courseHighlight);
 const crates=[];for(let s=70;s<track.length;s+=240){const p=track.at(s),mesh=new Three.Group();mesh.add(new Three.Group());scene.add(mesh);crates.push({...p,mesh,groundY:surfaceHeightAt(map,p.x,p.z),available:0});}
 return {scene,sun,courseHighlight,crates,obstacles:track.obstacles.map(obstacle=>({...obstacle,mesh:new Three.Group()})),setQuality(){},setRaceRules(){},animate(){},updateVisibility(){for(const crate of crates)crate.mesh.visible=true;},skid(){},dispose(){disposedWorlds.push(map.trackId);}};
}
let now=1000,rafQueue=[],timerId=0;const timers=new Map(),storage=new Map(),fetches=[],apiRequests=[],failureCourses=new Set(),files=new Map(),imageRequests=[];
for(const id of ['base',...Tracks.TRACKS.map(track=>track.id)])files.set(id,JSON.parse(fs.readFileSync(new URL(`../src/tracks/${id}.json`,import.meta.url))));
const previousFetch=globalThis.fetch,previousImage=globalThis.Image;
globalThis.Image=class{
 constructor(){this.complete=false;this.naturalWidth=0;this.naturalHeight=0;}
 set src(value){this._src=value;imageRequests.push(value);queueMicrotask(()=>{const asset=new URL('../assets/'+new URL(value,'https://game.test').pathname.slice(1),import.meta.url);if(!fs.existsSync(asset)){this.onerror?.(new Error('Missing actual model view'));return;}this.naturalWidth=640;this.naturalHeight=400;this.complete=true;this.onload?.();});}
 get src(){return this._src;}
};
globalThis.fetch=async(url,options={})=>{const parsed=new URL(url,'https://game.test');if(parsed.pathname.startsWith('/api/')){apiRequests.push({path:parsed.pathname,body:options.body?JSON.parse(options.body):null});return {ok:false,status:503,json:async()=>({error:'QA ranking service unavailable'})};}const id=parsed.pathname.split('/').at(-1).replace('.json','');fetches.push(id);assert(files.has(id),'Unexpected request: '+url);if(failureCourses.delete(id))return {ok:false,status:503};return {ok:true,status:200,json:async()=>structuredClone(files.get(id))};};
const sandbox={console:{...console,error:(...args)=>errors.push(args),warn(){}},THREE:{...Three,WebGLRenderer:Renderer,PMREMGenerator:PMREM},...Tracks,...Rules,...Modes,...Clock,...Core,createMiniMap,drawRaceMinimap,loadVehicleAssets:async()=>[],installToonShading:()=>false,animateItemBox(){},ComicPost:class{constructor(r){this.r=r;}render(s,c){this.r.render(s,c);}setSamples(){}setSpeedLines(){}},OnlineRecords,createDriverProfileUI,createGarageCarousel,createGarageVehiclePreview,installInteractionGuard,RenderCadence,loadVehicleFinishes,ChaseCameraRig,surfaceHeightAt,makeOilDecal,TouchControls,StartBriefing,EntryScreen,HANDLING_VERSION,FrameQuality,NetworkSampleClock,createGarageFlow:options=>createGarageFlow({...options,root:document}),makeCar,makeWorld,makeShowroom,makePremiumShowroom,frameShowroom,RacingAudio,drawGarageCourse,animateCar(){},setCarQuality(){},disposeScene(){},RoomEnvironment,document,window,innerWidth:1280,innerHeight:800,devicePixelRatio:1,matchMedia:()=>query,navigator:{getGamepads:()=>[],userAgent:'Controller test; no browser FPS'},localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)},performance:{now:()=>now},Date,URL,URLSearchParams,Blob,AbortSignal,location:{search:'',href:'https://game.test',reload(){}},fetch:globalThis.fetch,setTimeout(fn,delay=0){const id=++timerId;timers.set(id,{fn,due:now+delay});return id;},clearTimeout:id=>timers.delete(id),requestAnimationFrame:fn=>{rafQueue.push(fn);return rafQueue.length;}};
window.innerWidth=1280;window.innerHeight=800;window.navigator=sandbox.navigator;window.performance=sandbox.performance;window.devicePixelRatio=1;window.setTimeout=sandbox.setTimeout;window.clearTimeout=sandbox.clearTimeout;sandbox.globalThis=sandbox;
const source=fs.readFileSync(new URL('../src/game.js',import.meta.url),'utf8').replace(/^import .+;\n/gm,'')+`
globalThis.inspect=()=>({selected,mode,showroom,world,MAP,track,tour,carHeading,audio,player,vehicles,renderer,graphicsLevel,raceConfig,elapsed,clock,paused,ghostReplay,raceTiming,cup,demo,benchmark,store,touchControls,camera,cameraRig,meshes,renderAlpha,previousPoses,worldLoading,entryScreen,briefing,startedAt,startPending,onlineRecords,onlineRun,finishedRun,driverUI,probe});
globalThis.refreshHUD=()=>updateHUD();
globalThis.countRenderGroundLookups=()=>{const previous=ground;let calls=0;ground=(x,z)=>{calls++;return previous(x,z);};try{render(0);}finally{ground=previous;}return calls;};
globalThis.drive=(seconds,difficulty=.91)=>{for(let step=0;step<seconds*60&&mode==='race';step++){simulationInput=botInput(player,track,difficulty);clock.advance(1/60,(dt,time)=>simulate(dt,time));}};
globalThis.driveToPickup=()=>{for(let step=0;step<150*60&&mode==='race'&&!player.item;step++){simulationInput=botInput(player,track,.91);clock.advance(1/60,(dt,time)=>simulate(dt,time));}};
globalThis.controllerInput=()=>input();
globalThis.captureNetworkState=(session,vehicle)=>{online=session;player=vehicle;return snapshot();};
`;
function frame(milliseconds=1000/60){now+=milliseconds;const queue=rafQueue;rafQueue=[];for(const fn of queue)fn(now);for(const [id,timer] of [...timers])if(timer.due<=now){timers.delete(id);timer.fn();}}
let observedBriefings=0;
async function settle(predicate=()=>!sandbox.inspect().worldLoading,{autoReady=true}={}){for(let index=0;index<100;index++){await Promise.resolve();frame();await Promise.resolve();const state=sandbox.inspect();if(autoReady&&state.briefing?.isOpen){const before=state.clock.time;assert.notEqual(state.mode,'countdown','A local race must wait for its control explanation');frame(250);assert.equal(state.clock.time,before,'Reading the briefing must not advance race time');state.briefing.ready.emit('click');observedBriefings++;await Promise.resolve();}if(predicate())return;}assert.fail('Asynchronous controller operation did not settle');}
async function click(id){const element=registry.get(id);assert(element,'Missing '+id);assert(!element.disabled,'Disabled '+id);const outcomes=element.emit('click');for(const output of outcomes)if(output?.then){let settled=false;output.finally(()=>settled=true);await settle(()=>settled);await output;}}
async function select(id,value){const element=registry.get(id);assert(element,'Missing '+id);element.value=value;element.emit('change');await Promise.resolve();}
function check(value){assert(value,'Controller assertion failed');}
function config({mode='race',laps=1,opponents=0,rules='classic',assist=false}={}){registry.get('race-mode').value=mode;registry.get('laps').value=String(laps);registry.get('opponents').value=String(opponents);registry.get('rules').value=rules;registry.get('auto-gas').checked=assist;registry.get('race-mode').emit('change');}
async function start(){await click('start-solo');await settle(()=>sandbox.inspect().mode==='countdown');frame(3100);assert.equal(sandbox.inspect().mode,'race');}
try{
 vm.runInNewContext(source,sandbox,{timeout:15000});assert.equal(errors.length,0,'Controller initialization errors: '+errors.map(error=>error.join(' ')).join('\n'));
 check(!registry.get('start-solo').disabled);assert.equal(fetches.length,0,'The garage must open without loading village data');assert.equal(sandbox.inspect().world,undefined);assert(!imageRequests.some(url=>/car-(finish|details)\.webp/.test(url)),'The image-backed garage must not request racing finish textures');
 assert.equal(sandbox.inspect().entryScreen.visible,true);check(registry.get('garage').inert);await click('entry-enter');assert.equal(sandbox.inspect().entryScreen.visible,false);check(!registry.get('garage').inert);
 for(let i=0;i<Core.CARS.length;i++){const tab=[...elements].find(element=>element.dataset.car===String(i));tab.emit('click');frame(450);await settle(()=>['ready','fallback'].includes(registry.get('showroom-slot').dataset.vehiclePreviewState)&&registry.get('showroom-slot').dataset.vehiclePreviewCar===Core.CARS[i].id,{autoReady:false});assert.equal(sandbox.inspect().selected,i);assert.equal(registry.get('preview-name').textContent,Core.CARS[i].name);assert.equal(registry.get('stat-speed').textContent,Math.round(Core.CARS[i].max*3.6)+' km/h');assert.equal(sandbox.inspect().showroom.cars.filter(car=>car.visible).length,1);check(sandbox.inspect().showroom.cars[i].visible);const preview=registry.get('showroom-slot').querySelector('.garage-vehicle-canvas');assert(preview&&!preview.hidden&&preview.width>0,'The actual independent garage preview must paint the selected existing model asset');}
 await click('car-choice-next');assert.equal(sandbox.inspect().selected,0,'Compact carousel advances the real persisted selection');await click('car-choice-prev');assert.equal(sandbox.inspect().selected,Core.CARS.length-1);
 await click('next-car');assert.equal(sandbox.inspect().selected,0);await click('previous-car');assert.equal(sandbox.inspect().selected,Core.CARS.length-1);[...elements].find(element=>element.dataset.car==='2').emit('click');const heading=sandbox.inspect().carHeading;await click('rotate-car');check(sandbox.inspect().carHeading>heading);await click('rev-car');check(!sandbox.inspect().audio.muted);
 await click('preview-lights');assert.equal(registry.get('preview-lights').getAttribute('aria-pressed'),'true');assert.equal(sandbox.inspect().showroom.scene.userData.previewLights,true);await click('preview-lights');assert.equal(registry.get('preview-lights').getAttribute('aria-pressed'),'false');
 await click('garage-next');assert.equal(registry.get('garage-course-stage').hidden,false);const trackChoice=[...elements].find(element=>element.dataset.track==='bahnhof');trackChoice.emit('click');assert.equal(registry.get('garage-course-name').textContent,Tracks.TRACKS.find(t=>t.id==='bahnhof').name);await click('track-choice-next');assert.equal(registry.get('garage-course-name').textContent,Tracks.TRACKS.find(t=>t.id==='kraemer').name);await click('track-choice-prev');assert.equal(registry.get('garage-course-name').textContent,Tracks.TRACKS.find(t=>t.id==='bahnhof').name);await click('garage-back');assert.equal(registry.get('garage-course-stage').hidden,true);[...elements].find(element=>element.dataset.track==='lammersdorf').emit('click');
 await select('difficulty','1.06');check(registry.get('option-note').textContent.includes('Sportmodus'));registry.get('auto-gas').checked=false;registry.get('auto-gas').emit('change');check(registry.get('option-note').textContent.includes('Gas mit W'));
 await select('graphics','smooth');assert.equal(sandbox.inspect().graphicsLevel,0);// The smooth profile no longer renders below one pixel per CSS pixel.
 assert.equal(sandbox.inspect().renderer.getPixelRatio(),1);check(sandbox.inspect().renderer.shadowMap.enabled,'Phones keep the cel shadows; they save on range instead');
 await click('show-help');check(!registry.get('dialog').hidden);
 const helpItems=[...elements].find(element=>element.dataset.dialogTab==='help-items');helpItems.emit('click');
 assert.equal(helpItems.getAttribute('aria-selected'),'true');assert.equal([...elements].find(element=>element.dataset.dialogPage==='help-driving').hidden,true);
 await click('help-done');check(registry.get('dialog').hidden);
check(registry.get('dialog').hidden);await click('open-online');check(!registry.get('dialog').hidden);await click('close-dialog');window.BREUER_OFFLINE=false;await click('open-online');
 const onlineJoin=[...elements].find(element=>element.dataset.dialogTab==='online-join');onlineJoin.emit('click');
 assert.equal(onlineJoin.getAttribute('aria-selected'),'true');assert.equal([...elements].find(element=>element.dataset.dialogPage==='online-create').hidden,true);
 await click('close-dialog');window.BREUER_OFFLINE=true;assert.equal(fetches.length,0);
 // First-load failure must keep the menu usable and preserve a cached base.
 failureCourses.add('lammersdorf');config();await click('start-solo');await settle(()=>!registry.get('start-solo').disabled);assert.equal(sandbox.inspect().mode,'garage');check(registry.get('load-status').textContent.includes('erneut'));await click('start-solo');await settle(()=>sandbox.inspect().briefing.isOpen,{autoReady:false});const preRace=sandbox.inspect();check(preRace.player==null);assert.equal(preRace.mode,'garage');assert.equal(preRace.touchControls.available,false);for(let i=0;i<90;i++)frame();assert.equal(preRace.clock.time,0);preRace.briefing.cancelButton.emit('click');await settle(()=>!sandbox.inspect().startPending);assert.equal(sandbox.inspect().mode,'garage');await start();assert.equal(fetches.filter(id=>id==='base').length,1);assert.equal(fetches.filter(id=>id==='lammersdorf').length,2);
 assert.equal(sandbox.inspect().vehicles.length,1);assert.equal(registry.get('field-size').textContent,'/1');check(['next-turn','sector-split','race-mode-label'].every(id=>!registry.get(id).hidden));assert.equal(sandbox.controllerInput().gas,0,'Desktop gas assistant stays off');
 assert(sandbox.inspect().world.crates.every(crate=>!crate.mesh.visible),'Classic crates reappeared after distance visibility updated');
 const mobileGas=[...elements].find(element=>element.dataset.touch==='gas'),mobileBrake=[...elements].find(element=>element.dataset.touch==='brake');mobileGas.emit('pointerdown',{pointerId:7,button:0});assert.equal(sandbox.controllerInput().gas,1);mobileBrake.emit('pointerdown',{pointerId:8,button:0});assert.equal(sandbox.controllerInput().gas,0,'Braking overrides the held accelerator');assert.equal(sandbox.controllerInput().brake,1);mobileBrake.emit('pointerup',{pointerId:8});mobileGas.emit('pointerup',{pointerId:7});assert.equal(sandbox.controllerInput().gas,0);
 const mobileLeft=[...elements].find(element=>element.dataset.touchZone==='left'),mobileRight=[...elements].find(element=>element.dataset.touchZone==='right');
 mobileLeft.emit('pointerdown',{pointerId:11,button:0});assert.equal(sandbox.controllerInput().steer,-1);
 mobileRight.emit('pointerdown',{pointerId:12,button:0});assert.equal(sandbox.controllerInput().steer,0);
 mobileLeft.emit('pointerup',{pointerId:11});assert.equal(sandbox.controllerInput().steer,1);
 mobileRight.emit('pointerup',{pointerId:12});assert.equal(sandbox.controllerInput().steer,0);
 assert.equal(sandbox.inspect().touchControls.layout,'screen');
 query.matches=true;window.screen.orientation={type:'landscape-primary'};window.emit('orientationchange');assert.equal(sandbox.controllerInput().gas,1,'A phone always accelerates automatically, even with a stored desktop gas setting off');mobileBrake.emit('pointerdown',{pointerId:19,button:0});assert.equal(sandbox.controllerInput().gas,0);mobileBrake.emit('pointerup',{pointerId:19});query.matches=false;
 // Receipt from the actual render path must match the visible mesh, including fractional physics frames.
 window.emit('keydown',{code:'ArrowUp',target:registry.get('view')});
 let cameraFrames=0,fractionalCameraFrames=0;
 for(let n=0;n<90;n++){
  const count=sandbox.inspect().renderer.frameCount;frame(13);
  const view=sandbox.inspect(),mesh=view.meshes.get(view.player.id);
  if(view.renderer.frameCount!==count){
   assert.ok(Math.abs(view.cameraRig.previous.x-mesh.position.x)<1e-10,'Camera uses a different physics frame from the visible car');
   assert.ok(Math.abs(view.cameraRig.previous.z-mesh.position.z)<1e-10);
   assert.ok(Math.abs(Core.angleDelta(view.cameraRig.previous.angle-mesh.rotation.y))<1e-10);cameraFrames++;if(view.renderAlpha>0&&view.renderAlpha<1&&Math.hypot(view.player.x-mesh.position.x,view.player.z-mesh.position.z)>1e-5)fractionalCameraFrames++;
  }
 }
 window.emit('keyup',{code:'ArrowUp'});assert.ok(cameraFrames>=25);assert.ok(fractionalCameraFrames>=15,'Regression must actually cover interpolated frames while moving');
 query.matches=true;window.screen.orientation={type:'portrait-primary'};window.emit('orientationchange');check(sandbox.inspect().paused);check(!registry.get('orientation-lock').hidden);const portraitTime=sandbox.inspect().clock.time;for(let frameIndex=0;frameIndex<120;frameIndex++)frame();assert.equal(sandbox.inspect().clock.time,portraitTime);window.screen.orientation.type='landscape-primary';window.emit('orientationchange');check(!sandbox.inspect().paused);check(registry.get('orientation-lock').hidden);query.matches=false;
 await click('pause');const pausedTime=sandbox.inspect().clock.time,pausedRenderStart=sandbox.inspect().renderer.frameCount,pausedSamples=sandbox.inspect().probe.totalFrames;
 for(let frameIndex=0;frameIndex<120;frameIndex++)frame();
 assert.equal(sandbox.inspect().clock.time,pausedTime);assert(sandbox.inspect().renderer.frameCount-pausedRenderStart<=5,'Offline pause must not submit 30/60 full scene renders every second');assert.equal(sandbox.inspect().probe.totalFrames,pausedSamples,'Intentional two-Hz pause frames must not pollute active performance measurements');
 sandbox.refreshHUD();const steadyMutations=domMutations;for(let refresh=0;refresh<100;refresh++)sandbox.refreshHUD();assert.equal(domMutations,steadyMutations,'An unchanged HUD must not mutate its text, classes, attributes or widths');
 const cachedCrates=sandbox.inspect().world.crates.map(crate=>crate.groundY),cachedLookups=sandbox.countRenderGroundLookups();for(const crate of sandbox.inspect().world.crates)delete crate.groundY;
 const uncachedLookups=sandbox.countRenderGroundLookups();sandbox.inspect().world.crates.forEach((crate,index)=>crate.groundY=cachedCrates[index]);assert.equal(uncachedLookups-cachedLookups,cachedCrates.length,'Stationary crate bases must reuse exactly one stored ground height per crate instead of repeating terrain lookups');
 await click('resume');await click('camera-switch');
 const state=sandbox.inspect(),player=state.player,p=state.track.at(95),originalHeight=state.track.heightAt;state.track.heightAt=()=>0;Object.assign(player,{x:p.x+p.dz*7,z:p.z-p.dx*7,angle:p.angle,s:p.s,safeS:p.s,speed:0,progress:95,offroadStillTime:0,resetRemaining:0,zoneCooldown:10});
 for(let frameIndex=0;frameIndex<95;frameIndex++)frame();check(!registry.get('reset-status').hidden);assert.equal(registry.get('reset-seconds').textContent,'1');await click('pause');const remaining=player.offroadStillTime;for(let frameIndex=0;frameIndex<120;frameIndex++)frame();assert.equal(player.offroadStillTime,remaining);await click('resume');for(let frameIndex=0;frameIndex<30;frameIndex++)frame();check(state.track.nearest(player.x,player.z).distance<.001);assert.equal(player.progress,95,'A reset cannot grant race progress');state.track.heightAt=originalHeight;await click('exit-race');
 // A PC driver can genuinely collect and activate an item. The render stub
 // deliberately re-shows nearby meshes, as the production distance pass does.
 config({rules:'action',assist:true});await start();sandbox.driveToPickup();
 const pickupState=sandbox.inspect(),collected=pickupState.world.crates.find(crate=>crate.available>pickupState.elapsed);
 assert.ok(pickupState.player.item&&collected,'An actual PC race never acquired a gadget');const collectedType=pickupState.player.item;
 frame(100);assert.equal(collected.mesh.visible,false,'A consumed crate appeared collectable after the render distance pass');
 assert.equal(registry.get('use-item').disabled,false,'The desktop gadget button did not become usable');assert.equal(registry.get('use-item').dataset.item,collectedType);assert.equal(registry.get('touch-item').dataset.item,collectedType);
 window.emit('keydown',{code:'KeyE',target:registry.get('view')});assert.equal(pickupState.player.item,null,'PC KeyE did not activate the collected gadget');window.emit('keyup',{code:'KeyE'});
 assert.ok(collectedType==='boost'?pickupState.player.boost>0:collectedType==='shield'?pickupState.player.shield>0:true);sandbox.refreshHUD();assert.equal(registry.get('use-item').dataset.item,'none');assert.equal(registry.get('touch-item').dataset.item,'none');
 await click('exit-race');
 await click('show-track');check(!registry.get('dialog').hidden);assert.equal([...elements].filter(element=>element.dataset.poi!==undefined).length,state.MAP.pois.length);await click('poi-next');assert.equal(registry.get('poi-page-number').textContent,'2 / '+Math.ceil(state.MAP.pois.length/4));await click('poi-prev');
 const poi=[...elements].find(element=>element.dataset.poi==='1');poi.emit('click');check(registry.get('poi-detail').innerHTML.includes(state.MAP.pois[1].name));await click('map-tour');await settle(()=>sandbox.inspect().mode==='tour');frame(500);check(renders.at(-1).scene===sandbox.inspect().world.scene);await click('tour-next');const stop=sandbox.inspect().tour.index;await click('tour-prev');assert.equal(sandbox.inspect().tour.index,stop-1);await click('tour-auto');check(!sandbox.inspect().tour.autoplay);await click('end-tour');await click('start-tour');await settle(()=>sandbox.inspect().mode==='tour');frame(500);assert.equal(sandbox.inspect().camera.far,800);await click('end-tour');assert.equal(document.activeElement.id,'garage-heading-car','Return from a tour focuses the visible garage step');
 // Actual driving/checkpoints/finish, with every selected route and five laps.
 for(const meta of Tracks.TRACKS){
  [...elements].find(element=>element.dataset.track===meta.id).emit('click');
  config({laps:2});await start();assert.equal(sandbox.inspect().raceConfig.laps,2);sandbox.drive(350);
  assert.equal(sandbox.inspect().mode,'finished',meta.id+': the controller must finish an actual two-lap race');
  assert.equal(sandbox.inspect().raceTiming.completedLaps,2);assert.equal(sandbox.inspect().raceTiming.sectorTimes.length,6);
  if(meta.id==='lammersdorf'){
   await settle(()=>!!sandbox.inspect().onlineRun.error);assert.equal(sandbox.inspect().mode,'finished','Ranking outage cannot prevent the real race finish');const completed=sandbox.inspect().finishedRun;assert(sandbox.inspect().store.get(completed.config)?.time>0,'The local best survives the online outage');await click('online-result-submit');assert(!registry.get('dialog').hidden);registry.get('driver-name').value='QA Offline Driver';await registry.get('driver-name-form').onsubmit({preventDefault(){}});assert.equal(registry.get('profile-feedback').dataset.state,'error');assert.equal(registry.get('driver-name-save').disabled,false);await click('profile-done');assert(registry.get('dialog').hidden);assert(!registry.get('results').hidden);
  }
  frame(100);assert.equal(registry.get('lap').textContent,'2 / 2');check(!registry.get('results').hidden);await click('result-back');
  config({laps:5});await start();assert.equal(sandbox.inspect().raceConfig.laps,5);check(sandbox.inspect().camera.far<=480);sandbox.drive(150);assert.equal(sandbox.inspect().mode,'race',`${meta.id}: five laps must not finish after two`);sandbox.drive(600);assert.equal(sandbox.inspect().mode,'finished',`${meta.id}: actual driving must finish five laps`);assert.equal(sandbox.inspect().raceTiming.completedLaps,5);assert.equal(sandbox.inspect().raceTiming.sectorTimes.length,15);check(!registry.get('results').hidden);check(registry.get('record').textContent.includes('Bestzeit'));check(registry.get('podium').innerHTML.includes('Du'));await click('again');await settle(()=>sandbox.inspect().mode==='countdown');check(sandbox.inspect().ghostReplay,'Retry uses the recorded ghost');await click('exit-race');
 }
 check(disposedWorlds.includes('lammersdorf')&&disposedWorlds.includes('bahnhof'),'Switching courses disposes the previous world');
 config({mode:'time-trial',laps:1,rules:'action',opponents:5});await start();assert.equal(sandbox.inspect().raceConfig.rules,'classic');assert.equal(sandbox.inspect().vehicles.length,1);sandbox.drive(160);assert.equal(sandbox.inspect().mode,'finished');await click('result-back');
 config({mode:'cup',laps:1,opponents:0});await start();const cupIds=sandbox.inspect().vehicles.map(vehicle=>vehicle.id);assert.equal(cupIds.length,6);
 for(let race=0;race<3;race++){assert.equal(sandbox.inspect().MAP.trackId,Modes.CUP_TRACKS[race]);sandbox.drive(240);assert.equal(sandbox.inspect().mode,'finished');assert.equal(sandbox.inspect().cup.state.index,race+1);if(race<2){if(race===0){await click('result-back');await click('start-solo');check(!registry.get('dialog').hidden);check(registry.get('cup-resume'));await click('cup-resume');}else await click('again');await settle(()=>sandbox.inspect().mode==='countdown');assert.deepEqual(sandbox.inspect().vehicles.map(vehicle=>vehicle.id),cupIds);frame(3100);}}
 assert.equal(sandbox.inspect().cup.state.status,'completed');await click('result-back');
 const previousRecords=[...storage.keys()].filter(key=>key.startsWith('breuer-record:v2:')).length,rankingStartsBeforeDemo=apiRequests.filter(call=>call.path==='/api/runs/start').length;await click('demo-button');await settle(()=>sandbox.inspect().mode==='countdown');frame(3100);assert(sandbox.inspect().demo);sandbox.drive(240);assert.equal(sandbox.inspect().mode,'finished');assert.equal([...storage.keys()].filter(key=>key.startsWith('breuer-record:v2:')).length,previousRecords);assert.equal(apiRequests.filter(call=>call.path==='/api/runs/start').length,rankingStartsBeforeDemo,'A demo never requests an online ranking ticket');check(registry.get('record').textContent.includes('kein Rekord'));await click('result-back');
 // A slow real challenge run and a bronze run must preserve an earlier gold.
 config({mode:'challenge',laps:1});const medalKey='breuer-medal-kraemer-'+sandbox.inspect().selected;storage.set(medalKey,'gold');await start();sandbox.drive(600,.4);assert.equal(sandbox.inspect().mode,'finished');let current=sandbox.inspect(),targets=Modes.challengeTargets(Tracks.TRACKS.find(track=>track.id===current.MAP.trackId),Core.CARS[current.selected],1);assert.equal(Modes.medal(current.player.finish,targets),null);assert.equal(registry.get('challenge-medal').dataset.medal,'finish');assert.equal(storage.get(medalKey),'gold','A slower challenge cannot erase a gold medal');await click('again');await settle(()=>sandbox.inspect().mode==='countdown');frame(3100);sandbox.drive(240,1.05);assert.equal(sandbox.inspect().mode,'finished');current=sandbox.inspect();assert.equal(Modes.medal(current.player.finish,targets),'bronze','Expected bronze run: '+current.player.finish+' / '+JSON.stringify(targets));assert.equal(registry.get('challenge-medal').dataset.medal,'bronze');assert.equal(storage.get(medalKey),'gold','A new bronze medal cannot replace gold');await click('result-back');check(registry.get('garage-awards').textContent.includes('🥇'));
 // The benchmark drives six cars and ten laps without publishing a race record.
 const beforeBenchmark=[...storage.keys()].filter(key=>key.startsWith('breuer-record:v2:')).length,rankingStartsBeforeBenchmark=apiRequests.filter(call=>call.path==='/api/runs/start').length;await click('benchmark-button');assert.equal(sandbox.inspect().mode,'countdown');assert.equal(sandbox.inspect().vehicles.length,6);assert.equal(sandbox.inspect().raceConfig.laps,10);frame(3100);for(let index=0;index<61*60&&sandbox.inspect().benchmark;index++)frame();assert.equal(sandbox.inspect().benchmark,null);check(!registry.get('dialog').hidden);check(registry.get('dialog-content').innerHTML.includes('Leistungsmessung'));assert.equal([...storage.keys()].filter(key=>key.startsWith('breuer-record:v2:')).length,beforeBenchmark);assert.equal(apiRequests.filter(call=>call.path==='/api/runs/start').length,rankingStartsBeforeBenchmark,'A measurement never requests an online ranking ticket');
 // A completed measurement cannot be resumed as a timed race, and the pause
 // overlay must not cover its report or download buttons.
 assert.equal(sandbox.inspect().mode,'garage');assert.equal(sandbox.inspect().paused,false);assert.equal(sandbox.inspect().player,null);check(registry.get('pause-screen').hidden);await click('benchmark-back');assert.equal(sandbox.inspect().mode,'garage');check(registry.get('dialog').hidden);
 // The actual network serializer must capture a finish once and retain it
 // while the delivery channel catches up several seconds later.
 const sampleClock=new NetworkSampleClock({startAt:Date.now()-25000,now:()=>now});
 const session={sequence:0,stateClock:sampleClock,finishRaceTime:null};
 const finishedCar={x:0,z:0,angle:0,speed:0,progress:1200,gate:12,finish:null,shield:0,boost:0,spin:0,drifting:false,id:'network-test'};
 const underway=sandbox.captureNetworkState(session,finishedCar);
 assert.equal(underway.finishRaceTime,undefined);assert.equal(underway.finish,null);
 finishedCar.finish=25;
 const firstFinish=sandbox.captureNetworkState(session,finishedCar);
 now+=6000;
 const retriedFinish=sandbox.captureNetworkState(session,finishedCar);
 assert.equal(retriedFinish.finish,25);assert.equal(retriedFinish.finishRaceTime,firstFinish.finishRaceTime);
 assert.ok(Math.abs(retriedFinish.raceTime-firstFinish.raceTime-6)<1e-9);
 assert.equal(retriedFinish.sequence,firstFinish.sequence+1);
 for(const name of ['car-finish','car-details'])assert.equal(imageRequests.filter(url=>url.endsWith(name+'.webp')).length,1,'Finish images are requested once at the first world, never per car/course/restart');
 console.log('PASS Actual controller: lazy garage/finish textures, car selection/rotation/audio/options/dialogs, failed-load retry, touch gas, map/tour, sparse offline pause, zero unchanged HUD mutations, cached crate heights, item/medal datasets, stationary offroad reset, rendered-pose camera, all courses with two and five real laps, ghosts, solo rules, persistent three-course Cup, demo without records, gold-medal preservation, benchmark flow and immutable delayed online finish');
 assert.ok(observedBriefings>=14,'Every player restart, Cup race and selected-course start must explain the controls again');
 console.log('Controller DOM and renderer are mocked; these checks make no browser/device FPS claim.');
}finally{globalThis.fetch=previousFetch;if(previousImage===undefined)delete globalThis.Image;else globalThis.Image=previousImage;}
