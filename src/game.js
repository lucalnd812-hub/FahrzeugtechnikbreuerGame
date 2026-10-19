import * as THREE from 'three';
import {TRACKS,loadTrack,sampleGround} from './tracks.js';
import {normalizeRaceConfig,DEFAULT_RACE_CONFIG} from './race-config.js';
import {TouchControls} from './touch-controls.js';
import {StartBriefing} from './start-briefing.js';
import {EntryScreen} from './entry-screen.js';
import {HANDLING_VERSION} from './car-catalog.js';
import {SimulationClock,interpolatedPose} from './simulation-clock.js';
import {ChaseCameraRig} from './chase-camera.js';
import {surfaceHeightAt,makeOilDecal} from './road-surface.js';
import {RecordStore,GhostRecorder,GhostReplay,RaceTiming,BreuerCup,challengeTargets,medalTargets,medal,bestMedal,PerformanceProbe} from './race-modes.js';
import {Track,CARS,makeVehicle,stepVehicle,botInput,collideCars,resetVehicle,useItem,collectPickup,pickupAvailable,ranking,timeText,clamp,angleDelta} from './race-core.js';
import {makeWorld,makeCar,animateCar,setCarQuality,disposeScene} from './world.js';
import {FrameQuality} from './performance.js';
import {LightweightCanvasRenderer} from './canvas-renderer.js';
import {NetworkSampleClock} from './network-clock.js';
import {createGarageFlow} from './garage-flow.js';
import {makePremiumShowroom} from './premium-showroom.js';
import {frameShowroom} from './showroom-framing.js';
import {RacingAudio} from './racing-audio.js';
import {drawGarageCourse} from './garage-course-preview.js';
import {OnlineRecords} from './online-records.js';
import {createDriverProfileUI} from './driver-profile-ui.js';
import {createGarageCarousel} from './garage-carousel.js';
import {createGarageVehiclePreview} from './garage-vehicle-preview.js';
import {installInteractionGuard} from './interaction-guard.js';
import {RenderCadence} from './render-cadence.js';
import {loadVehicleFinishes} from './vehicle-finish.js';
import {createMiniMap,drawRaceMinimap} from './minimap.js';
import {animateItemBox} from './item-box.js';
import {loadVehicleAssets} from './vehicle-assets.js';
import {ComicPost} from './comic-post.js';
import {installToonShading} from './toon-shading.js';
// Cel shading for every lit material; must run before the first shader compiles.
installToonShading();

const $=id=>document.getElementById(id),$$=s=>[...document.querySelectorAll(s)];
installInteractionGuard(document);
let MAP=null,track=null;
const keys=new Set(),touch=new Set(),meshes=new Map();
// QA only: ?debug exposes the live scene objects for in-browser inspection.
if(new URLSearchParams(location.search).has('debug'))globalThis.__breuerDebug={get world(){return world;},meshes,get player(){return player;},get comic(){return comic;},get renderer(){return renderer;}};
const itemNames={boost:'NITRO',shield:'SCHUTZSCHILD',oil:'ÖLSPUR'};
const save={get(key){try{return localStorage.getItem(key);}catch{return null;}},set(key,value){try{localStorage.setItem(key,value);}catch{}}};
const escapeHTML=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
let renderer,camera,world,player,vehicles=[],oils=[],oilMeshes=new Map(),selected=Number(save.get('breuer-car')||0),mode='garage',paused=false,pauseAt=0,startedAt=0,elapsed=0,lastFrame=0,accumulator=0,online=null,pollTimer=null,cameraTop=false,bannerUntil=0,streetUpdated=-1,countNumber='',statusErrors=0,lastFocus=null;
let showroom,garageCamera,carHeading=-.65,displayHeading=-.65,carTransition=0,revUntil=0,dragging=null,previewLights=false,tour=null,mapPoi=0,hudMapAt=0;
const mapCache=new WeakMap();
const minimapUI=createMiniMap({root:$('minimap-panel'),onInteract:()=>{keys.clear();touchControls?.clear();},onChange:expanded=>{$('map-open')?.setAttribute('aria-expanded',String(expanded));hudMapAt=-Infinity;if(MAP&&player&&!$('hud').hidden)drawMap($('minimap'),vehicles);}});
const frameQuality=new FrameQuality(),cameraRig=new ChaseCameraRig(),cameraLook=new THREE.Vector3(),worldCadence=new RenderCadence();
const hudNodes=new Map();
let worldRenderDirty=true,probeNeedsBaseline=true,comic=null;
// World frames get the comic finish (ink outlines and grade); the 2D fallback renders as before.
function renderWorld(){if(comic)comic.render(world.scene,camera);else renderer.render(world.scene,camera);}
let graphics=save.get('breuer-graphics')||'auto',graphicsLevel=0,hudAt=-1,shadowAt=-1,simulationInput=null;
selected=Number.isFinite(selected)?clamp(Math.trunc(selected),0,CARS.length-1):0;
const coarse=matchMedia('(pointer: coarse)').matches;
const store=new RecordStore({getItem:key=>save.get(key),setItem:(key,value)=>{localStorage.setItem(key,value);}});
const cup=new BreuerCup({getItem:key=>save.get(key),setItem:(key,value)=>localStorage.setItem(key,value),removeItem:key=>{try{localStorage.removeItem(key);}catch{}}});
const clock=new SimulationClock(),probe=new PerformanceProbe(),previousPoses=new Map();
let raceConfig=normalizeRaceConfig(DEFAULT_RACE_CONFIG),trackId=save.get('breuer-track')||'lammersdorf',worldLoading=null,loadSerial=0,demo=false,renderAlpha=1,ghostMesh=null,ghostReplay=null,ghostRecorder=null,raceTiming=null,raceRecordConfig=null,benchmark=null,garageRect=null,garageDirty=true,lastRenderAt=0,lastProbeAt=0,portraitPaused=false,gamepadItem=false,nextCupTrack=null;
if(!TRACKS.some(t=>t.id===trackId))trackId='lammersdorf';
let touchControls=null,environment=null,garageFlow=null,entryScreen=null,briefing=null,startPending=false,raceRequest=0,garageCarousel=null,garageVehiclePreview=null,driverUI=null,onlineRun=null,finishedRun=null;
const onlineRecords=new OnlineRecords({request:api,storage:{getItem:key=>save.get(key),setItem:(key,value)=>localStorage.setItem(key,value)}});
const mobileLayout=()=>matchMedia('(any-pointer: coarse), (max-width: 1180px) and (max-height: 500px)').matches;
function trackMeta(id=trackId){return TRACKS.find(t=>t.id===id)||TRACKS[0];}
function syncGaragePreview(){const stage=$('garage-course-stage'),active=$('garage').getAttribute('data-setup-current')==='track'&&$('garage').getAttribute('data-garage-view')==='setup';stage.hidden=!active;if(active){const meta=trackMeta();$('garage-course-name').textContent=document.querySelector('.track-tab[aria-pressed=true] strong')?.textContent||meta.name;$('garage-course-distance').textContent=(meta.length/1000).toFixed(2).replace('.',',')+' km pro Runde · Start/Ziel bei Breuer';drawGarageCourse($('garage-course-preview'),meta);}}
function readConfig(){const config=normalizeRaceConfig({trackId,laps:Number($('laps')?.value||2),opponents:Number($('opponents')?.value||5),difficulty:Number($('difficulty').value),rules:$('rules')?.value||'action',mode:$('race-mode')?.value||'race',assist:mobileLayout()||$('auto-gas').checked,autoDrift:$('auto-drift')?.checked!==false});if(config.mode==='cup')config.opponents=5;return config;}
function recordConfig(config=raceConfig,network=false){return {...config,raceType:network?'online':'solo',car:selected,trackVersion:trackMeta(config.trackId).version,handlingVersion:HANDLING_VERSION,assists:{autoGas:mobileLayout()||config.assist,autoDrift:config.autoDrift}};}
function updateRaceOptions(){
 raceConfig=readConfig();const meta=trackMeta(),names={'race':'Einzelrennen','time-trial':'Zeitfahren','cup':'Breuer-Cup','challenge':'Max-Challenge'};
 if($('race-summary'))$('race-summary').textContent=`${names[raceConfig.mode]} · ${raceConfig.laps} ${raceConfig.laps===1?'Runde':'Runden'} · ${raceConfig.opponents} Gegner · ${raceConfig.rules==='classic'?'Klassisch':'Action'}`;
 if($('mode-note'))$('mode-note').textContent={race:'Dein Rennen, deine Regeln. Max steht schon an der Startlinie.','time-trial':'Freie Strecke. Fahre gegen die Uhr und den Geist deiner Bestzeit.',cup:'Drei Kurse, eine Gesamtwertung. Jeder Platz bringt Punkte.',challenge:'Schlage Max’ Bronze-, Silber- und Goldzeiten.'}[raceConfig.mode];
 if($('course-caption'))$('course-caption').textContent=meta.description;
 if($('opponents'))$('opponents').disabled=['time-trial','challenge','cup'].includes(raceConfig.mode);if(raceConfig.mode==='cup')$('opponents').value='5';
 if(['time-trial','challenge'].includes(raceConfig.mode)&&$('opponents'))$('opponents').value='0';
 if($('laps'))$('laps').disabled=false;
 if($('rules'))$('rules').disabled=['time-trial','challenge'].includes(raceConfig.mode);
 save.set('breuer-race-config',JSON.stringify(raceConfig));updateRecord();
 touchControls?.setOptions({sensitivity:Number($('steering-sensitivity')?.value||1),enabled:mode==='race'||mode==='countdown'});
 garageFlow?.refresh();
}
function chooseTrack(id){trackId=id;save.set('breuer-track',id);$$('[data-track]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.track===id)));updateRaceOptions();syncGaragePreview();notify(trackMeta().name+' ausgewählt.');}


const audio=new RacingAudio({getCar:()=>selected,assetBase:'/audio/',onMuteChange:muted=>{
 $$('.sound-toggle').forEach(b=>{b.textContent=muted?'Ton aus':'Ton an';b.setAttribute('aria-pressed',String(!muted));});
 notify(muted?'Ton ausgeschaltet.':'Ton an. Hör dir deine Karre an!');
}});

function chooseCar(n){
 selected=((Math.trunc(n)%CARS.length)+CARS.length)%CARS.length;save.set('breuer-car',selected);const spec=CARS[selected];carTransition=reduced?0:1;
 // Choosing a car starts it: a short blip of revs (sound only when it is on).
 revUntil=reduced?0:performance.now()+1100;
 $$('[data-car]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.car)===selected)));
 $('car-note').textContent=["Der schnelle ;-) · Gelb, spritzig und bereit für Max’ Heimstrecke.",'Der Kurvenkünstler. AC Schnitzer, viel Grip und ein sattes Fahrgefühl.','Der Procar. Breit, tief und bereit für die lange Gerade.','Der M2 Competition. Grauer Lack, satte Kraft und lebendige Drifts.','Der GT3 RS. Blauer Lack, großer Flügel und Grip bis zur Ziellinie.'][selected];
 $('preview-name').textContent=spec.name;$('preview-tag').textContent=spec.tag;
 $('stat-speed').textContent=Math.round(spec.max*3.6)+' km/h';$('stat-accel').textContent=[9,8,7,9,9][selected]+' / 10';$('stat-grip').textContent=[8,10,9,9,10][selected]+' / 10';
 $('bar-speed').style.width=(spec.max/38*100)+'%';$('bar-accel').style.width=[90,80,70,90,90][selected]+'%';$('bar-grip').style.width=[80,100,90,90,100][selected]+'%';
 if(showroom)showroom.cars.forEach((car,i)=>car.visible=i===selected);garageDirty=true;updateRecord();garageFlow?.refresh();
}
function updateRecord(){
 const config=recordConfig(readConfig()),best=store.get(config);$('local-record').textContent=best?.time?'Deine Bestzeit: '+timeText(best.time):`${(trackMeta().length/1000).toFixed(2).replace('.',',')} km pro Runde · Start/Ziel bei Breuer`;
 if($('garage-awards')){const awards=TRACKS.map(t=>({name:t.shortName||t.name,award:save.get('breuer-medal-'+t.id+'-'+selected)})).filter(t=>['gold','silver','bronze'].includes(t.award));$('garage-awards').hidden=!awards.length;$('garage-awards').textContent=awards.map(t=>({gold:'🥇',silver:'🥈',bronze:'🥉'}[t.award])+' '+t.name).join(' · ');}
 if($('medal-targets')){const target=medalTargets(trackMeta(),{laps:config.laps});$('medal-targets').innerHTML=['gold','silver','bronze'].map((key,index)=>`<div data-medal="${key}">${['Gold','Silber','Bronze'][index]}<strong>${timeText(target[key])}</strong></div>`).join('');$('medal-targets').setAttribute('aria-label',`Medaillenziele für ${config.laps} ${config.laps===1?'Runde':'Runden'}: Gold ${timeText(target.gold)}, Silber ${timeText(target.silver)}, Bronze ${timeText(target.bronze)}`);}
}
$$('[data-car]').forEach(b=>b.addEventListener('click',()=>chooseCar(Number(b.dataset.car))));chooseCar(selected);
$('previous-car').onclick=()=>chooseCar(selected-1);$('next-car').onclick=()=>chooseCar(selected+1);
$('rotate-car').onclick=()=>{garageDirty=true;carHeading+=Math.PI/2;notify('Einmal von der anderen Seite. Ziehen geht auch.');};
$('preview-lights').onclick=()=>{previewLights=!previewLights;showroom?.setLights?.(previewLights);$('preview-lights').setAttribute('aria-pressed',String(previewLights));$('garage').setAttribute('data-preview-lights',previewLights?'on':'off');$('garage-art').setAttribute('data-lights',previewLights?'on':'off');garageDirty=true;notify(previewLights?'Scheinwerfer an. Bereit für den Renntag.':'Scheinwerfer aus.');};
$('rev-car').onclick=()=>{garageDirty=true;if(audio.muted)audio.toggle();audio.unlock();revUntil=performance.now()+1800;notify(CARS[selected].short+' gibt Gas!');};
document.addEventListener('click',e=>{const button=e.target.closest('button');if(!button||button.disabled||button.dataset.touch)return;button.classList.add('clicked');setTimeout(()=>button.classList.remove('clicked'),320);if(!button.classList.contains('sound-toggle')&&!audio.muted){audio.unlock();audio.play(button.dataset.car!==undefined?'ui-select':button.id==='garage-back'||button.id==='settings-done'?'ui-back':'ui-click');}});
$('showroom-slot').addEventListener('pointerdown',e=>{dragging={id:e.pointerId,x:e.clientX,heading:carHeading};$('showroom-slot').setPointerCapture(e.pointerId);});
$('showroom-slot').addEventListener('pointermove',e=>{if(dragging?.id===e.pointerId)carHeading=dragging.heading+(e.clientX-dragging.x)*.012;});
for(const event of ['pointerup','pointercancel','lostpointercapture'])$('showroom-slot').addEventListener(event,()=>dragging=null);
if(['.76','.91','1.06'].includes(save.get('breuer-difficulty')))$('difficulty').value=save.get('breuer-difficulty');
if(save.get('breuer-assist')!==null)$('auto-gas').checked=save.get('breuer-assist')==='true';
function optionFeedback(){const level={'.76':'Entspannt einfahren. Die Gegner lassen dir Luft.','.91':'Ein faires Rennen. Die Gegner bleiben dran.','1.06':'Sportmodus. Max und die anderen geben richtig Gas.'}[$('difficulty').value];$('option-note').textContent=level+(mobileLayout()||$('auto-gas').checked?' Gas automatisch.':' Gas mit W / ↑.');save.set('breuer-difficulty',$('difficulty').value);save.set('breuer-assist',$('auto-gas').checked);raceConfig=readConfig();updateRecord();if(renderer)updateRaceOptions();}
$('difficulty').onchange=optionFeedback;$('auto-gas').onchange=optionFeedback;optionFeedback();
$$('.sound-toggle').forEach(b=>b.addEventListener('click',()=>audio.toggle()));
$$('.fullscreen').forEach(b=>b.addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();notify(document.fullscreenElement?'Vollbild aktiviert.':'Zurück im Fenster.');}catch{notify('Vollbild wird in dieser Einbettung nicht unterstützt.');}}));
document.addEventListener('fullscreenchange',()=>$$('.fullscreen').forEach(b=>b.textContent=document.fullscreenElement?'Vollbild aus':'Vollbild'));

