import assert from 'node:assert/strict';
import {createGarageVehiclePreview} from '../src/garage-vehicle-preview.js';
import {VehicleArtLibrary,frameIndexForAngle,vehicleArtPlacement,getVehicleArtFraming,naturalGroundY} from '../src/vehicle-art.js';
import manifest from '../assets/vehicles/manifest.json' with {type:'json'};

// Exercises the real shared art library and alpha bounds. This deliberately has
// no global race canvas, WebGL renderer, requestAnimationFrame or THREE scene.
class Context{
 constructor(){this.globalAlpha=1;this.draws=[];this.clears=[];this.transforms=[];this.saved=[];}
 save(){this.saved.push(this.globalAlpha);}restore(){this.globalAlpha=this.saved.pop();}
 setTransform(...args){this.transforms.push(args);}clearRect(...args){this.clears.push(args);}
 drawImage(...args){this.draws.push(args);}
}
class Element{
 constructor(tag,document){this.tagName=tag.toUpperCase();this.ownerDocument=document;this.style={};this.dataset={};this.attrs={};this.children=[];this.listeners=new Map();this.hidden=false;this.textContent='';this.parentElement=null;this.clientWidth=0;this.clientHeight=0;}
 appendChild(child){this.children.push(child);child.parentElement=this;return child;}
 remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(c=>c!==this);this.parentElement=null;}
 setAttribute(key,value){this.attrs[key]=String(value);}getAttribute(key){return this.attrs[key];}
 addEventListener(type,listener){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(listener);}
 removeEventListener(type,listener){this.listeners.get(type)?.delete(listener);}
 emit(type){for(const listener of this.listeners.get(type)||[])listener();}
 getContext(){return this.ownerDocument.context;}
 getBoundingClientRect(){return {left:0,top:0,width:this.clientWidth,height:this.clientHeight};}
}
function environment({width=640,height=360,dpr=3,canvas=true}={}){
 const context=new Context(),listeners=new Map(),timers=new Map(),observers=[],thumbnails=new Map();let time=100,timerId=0;
 const view={devicePixelRatio:dpr,performance:{now:()=>time},
  setTimeout:fn=>{const id=++timerId;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),
  addEventListener:(type,fn)=>{if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);},
  removeEventListener:(type,fn)=>listeners.get(type)?.delete(fn),
  ResizeObserver:class{constructor(fn){this.fn=fn;this.targets=[];this.closed=false;observers.push(this);}observe(target){this.targets.push(target);}disconnect(){this.closed=true;}}
 };
 const document={defaultView:view,context:canvas?context:null,createElement:tag=>new Element(tag,document),
  querySelector:selector=>{const match=selector.match(/^\[data-car="(\d+)"\] img$/);return match?thumbnails.get(Number(match[1]))||null:null;}};
 const host=new Element('div',document);host.clientWidth=width;host.clientHeight=height;host.style.position='absolute';
 return {context,document,host,view,timers,observers,listeners,thumbnails,tick:()=>time+=16,expire(){for(const fn of [...timers.values()])fn();}};
}
function realLibrary(){
 const images=[],requests=[];
 const library=new VehicleArtLibrary({baseUrl:'/vehicles',version:'test',imageFactory(){
  const image={naturalWidth:640,naturalHeight:400,width:640,height:400,complete:false,_src:''};
  Object.defineProperty(image,'src',{get(){return this._src;},set(value){this._src=value;requests.push(value);}});
  images.push(image);return image;
 }});
 const image=(car,frame)=>images.find(img=>img.src.includes('/'+manifest.cars[car].id+'/'+String(frame).padStart(2,'0')+'.webp'));
 const loaded=(car,frame)=>{const img=image(car,frame);assert.ok(img,`Requested ${car}/${frame}`);img.complete=true;img.onload();return img;};
 const failed=(car,frame)=>{const img=image(car,frame);assert.ok(img);img.onerror();};
 return {library,images,requests,image,loaded,failed};
}
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
const child=(env,name)=>env.host.children.find(node=>node.className===name);
const GROUND_Y=naturalGroundY(.94);
const garagePlacement=(car,frame,width,height)=>vehicleArtPlacement(car,frame,{width,height,fit:.94,anchorY:GROUND_Y});
function checkCrop(draw,car,frame,width,height){
 assert.equal(draw.length,9,'Canvas must crop the manifest alpha padding, not fit the empty 640x400 image');
 const bounds=manifest.cars[car].files.find(file=>file.frame===frame).contentBounds;
 assert.deepEqual(draw.slice(1,5),bounds);const [x,y,w,h]=draw.slice(5);
 assert.ok(x>=0&&y>=0&&x+w<=width+.01&&y+h<=height+.01,'Actual model fits completely inside its host');
 const p=garagePlacement(car,frame,width,height);
 for(const [actual,expected] of [[x,p.left],[y,p.top],[w,p.width],[h,p.height]])assert.ok(Math.abs(actual-expected)<1e-7);
 assert.ok(Math.abs(w/bounds[2]-p.scale)<1e-10,'Alpha crop must use the fixed full-turntable scale');
 assert.ok(Math.abs(x+(p.sourceAnchor[0]-bounds[0])*p.scale-width*.5)<1e-7,'World ground pivot X stays fixed');
 assert.ok(Math.abs(y+(p.sourceAnchor[1]-bounds[1])*p.scale-height*GROUND_Y)<1e-7,'World ground pivot Y stays on the same garage floor');
}

