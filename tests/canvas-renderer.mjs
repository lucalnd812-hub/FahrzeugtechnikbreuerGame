import {CARS} from '../src/car-catalog.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {LightweightCanvasRenderer} from '../src/canvas-renderer.js';
import {Track} from '../src/race-core.js';
import {TRACKS} from '../src/tracks.js';
import {makeOilDecal} from '../src/road-surface.js';
import {loadVehicleArt,getVehicleArt,getVehicleArtLibrary} from '../src/vehicle-art.js';

const multiply=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
class RecordingContext{
 constructor(){this.ops=[];this.stack=[];this.matrix=[1,0,0,1,0,0];this.path=[];this.fillStyle='';this.strokeStyle='';this.lineWidth=1;this.globalAlpha=1;}
 numbers(values){assert.ok(values.every(Number.isFinite),'Canvas received non-finite coordinates');}
 add(type,args=[]){this.numbers(args.filter(v=>typeof v==='number'));this.ops.push({type,args:[...args],path:this.path.map(p=>({...p,args:[...p.args]})),matrix:[...this.matrix],fill:this.fillStyle,stroke:this.strokeStyle,width:this.lineWidth});}
 save(){this.stack.push({matrix:[...this.matrix],fill:this.fillStyle,stroke:this.strokeStyle,width:this.lineWidth,alpha:this.globalAlpha});}
 restore(){assert.ok(this.stack.length,'Unbalanced canvas restore');const s=this.stack.pop();this.matrix=s.matrix;this.fillStyle=s.fill;this.strokeStyle=s.stroke;this.lineWidth=s.width;this.globalAlpha=s.alpha;}
 setTransform(...a){this.numbers(a);this.matrix=a;this.add('setTransform',a);}
 translate(x,y){this.matrix=multiply(this.matrix,[1,0,0,1,x,y]);this.numbers(this.matrix);}
 scale(x,y){this.matrix=multiply(this.matrix,[x,0,0,y,0,0]);this.numbers(this.matrix);}
 rotate(a){this.matrix=multiply(this.matrix,[Math.cos(a),Math.sin(a),-Math.sin(a),Math.cos(a),0,0]);this.numbers(this.matrix);}
 beginPath(){this.path=[];}
 closePath(){this.path.push({type:'close',args:[]});}
 pathOp(type,args){this.numbers(args);this.path.push({type,args});}
 moveTo(...a){this.pathOp('move',a);}lineTo(...a){this.pathOp('line',a);}quadraticCurveTo(...a){this.pathOp('quadratic',a);}
 arc(...a){this.pathOp('arc',a);assert.ok(a[2]>=0);}ellipse(...a){this.pathOp('ellipse',a);assert.ok(a[2]>=0&&a[3]>=0);}
 rect(...a){this.pathOp('rect',a);}clip(){this.add('clip');}fill(){this.add('fill');}stroke(){this.add('stroke');}
 fillRect(...a){this.add('fillRect',a);}strokeRect(...a){this.add('strokeRect',a);}clearRect(...a){this.add('clearRect',a);}
 fillText(text,...a){assert.equal(typeof text,'string');this.add('text',[text,...a]);}
 measureText(text){return {width:String(text).length*6};}
 createLinearGradient(...a){this.numbers(a);const stops=[];return {stops,addColorStop(offset,color){assert.ok(Number.isFinite(offset)&&offset>=0&&offset<=1);assert.equal(typeof color,'string');stops.push([offset,color]);}};}
 drawImage(image,...a){assert.ok(image);assert.ok(Number.isFinite(this.globalAlpha)&&this.globalAlpha>=0&&this.globalAlpha<=1);this.add('drawImage',a);}
 reset(){assert.equal(this.stack.length,0);this.ops=[];this.path=[];}
}
const ctx=new RecordingContext(),canvas={clientWidth:640,clientHeight:400,width:0,height:0,style:{},getContext(type,options){assert.equal(type,'2d');assert.equal(options.alpha,true);return ctx;}};
assert.throws(()=>new LightweightCanvasRenderer(),TypeError);
assert.throws(()=>new LightweightCanvasRenderer({canvas:{getContext:()=>null}}),/2D/);
const renderer=new LightweightCanvasRenderer({canvas});assert.equal(renderer.getContext(),ctx);assert.equal(renderer.isCompatibilityRenderer,true);assert.equal(renderer.renderMode,'2d');
renderer.setPixelRatio(1.5);renderer.setSize(480,320);assert.equal(canvas.width,720);assert.equal(canvas.height,480);assert.equal(canvas.style.width,'480px');assert.equal(renderer.getPixelRatio(),1.5);
renderer.setSize(NaN,0);assert.equal(canvas.width,720);renderer.setPixelRatio(NaN);assert.equal(renderer.getPixelRatio(),1.5);
renderer.setViewport(40,50,320,200);renderer.setScissor(55,75,200,150);renderer.setScissorTest(true);
renderer.render({},{});
const clips=ctx.ops.filter(o=>o.type==='clip');assert.deepEqual(clips.map(o=>o.path[0].args),[[40,70,320,200],[55,95,200,150]]);assert.deepEqual(clips[0].matrix,[1.5,0,0,1.5,0,0]);assert.equal(ctx.stack.length,0);
renderer.setViewport(0,0,480,320);renderer.setScissorTest(false);