function notify(text,duration=2.2){$('banner').textContent=text;bannerUntil=performance.now()+duration*1000;if(mode==='garage'){$('load-status').textContent=text;setTimeout(()=>{if($('load-status').textContent===text)$('load-status').textContent='';},duration*1000);}}
function dialog(html,wide=false,layout=false){lastFocus=document.activeElement;$('dialog-content').classList.toggle('wide',wide);$('dialog-content').classList.toggle('dialog-layout',layout);$('dialog-content').innerHTML=html;$('dialog').hidden=false;$('pause-screen').hidden=true;const close=$('close-dialog');if(close)close.onclick=()=>closeDialog();setTimeout(()=>$('dialog-content').querySelector('input,button')?.focus(),0);}
function closeDialog(leave=true){$('dialog').hidden=true;if(leave&&online&&!online.started)leaveRoom();if(paused&&(mode==='race'||mode==='countdown')){$('pause-screen').hidden=false;$('resume').focus();}else lastFocus?.focus();}
function closeHead(){return '<button id="close-dialog" class="close" aria-label="Dialog schließen">Schließen</button>';}
function dialogHead(title){return `<header class="dialog-formhead"><h2 id="dialog-title">${escapeHTML(title)}</h2>${closeHead()}</header>`;}
function bindDialogTabs(initial){
 const tabs=$$('[data-dialog-tab]'),pages=$$('[data-dialog-page]');
 const show=name=>{for(const tab of tabs){const active=tab.dataset.dialogTab===name;tab.setAttribute('aria-selected',String(active));tab.setAttribute('tabindex',active?'0':'-1');}for(const page of pages){page.hidden=page.dataset.dialogPage!==name;page.inert=page.hidden;}};
 for(const [index,tab]of tabs.entries()){tab.onclick=()=>show(tab.dataset.dialogTab);tab.addEventListener('keydown',event=>{const direction={ArrowLeft:-1,ArrowRight:1}[event.key];if(direction){event.preventDefault();const next=tabs[(index+direction+tabs.length)%tabs.length];show(next.dataset.dialogTab);next.focus({preventScroll:true});}});}
 show(initial);
}