// Initial desired angle is front-quarter view 14; only that plus fallback 00
// may load. A fallback image must remain visible until the requested view lands.
const env=environment(),art=realLibrary(),preview=createGarageVehiclePreview({host:env.host,artLibrary:art.library});await flush();
assert.equal(env.host.style.position,'absolute','The view must preserve the UI-owned absolute containing block');
assert.equal(env.host.children.length,3);const canvas=child(env,'garage-vehicle-canvas'),status=child(env,'garage-vehicle-status');
assert.equal(canvas.style.pointerEvents,'none');assert.equal(canvas.width,1280);assert.equal(canvas.height,720,'DPR is capped at two');
assert.equal(env.host.dataset.vehiclePreviewState,'loading');assert.equal(status.hidden,false);
assert.equal(art.requests.length,2,'No eager 16-view sweep');assert.ok(art.image(0,14));assert.ok(art.image(0,0));
const fallback=art.loaded(0,0);await flush();assert.equal(env.host.dataset.vehiclePreviewFrame,'0');checkCrop(env.context.draws.at(-1),0,0,640,360);
const first=art.loaded(0,14);await flush();assert.equal(env.host.dataset.vehiclePreviewState,'ready');assert.equal(status.hidden,true);
assert.equal(env.context.draws.at(-1)[0],first);checkCrop(env.context.draws.at(-1),0,14,640,360);
const drawsAtRest=env.context.draws.length,clearsAtRest=env.context.clears.length;
for(let i=0;i<600;i++)preview.update({car:0,heading:-.65,rev:0,lights:false,visible:true});
assert.equal(env.context.draws.length,drawsAtRest);assert.equal(env.context.clears.length,clearsAtRest);assert.equal(art.requests.length,2,'Idle updates create no redraw, request or animation loop');

// A real rotation uses a new frame while preserving the last good pixels. Rapid
// drags can request at most two views; when one finishes the latest heading wins.
preview.update({heading:Math.PI/2});await flush();assert.equal(art.requests.length,3);assert.equal(env.context.draws.at(-1)[0],first);
for(let i=0;i<200;i++)preview.update({heading:i/10});
preview.update({heading:Math.PI});await flush();assert.ok(art.requests.length<=4,'Rapid drag does not fetch all intermediate angles');
const four=art.loaded(0,4);await flush();assert.ok(art.image(0,8),'The latest drag heading is next in line');
const eight=art.loaded(0,8);await flush();assert.equal(env.context.draws.at(-1)[0],eight);assert.equal(env.host.dataset.vehiclePreviewFrame,'8');