const base=JSON.parse(fs.readFileSync(new URL('../src/tracks/base.json',import.meta.url)));
function mapFor(id){const route=JSON.parse(fs.readFileSync(new URL('../src/tracks/'+id+'.json',import.meta.url)));return structuredClone({...base,...route,buildings:base.buildings.filter(b=>route.buildingIds.includes(b.id)),landAreas:base.landAreas.filter(a=>route.landAreaIds.includes(a.id))});}
function rawPoints(op){return op.path.filter(p=>p.type==='move'||p.type==='line').map(p=>p.args);}
for(const meta of TRACKS){
 const data=mapFor(meta.id),before=JSON.stringify(data),track=new Track(data.route,{trackId:meta.id,laps:1,rules:'action'}),origin=track.at(0);
 const oil=makeOilDecal(data,origin.x+1,origin.z+4);
 const scene={children:[{position:{x:origin.x,z:origin.z},visible:true,userData:{baseY:0}},{position:{x:origin.x+2,z:origin.z},visible:false,userData:{baseY:0}},oil]};
 renderer.setWorld(data,track,scene);
 const focus={id:'you',x:origin.x,z:origin.z,angle:origin.angle,car:0},vehicles=[{...focus,shield:1,boost:1,drifting:true,drift:1},{id:'bot',x:origin.x+2,z:origin.z+4,car:2,angle:origin.angle},{id:'far',x:100000,z:100000,car:1,angle:0}];
 const vehicleCopy=JSON.stringify(vehicles);renderer.setFocus(focus);renderer.setVehicles(vehicles);
 const drawn=[],drawCar=renderer._drawCar;renderer._drawCar=function(c,v,player){assert.ok(ctx.ops.some(o=>o.type==='fill'&&o.fill==='#152a35b3'),'Oil must render below cars in compatibility mode');drawn.push({id:v.id,player});return drawCar.call(this,c,v,player);};
 ctx.reset();renderer.render(scene,{position:{x:origin.x,y:7,z:origin.z}});renderer._drawCar=drawCar;
 assert.deepEqual(drawn,[{id:'you',player:true},{id:'bot',player:false}]);assert.equal(JSON.stringify(vehicles),vehicleCopy);assert.equal(JSON.stringify(data),before);
 const course=ctx.ops.find(o=>o.type==='stroke'&&o.width===10.5);assert.ok(course);assert.deepEqual(rawPoints(course),data.route,'Canvas course must use every original street vertex');
 const buildings=ctx.ops.filter(o=>o.type==='stroke'&&o.width===.35);assert.ok(buildings.length>0&&buildings.length<data.buildings.length,'Nearby buildings should draw while distant buildings are culled');
 for(const roof of buildings)assert.ok(data.buildings.some(b=>[...(b.geodata?.groundRings||[]),b.points].filter(Boolean).some(p=>JSON.stringify(p)===JSON.stringify(rawPoints(roof)))),'A building footprint was invented');
 assert.ok(ctx.ops.some(o=>o.type==='text'&&o.args[0]==='?'),'Available real crates must draw');
 assert.ok(ctx.ops.some(o=>o.type==='fill'&&o.fill==='#152a35b3'),'Actual controller oil must draw');
 assert.ok(ctx.ops.some(o=>o.type==='text'&&o.args[0].includes('2D-KOMPATIBILITÄT')));
 assert.ok(renderer.info.render.calls>10);assert.equal(renderer.info.render.triangles,0);assert.equal(renderer.info.memory.geometries,0);assert.equal(ctx.stack.length,0);
 renderer.setFocus({...focus,cameraX:focus.x-1,cameraZ:focus.z-2,cameraAngle:focus.angle-.1,cameraTop:0});ctx.reset();renderer.render(scene,{position:{y:550}});
 const chaseRoad=ctx.ops.find(o=>o.type==='stroke'&&o.width===10.5);renderer.setFocus({...focus,cameraX:focus.x-1,cameraZ:focus.z-2,cameraAngle:focus.angle-.1,cameraTop:1});ctx.reset();renderer.render(scene,{position:{y:616}});
 const topRoad=ctx.ops.find(o=>o.type==='stroke'&&o.width===10.5);
 assert(Math.hypot(chaseRoad.matrix[0],chaseRoad.matrix[1])>Math.hypot(topRoad.matrix[0],topRoad.matrix[1]),'Camera mode uses an explicit relative height, independent of village elevation');

 // Race rules gate real game objects without changing the course geometry.
 track.raceConfig.rules='classic';ctx.reset();renderer.render(scene,{position:{y:7}});assert.ok(!ctx.ops.some(o=>o.type==='text'&&o.args[0]==='?'));
 track.raceConfig.rules='action';const hazard=track.obstacles[0];assert.ok(hazard);renderer.setFocus({x:hazard.x,z:hazard.z,angle:hazard.angle});ctx.reset();renderer.render(scene,{position:{y:7}});
 const obstacleDraws=ctx.ops.filter(o=>o.fill==='#efca7c'||o.fill==='#28323a');assert.ok(obstacleDraws.length>0,'Actual nearby slalom obstacles must draw');
 track.raceConfig.rules='classic';ctx.reset();renderer.render(scene,{position:{y:7}});assert.equal(ctx.ops.filter(o=>o.fill==='#efca7c'||o.fill==='#28323a').length,0);
 renderer.setTour([origin.x,3,origin.z]);assert.equal(renderer._focus,null);assert.deepEqual(renderer._tour,{x:origin.x,z:origin.z});ctx.reset();renderer.render(scene,{position:{y:160}});assert.ok(ctx.ops.filter(o=>o.type==='stroke'&&o.width===.35).length>buildings.length,'Aerial view should reveal more actual buildings');
 renderer.setFocus({x:origin.x,z:origin.z});assert.equal(renderer._tour,null);
 console.log(`PASS ${meta.id}: exact route vertices, sourced footprints, viewport/scissor/DPR, spatial culling, player focus, real hazards/items/oil and immutable race data.`);
 oil.geometry.dispose();oil.material.dispose();
}
renderer.setWorld(null,null,null);renderer.setGarage({},[{name:'car:kadett',visible:true,rotation:{y:.5}}]);ctx.reset();renderer.render(renderer._garage.scene,{});assert.equal(ctx.stack.length,0);assert.ok(ctx.ops.length>=2);
assert.ok(ctx.ops.some(o=>o.type==='text'&&o.args[0].includes('geladen')),'Unloaded art has a real loading state');

