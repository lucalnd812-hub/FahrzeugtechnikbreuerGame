import {CARS} from './car-catalog.js';
import {getVehicleArtLibrary,frameIndexForAngle,closestLoadedFrame,vehicleArtPlacement,VEHICLE_ART_FRAMES} from './vehicle-art.js';

// Keep the fleet's entire rotation envelope large in short landscape stages.
// This is one fixed floor pivot for every model/angle, not per-frame fitting.
const FIT=.94,GROUND_Y=.735,MAX_PENDING=2,LOAD_TIMEOUT=7000;
const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
const indexFor=value=>typeof value==='string'&&CARS.some(car=>car.id===value)
 ?CARS.findIndex(car=>car.id===value):clamp(Number.isFinite(Number(value))?Math.trunc(Number(value)):0,0,CARS.length-1);
const imageSize=image=>[image?.naturalWidth||image?.width||0,image?.naturalHeight||image?.height||0];

/** The garage is a real DOM layer, independent of the race canvas/WebGL state.
 * Uses only the selected model's requested views; never starts a 16-view sweep.
 * The shared art library owns the image cache. This view owns no animation loop. */
export function createGarageVehiclePreview({host,artLibrary=getVehicleArtLibrary(),reduced=false}={}){
 if(!host?.ownerDocument?.createElement)throw new TypeError('A garage preview host is required');
 const document=host.ownerDocument,view=document.defaultView||globalThis;
 const canvas=document.createElement('canvas'),fallback=document.createElement('img'),status=document.createElement('span');
 canvas.className='garage-vehicle-canvas';canvas.setAttribute('aria-hidden','true');
 Object.assign(canvas.style,{position:'absolute',inset:'0',width:'100%',height:'100%',pointerEvents:'none',zIndex:'1'});
 fallback.className='garage-vehicle-fallback';fallback.alt='';fallback.decoding='async';fallback.draggable=false;
 Object.assign(fallback.style,{position:'absolute',pointerEvents:'none',zIndex:'1',maxWidth:'none',maxHeight:'none',objectFit:'fill'});
 status.className='garage-vehicle-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 status.setAttribute('aria-atomic','true');
 Object.assign(status.style,{position:'absolute',left:'50%',bottom:'6px',transform:'translateX(-50%)',maxWidth:'90%',
  padding:'5px 9px',borderRadius:'6px',font:'600 12px/1.35 system-ui,sans-serif',textAlign:'center',
  color:'#fff7e8',background:'#15202dd9',pointerEvents:'none',zIndex:'2'});
 host.appendChild(canvas);host.appendChild(fallback);host.appendChild(status);
 let context=null;try{context=canvas.getContext('2d',{alpha:true,desynchronized:true});}catch{}
 let disposed=false,size={width:0,height:0,dpr:1},lastGood=null,lastPaint='',thumbnailWatch=null;
 let state={car:0,heading:-.65,rev:0,lights:false,visible:true};
 const pending=new Map(),failed=new Set();
 const now=()=>view.performance?.now?.()??globalThis.performance?.now?.()??0;
 const keyFor=(car,frame)=>car+':'+frame;
 const timerFor=callback=>{const timer=(view.setTimeout||globalThis.setTimeout)(callback,LOAD_TIMEOUT);timer?.unref?.();return timer;};
 const clearTimer=timer=>(view.clearTimeout||globalThis.clearTimeout)(timer);

 function publish(kind,message=''){
  if(host.dataset.vehiclePreviewState!==kind)host.dataset.vehiclePreviewState=kind;
  if(host.dataset.vehiclePreviewCar!==CARS[state.car].id)host.dataset.vehiclePreviewCar=CARS[state.car].id;
  if(status.textContent!==message)status.textContent=message;
  const hidden=!state.visible||!message;if(status.hidden!==hidden)status.hidden=hidden;
 }
 function cachedRecord(){
  const entry=artLibrary.entry(state.car),target=frameIndexForAngle(state.heading);
  // Keep the exact previously painted view during a pending drag. Choosing a
  // different nearest cached angle on every pointer event would visibly flash.
  if(!entry.frames.has(target)&&lastGood?.car===state.car)return lastGood;
  const frame=closestLoadedFrame(entry.frames,target);
  return frame===null?null:{car:state.car,frame,image:entry.frames.get(frame),library:true};
 }
 function thumbnailRecord(){
  const image=document.querySelector?.(`[data-car="${state.car}"] img`),[width,height]=imageSize(image);
  if(!image||image.complete===false||!width||!height)return null;
  const match=(image.currentSrc||image.src||'').match(/\/(\d{2})\.webp(?:[?#]|$)/);
  return {car:state.car,frame:match?Number(match[1]):0,image,library:false};
 }
 function watchThumbnail(){
  const image=document.querySelector?.(`[data-car="${state.car}"] img`);
  if(thumbnailWatch?.image===image)return;
  thumbnailWatch?.image.removeEventListener?.('load',thumbnailWatch.listener);
  thumbnailWatch=null;
  if(image){const listener=()=>{if(!disposed&&state.visible){lastPaint='';paint();pump();}};
   image.addEventListener?.('load',listener);thumbnailWatch={image,listener};}
 }
 function placement(record){
  const [width,height]=imageSize(record.image);
  const p=vehicleArtPlacement(record.car,record.frame,{width:size.width,height:size.height,fit:FIT,anchorY:GROUND_Y});
  return p?{...p,bounds:p.source,width,height}:null;
 }
 function showImage(record){
  const p=placement(record);if(!p)return false;
  const {bounds,scale,left,top,width,height}=p;
  // Match the same fixed scale and ground pivot even without Canvas2D.
  const src=record.image.currentSrc||record.image.src;
  if(!src)return false;
  if(fallback.src!==src)fallback.src=src;
  Object.assign(fallback.style,{left:(left-bounds[0]*scale)+'px',top:(top-bounds[1]*scale)+'px',
   width:width*scale+'px',height:height*scale+'px'});
  fallback.hidden=false;canvas.hidden=true;return true;
 }
 function paint(force=false){
  if(disposed)return;
  if(!state.visible){canvas.hidden=fallback.hidden=status.hidden=true;if(host.dataset.vehiclePreviewState!=='hidden')host.dataset.vehiclePreviewState='hidden';return;}
  const target=frameIndexForAngle(state.heading),record=cachedRecord()||thumbnailRecord()||lastGood;
  const waiting=pending.has(keyFor(state.car,target));
  if(!record){
   canvas.hidden=false;fallback.hidden=true;
   publish(failed.has(keyFor(state.car,target))?'error':'loading',failed.has(keyFor(state.car,target))
    ?'Deine Autoansicht ist gerade nicht verfügbar. Wähle kurz ein anderes Auto.'
    :'Deine Autoansicht wird geladen.');
   return;
  }
  const selected=record.car===state.car,exact=selected&&record.frame===target;
  const fingerprint=[record.car,record.frame,size.width,size.height,size.dpr,state.lights,!reduced&&state.rev>0?now():0].join(':');
  if(force||fingerprint!==lastPaint){
   let drawn=false;
   if(size.width>0&&size.height>0&&context){
    try{
     context.setTransform(size.dpr,0,0,size.dpr,0,0);context.clearRect(0,0,size.width,size.height);
     const {bounds,scale,left,top}=placement(record);
     if(record.library&&artLibrary.entry(record.car).frames.get(record.frame)===record.image){drawn=artLibrary.draw(context,record.car,record.frame*Math.PI*2/VEHICLE_ART_FRAMES,
      {x:0,y:0,width:size.width,height:size.height,fit:FIT,anchorY:GROUND_Y,contentFit:true});}
     else {context.drawImage(record.image,...bounds,left,top,bounds[2]*scale,bounds[3]*scale);drawn=true;}
    }catch{}
   }
   if(drawn){canvas.hidden=false;fallback.hidden=true;}
   else showImage(record);
   // A restrained exposure pulse acknowledges revving without moving the tyres
   // off the contact shadow or changing the car's physical projected size.
   const pulse=!reduced&&state.rev>0?Math.sin(now()*.045)*.014*state.rev:0;
   const brightness=state.lights?1.1:1;
   canvas.style.filter=fallback.style.filter=state.lights||pulse?'brightness('+(brightness+pulse).toFixed(3)+') saturate(1.03)':'none';
   lastPaint=fingerprint;lastGood=record;
  }
  if(host.dataset.vehiclePreviewFrame!==String(record.frame))host.dataset.vehiclePreviewFrame=String(record.frame);
  const projected=placement(record);
  if(projected){for(const [key,value] of Object.entries({vehiclePreviewScale:projected.scale,vehiclePreviewGroundX:projected.groundX,vehiclePreviewGroundY:projected.groundY})){
   const text=value.toFixed(6);if(host.dataset[key]!==text)host.dataset[key]=text;
  }}
  if(!selected)publish('loading',failed.has(keyFor(state.car,target))
   ?'Deine neue Autoansicht ist gerade nicht verfügbar. Das vorherige Auto bleibt sichtbar.'
   :'Dein ausgewähltes Auto wird geladen.');
  else if(!exact&&failed.has(keyFor(state.car,target)))publish('fallback','Dein Auto bleibt sichtbar. Diese Perspektive ist gerade nicht verfügbar.');
  else publish(exact?'ready':'fallback',waiting&&!exact?'Die nächste Perspektive wird geladen.':'');
 }
 function startRequest(car,frame){
  const key=keyFor(car,frame),request={car,frame,timer:null};pending.set(key,request);
  const settle=success=>{
   if(pending.get(key)!==request){
    // A very late image may still repair a view after the finite loading status.
    if(success&&!disposed){failed.delete(key);if(state.visible){lastPaint='';paint();pump();}}return;
   }
   clearTimer(request.timer);pending.delete(key);
   if(!success)failed.add(key);else failed.delete(key);
   if(disposed)return;
   artLibrary.trim?.({maxFrames:24,keepCar:state.car});
   if(state.visible){lastPaint='';paint();pump();}
  };
  request.timer=timerFor(()=>settle(false));
  Promise.resolve().then(()=>disposed||!state.visible||state.car!==car?null:artLibrary.loadFrame(car,frame)).then(image=>settle(!!image),()=>settle(false));
 }
 function pump(){
  if(disposed||!state.visible)return;
  const target=frameIndexForAngle(state.heading),frames=[target];
  if(!cachedRecord()&&!thumbnailRecord()&&target!==0)frames.push(0);
  for(const frame of frames){
   if(pending.size>=MAX_PENDING)break;
   const key=keyFor(state.car,frame);
   if(!pending.has(key)&&!failed.has(key)&&!artLibrary.entry(state.car).frames.has(frame))startRequest(state.car,frame);
  }
 }
 function resize(){
  if(disposed)return;
  const rect=host.getBoundingClientRect(),width=Math.max(0,host.clientWidth||rect.width||0),height=Math.max(0,host.clientHeight||rect.height||0);
  const dpr=clamp(Number(view.devicePixelRatio)||1,1,2);
  if(width===size.width&&height===size.height&&dpr===size.dpr)return;
  size={width,height,dpr};canvas.width=Math.max(1,Math.round(width*dpr));canvas.height=Math.max(1,Math.round(height*dpr));
  lastPaint='';paint(true);
 }
 function update(options={}){
  if(disposed)return;
  const previous=state,car=options.car===undefined?state.car:indexFor(options.car);
  state={car,heading:Number.isFinite(options.heading)?options.heading:state.heading,
   rev:options.rev===undefined?state.rev:clamp(Number(options.rev)||0,0,1),
   lights:options.lights===undefined?state.lights:!!options.lights,
   visible:options.visible===undefined?state.visible:!!options.visible};
  if(state.car!==previous.car){
   for(const key of failed)if(key.startsWith(state.car+':'))failed.delete(key);
   lastPaint='';watchThumbnail();
   artLibrary.trim?.({maxFrames:24,keepCar:state.car});
  }
  if(state.visible&&!previous.visible){failed.clear();resize();}
  if(!size.width||!size.height)resize();
  paint();pump();
 }
 const Observer=view.ResizeObserver||globalThis.ResizeObserver;
 const observer=typeof Observer==='function'?new Observer(()=>resize()):null;
 observer?.observe(host);view.addEventListener?.('resize',resize,{passive:true});
 // Let the controller immediately apply a persisted selected car before any
 // default Kadett request starts. This also coalesces same-tick initial setup.
 watchThumbnail();resize();paint();Promise.resolve().then(pump);
 return {update,resize,dispose(){
  if(disposed)return;disposed=true;
  observer?.disconnect();view.removeEventListener?.('resize',resize);
  thumbnailWatch?.image.removeEventListener?.('load',thumbnailWatch.listener);thumbnailWatch=null;
  for(const request of pending.values())clearTimer(request.timer);pending.clear();
  canvas.remove();fallback.remove();status.remove();lastGood=null;
  delete host.dataset.vehiclePreviewState;delete host.dataset.vehiclePreviewCar;delete host.dataset.vehiclePreviewFrame;
  delete host.dataset.vehiclePreviewScale;delete host.dataset.vehiclePreviewGroundX;delete host.dataset.vehiclePreviewGroundY;
 }};
}