// Selection remains correct with a preloaded real thumbnail even before the
// art library has loaded that car. The source uses the selected car's alpha bounds.
const thumb=new Element('img',env.document);Object.assign(thumb,{complete:true,naturalWidth:640,naturalHeight:400,src:'/vehicles/m2/02.webp?v=test'});env.thumbnails.set(3,thumb);
preview.update({car:3,heading:-.65});assert.equal(env.context.draws.at(-1)[0],thumb);checkCrop(env.context.draws.at(-1),3,2,640,360);await flush();
assert.ok(art.image(3,14));assert.equal(art.image(3,0),undefined,'An existing selected thumbnail avoids an extra fallback request');
art.failed(3,14);await flush();assert.equal(env.host.dataset.vehiclePreviewState,'fallback');assert.equal(status.hidden,false);
const requestsAfterError=art.requests.length;
for(let i=0;i<100;i++)preview.update({car:3,heading:-.65});await flush();
assert.equal(art.requests.length,requestsAfterError,'A failed angle is not retried every render frame');
assert.equal(env.context.draws.at(-1)[0],thumb,'A network failure never blanks a visible selected car');

// Resize keeps the real silhouette large and fully visible on a narrow phone.
env.host.clientWidth=312;env.host.clientHeight=188;env.observers[0].fn();
assert.equal(canvas.width,624);assert.equal(canvas.height,376);checkCrop(env.context.draws.at(-1),3,2,312,188);
preview.update({lights:true});assert.equal(canvas.style.filter,'brightness(1.100) saturate(1.03)');
env.tick();preview.update({rev:1});const revPlacement=env.context.draws.at(-1).slice(1),revFilter=canvas.style.filter;env.tick();preview.update({rev:1});
assert.deepEqual(env.context.draws.at(-1).slice(1),revPlacement,'Revving must never bounce the wheel contact off the fixed ground');assert.notEqual(canvas.style.filter,revFilter,'Motor revs retain restrained event-driven exposure feedback');

// Race/route hiding stops drawing and new loads, including already-queued
// microtasks. Showing it again permits one useful retry instead of a spinner.
preview.update({visible:false,car:4,heading:1});const hiddenDraws=env.context.draws.length,hiddenRequests=art.requests.length;await flush();
for(let i=0;i<50;i++)preview.update({visible:false,heading:i});await flush();
assert.equal(env.context.draws.length,hiddenDraws);assert.equal(art.requests.length,hiddenRequests);assert.equal(canvas.hidden,true);assert.equal(status.hidden,true);
preview.update({visible:true,car:3,heading:-.65,rev:0});await flush();assert.equal(canvas.hidden,false);assert.ok(art.requests.length>requestsAfterError,'Showing the garage allows a finite failed-frame retry');
// Same car and heading after a hidden step (course -> race) must be drawn again.
preview.update({visible:false});await flush();preview.update({visible:true,car:3,heading:-.65,rev:0});await flush();assert.equal(canvas.hidden,false,'The unchanged car reappears after a hidden step');
const drawsBeforeDispose=env.context.draws.length;preview.dispose();preview.dispose();
assert.equal(env.host.children.length,0);assert.equal(env.observers[0].closed,true);assert.equal(env.listeners.get('resize').size,0);assert.equal(thumb.listeners.get('load').size,0);assert.equal(env.timers.size,0);
preview.update({car:2});preview.resize();assert.equal(env.context.draws.length,drawsBeforeDispose);