function mapTransform(canvas,large=false){
 if(!MAP)return {w:500,h:300,scale:1,X:x=>x,Z:z=>z};
 const pts=large?[...MAP.route,...MAP.pois.map(p=>p.point)]:MAP.route;
 const bounds=pts.reduce((b,p)=>[Math.min(b[0],p[0]),Math.max(b[1],p[0]),Math.min(b[2],p[1]),Math.max(b[3],p[1])],[Infinity,-Infinity,Infinity,-Infinity]);
 const w=canvas.clientWidth||500,h=canvas.clientHeight||300,pad=large?32:16,scale=Math.min((w-pad*2)/(bounds[1]-bounds[0]),(h-pad*2)/(bounds[3]-bounds[2]));
 return {w,h,scale,X:x=>(x-(bounds[0]+bounds[1])/2)*scale+w/2,Z:z=>(z-(bounds[2]+bounds[3])/2)*scale+h/2};
}
function drawMap(canvas,drivers=[],large=false){
 if(!MAP)return;
 if(!large)return drawRaceMinimap(canvas,{map:MAP,track,drivers,player,cache:mapCache,pixelRatio:devicePixelRatio||1,local:!minimapUI?.expanded});
 const {w,h,scale,X,Z}=mapTransform(canvas,large),dpr=Math.min(devicePixelRatio||1,2);
 if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);mapCache.delete(canvas);}
 let cached=mapCache.get(canvas);
 if(!cached){
  const base=document.createElement('canvas');base.width=canvas.width;base.height=canvas.height;const c=base.getContext('2d');c.scale(dpr,dpr);c.fillStyle='#e8eddb';c.fillRect(0,0,w,h);
  c.fillStyle='#c8cbbf';for(const b of MAP.buildings){c.beginPath();b.points.forEach((p,i)=>i?c.lineTo(X(p[0]),Z(p[1])):c.moveTo(X(p[0]),Z(p[1])));c.closePath();c.fill();}
  c.lineCap=c.lineJoin='round';for(const r of MAP.roads){c.strokeStyle='#fffdf4';c.lineWidth=Math.max(large?2:1,r.width*scale);c.beginPath();r.points.forEach((p,i)=>i?c.lineTo(X(p[0]),Z(p[1])):c.moveTo(X(p[0]),Z(p[1])));c.stroke();}
  for(const [color,width] of [['#fff9f1',large?9:6],['#df2c43',large?5:3]]){c.strokeStyle=color;c.lineWidth=width;c.beginPath();MAP.route.forEach((p,i)=>i?c.lineTo(X(p[0]),Z(p[1])):c.moveTo(X(p[0]),Z(p[1])));c.stroke();}
  c.fillStyle='#b42339';for(let s=70;s<track.length;s+=155){const p=track.at(s);c.save();c.translate(X(p.x),Z(p.z));c.rotate(-p.angle);c.beginPath();c.moveTo(0,5);c.lineTo(-3,-2);c.lineTo(3,-2);c.closePath();c.fill();c.restore();}
  c.fillStyle='#252632';c.font='bold 10px Arial';c.fillText('N ↑',w-30,17);
  const st=MAP.start;c.fillStyle='#28292d';c.fillRect(X(st[0])-4,Z(st[1])-4,8,8);c.fillStyle='#fff9ec';c.fillRect(X(st[0])-4,Z(st[1])-4,4,4);c.fillRect(X(st[0]),Z(st[1]),4,4);
  if(large){c.font='10px Arial';c.fillStyle='#72675f';for(const name of MAP.routeNames){const r=MAP.roads.filter(r=>r.name===name).sort((a,b)=>b.points.length-a.points.length)[0];if(r){const p=r.points[Math.floor(r.points.length/2)];c.fillText(name,X(p[0])+5,Z(p[1])-8);}}}
  cached={base};mapCache.set(canvas,cached);
 }
 const ctx=canvas.getContext('2d');ctx.setTransform(1,0,0,1,0,0);ctx.drawImage(cached.base,0,0);ctx.setTransform(dpr,0,0,dpr,0,0);
 if(large){MAP.pois.forEach((p,i)=>{const active=i===mapPoi;ctx.fillStyle=active?'#e12c42':'#282933';ctx.strokeStyle='#fff9ee';ctx.lineWidth=2;ctx.beginPath();ctx.arc(X(p.point[0]),Z(p.point[1]),active?11:8,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#ffffff';ctx.font='bold 10px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(i+1,X(p.point[0]),Z(p.point[1]));});ctx.textAlign='left';ctx.textBaseline='alphabetic';}
 for(const v of drivers){ctx.save();ctx.translate(X(v.x),Z(v.z));if(v===player){ctx.rotate(-v.angle);ctx.fillStyle='#ffe047';ctx.strokeStyle='#302333';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(0,6);ctx.lineTo(-4,-4);ctx.lineTo(4,-4);ctx.closePath();ctx.fill();ctx.stroke();}else{ctx.fillStyle='#1e5489';ctx.beginPath();ctx.arc(0,0,2.7,0,Math.PI*2);ctx.fill();}ctx.restore();}
}
function pickMapPoi(n){mapPoi=Math.max(0,Math.min(MAP.pois.length-1,n));const p=MAP.pois[mapPoi],page=Math.floor(mapPoi/4);$$('[data-poi]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.poi)===mapPoi)));$$('[data-poi-page]').forEach(panel=>{panel.hidden=Number(panel.dataset.poiPage)!==page;panel.inert=panel.hidden;});if($('poi-page-number'))$('poi-page-number').textContent=`${page+1} / ${Math.ceil(MAP.pois.length/4)}`;if($('poi-prev'))$('poi-prev').disabled=page===0;if($('poi-next'))$('poi-next').disabled=page===Math.ceil(MAP.pois.length/4)-1;$('poi-detail').innerHTML='<b>'+escapeHTML(p.name)+'</b> · '+escapeHTML(p.address)+'<br>'+escapeHTML(p.description);drawMap($('track-preview'),[],true);}
$('garage-course-map').onclick=()=>$('show-track').click();
$('show-track').onclick=async()=>{
 if(!await ensureWorld(trackId))return;
 const pages=Array.from({length:Math.ceil(MAP.pois.length/4)},(_,page)=>`<div class="poi-page" data-poi-page="${page}">${MAP.pois.slice(page*4,page*4+4).map((p,i)=>`<button data-poi="${page*4+i}" aria-pressed="false"><b>${page*4+i+1}</b>${escapeHTML(p.name)}</button>`).join('')}</div>`).join('');
 dialog(`${dialogHead(trackMeta().name)}<div class="dialog-pages map-dialog-body map-layout"><canvas id="track-preview" class="track-preview" aria-label="Anklickbare Karte des echten Rundkurses"></canvas><aside class="map-pois map-aside"><div class="poi-pagination"><button id="poi-prev" class="secondary" aria-label="Vorherige Orte">‹</button><span id="poi-page-number"></span><button id="poi-next" class="secondary" aria-label="Weitere Orte">›</button></div><div class="poi-list">${pages}</div><p id="poi-detail" class="poi-detail" aria-live="polite"></p></aside></div><footer class="dialog-footer"><p class="map-brief map-facts">${(track.length/1000).toFixed(2).replace('.',',')} km · ${readConfig().laps} Runden · ${readConfig().opponents+1} Autos · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a></p><button id="map-tour" class="primary">Diesen Ort in 3D ansehen ↗</button></footer>`,true,true);
 $('poi-prev').onclick=()=>pickMapPoi(Math.floor(mapPoi/4)*4-4);$('poi-next').onclick=()=>pickMapPoi(Math.floor(mapPoi/4)*4+4);
 $$('[data-poi]').forEach(b=>b.onclick=()=>pickMapPoi(Number(b.dataset.poi)));pickMapPoi(mapPoi);
 $('map-tour').onclick=()=>{closeDialog();startTour(mapPoi+1);};
 $('track-preview').onclick=e=>{const {X,Z}=mapTransform($('track-preview'),true),r=$('track-preview').getBoundingClientRect(),x=e.clientX-r.left,z=e.clientY-r.top;let nearest=0,dist=Infinity;MAP.pois.forEach((p,i)=>{const d=Math.hypot(X(p.point[0])-x,Z(p.point[1])-z);if(d<dist){dist=d;nearest=i;}});if(dist<30)pickMapPoi(nearest);};
};

let tourStops=[];
function buildTourStops(){return [{name:trackMeta().name,description:'Dein Kurs auf kartierten Dorfstraßen. Die roten und weißen Randsteine zeigen den Weg.',look:[5,0,-135],eye:[100,310,150]},...MAP.pois.map(p=>{
 const [x,z]=p.point;let eye=[x+29,18,z+29],look=[x,3,z];
 if(p.id==='breuer'){eye=[10,13,12];look=[3,3,-1];}
 if(p.id==='church'){eye=[45,29,-9];look=[83,15,-48];}
 if(p.id==='bakery'){eye=[171,19,-124];look=[212,5,-78];}
 if(p.id==='roundabout'){eye=[225,39,-82];look=[187,1,-116];}
 return {name:p.name,description:p.description,look,eye};
})];}
function tourStop(n){if(!tour)return;tour.index=(n+tourStops.length)%tourStops.length;tour.next=performance.now()+7000;const spot=tourStops[tour.index];$('tour-title').textContent=spot.name;$('tour-description').textContent=spot.description;$('tour-step').textContent=(tour.index+1)+' / '+tourStops.length;}
async function startTour(n=0){if(!await ensureWorld(trackId))return;if(!renderer){notify('Die 3D-Strecke ist noch nicht bereit.');return;}mode='tour';worldCadence.reset();worldRenderDirty=true;probeNeedsBaseline=true;tour={index:0,autoplay:!reduced,next:0};$('garage').hidden=true;$('hud').hidden=true;$('tour-ui').hidden=false;camera.position.set(...tourStops[n].eye);tourStop(n);$('tour-auto').textContent=tour.autoplay?'Rundflug pausieren':'Rundflug starten';$('end-tour').focus();}
$('start-tour').onclick=()=>startTour();$('end-tour').onclick=()=>backToGarage();$('tour-prev').onclick=()=>tourStop(tour.index-1);$('tour-next').onclick=()=>tourStop(tour.index+1);$('tour-auto').onclick=()=>{tour.autoplay=!tour.autoplay;tour.next=performance.now()+7000;$('tour-auto').textContent=tour.autoplay?'Rundflug pausieren':'Rundflug starten';};
function renderTour(dt,time){
 if(tour.autoplay&&performance.now()>tour.next)tourStop(tour.index+1);world.courseHighlight.visible=tour.index===0;const spot=tourStops[tour.index],target=new THREE.Vector3(...spot.eye),look=new THREE.Vector3(...spot.look);
 if(!reduced){target.x+=Math.sin(time*.2)*1.4;target.z+=Math.cos(time*.2)*1.4;}camera.position.lerp(target,reduced?1:1-Math.exp(-dt*1.4));camera.lookAt(look);camera.fov=55;camera.far=tour.index===0?800:[260,360,480][graphicsLevel];camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
 renderer.setFocus?.(null);renderer.setVehicles?.([]);renderer.setTour?.(spot.look);world.sun.position.set(look.x-115,92,look.z+75);world.sun.target.position.set(look.x,0,look.z);world.animate(time,reduced,camera.position);world.updateVisibility(camera,graphicsLevel);prepareShadows(time);renderer.setScissorTest(false);renderer.setViewport(0,0,innerWidth,innerHeight);renderWorld();audio.update(0,false);
}
function renderGarage(dt,time){
 if(garageVehiclePreview){
  renderer.setScissorTest(false);renderer.setViewport(0,0,innerWidth,innerHeight);renderer.setClearColor(0x182536,0);renderer.clear();
  const visible=$('garage-course-stage').hidden&&!entryScreen?.visible;displayHeading+=(carHeading-displayHeading)*(reduced?1:1-Math.exp(-dt*9));carTransition=Math.max(0,carTransition-dt*3);
  const rev=Math.max(0,(revUntil-performance.now())/1800);garageVehiclePreview.update({car:selected,heading:displayHeading,rev,lights:previewLights,visible});audio.update(visible&&rev>0?8+Math.sin((1-rev)*Math.PI)*26:0,visible&&rev>0);$('garage').setAttribute('data-preview-rev',String(rev>0));garageDirty=false;return;
 }
 renderer.setScissorTest(false);renderer.setViewport(0,0,innerWidth,innerHeight);renderer.setClearColor(0x182536,0);renderer.clear();if(!$('garage-course-stage').hidden){garageDirty=false;audio.update(0,false);return;}if(garageDirty||!garageRect){garageRect=$('showroom-slot').getBoundingClientRect();garageDirty=false;}const r=garageRect;if(r.width<=0||r.height<=0||r.bottom<0||r.top>innerHeight){audio.update(0,false);return;}
 const car=showroom.cars[selected];showroom.cars.forEach((c,i)=>c.visible=i===selected);carTransition=Math.max(0,carTransition-dt*3);displayHeading+=(carHeading-displayHeading)*(reduced?1:1-Math.exp(-dt*9));car.rotation.y=displayHeading;car.position.x=carTransition*1.2;
 const rev=Math.max(0,(revUntil-performance.now())/1800),speed=rev>0?(8+Math.sin((1-rev)*Math.PI)*26):0;car.position.y=.025+(!reduced&&rev>0?Math.sin(time*45)*.012:0);animateCar(car,0,0,time);audio.update(speed,rev>0);$('garage').setAttribute('data-preview-rev',String(rev>0));
 frameShowroom(garageCamera,car,r.width/r.height);renderer.setViewport(r.left,innerHeight-r.bottom,r.width,r.height);renderer.setScissor(r.left,innerHeight-r.bottom,r.width,r.height);renderer.setScissorTest(true);renderer.render(showroom.scene,garageCamera);renderer.setScissorTest(false);
}

$('show-help').onclick=()=>{
 dialog(`${dialogHead('So fährst du.')}<nav class="dialog-tabs" role="tablist" aria-label="Spielhilfe"><button role="tab" data-dialog-tab="help-driving">Fahren</button><button role="tab" data-dialog-tab="help-items">Items</button><button role="tab" data-dialog-tab="help-course">Strecke</button></nav><div class="dialog-pages"><section class="dialog-page" data-dialog-page="help-driving"><div class="compact-instructions instructions"><div><strong>LENKEN</strong><span>Handy: Links oder Rechts halten. PC: A/D oder Pfeiltasten.</span></div><div><strong>GAS &amp; BREMSE</strong><span>Mit Gas-Assistent reicht Lenken. Ohne: Gas halten. Zum Bremsen Bremse halten. PC: W/S.</span></div><div><strong>DRIFT &amp; BOOST</strong><span>Bei Tempo stark lenken oder Drift halten. Gerade stellen löst den geladenen Boost aus.</span></div><div><strong>BOXENPAUSE</strong><span>Pause oben rechts. Am PC: P oder Escape. Im Hochformat pausiert das Handy.</span></div></div></section><section class="dialog-page" data-dialog-page="help-items"><div class="compact-instructions instructions"><div><strong>NITRO</strong><span>Gelbe Werkzeugkiste sammeln, dann Item antippen oder E drücken. Nitro gibt einen kurzen Temposchub.</span></div><div><strong>SCHUTZSCHILD</strong><span>Acht Sekunden Schutz vor Öl, Hindernissen und Remplern.</span></div><div><strong>ÖLSPUR</strong><span>Legt Öl hinter deinem Auto. Gegner geraten darauf ins Schleudern.</span></div><div><strong>KLASSISCH</strong><span>Für eine freie Straße ohne Items und Slaloms: Einstellungen → Fahrstil → Klassisch.</span></div></div></section><section class="dialog-page" data-dialog-page="help-course"><div class="compact-instructions instructions"><div><strong>RUNDEN</strong><span>Fahre in der markierten Richtung. Das Rennen endet nach deiner eingestellten Rundenzahl.</span></div><div><strong>ZURÜCK AUF DIE STRASSE</strong><span>Im Grün zwei Sekunden stillstehen: Auto-Reset. Sofort zurück: ↻ oder R.</span></div><div><strong>HINDERNISSE</strong><span>Im Action-Modus Reifen und Strohballen umfahren. Ein Treffer kostet Tempo.</span></div><div><strong>SCHWACHES GERÄT?</strong><span>Einstellungen → Grafik → Flüssig. Der Breuer-Boost wartet an Start/Ziel.</span></div></div></section></div><footer class="dialog-footer"><button id="help-done" class="primary">Alles klar!</button></footer>`,true,true);
 bindDialogTabs('help-driving');$('help-done').onclick=()=>closeDialog();
};

function disposeObject(root){disposeScene(root,{excludeTextures:environment?[environment]:[]});}
function clearVehicles(){for(const m of meshes.values()){world?.scene.remove(m);disposeObject(m);}meshes.clear();for(const m of oilMeshes.values()){world?.scene.remove(m);disposeObject(m);}oilMeshes.clear();oils=[];previousPoses.clear();if(ghostMesh){world?.scene.remove(ghostMesh);disposeObject(ghostMesh);ghostMesh=null;}ghostReplay=null;ghostRecorder=null;}
function attach(v){const m=makeCar(v.car,false,graphicsLevel);world.scene.add(m);meshes.set(v.id,m);m.position.set(v.x,ground(v.x,v.z)+.026,v.z);m.rotation.y=v.angle;return m;}
function ground(x,z){return MAP?surfaceHeightAt(MAP,x,z):0;}
async function ensureWorld(id){
 void loadVehicleFinishes().catch(()=>{});
 if(world&&MAP?.trackId===id)return true;
 if(worldLoading?.id===id)return worldLoading.promise;
 const serial=++loadSerial,button=$('start-solo');entryScreen?.setLoading(true,'Straßen und Gebäude werden geladen …');touchControls?.setBlocked('loading',true);keys.clear();button.disabled=true;button.textContent='Strecke lädt …';$('load-status').textContent='Straßen und Gebäude werden geladen …';
 const promise=(async()=>{try{
  const art=loadVehicleAssets({high:[CARS[selected]?.id].filter(Boolean),low:CARS.map(car=>car.id)}),data=await loadTrack(id);await art;if(serial!==loadSerial)return false;
  $('load-status').textContent='Die Rennstrecke wird aufgebaut …';entryScreen?.setPhase('Die Rennstrecke wird aufgebaut …');await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  const nextTrack=new Track(data.route,raceConfig);nextTrack.heightAt=(x,z)=>sampleGround(data,x,z);
  const nextWorld=makeWorld(data,nextTrack);if(serial!==loadSerial){nextWorld.dispose?.();return false;}
  clearVehicles();world?.dispose?.();MAP=data;track=nextTrack;world=nextWorld;trackId=id;mapCache.delete($('minimap'));minimapUI?.setTrack(trackMeta(id).name);tourStops=buildTourStops();mapPoi=0;
  if(environment){world.scene.environment=environment;world.scene.environmentIntensity=.4;}world.setQuality?.(graphicsLevel);
  renderer.setWorld?.(MAP,track,world.scene);renderer.renderLists?.dispose();$('load-status').textContent='Strecke bereit. Auf geht’s!';garageDirty=true;return true;
 }catch(e){console.error('Breuer track:',e);$('load-status').textContent=e.message+' Bitte erneut versuchen.';return false;}
 finally{if(serial===loadSerial){button.disabled=false;button.textContent='Starten';worldLoading=null;entryScreen?.setLoading(false);touchControls?.setBlocked('loading',false);}}
 })();worldLoading={id,promise};return promise;
}
function setRules(){
 const action=raceConfig.rules==='action';for(const crate of world.crates){crate.available=0;crate.mesh.visible=action;}
 world.setRaceRules?.(raceConfig.rules);
 if(world.obstacles)for(const o of world.obstacles)if(o.mesh)o.mesh.visible=action;
}
async function beginRace(network=false,participants=[],options={}){
 if(!renderer||touchControls?.blocked||entryScreen?.visible||startPending)return;
 const request=++raceRequest;startPending=true;demo=!!options.demo;
 try{
 raceConfig=normalizeRaceConfig(network?online.config:options.config||readConfig());trackId=raceConfig.trackId;
 if(!await ensureWorld(trackId)||request!==raceRequest)return;
 if(!network&&!demo&&!options.skipBriefing){const accepted=await briefing.show({mobile:mobileLayout(),network:false});if(!accepted||request!==raceRequest){if(request===raceRequest&&mode!=='garage')backToGarage();return;}}
 if(touchControls?.blocked){notify('Drehe dein Handy ins Querformat.');return;}
 track.raceConfig=raceConfig;world.courseHighlight.visible=false;camera.far=[260,360,480][graphicsLevel];camera.updateProjectionMatrix();if(!audio.muted)audio.unlock();audio.setPaused(false);clearVehicles();keys.clear();touchControls?.clear();paused=false;touchControls?.setBlocked('pause',false);elapsed=-4;streetUpdated=-1;countNumber='';clock.reset();probe.reset();worldCadence.reset();worldRenderDirty=true;probeNeedsBaseline=true;frameQuality.resetTiming();hudAt=shadowAt=-1;nextCupTrack=null;
 if(network){const mine=participants.find(p=>p.id===online.id);if(!mine)return;online.stateClock=new NetworkSampleClock({startAt:online.startAt,offset:online.offset,priorRaceTime:online.resumeState?.raceTime??mine.state?.raceTime});online.finishRaceTime=online.resumeState?.finishRaceTime??mine.state?.finishRaceTime??null;selected=mine.car;vehicles=participants.map((p,i)=>{const v=makeVehicle(track,p.car,i,p.name,p.id,raceConfig);v.remote=p.id!==online.id;return v;});player=vehicles.find(v=>v.id===online.id);if(online.resumeState){Object.assign(player,online.resumeState);const p=track.nearest(player.x,player.z);player.s=player.safeS=p.s;online.resumeState=null;}startedAt=online.startAt;}
 else{
  leaveRoom();player=makeVehicle(track,selected,0,onlineRecords.profile?.name||'Du','you',raceConfig);vehicles=[player,...['Max','Eifel Express','Kurvenkönig','Venn-Racer','Dorfmeister'].slice(0,raceConfig.opponents).map((n,i)=>makeVehicle(track,i%CARS.length,i+1,n,'bot'+i,raceConfig))];startedAt=performance.now()+3000;
  if(raceConfig.mode==='cup'&&!options.continueCup)cup.start({...raceConfig,car:selected},vehicles.map(v=>({id:v.id,name:v.name,car:v.car})));
 }
 raceRecordConfig=recordConfig(raceConfig,network);const record=store.get(raceRecordConfig);finishedRun=null;onlineRun=onlineRecords.start(raceRecordConfig,{eligible:!demo&&!options.skipBriefing,resumeKey:network?`breuer-ranked-run:${online.code}:${online.id}:${online.startAt}`:null});
 ghostRecorder=new GhostRecorder();raceTiming=new RaceTiming({length:track.length,laps:raceConfig.laps});
 if(!network&&$('ghost')?.checked&&record?.ghost){try{ghostReplay=new GhostReplay(record.ghost);ghostMesh=makeCar(selected,false,0);ghostMesh.traverse(o=>{if(o.isMesh){o.castShadow=false;const mats=Array.isArray(o.material)?o.material:[o.material];for(const m of mats){m.transparent=true;m.opacity=.24;m.depthWrite=false;} }});world.scene.add(ghostMesh);}catch{ghostReplay=null;}}
 vehicles.forEach(attach);setRules();touchControls?.setOptions({sensitivity:Number($('steering-sensitivity')?.value||1),enabled:true});
 minimapUI?.collapse({focus:false});mode='countdown';$('garage').hidden=true;$('hud').hidden=false;$('tour-ui').hidden=true;$('results').hidden=true;$('pause-screen').hidden=true;$('dialog').hidden=true;$('countdown').hidden=false;
 garageVehiclePreview?.update({visible:false});
 $('lap').textContent='1 / '+raceConfig.laps;$('clock').textContent='0:00.00';$('position').textContent='1';
 $('field-size').textContent='/'+vehicles.length;for(const id of ['next-turn','sector-split','race-mode-label'])if($(id))$(id).hidden=false;if($('race-mode-label'))$('race-mode-label').textContent={'race':'EINZELRENNEN','time-trial':'ZEITFAHREN',cup:'BREUER-CUP',challenge:'MAX-CHALLENGE'}[raceConfig.mode];
 $('view').focus();const initialCamera=cameraRig.reset({x:player.x,y:ground(player.x,player.z),z:player.z,angle:player.angle},player.speed,{top:cameraTop,reduced});camera.position.set(initialCamera.position.x,initialCamera.position.y,initialCamera.position.z);camera.lookAt(initialCamera.look.x,initialCamera.look.y,initialCamera.look.z);camera.fov=initialCamera.fov;camera.updateProjectionMatrix();notify(`${raceConfig.laps} ${raceConfig.laps===1?'Runde':'Runden'}. ${trackMeta().name}. Viel Spaß!`,2.5);
 }finally{if(request===raceRequest)startPending=false;}
}
$('start-solo').onclick=()=>{
 if(readConfig().mode==='cup'){const pending=cup.resume();if(pending?.status==='active'){dialog(`${closeHead()}<h2 id="dialog-title">Dein Cup wartet.</h2><p>Du hast bereits Cup-Punkte gesammelt. Weiterfahren oder von vorn beginnen?</p><div class="actions"><button id="cup-resume" class="primary">Cup fortsetzen</button><button id="cup-new" class="secondary">Neu starten</button></div>`);$('cup-resume').onclick=()=>{selected=pending.config.car??selected;const id=pending.tracks?.[pending.raceIndex??pending.index??0]||pending.nextTrack||'lammersdorf';beginRace(false,[],{continueCup:true,config:{...pending.config,trackId:typeof id==='string'?id:id.id}});};$('cup-new').onclick=()=>{cup.abandon();beginRace(false,[],{config:{...readConfig(),trackId:'lammersdorf'}});};return;}}
 beginRace(false,[],{config:readConfig().mode==='cup'?{...readConfig(),trackId:'lammersdorf'}:readConfig()});
};
$('again').onclick=()=>{if(nextCupTrack)beginRace(false,[],{continueCup:true,config:{...raceConfig,trackId:nextCupTrack}});else beginRace(false,[],{config:raceConfig});};
function backToGarage(){minimapUI?.collapse({focus:false});audio.setPaused(false);++raceRequest;startPending=false;briefing?.close();entryScreen?.setLoading(false);touchControls?.setBlocked('pause',false);leaveRoom();benchmark=null;mode='garage';tour=null;paused=false;clearVehicles();vehicles=[];player=null;$('garage').hidden=false;$('hud').hidden=true;$('tour-ui').hidden=true;$('results').hidden=true;$('pause-screen').hidden=true;keys.clear();touchControls?.clear();touchControls?.setOptions({enabled:false});audio.update(0,false);garageDirty=true;updateRecord();if(garageFlow)garageFlow.goTo(garageFlow.step,{scroll:false});else $('start-solo').focus();}
$('result-back').onclick=backToGarage;$('exit-race').onclick=backToGarage;

function togglePause(value=!paused){if(mode==='garage'||mode==='finished'||mode==='tour')return;if(value===paused)return;if(value)minimapUI?.collapse({focus:false});paused=value;worldRenderDirty=true;probeNeedsBaseline=true;frameQuality.resetTiming();audio.setPaused(value);touchControls?.setBlocked('pause',value);keys.clear();touchControls?.clear();$$('[data-touch]').forEach(b=>b.classList.remove('pressed'));$('pause-screen').hidden=!paused;if(paused){pauseAt=performance.now();$('pause-note').textContent=online?'Das Online-Rennen läuft für die anderen weiter. Dein Auto bremst ab.':'Kurz durchatmen. Gleich geht’s weiter.';$('resume').focus();}else{if(!online)startedAt+=performance.now()-pauseAt;$('view').focus();}}
$('pause').onclick=()=>togglePause();$('resume').onclick=()=>togglePause(false);

function activateItem(){if(player&&mode==='race'&&!paused&&!briefing?.isOpen&&!touchControls?.blocked){const type=useItem(player,oils,elapsed);if(type){audio.play(type);notify(itemNames[type]+'!',1.4);}else notify('Erst eine Werkzeugkiste einsammeln.',1.5);}else if(mode==='countdown')notify('Gleich geht’s los. Die Kisten stehen auf der Strecke.');}
$('use-item').onclick=activateItem;
$('map-open').onclick=()=>minimapUI?.toggle();
$('camera-switch').onclick=()=>{cameraTop=!cameraTop;worldRenderDirty=true;notify(cameraTop?'Streckenübersicht.':'Zurück hinter dein Auto.');};
window.addEventListener('keydown',e=>{
 if(minimapUI?.handleKeydown(e))return;
 if($('dialog').hidden===false&&e.code==='Escape'){e.preventDefault();closeDialog();return;}
 if(touchControls?.blocked||briefing?.isOpen||entryScreen?.visible||worldLoading||e.target.matches('input,select,textarea'))return;
 if(mode==='tour'){if(e.code==='Escape')backToGarage();if(e.code==='ArrowRight')tourStop(tour.index+1);if(e.code==='ArrowLeft')tourStop(tour.index-1);return;}
 if(mode==='garage'||mode==='finished')return;
 if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();
 if(e.repeat)return;keys.add(e.code);
 if(e.code==='Escape'||e.code==='KeyP')togglePause();
 if(e.code==='KeyE')activateItem();
 if(e.code==='KeyR'&&!paused){resetVehicle(player,track);notify('Zurück auf der Strecke.',1.2);}
 if(e.code==='KeyC'){cameraTop=!cameraTop;worldRenderDirty=true;}
});
window.addEventListener('keyup',e=>keys.delete(e.code));
window.addEventListener('blur',()=>{keys.clear();touchControls?.clear();if((mode==='race'||mode==='countdown')&&!paused)togglePause(true);});
document.addEventListener('visibilitychange',()=>{if(document.hidden){keys.clear();touchControls?.clear();if((mode==='race'||mode==='countdown')&&!paused)togglePause(true);}});
document.addEventListener('keydown',e=>{if(e.code!=='Tab')return;const panel=!$('dialog').hidden?$('dialog-content'):!$('pause-screen').hidden?$('pause-screen'):!$('results').hidden?$('results'):null;if(!panel)return;const all=[...panel.querySelectorAll('button:not([disabled]),input,select,a[href]')];if(!all.length)return;const first=all[0],last=all.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}});

function input(){
 if(paused||touchControls?.blocked||briefing?.isOpen||worldLoading||entryScreen?.visible)return {gas:0,brake:1,steer:0,drift:false,autoDrift:false};
 const mobile=touchControls?.read()||{gas:0,brake:0,steer:0,drift:false};
 let steer=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0);if(Math.abs(mobile.steer)>Math.abs(steer))steer=mobile.steer;
 let gas=mobileLayout()||raceConfig.assist||keys.has('KeyW')||keys.has('ArrowUp')?1:mobile.gas;
 let brake=keys.has('KeyS')||keys.has('ArrowDown')?1:mobile.brake,drift=keys.has('Space')||mobile.drift;
 const pad=Array.from(navigator.getGamepads?.()||[]).find(Boolean);if(pad){if(Math.abs(pad.axes[0])>.12)steer=pad.axes[0];gas=Math.max(gas,pad.buttons[7]?.value||0);brake=Math.max(brake,pad.buttons[6]?.value||0);drift=drift||pad.buttons[0]?.pressed;const item=!!pad.buttons[1]?.pressed;if(item&&!gamepadItem)activateItem();gamepadItem=item;}
 return {steer,gas:brake?0:gas,brake,drift,autoDrift:raceConfig.autoDrift};
}

function simulate(dt,time=elapsed){
 elapsed=time;
 for(const v of vehicles)if(!v.remote)previousPoses.set(v.id,{x:v.x,z:v.z,angle:v.angle});
 for(const v of vehicles){if(v.remote)continue;const events=stepVehicle(v,track,v===player?simulationInput:botInput(v,track,raceConfig.difficulty),dt,elapsed,raceConfig);
  if(v===player){if(events.includes('driftBoost')){notify('DRIFT BOOST!',1.1);audio.play('boost');}if(events.includes('breuerBoost')){notify('BREUER BOOST!',1.5);audio.play('boost');}if(events.includes('autoReset')){audio.play('reset');notify('Wieder auf Kurs. Weiter geht’s!',1.5);}if(events.includes('obstacleHit')){notify('Hindernis erwischt. Slalom fahren!',1.3);audio.play('impact');}if(events.includes('finish'))finishRace();}
  const pickup=collectPickup(v,world.crates,elapsed,events.includes('autoReset')?null:previousPoses.get(v.id));
  if(pickup&&v===player){audio.play('pickup');notify(itemNames[pickup.type]+' eingesammelt',1.2);}
  if(v!==player&&v.item&&Math.random()<dt*.22)useItem(v,oils,elapsed);
  for(const oil of oils){if(oil.owner!==v.id&&oil.expires>elapsed&&v.shield===0&&v.spin===0&&Math.hypot(v.x-oil.x,v.z-oil.z)<2.3){v.spin=1.1;v.speed*=.35;if(v===player){audio.play('oil-hit');notify('Öl erwischt!',1.4);}}}
 }
 for(let i=0;i<vehicles.length;i++)for(let j=i+1;j<vehicles.length;j++){
  if(online&&vehicles[i]!==player&&vehicles[j]!==player)continue;
  if(collideCars(vehicles[i],vehicles[j],track)&&(vehicles[i]===player||vehicles[j]===player))audio.play('impact');
 }
 oils=oils.filter(o=>o.expires>elapsed);
 if(mode==='race'&&!benchmark&&!demo){ghostRecorder?.sample(elapsed,player);const timingEvents=raceTiming?.update(player.progress,elapsed)||[];if(timingEvents.some(e=>e.type==='lap')){audio.play('lap');notify(Math.floor(player.progress/track.length)===raceConfig.laps-1?'Letzte Runde! Gib noch einmal alles.':'Nächste Runde. Weiter so!',1.6);}}
}

function finishRace(){
 if(mode==='finished')return;
 if(benchmark){finishBenchmark();return;}
 ghostRecorder?.sample(player.finish,player);raceTiming?.update(player.progress,player.finish);
 minimapUI?.collapse({focus:false});mode='finished';paused=false;touchControls?.clear();touchControls?.setOptions({enabled:false});$('pause-screen').hidden=true;$('results').hidden=false;$('countdown').hidden=true;
 const ranked=ranking(vehicles),rank=ranked.indexOf(player)+1;$('result-position').textContent=rank+'. PLATZ';$('result-time').textContent=timeText(player.finish);
 const result=demo?{isBest:false,record:null}:store.save(raceRecordConfig,{time:player.finish,sectors:raceTiming?.sectorTimes||[],ghost:ghostRecorder?.finish()});
 $('record').textContent=demo?'Max’ Vorführfahrt · kein Rekord gespeichert.':result.isBest?'Neue Bestzeit auf diesem Gerät!':result.record?.time?'Deine Bestzeit: '+timeText(result.record.time):'Stark gefahren!';
 if(result.error)$('record').textContent+=' Dein Browser konnte diesen Rekord nicht speichern.';
 finishedRun={session:onlineRun,result:{time:player.finish,sectors:[...(raceTiming?.sectorTimes||[])]},config:{...raceRecordConfig},demo};
 if($('online-result-state')){$('online-result-state').textContent=demo?'Vorführfahrten zählen nicht für die Bestenliste.':onlineRecords.profile?'Deine Zeit wird gespeichert …':'Trag deine Zeit mit deinem eigenen Fahrernamen ein.';$('online-result-state').removeAttribute('data-state');}
 if($('online-result-submit')){$('online-result-submit').hidden=demo;$('online-result-submit').disabled=false;$('online-result-submit').textContent=onlineRecords.profile?'Zeit speichern':'Zeit eintragen';}
 if(!demo&&onlineRecords.profile)void submitFinishedRun(finishedRun);
 if($('challenge-medal')){$('challenge-medal').hidden=demo;if(!demo){const targets=challengeTargets(trackMeta(),CARS[selected],raceConfig.laps),award=medal(player.finish,targets);$('challenge-medal').dataset.medal=award||'finish';$('challenge-medal').textContent=`${award==='gold'?'🥇 Gold':award==='silver'?'🥈 Silber':award==='bronze'?'🥉 Bronze':'Auf zur nächsten Medaille'} · Gold ${timeText(targets.gold)} · Silber ${timeText(targets.silver)} · Bronze ${timeText(targets.bronze)}`;const awardKey='breuer-medal-'+trackId+'-'+selected;save.set(awardKey,bestMedal(save.get(awardKey),award));}}
 if($('cup-progress')){$('cup-progress').hidden=raceConfig.mode!=='cup';if(raceConfig.mode==='cup'){const c=cup.recordRace(trackId,ranked.map((v,i)=>({id:v.id,name:v.name,car:v.car,position:i+1,time:v.finish})));nextCupTrack=c.nextTrack||null;$('cup-progress').innerHTML=`<b>${c.completed?'🏆 Dein Cup-Ergebnis':'Breuer-Cup · Rennen beendet'}</b><ol>${cup.standings().map(e=>`<li>${escapeHTML(e.name)} · ${e.points} Punkte</li>`).join('')}</ol>`;}}
 $('again').hidden=!!online;$('again').textContent=nextCupTrack?'Nächstes Rennen':'Nochmal';audio.play('finish');$('result-back').focus();updateStandings();
}
function downloadResult(){
 const c=document.createElement('canvas');c.width=1200;c.height=630;const g=c.getContext('2d');g.fillStyle='#17181b';g.fillRect(0,0,c.width,c.height);g.fillStyle='#df2535';g.fillRect(0,0,c.width,16);g.fillStyle='#ffffff';g.font='bold 70px Arial';g.fillText('BREUER GRAND PRIX',60,105);g.fillStyle='#ddd4c6';g.font='30px Arial';g.fillText(trackMeta().name+' · '+raceConfig.laps+' Runden',60,163);g.fillStyle='#f5cc46';g.font='bold 95px Arial';g.fillText($('result-position').textContent,60,315);g.fillStyle='#fff';g.font='bold 78px Arial';g.fillText(timeText(player.finish),60,420);g.font='32px Arial';g.fillText(CARS[selected].name,60,484);g.fillStyle='#b2b2b5';g.font='24px Arial';g.fillText('Fahrzeugtechnik Breuer · Lammersdorf',60,570);g.fillStyle='#df2535';g.fillRect(995,200,130,130);g.fillStyle='#fff';g.font='bold 60px Arial';g.fillText('GP',1017,287);
 c.toBlob(blob=>{if(!blob){notify('Das Ergebnisbild konnte nicht erzeugt werden.');return;}const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='Breuer-GP-'+trackId+'-Ergebnis.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);},'image/png');
}
if($('result-download'))$('result-download').onclick=downloadResult;
function updateStandings(){if(!$('results').hidden){const ranked=ranking(vehicles);$('standings').innerHTML=ranked.map((v,i)=>`<li><b>${i+1}. ${escapeHTML(v.name)}</b><span>${v.finish!==null?timeText(v.finish):'noch unterwegs'}</span></li>`).join('');if($('podium'))$('podium').innerHTML=ranked.slice(0,3).map((v,i)=>`<div class="podium-place ${v===player?'you':''}"><b>${i+1}</b><span>${escapeHTML(v.name)}</span><small>${escapeHTML(CARS[v.car]?.short||'')}</small></div>`).join('');}}

function hudElement(id){let node=hudNodes.get(id);if(!node){node=$(id);if(node)hudNodes.set(id,node);}return node;}
function hudText(id,value){const node=hudElement(id),text=String(value);if(node&&node.textContent!==text)node.textContent=text;}
function hudFlag(id,key,value){const node=hudElement(id);if(node&&node[key]!==value)node[key]=value;}
function hudClass(id,name,value){const node=hudElement(id);if(node&&node.classList.contains(name)!==value)node.classList.toggle(name,value);}
function hudWidth(id,value){const node=hudElement(id);if(node&&node.style.width!==value)node.style.width=value;}
function hudItem(id,item){const node=hudElement(id);if(node&&node.dataset.item!==item)node.dataset.item=item;}
function updateHUD(){
 const ranked=ranking(vehicles);hudText('position',ranked.indexOf(player)+1);hudText('lap',Math.min(raceConfig.laps,Math.max(1,Math.floor(player.progress/track.length)+1))+' / '+raceConfig.laps);hudText('clock',timeText(Math.max(0,player.finish??elapsed)));hudText('speed',Math.round(player.speed*3.6));
 hudText('boost-state',player.boost>0?'BOOST':player.shield>0?'SCHUTZSCHILD':player.offroad?'GRÜN BREMST':player.drifting?'DRIFT':player.wrongWay?'FALSCHE RICHTUNG':'');
 if(hudElement('next-turn')){const p=track.at(player.s),ahead=track.at(player.s+45),turn=angleDelta(ahead.angle-p.angle);hudText('next-turn',Math.abs(turn)<.2?'Geradeaus · 45 m':turn>0?'Rechtskurve · 45 m':'Linkskurve · 45 m');}
 if(hudElement('sector-split')){const delta=ghostReplay?.timeAtProgress(player.progress);hudText('sector-split',Number.isFinite(delta)?'Zum Geist: '+((elapsed-delta)>0?'+':'')+(elapsed-delta).toFixed(2)+' s':raceTiming?.sectorTimes?.length?'Letzter Sektor: '+timeText(raceTiming.sectorTimes.at(-1)):'Sektor 1 / 3');}
 hudFlag('use-item','disabled',!player.item);hudClass('use-item','ready',!!player.item);hudText('use-item',player.item?itemNames[player.item]:'KEIN ITEM');hudText('touch-item',player.item?itemNames[player.item]:'ITEM');hudFlag('touch-item','disabled',!player.item);hudItem('use-item',player.item||'none');hudItem('touch-item',player.item||'none');hudWidth('drift-fill',(player.drift/2.5*100)+'%');
 hudClass('drift-fill','charged',player.drift>.6);hudText('drift-label',player.drifting?(player.drift>.6?'GERADESTELLEN = BOOST':'DRIFT LÄDT …'):'STARK LENKEN = DRIFT');
 hudFlag('reset-status','hidden',player.resetRemaining<=0);hudText('reset-seconds',Math.ceil(player.resetRemaining));hudWidth('reset-progress',(player.offroadStillTime/2*100)+'%');
 if(elapsed-streetUpdated>.7){streetUpdated=elapsed;let nearest=Infinity,name='Lammersdorf';for(const r of MAP.roads){if(!MAP.routeNames.includes(r.name))continue;for(const p of r.points){const d=(p[0]-player.x)**2+(p[1]-player.z)**2;if(d<nearest){nearest=d;name=r.name;}}}const poi=MAP.pois.find(p=>Math.hypot(player.x-p.point[0],player.z-p.point[1])<32);hudText('street',name+(poi?' · '+poi.name:''));updateStandings();}
 if(performance.now()-hudMapAt>(minimapUI?.expanded?90:33)){hudMapAt=performance.now();drawMap(hudElement('minimap'),vehicles);}
}

function render(dt){
 let renderedPlayerPose=null;
 for(const v of vehicles){const m=meshes.get(v.id);if(!m)continue;
  if(v.remote&&v.target){const t=1-Math.exp(-dt*11);v.x+=(v.target.x-v.x)*t;v.z+=(v.target.z-v.z)*t;v.angle+=angleDelta(v.target.angle-v.angle)*t;}
  const pose=v.remote?v:interpolatedPose(previousPoses.get(v.id),v,renderAlpha),y=ground(pose.x,pose.z);m.position.set(pose.x,y+.026,pose.z);m.rotation.y=pose.angle;const frontY=ground(pose.x+Math.sin(pose.angle)*1.5,pose.z+Math.cos(pose.angle)*1.5),backY=ground(pose.x-Math.sin(pose.angle)*1.5,pose.z-Math.cos(pose.angle)*1.5);m.rotation.x=-Math.atan2(frontY-backY,3);m.rotation.z=0;m.userData.shield.visible=v.shield>0;m.userData.flames.visible=v.boost>0;
  if(v===player)renderedPlayerPose={x:pose.x,y,z:pose.z,angle:pose.angle};
  m.userData.flames.scale.z=reduced?1:.9+Math.sin(elapsed*40)*.2;
  animateCar(m,v.speed,v.steering||0,elapsed,!reduced&&v.drifting,v.drift,reduced?null:{bodyRoll:v.bodyRoll,bodyPitch:v.bodyPitch});
 }
 for(const b of world.crates){animateItemBox(b.mesh,elapsed,b.s*.37+b.x*.11,reduced);b.mesh.position.y=Number.isFinite(b.groundY)?b.groundY:ground(b.x,b.z);}
 for(const o of oils){if(!oilMeshes.has(o.id)){const m=makeOilDecal(MAP,o.x,o.z);world.scene.add(m);oilMeshes.set(o.id,m);}}
 for(const [id,m] of oilMeshes){if(!oils.some(o=>o.id===id)){world.scene.remove(m);m.geometry.dispose();m.material.dispose();oilMeshes.delete(id);}}
 if(ghostMesh&&ghostReplay){const p=ghostReplay.at(Math.max(0,elapsed));ghostMesh.visible=!!p&&mode!=='countdown';if(p){ghostMesh.position.set(p.x,ground(p.x,p.z)+.036,p.z);ghostMesh.rotation.y=p.angle;animateCar(ghostMesh,p.speed,0,elapsed);}}
 const pose=renderedPlayerPose||{x:player.x,y:ground(player.x,player.z),z:player.z,angle:player.angle};
 const view=cameraRig.sample(pose,player.speed,dt,{top:cameraTop,reduced});
 if(renderer.isCompatibilityRenderer){const renderedVehicles=vehicles.map(v=>{const m=meshes.get(v.id);return {...v,x:m?.position.x??v.x,z:m?.position.z??v.z,angle:m?.rotation.y??v.angle};});renderer.setVehicles(renderedVehicles);renderer.setFocus({...renderedVehicles.find(v=>v.id===player.id),cameraX:cameraRig.anchor.x,cameraZ:cameraRig.anchor.z,cameraAngle:cameraRig.heading,cameraTop:cameraRig.overhead});}
 camera.position.set(view.position.x,view.position.y,view.position.z);cameraLook.set(view.look.x,view.look.y,view.look.z);camera.lookAt(cameraLook);
 const debugCam=globalThis.__breuerDebug?.cam;if(debugCam){camera.position.set(...debugCam.position);cameraLook.set(...debugCam.look);camera.lookAt(cameraLook);pose.x=debugCam.look[0];pose.z=debugCam.look[2];}
 if(Math.abs(camera.fov-view.fov)>.001){camera.fov=view.fov;camera.updateProjectionMatrix();}
 world.sun.position.set(pose.x-115,pose.y+92,pose.z+75);world.sun.target.position.set(pose.x,pose.y,pose.z);
 world.animate(elapsed,reduced,camera.position);world.updateVisibility(camera,graphicsLevel);
 // The distance pass may show a nearby mesh. Cooldown/rules must be the final
 // visibility gate, otherwise AI-collected crates reappear but cannot be taken.
 for(const b of world.crates)b.mesh.visible=b.mesh.visible&&pickupAvailable(b,Math.max(0,elapsed),raceConfig.rules);
 if(!reduced)world.skid(player,elapsed);prepareShadows(elapsed);renderer.setScissorTest(false);renderer.setViewport(0,0,innerWidth,innerHeight);comic?.setSpeedLines?.(reduced||paused?0:player.boost>0?1:Math.max(0,(player.speed-27)/14)*.45);renderWorld();audio.update(player.speed,mode==='race'&&!paused,player.drifting,{car:player.car,race:true,boost:player.boost,crowd:Math.max(0,1-Math.hypot(player.x-3.68,player.z-4.08)/90)});
}

function frame(ts){
 if($('garage-art').hidden!==(mode!=='garage'))$('garage-art').hidden=mode!=='garage';
 const raw=lastFrame?Math.max(0,ts-lastFrame):16.7,dt=Math.min(.1,raw/1000),renderTargetFPS=graphicsLevel===0?30:60;lastFrame=ts;

 let didRender=false;
 if(mode==='tour'&&world){if(worldCadence.take(ts,renderTargetFPS,worldRenderDirty)){renderTour(Math.min(.1,(ts-lastRenderAt)/1000),ts/1000);worldRenderDirty=false;didRender=true;}}
 else if(mode!=='garage'&&player&&world){
  if(!paused||online){
   if(mode==='countdown'){
    elapsed=(online?Date.now()+online.offset:ts)-startedAt;elapsed/=1000;const number=elapsed<0?String(Math.ceil(-elapsed)):'LOS!';if(number!==countNumber){countNumber=number;$('countdown').textContent=number;audio.play(number==='LOS!'?'go':'countdown');}if(elapsed>=0){mode='race';simulationInput=benchmark||demo?botInput(player,track,.9):input();if(online){clock.reset(elapsed);renderAlpha=1;}else{clock.reset();renderAlpha=clock.advance(elapsed,(step,time)=>simulate(step,time));}setTimeout(()=>$('countdown').hidden=true,650);}
   }else if(mode==='race'){
    simulationInput=benchmark||demo?botInput(player,track,.9):input();
    // Offline time follows every simulated step. Online uses the synchronized server clock.
    renderAlpha=clock.advance(document.hidden?0:raw/1000,(step,time)=>simulate(step,online?Math.max(0,(Date.now()+online.offset-startedAt)/1000-clock.debt+step):time));
    if(benchmark&&performance.now()-benchmark.started>=benchmark.duration)finishBenchmark();
   }
  }
  if(mode!=='garage'&&player){const offlinePaused=paused&&!online;if(performance.now()>bannerUntil&&$('banner').textContent)$('banner').textContent='';if(worldRenderDirty||ts-hudAt>=(offlinePaused?500:80)){hudAt=ts;updateHUD();}if(worldCadence.take(ts,offlinePaused?2:renderTargetFPS,worldRenderDirty)){render(Math.min(.1,(ts-lastRenderAt)/1000));worldRenderDirty=false;didRender=true;}}
 }else if(showroom&&!entryScreen?.visible&&!worldLoading){
  const moving=carTransition>0||Math.abs(carHeading-displayHeading)>.002||revUntil>ts||dragging;
  if(garageDirty||moving||ts-lastRenderAt>500){renderGarage(dt,ts/1000);didRender=true;}else audio.update(0,false);
 }
 if(didRender){const renderedInterval=lastRenderAt?ts-lastRenderAt:raw;if(!document.hidden&&graphics==='auto'&&(!paused||online)&&(mode==='race'||mode==='tour')&&frameQuality.sample(raw))applyGraphics();lastRenderAt=ts;if(mode!=='garage'&&!document.hidden&&(!paused||online)&&!(benchmark&&mode==='countdown')){if(!probeNeedsBaseline)probe.sample(renderedInterval,renderer.info,renderTargetFPS);probeNeedsBaseline=false;}else probeNeedsBaseline=true;}
 if(ts-lastProbeAt>=500){lastProbeAt=ts;updatePerformance();}
 requestAnimationFrame(frame);
}
function updatePerformance(){
 const result=probe.summary();if(!$('performance-panel'))return;
 $('performance-fps').textContent=Number.isFinite(result.fps)?Math.round(result.fps)+' FPS':'—';$('performance-frame').textContent=Number.isFinite(result.p95Ms)?result.p95Ms.toFixed(1)+' ms':'—';$('performance-drawcalls').textContent=String(renderer?.info?.render?.calls||0);
 if($('performance-live')){$('performance-live').hidden=!benchmark;$('performance-live').textContent=benchmark?'Messfahrt · '+Math.max(0,Math.ceil((benchmark.duration-performance.now()+benchmark.started)/1000))+' s · '+Math.round(result.fps||0)+' FPS':'';}
 $('performance-status').textContent=benchmark?'Messfahrt · '+Math.max(0,Math.ceil((benchmark.duration-performance.now()+benchmark.started)/1000))+' s':mode==='garage'?'Im Rennen wird die Leistung gemessen.':graphicsLevel===0?'Sparsame Grafik · automatische Anpassung':graphicsLevel===1?'Ausgewogene Grafik':'Hohe Grafikdetails';
}
async function startBenchmark(){
 benchmark=null;probe.reset();await beginRace(false,[],{skipBriefing:true,config:{...readConfig(),mode:'race',opponents:5,laps:10}});if(mode!=='countdown')return;
 benchmark={started:performance.now()+3000,duration:60000};probe.reset();$('performance-panel').hidden=false;notify('60 Sekunden Messfahrt. Das Auto fährt für dich.',4);
}
function finishBenchmark(){
 if(!benchmark)return;const result=probe.summary();backToGarage();
 dialog(`${closeHead()}<h2 id="dialog-title">Deine Leistungsmessung.</h2><p>Diese Werte stammen von diesem Browser und diesem Gerät. ${renderer.isCompatibilityRenderer?'2D-Kompatibilität · diese Messung prüft keine 3D-Grafikleistung.':'3D-Grafik mit WebGL 2.'} Die Messfahrt ist kein Rennrekord.</p><div class="map-facts"><span><strong>${Math.round(result.overallFPS||0)}</strong> FPS · gesamte Fahrt</span><span><strong>${Number(result.p95Ms||0).toFixed(1)}</strong> ms · 95 % der letzten 10 s</span><span><strong>${result.maxDrawCalls||0}</strong> maximale ${renderer.isCompatibilityRenderer?'Canvas-Zeichenaufrufe':'Grafikaufrufe'}</span></div><p>${escapeHTML(navigator.userAgent)}</p><p>Grafikstufe ${graphicsLevel+1} · ${Math.round(renderer.getPixelRatio?.()*100||100)} % Pixelauflösung. Für die Handyabnahme die Fahrt nach zehn Minuten wiederholen.</p><div class="actions"><button id="benchmark-back" class="primary">Zur Garage</button><button id="benchmark-export" class="secondary">Messbericht speichern ↓</button></div>`,true);$('benchmark-back').onclick=()=>{closeDialog();backToGarage();};$('benchmark-export').onclick=()=>{const report={date:new Date().toISOString(),renderer:renderer.isCompatibilityRenderer?'canvas-2d':'webgl-2',course:trackId,graphicsLevel,width:innerWidth,height:innerHeight,pixelRatio:renderer.getPixelRatio(),userAgent:navigator.userAgent,metrics:result},url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='Breuer-GP-Leistungsmessung.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);};
}
if($('benchmark-button'))$('benchmark-button').onclick=startBenchmark;
if($('demo-button'))$('demo-button').onclick=()=>beginRace(false,[],{demo:true,config:{...readConfig(),mode:'race',laps:1,opponents:5}});

async function api(path,body){
 const base=window.BREUER_API||'';const r=await fetch(base+'/api'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store',signal:AbortSignal.timeout(10000)});
 let data;try{data=await r.json();}catch{throw Error('Der Online-Server ist hier nicht erreichbar.');}
 if(!r.ok){const error=Error(data.error||'Online-Verbindung fehlgeschlagen.');error.code=data.code;error.status=r.status;throw error;}return data;
}
async function submitFinishedRun(run=finishedRun){
 if(!run||run.demo)return;
 if(!onlineRecords.profile){driverUI?.profile({onReady:()=>submitFinishedRun(run)});return;}
 const state=$('online-result-state'),button=$('online-result-submit');if(button)button.disabled=true;
 if(state&&finishedRun===run){state.textContent='Bestzeit wird mit dem Rennserver abgeglichen …';state.removeAttribute('data-state');}
 try{const saved=await onlineRecords.submit(run.session,run.result);if(finishedRun!==run||mode!=='finished')return;
  if(state){state.textContent=`${saved.improved?'Neue persönliche Bestzeit!':'Bestzeit gespeichert.'} Dein Rang: ${saved.rank}.`;state.dataset.state='success';}
  if(button){button.textContent='Gespeichert ✓';button.disabled=true;}if(player&&onlineRecords.profile)player.name=onlineRecords.profile.name;updateStandings();
 }catch(error){if(finishedRun!==run||mode!=='finished')return;if(state){state.textContent=error.code==='RUN_TOO_EARLY'?'Der Rennserver holt noch auf. Deine lokale Zeit ist sicher. Versuche es gleich erneut.':error.message;state.dataset.state='error';}if(button){button.disabled=false;button.textContent='Erneut speichern';}}
}
function leaveRoom(){
 const old=online;if(pollTimer)clearTimeout(pollTimer);pollTimer=null;online=null;if(old?.socket)old.socket.close();
 if(old){api(`/rooms/${old.code}/leave`,{id:old.id,token:old.token}).catch(()=>{});save.set('breuer-online-session','');}
}
function onlineForm(){
 if(window.BREUER_OFFLINE&&!window.BREUER_API){dialog(`${closeHead()}<h2 id="dialog-title">Mit Freunden fahren.</h2><p>Für gemeinsame Online-Rennen öffne die gehostete Spielversion.</p><a href="https://breuer-grand-prix.vercel.app/" class="primary" target="_blank" rel="noopener">Online spielen</a>`);return;}
 let saved;try{saved=JSON.parse(save.get('breuer-online-session')||'null');}catch{}
 dialog(`${dialogHead('Das Dorf fährt mit.')}<nav class="dialog-tabs" role="tablist" aria-label="Online-Rennen"><button role="tab" data-dialog-tab="online-create">Neuer Raum</button><button role="tab" data-dialog-tab="online-join">Code eingeben</button>${saved?'<button role="tab" data-dialog-tab="online-reconnect">Weiterfahren</button>':''}</nav><div class="dialog-pages online-pages"><fieldset class="online-nickname"><label for="nickname">Dein Fahrername</label><input id="nickname" maxlength="20" value="${escapeHTML(save.get('breuer-name')||'Fahrer')}" autocomplete="nickname"></fieldset><section class="dialog-page online-page" data-dialog-page="online-create"><p>Bis zu sechs Fahrer. Strecke und Runden aus deiner Auswahl.</p><button id="create-room" class="primary">Raum erstellen</button></section><section class="dialog-page online-page" data-dialog-page="online-join"><label for="room-code">Raumcode</label><div class="join-grid"><input id="room-code" maxlength="6" placeholder="ABC123" autocapitalize="characters" autocomplete="off"><button id="join-room" class="secondary">Beitreten</button></div></section>${saved?'<section class="dialog-page online-page" data-dialog-page="online-reconnect"><p>Du hast noch eine gespeicherte Rennsession.</p><button id="reconnect-room" class="secondary">Letzten Raum wieder verbinden</button></section>':''}</div><footer class="dialog-footer"><p id="online-status" class="status" role="status">Erstelle einen Raum oder gib den Code deiner Freunde ein.</p></footer>`,true,true);
 bindDialogTabs('online-create');
 $('create-room').onclick=()=>joinAction(true);$('join-room').onclick=()=>joinAction(false);
 if($('reconnect-room'))$('reconnect-room').onclick=async()=>{try{const d=await api(`/rooms/${saved.code}/tick`,{id:saved.id,token:saved.token});online={...saved,started:false,host:d.host,config:d.config,offset:d.serverTime-Date.now(),failures:0,ready:false,sequence:d.players.find(p=>p.id===saved.id)?.state?.sequence||0,resumeState:d.players.find(p=>p.id===saved.id)?.state};lobby();await ensureWorld(d.config.trackId);pollRoom();}catch(e){$('online-status').textContent=e.message;save.set('breuer-online-session','');}};
 const invite=new URLSearchParams(location.search).get('room');if(invite&&/^[A-Z0-9]{6}$/i.test(invite))$('room-code').value=invite.toUpperCase();
}
$('open-online').onclick=onlineForm;
async function joinAction(create){
 const name=$('nickname').value.trim()||'Fahrer',code=$('room-code').value.trim().toUpperCase();if(!create&&!/^[A-Z0-9]{6}$/.test(code)){$('online-status').textContent='Bitte einen gültigen Code mit sechs Zeichen eingeben.';return;}
 $('create-room').disabled=$('join-room').disabled=true;$('online-status').textContent=create?'Raum wird vorbereitet …':'Verbindung zum Raum …';
 try{
  const d=await api(create?'/rooms':`/rooms/${code}/join`,{name,car:selected,config:{...readConfig(),mode:'race',opponents:0}});save.set('breuer-name',name);
  online={code:d.code,id:d.id,token:d.token,host:d.host,started:false,config:d.config||readConfig(),offset:d.serverTime-Date.now(),startAt:0,failures:0,ready:false,sequence:0,configRevision:d.configRevision};
  save.set('breuer-online-session',JSON.stringify({code:d.code,id:d.id,token:d.token}));lobby();await ensureWorld(online.config.trackId);if($('ready-room'))$('ready-room').disabled=false;pollRoom();
 }catch(e){if($('online-status')){$('online-status').textContent=e.message;$('create-room').disabled=$('join-room').disabled=false;}}
}
function lobby(){
 dialog(`${dialogHead('Treffpunkt Werkstatt.')}<div class="dialog-pages lobby-layout"><div class="lobby-code-row lobby-code"><div class="code">${online.code}</div><button id="share-room" class="secondary">Einladung kopieren</button></div><p id="lobby-config">Die Strecke wird vorbereitet …</p><ul id="lobby-players" class="players"></ul><p id="host-note">${online.host?'Du bist der Gastgeber.':'Der Gastgeber startet, sobald alle bereit sind.'}</p></div><footer class="dialog-footer"><p id="lobby-status" class="status" role="status">Warte auf Fahrer …</p><div class="actions"><button id="ready-room" class="secondary" disabled>Bereit zum Rennen</button><button id="start-room" class="primary" disabled ${online.host?'':'hidden'}>Gemeinsam starten</button></div></footer>`,true,true);
 $('share-room').onclick=async()=>{const url=new URL(location.href);url.searchParams.set('room',online.code);try{await navigator.clipboard.writeText(url.href);$('lobby-status').textContent='Einladung kopiert. Raumcode: '+online.code;}catch{$('lobby-status').textContent='Raumcode zum Teilen: '+online.code;}};
 $('ready-room').onclick=async()=>{const active=online;if(!active||active.preparing)return;active.preparing=true;$('ready-room').disabled=true;try{const revision=active.configRevision;if(!active.ready){if(!await briefing.show({mobile:mobileLayout(),network:true})||online!==active||active.started||revision!==active.configRevision)return;active.briefedRevision=revision;}await api(`/rooms/${active.code}/ready`,{id:active.id,token:active.token,ready:!active.ready,configRevision:revision});if(online!==active)return;active.ready=!active.ready;$('ready-room').textContent=active.ready?'Bereit ✓ · Ändern':'Bereit zum Rennen';}catch(e){if($('lobby-status'))$('lobby-status').textContent=e.message;}finally{active.preparing=false;if($('ready-room'))$('ready-room').disabled=false;}};
 $('start-room').onclick=async()=>{const active=online;$('start-room').disabled=true;try{await api(`/rooms/${active.code}/start`,{id:active.id,token:active.token});}catch(e){if($('lobby-status'))$('lobby-status').textContent=e.message;if($('start-room'))$('start-room').disabled=false;}};
}
function snapshot(){if(online&&player.finish!==null&&online.finishRaceTime===null)online.finishRaceTime=online.stateClock.read();return {raceTime:online?.stateClock?.read(),finishRaceTime:online?.finishRaceTime??undefined,x:player.x,z:player.z,angle:player.angle,speed:player.speed,progress:player.progress,gate:player.gate,sequence:online?++online.sequence:0,finish:player.finish,shield:player.shield,boost:player.boost,spin:player.spin,drifting:player.drifting,oil:oils.filter(o=>o.owner===player.id).slice(-8)};}
function syncOpponents(d){
 for(const p of d.players){if(p.id===online?.id||!p.state)continue;let v=vehicles.find(v=>v.id===p.id);if(!v){v=makeVehicle(track,p.car,vehicles.length,p.name,p.id,raceConfig);v.remote=true;vehicles.push(v);attach(v);}const state=p.state;v.target={x:state.x,z:state.z,angle:state.angle,at:performance.now()};v.progress=state.progress;v.finish=state.finish;v.speed=state.speed;v.shield=state.shield;v.boost=state.boost;v.drifting=state.drifting;for(const o of state.oil||[])if(!oils.some(x=>x.id===o.id)&&o.expires>elapsed)oils.push(o);}
 updateStandings();
}
function connectRealtime(active){
 if(active!==online||active.socket?.readyState<2||typeof WebSocket==='undefined')return;
 try{const base=new URL(window.BREUER_API||location.origin);base.protocol=base.protocol==='http:'?'ws:':'wss:';base.pathname='/api/realtime';base.search='';const ws=new WebSocket(base.href);active.socket=ws;
 ws.onopen=()=>ws.send(JSON.stringify({action:'hello',code:active.code,id:active.id,token:active.token}));
 ws.onmessage=e=>{if(active!==online)return;let d;try{d=JSON.parse(e.data);}catch{return;}if(d.type==='snapshot'){active.stateClock?.observe(Math.max(0,(d.serverTime-active.startAt)/1000));active.socketReady=true;const own=d.players?.find(p=>p.id===active.id)?.state;if(own){active.sequence=Math.max(active.sequence||0,own.sequence||0);active.stateClock?.observe(own.raceTime);}active.offset=active.offset*.8+(d.serverTime-Date.now())*.2;syncOpponents(d);}else if(d.type==='error'){active.socketReady=false;ws.close();}};
 ws.onclose=()=>{active.socketReady=false;};ws.onerror=()=>{active.socketReady=false;};
 }catch{active.socketReady=false;}
}
async function pollRoom(){
 const current=online;if(!current)return;
 try{
  let d;
  if(current.started&&player&&current.socketReady&&current.socket?.readyState===WebSocket.OPEN){current.socket.send(JSON.stringify({action:'state',state:snapshot()}));d=null;}
  else d=await api(`/rooms/${current.code}/tick`,{id:current.id,token:current.token,...(current.started&&player?{state:snapshot()}: {})});
  if(online!==current)return;current.failures=0;
  if(d){current.stateClock?.observe(Math.max(0,(d.serverTime-current.startAt)/1000));current.offset=current.offset*.75+(d.serverTime-Date.now())*.25;current.host=d.hostId===current.id||d.host;current.config=d.config||current.config;current.configRevision=d.configRevision;
   if(!current.started){
    if($('lobby-config'))$('lobby-config').textContent=`${trackMeta(current.config.trackId).name} · ${current.config.laps} Runden · ${current.config.rules==='classic'?'Klassisch':'Action'}`;
    if($('lobby-players'))$('lobby-players').innerHTML=d.players.map(p=>`<li><b>${escapeHTML(p.name)}${p.id===current.id?' (Du)':''}${p.id===d.hostId?' · Gastgeber':''}</b><span>${CARS[p.car].short} · ${p.ready?'Bereit ✓':p.connected?'Lädt / wartet':'Verbindung fehlt'}</span></li>`).join('');
    current.ready=!!d.players.find(p=>p.id===current.id)?.ready;
    if($('lobby-status'))$('lobby-status').textContent=d.players.length+' / 6 Fahrer · '+d.players.filter(p=>p.ready).length+' bereit.';
    if($('ready-room')){$('ready-room').disabled=!!current.preparing||MAP?.trackId!==current.config.trackId;$('ready-room').textContent=current.ready?'Bereit ✓ · Ändern':'Bereit zum Rennen';}
    if($('start-room')){$('start-room').hidden=!current.host;$('start-room').disabled=d.players.filter(p=>p.connected).length<2||d.players.some(p=>p.connected&&!p.ready);}
    if($('host-note'))$('host-note').textContent=current.host?'Du bist der Gastgeber.':'Der Gastgeber startet, sobald alle bereit sind.';
    if(d.startAt){current.startAt=d.startAt;current.started=true;await beginRace(true,d.players);connectRealtime(current);}
   }else{syncOpponents(d);if(performance.now()-(current.lastReconnect||0)>10000){current.lastReconnect=performance.now();connectRealtime(current);}}
  }
 }catch(e){if(online!==current)return;current.failures++;if($('lobby-status'))$('lobby-status').textContent=e.message;if(current.failures>=3&&current.started)notify('Verbindung unterbrochen. Neuer Versuch …',2);if(current.failures>=12){current.socket?.close();togglePause(true);keys.clear();touchControls?.clear();dialog(`${closeHead()}<h2 id="dialog-title">Die Verbindung ist gerade weg.</h2><p>Dein Fahrerzugang bleibt gespeichert. Versuche, deinen Raum erneut zu verbinden.</p><button id="network-reconnect" class="primary">Erneut verbinden</button><button id="network-back" class="secondary">Zur Garage</button>`);$('network-reconnect').onclick=()=>{current.failures=0;$('dialog').hidden=true;togglePause(false);pollRoom();};$('network-back').onclick=()=>{closeDialog();backToGarage();};return;}}
 if(online===current)pollTimer=setTimeout(pollRoom,current.started?(current.socketReady?100:220):800);
}

function applyGraphics(){
 if(!renderer)return;graphicsLevel=renderer.isCompatibilityRenderer?0:graphics==='smooth'?0:graphics==='detail'?2:frameQuality.level;
 // Never below one pixel per CSS pixel: blurry phones looked cheap. MSAA in the
 // comic target smooths edges instead of rendering more pixels.
 const ratios=coarse?[1.1,1.2,1.35]:[1,1,1.25];renderer.setPixelRatio(Math.min(devicePixelRatio||1,ratios[graphicsLevel]));comic?.setSamples(graphicsLevel===0?0:4);renderer.shadowMap.enabled=true;renderer.shadowMap.needsUpdate=true;shadowAt=-1;camera.far=[260,360,480][graphicsLevel];world?.setQuality?.(graphicsLevel);for(const m of meshes.values())setCarQuality(m,graphicsLevel);for(const m of showroom?.cars||[])setCarQuality(m,Math.max(1,graphicsLevel));resize();
}
function prepareShadows(time){if(time<shadowAt||time-shadowAt>(graphicsLevel===2?.05:graphicsLevel===1?.08:.12)){renderer.shadowMap.needsUpdate=true;shadowAt=time;}}
if(!['auto','smooth','detail','2d'].includes(graphics))graphics='auto';$('graphics').value=graphics;
$('graphics').onchange=()=>{const previous=graphics;graphics=$('graphics').value;save.set('breuer-graphics',graphics);if(graphics==='2d'&&previous!=='2d'||previous==='2d'&&graphics!=='2d'){location.reload();return;}applyGraphics();notify(renderer.isCompatibilityRenderer?'2D-Kompatibilität ist aktiv.':graphics==='smooth'?'Flüssige Darstellung aktiviert.':graphics==='detail'?'Mehr Grafikdetails aktiviert.':'Die Grafik passt sich automatisch an.');};
function resize(){garageDirty=true;worldRenderDirty=true;syncGaragePreview();if(!renderer)return;const w=innerWidth,h=innerHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();if($('track-preview'))drawMap($('track-preview'),[],true);}
function drawCourseCards(){
 for(const meta of TRACKS){const canvas=$('preview-track-'+meta.id);if(!canvas)continue;const w=320,h=120;canvas.width=w*2;canvas.height=h*2;const c=canvas.getContext('2d');c.scale(2,2);const bounds=meta.preview.reduce((b,p)=>[Math.min(b[0],p[0]),Math.max(b[1],p[0]),Math.min(b[2],p[1]),Math.max(b[3],p[1])],[Infinity,-Infinity,Infinity,-Infinity]);const scale=Math.min((w-40)/(bounds[1]-bounds[0]),(h-25)/(bounds[3]-bounds[2])),X=x=>(x-(bounds[0]+bounds[1])/2)*scale+w/2,Z=z=>(z-(bounds[2]+bounds[3])/2)*scale+h/2;
  c.fillStyle='#25282d';c.fillRect(0,0,w,h);c.lineCap=c.lineJoin='round';for(const [color,width] of [['#55595f',8],[meta.accent,4]]){c.strokeStyle=color;c.lineWidth=width;c.beginPath();meta.preview.forEach((p,i)=>i?c.lineTo(X(p[0]),Z(p[1])):c.moveTo(X(p[0]),Z(p[1])));c.stroke();}const p=meta.preview[0];c.fillStyle='#fff';c.fillRect(X(p[0])-3,Z(p[1])-3,6,6);if($('track-length-'+meta.id))$('track-length-'+meta.id).textContent=(meta.length/1000).toFixed(2).replace('.',',')+' km';
 }
}
function bindOptions(){
 let stored;try{stored=JSON.parse(save.get('breuer-race-config')||'null');}catch{}
 if(stored){for(const [id,value] of Object.entries({'race-mode':stored.mode,laps:stored.laps,opponents:stored.opponents,rules:stored.rules}))if($(id)&&value!==undefined)$(id).value=String(value);if($('auto-drift'))$('auto-drift').checked=stored.autoDrift!==false;}
 for(const id of ['race-mode','laps','opponents','rules','auto-drift','ghost','steering-sensitivity'])if($(id))$(id).addEventListener('change',()=>{if(['time-trial','challenge'].includes($('race-mode').value))$('rules').value='classic';if($('steering-value'))$('steering-value').textContent=Number($('steering-sensitivity').value).toFixed(1).replace('.',',')+'×';updateRaceOptions();notify('Renntag-Einstellungen aktualisiert.');});
 $$('[data-track]').forEach(b=>b.addEventListener('click',()=>chooseTrack(b.dataset.track)));
 touchControls=new TouchControls({root:$('touch-controls'),surface:$('view'),portrait:$('orientation-lock'),onAction:action=>{if(action==='item')activateItem();if(action==='reset'&&mode==='race'&&!paused){resetVehicle(player,track);audio.play('reset');}},onOrientationChange:blocked=>{keys.clear();if(blocked&&(mode==='race'||mode==='countdown')){portraitPaused=!paused;togglePause(true);$('orientation-lock')?.focus({preventScroll:true});}else if(!blocked&&portraitPaused){portraitPaused=false;togglePause(false);}}});
 briefing=new StartBriefing({host:document.body,onReleaseInputs:()=>{keys.clear();touchControls.clear();},onBlock:active=>touchControls.setBlocked('briefing',active)});
 updateRaceOptions();chooseTrack(trackId);drawCourseCards();
}
try{
 bindOptions();
 entryScreen=new EntryScreen({root:document,reduced,onEnter:()=>{garageDirty=true;garageFlow?.goTo('car',{scroll:false});}});
 if(graphics==='2d')renderer=new LightweightCanvasRenderer({canvas:$('view')});else{try{renderer=new THREE.WebGLRenderer({canvas:$('view'),antialias:false,alpha:true,powerPreference:'high-performance'});}catch(e){console.warn('WebGL unavailable; using 2D compatibility:',e.message);renderer=new LightweightCanvasRenderer({canvas:$('view')});}}
 if(!renderer.isCompatibilityRenderer)comic=new ComicPost(renderer);renderer.shadowMap.autoUpdate=false;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NeutralToneMapping;renderer.toneMappingExposure=1.12;
 camera=new THREE.PerspectiveCamera(63,innerWidth/innerHeight,.2,260);showroom=makePremiumShowroom({makeCar,disposeScene,renderModels:false});garageCamera=new THREE.PerspectiveCamera(35,1,.1,120);
 garageVehiclePreview=createGarageVehiclePreview({host:$('showroom-slot'),stage:$('garage-art'),reduced});
 // The menu loads independently of the village. Shared models are kept only once.
 if(renderer.isCompatibilityRenderer&&$('renderer-mode')){$('renderer-mode').hidden=false;$('renderer-mode').textContent='2D-Kompatibilität ist aktiv. Du fährst mit denselben Rennregeln ohne Grafikbeschleunigung.';}
 renderer.onInvalidate=()=>{garageDirty=true;};chooseCar(selected);
 applyGraphics();window.addEventListener('resize',resize);$('garage').addEventListener('scroll',()=>garageDirty=true,{passive:true,capture:true});if(typeof ResizeObserver!=='undefined')new ResizeObserver(()=>garageDirty=true).observe($('showroom-slot'));
 $('view').addEventListener('webglcontextlost',e=>{e.preventDefault();togglePause(true);notify('Grafikverbindung verloren. Seite bitte neu laden.',10);});
 $('start-solo').disabled=false;$('start-solo').textContent='Starten';$('load-status').textContent='Alles bereit. Die Strecke lädt, sobald du startest.';
 garageFlow=createGarageFlow({onStepChange:()=>{garageDirty=true;syncGaragePreview();},onLayoutChange:()=>{garageDirty=true;syncGaragePreview();}});garageCarousel=createGarageCarousel({root:document});
 driverUI=createDriverProfileUI({root:document,client:onlineRecords,dialog,dialogHead,closeDialog,notify,getCategory:()=>recordConfig(readConfig()),getTrackName:id=>trackMeta(id).name});
 if($('online-result-submit'))$('online-result-submit').onclick=()=>submitFinishedRun();if($('result-leaderboard'))$('result-leaderboard').onclick=()=>driverUI.leaderboard(finishedRun?.config||recordConfig(readConfig()));
 entryScreen.ready();requestAnimationFrame(frame);
 if(new URLSearchParams(location.search).has('room')){entryScreen.enter();onlineForm();}
}catch(e){
 console.error('Breuer GP initialization:',e);entryScreen?.setPhase('Das Spiel konnte nicht geladen werden. Bitte die Seite neu laden.');$('start-solo').textContent='Spiel nicht verfügbar';$('load-status').textContent='Für dieses Spiel wird WebGL 2 benötigt. Aktiviere die Hardwarebeschleunigung oder öffne es in einem aktuellen Browser.';$('open-online').disabled=true;
}

window.addEventListener('pagehide',event=>{if(event.persisted)audio.setPaused(true);else audio.dispose();});
window.addEventListener('pageshow',event=>{if(event.persisted)audio.setPaused(paused||!!touchControls?.blocked);});