// Load the actual art library through browser-shaped images, then render every
// selection through the shipped Canvas garage. Integrity/dimensions of the
// WebP bytes themselves are verified by tests/vehicle-art.mjs.
const requested=[];
globalThis.Image=class {
 constructor(){this.naturalWidth=640;this.naturalHeight=400;}
 set src(value){this.url=value;requested.push(value);queueMicrotask(()=>this.onload?.());}
 get src(){return this.url;}
};
let invalidations=0;renderer.onInvalidate=()=>invalidations++;
const garage={},models=CARS.map(spec=>spec.id).map(id=>({name:'car:'+id,visible:false,rotation:{y:.25},position:{x:0}}));
renderer.setGarage(garage,models);
await Promise.all(CARS.map((_,index)=>loadVehicleArt(index,{angle:Math.PI/4,all:false})));
assert.ok(invalidations>=CARS.length,'Successful asynchronous artwork loading invalidates the garage');
await Promise.all(CARS.flatMap((_,index)=>Array.from({length:16},(_,frame)=>getVehicleArtLibrary().loadFrame(index,frame))));
assert.equal(requested.length,CARS.length*16,'Cached preload and full loading must not duplicate image requests');
for(let index=0;index<CARS.length;index++){
 models.forEach((m,i)=>m.visible=i===index);
 const camera={position:{x:6.8,z:8.4}},angle=Math.atan2(camera.position.x,camera.position.z)-models[index].rotation.y;
 ctx.reset();renderer.render(garage,camera);
 const images=ctx.ops.filter(o=>o.type==='drawImage');assert.equal(images.length,1,'Exactly one selected car view must draw');
 const drawn=images[0];assert.ok(Math.abs(drawn.args[6]/drawn.args[7]-drawn.args[2]/drawn.args[3])<1e-10,'Cropped artwork proportions must be preserved');
 assert.ok(!ctx.ops.some(o=>o.type==='text'&&o.args[0].includes('geladen')),'Loaded card cannot remain in the loading state');
 const expected=getVehicleArt(index,angle);assert.ok(expected.src.includes('/'+CARS[index].id+'/'));
 // capture image identity as well as coordinates for the rendering assertion
 const draw=ctx.drawImage;let image;ctx.drawImage=function(img,...a){image=img;return draw.call(this,img,...a);};
 renderer.render(garage,camera);ctx.drawImage=draw;assert.equal(image,expected,'Garage camera/model rotation must choose the corresponding actual view');
 assert.equal(ctx.stack.length,0);
}
delete globalThis.Image;
console.log('PASS All five loaded original-model views, angle selection, proportions, first-frame preload and asynchronous garage invalidation.');
renderer.setPixelRatio(9);assert.equal(renderer.getPixelRatio(),2);renderer.setPixelRatio(.1);assert.equal(renderer.getPixelRatio(),.5);
renderer.clear();assert.equal(ctx.stack.length,0);renderer.dispose();ctx.reset();renderer.render({},{});assert.equal(ctx.ops.length,0);
console.log('PASS Real Canvas compatibility rendering flow; logical Canvas counters are not WebGL performance measurements.');