// Every selected model can appear immediately from its already-loaded actual
// thumbnail. Persisted selections applied at mount never load the default car.
for(let car=0;car<manifest.cars.length;car++){
 const e=environment({width:330,height:190}),a=realLibrary();
 const thumbnails=manifest.cars.map((spec,index)=>{const image=new Element('img',e.document);
  Object.assign(image,{complete:true,naturalWidth:640,naturalHeight:400,src:`/vehicles/${spec.id}/02.webp?v=test`});e.thumbnails.set(index,image);return image;});
 const p=createGarageVehiclePreview({host:e.host,artLibrary:a.library});p.update({car:manifest.cars[car].id,heading:0});
 assert.equal(e.context.draws.at(-1)[0],thumbnails[car]);assert.equal(e.host.dataset.vehiclePreviewCar,manifest.cars[car].id);
 checkCrop(e.context.draws.at(-1),car,2,330,190);await flush();assert.equal(a.requests.length,1);
 assert.ok(a.image(car,0),'The one startup request must belong to the persisted selected model');
 a.loaded(car,0);await flush();assert.equal(e.host.dataset.vehiclePreviewState,'ready');checkCrop(e.context.draws.at(-1),car,0,330,190);
 p.dispose();
}

// No WebGL AND no Canvas2D: the HTML image fallback still crops the visible
// model to the same fixed 360-degree fit. This tests the capability fallback.
const imageEnv=environment({width:420,height:240,canvas:false}),imageArt=realLibrary();
const imagePreview=createGarageVehiclePreview({host:imageEnv.host,artLibrary:imageArt.library,reduced:true});await flush();
const imageFrame=imageArt.loaded(0,14);await flush();const shown=child(imageEnv,'garage-vehicle-fallback');
assert.equal(shown.hidden,false);assert.equal(shown.src,imageFrame.src);assert.equal(child(imageEnv,'garage-vehicle-canvas').hidden,true);
const bounds=manifest.cars[0].files.find(file=>file.frame===14).contentBounds,scale=parseFloat(shown.style.width)/640;
assert.ok(Math.abs(scale-garagePlacement(0,14,420,240).scale)<1e-10);
const top=shown.style.top;imageEnv.tick();imagePreview.update({rev:1});assert.equal(shown.style.top,top,'Reduced motion suppresses rev bounce');imagePreview.dispose();

// A stalled request reaches a finite friendly error. A late success can repair
// that same view, and disposing while pending prevents all stale DOM writes.
const stalledEnv=environment(),stalledArt=realLibrary(),stalled=createGarageVehiclePreview({host:stalledEnv.host,artLibrary:stalledArt.library});await flush();
stalledEnv.expire();assert.equal(stalledEnv.host.dataset.vehiclePreviewState,'error');assert.equal(child(stalledEnv,'garage-vehicle-status').hidden,false);
const stillPending=stalledArt.requests.length;for(let i=0;i<100;i++)stalled.update({heading:-.65});await flush();assert.equal(stalledArt.requests.length,stillPending);
stalledArt.loaded(0,14);await flush();assert.equal(stalledEnv.host.dataset.vehiclePreviewState,'ready');assert.equal(child(stalledEnv,'garage-vehicle-status').hidden,true);
stalled.dispose();const staleDraws=stalledEnv.context.draws.length;stalledArt.loaded(0,0);await flush();assert.equal(stalledEnv.context.draws.length,staleDraws);assert.equal(stalledEnv.host.children.length,0);

// Mounting during a hidden step (zero-sized host) does not poison the canvas
// dimensions forever; reveal/resize must restore a correctly sized vehicle.
const zeroEnv=environment({width:0,height:0,dpr:1}),zeroArt=realLibrary(),zero=createGarageVehiclePreview({host:zeroEnv.host,artLibrary:zeroArt.library});await flush();zeroArt.loaded(0,14);await flush();
zeroEnv.host.clientWidth=700;zeroEnv.host.clientHeight=300;zero.update({visible:true});
assert.equal(child(zeroEnv,'garage-vehicle-canvas').width,700);checkCrop(zeroEnv.context.draws.at(-1),0,14,700,300);zero.dispose();
assert.equal(frameIndexForAngle(-.65),14);
assert.throws(()=>createGarageVehiclePreview(),/host/);

// Regression for the user's changing-size report: a full turntable is fitted
// ONCE per car/viewport. Front, quarter and side views cannot change metres per
// pixel or recenter the tyres as their alpha silhouettes change width/height.
let projections=0;
for(let car=0;car<manifest.cars.length;car++)for(const [width,height] of [[330,190],[568,210],[844,250],[700,500],[1250,650]]){
 const first=garagePlacement(car,0,width,height),framing=getVehicleArtFraming(car);
 assert.equal(first.scale,garagePlacement(0,0,width,height).scale,'All five cars share the same real-world metre scale');
 let maxOccupancy=0;
 for(let frame=0;frame<manifest.frames;frame++){
  const p=garagePlacement(car,frame,width,height);projections++;
  assert.equal(p.scale,first.scale,'Rotation must not change the projected scale');assert.equal(p.pixelsPerMetre,first.pixelsPerMetre);
  assert.equal(p.groundX,first.groundX);assert.equal(p.groundY,first.groundY);
  assert.ok(p.left>=width*.03-1e-7&&p.top>=height*.03-1e-7&&p.left+p.width<=width*.97+1e-7&&p.top+p.height<=height*.97+1e-7,'Every angle stays inside the common full-turntable fit');
  const [bx,by,bw,bh]=framing.bounds;
  maxOccupancy=Math.max(maxOccupancy,(p.groundX+(bx+bw-framing.anchor[0])*p.scale)/(width*.97),
   (p.groundY+(by+bh-framing.anchor[1])*p.scale)/(height*.97));
 }
 assert.ok(maxOccupancy>.8,'Fixed framing must not shrink the car into a distant thumbnail');
}

// Actual DOM draws in the short landscape stages reported by browser QA.
// Moving the fixed floor pivot into the full-fleet envelope's natural centre
// must recover useful height without changing scale during rotation or clipping.
for(const [width,height] of [[1024,181],[1024,235],[568,210],[568,180]])for(let car=0;car<manifest.cars.length;car++){
 const e=environment({width,height}),a=realLibrary(),entry=a.library.entry(car);
 for(let frame=0;frame<manifest.frames;frame++)entry.frames.set(frame,{naturalWidth:640,naturalHeight:400,complete:true,src:`/vehicles/${manifest.cars[car].id}/${String(frame).padStart(2,'0')}.webp`});
 const p=createGarageVehiclePreview({host:e.host,artLibrary:a.library});let stableScale,stableGround;
 for(let frame=0;frame<manifest.frames;frame++){
  p.update({car,heading:frame*Math.PI*2/manifest.frames});
  checkCrop(e.context.draws.at(-1),car,frame,width,height);
  stableScale??=e.host.dataset.vehiclePreviewScale;stableGround??=e.host.dataset.vehiclePreviewGroundY;
  assert.equal(e.host.dataset.vehiclePreviewScale,stableScale);assert.equal(e.host.dataset.vehiclePreviewGroundY,stableGround);
 }
 const corrected=garagePlacement(car,2,width,height),previous=vehicleArtPlacement(car,2,{width,height,fit:.88,anchorY:.64});
 // Baseline is the old fixed .64 pivot on the same (Blender) artwork.
 assert.ok(corrected.scale>=previous.scale*.999,'The stage-less fallback never shrinks the car below the old fixed pivot');
 const framing=getVehicleArtFraming(car);
 assert.ok(framing.bounds[3]*corrected.scale>height*.93,'The common vehicle envelope uses at least 93% of short-stage height');
 p.dispose();
}
console.log(`PASS standalone garage vehicle preview: ${projections} fixed-scale/ground-pivot projections, real five-car library, no global renderer dependency, capped DPR, bounded async rotation, retained images, thumbnail/HTML fallback, finite errors and late recovery, hidden-step pause, reduced motion, responsive redraw and full disposal.`);
