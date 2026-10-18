import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createMiniMap,drawRaceMinimap} from '../src/minimap.js';
import {TouchControls} from '../src/touch-controls.js';
import {mobileDOM} from './mobile-dom.mjs';
import {Track} from '../src/race-core.js';

// Pointer/keyboard behaviour uses the actual touch module. Physical viewport
// placement is also checked manually by the parent in a native browser.
const f=mobileDOM(),heldKeys=new Set(['KeyD']),controls=new TouchControls({root:f.root,surface:f.surface,portrait:f.portrait});
const panel=f.doc.createElement('aside');panel.setAttribute('id','minimap-panel');f.doc.body.appendChild(panel);
const add=(tag,id,parent=panel)=>{const node=f.doc.createElement(tag);node.setAttribute('id',id);parent.appendChild(node);return node;};
const toggle=add('button','minimap-toggle'),close=add('button','minimap-close'),details=add('section','minimap-details'),caption=add('span','minimap-caption'),title=add('h2','minimap-course-name',details);
let changes=0,interactions=0,rafId=0;const rafs=new Map();f.win.requestAnimationFrame=fn=>{const id=++rafId;rafs.set(id,fn);return id;};f.win.cancelAnimationFrame=id=>rafs.delete(id);const flush=()=>{const jobs=[...rafs.values()];rafs.clear();jobs.forEach(fn=>fn());};
const ui=createMiniMap({root:panel,onInteract:()=>{interactions++;heldKeys.clear();controls.clear();},onChange:()=>changes++});
assert(ui);assert.equal(ui.expanded,false);assert.equal(toggle.getAttribute('aria-expanded'),'false');assert(details.hidden);assert.equal(changes,0);
f.button('left').emit('pointerdown',{pointerId:11});assert.equal(controls.read().steer,-1);assert(f.button('left').hasPointerCapture(11));
const pointer=panel.emit('pointerdown',{target:toggle,stopPropagation(){this.propagationStopped=true;}});assert(pointer.propagationStopped);assert.equal(controls.read().steer,0);assert.equal(heldKeys.size,0);assert(!f.button('left').hasPointerCapture(11),'GPS interaction must release a previously held steering pointer');
toggle.emit('click');assert(ui.expanded);assert.equal(toggle.getAttribute('aria-expanded'),'true');assert(!details.hidden);assert.equal(f.doc.activeElement,close);assert.equal(changes,0);flush();assert.equal(changes,1);
f.button('brake').emit('pointerdown',{pointerId:12});assert.equal(controls.read().brake,1,'The large GPS must not disable the separate driving controls');f.button('brake').emit('pointerup',{pointerId:12});
const activation=panel.emit('keydown',{target:toggle,code:'Space',stopPropagation(){this.propagationStopped=true;}});assert(activation.propagationStopped);assert(!activation.prevented,'Normal accessible button activation must be preserved');
const escape={code:'Escape',preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;}};assert(ui.handleKeydown(escape));assert(escape.prevented&&escape.stopped);assert(!ui.expanded);assert.equal(f.doc.activeElement,toggle);assert(details.hidden);assert.equal(toggle.getAttribute('aria-expanded'),'false');assert(!ui.handleKeydown({code:'Escape'}),'A second Escape belongs to the normal pause action');
ui.expand();close.emit('click');assert(!ui.expanded);ui.setTrack('Krämer-Kurven');assert.equal(title.textContent,'Krämer-Kurven');flush();
const beforeResize=changes;f.win.emit('resize');f.win.emit('resize');f.win.emit('resize');assert.equal(rafs.size,1);flush();assert.equal(changes,beforeResize+1,'Resize bursts share one redraw');
ui.expand();flush();const beforeDestroy=interactions;ui.destroy();toggle.emit('click');assert.equal(interactions,beforeDestroy);controls.destroy();
console.log('PASS GPS click/close/ESC and focus/aria state; held steering pointers and keys are released; Space does not leak to drift; driving buttons remain available');

function context(){
 const calls=[],state={path:[]};return {calls,ctx:new Proxy(state,{get(target,key){if(key in target)return target[key];return (...args)=>{if(key==='beginPath')target.path=[];if(['moveTo','lineTo'].includes(key))target.path.push([...args]);calls.push({type:key,args,fill:target.fillStyle,stroke:target.strokeStyle,path:target.path.map(p=>[...p])});};},set(target,key,value){target[key]=value;return true;}})};
}
const bases=[],main=context(),doc={createElement(){const layer=context(),canvas={width:0,height:0,getContext:()=>layer.ctx};bases.push({canvas,...layer});return canvas;}},canvas={ownerDocument:doc,clientWidth:200,clientHeight:220,width:0,height:0,getContext:()=>main.ctx};
const route=[[0,0],[100,0],[100,120],[0,120],[0,0]],map={route,start:[0,0],buildings:[],roads:[],landAreas:[]},track=new Track(route),cache=new WeakMap(),player={id:'me',x:10,z:20,angle:.4,finish:null},rival={id:'bot',x:60,z:90,angle:2,finish:null};
const paint=(extra={})=>drawRaceMinimap(canvas,{map,track,drivers:[rival,player],player,cache,pixelRatio:1,...extra});
assert.deepEqual(paint(),{painted:true,cacheRebuilt:true});assert.equal(bases.length,1);assert.equal(canvas.width,200);assert.equal(canvas.height,220);
const routePath=bases[0].calls.find(call=>call.type==='stroke'&&call.stroke==='#c9253d').path;assert.equal(routePath.length,route.length);assert.deepEqual(routePath[0],routePath.at(-1));const mapWidth=routePath[1][0]-routePath[0][0],mapHeight=routePath[2][1]-routePath[1][1];assert(Math.abs(mapWidth/mapHeight-100/120)<1e-10,'The real route aspect ratio must stay exact');assert(bases[0].calls.some(call=>call.type==='fillRect'&&call.fill==='#26313d'),'Start/Ziel has a native chequered flag');
const rivalIndex=main.calls.findIndex(call=>call.type==='fill'&&call.fill==='#1774bc'),playerIndex=main.calls.findIndex(call=>call.type==='fill'&&call.fill==='#ffd64e');assert(rivalIndex>=0&&playerIndex>rivalIndex,'The larger player arrow must be painted above rivals');
const painted=main.calls.length;assert.deepEqual(paint(),{painted:false,cacheRebuilt:false});assert.equal(main.calls.length,painted,'A stationary countdown/pause does not repaint');
rival.angle+=.1;assert.equal(paint().painted,false,'Rival dot heading changes do not require repainting');player.angle+=.1;assert.equal(paint().painted,true);assert.equal(bases.length,1);rival.x+=2;assert.equal(paint().painted,true);assert.equal(bases.length,1,'Live markers must reuse the static bitmap');
canvas.clientWidth=300;canvas.clientHeight=260;assert.equal(paint().cacheRebuilt,true);assert.equal(bases.length,2);assert.equal(paint({pixelRatio:2}).cacheRebuilt,true);assert.equal(canvas.width,600);assert.equal(canvas.height,520);assert.equal(bases.length,3);
assert.equal(paint({map:structuredClone(map),pixelRatio:2}).cacheRebuilt,true);assert.equal(bases.length,4,'A course change cannot reuse another route image');canvas.clientWidth=0;assert.equal(paint().painted,false);assert.equal(bases.length,4,'A hidden GPS cannot allocate another bitmap');
console.log('PASS Static map cache survives moving players, rejects old course/size/DPR images and skips unchanged/hidden frames; player, rival and start markers stay distinct');

const html=fs.readFileSync(new URL('../src/game.html',import.meta.url),'utf8');
for(const id of ['minimap-panel','minimap-toggle','minimap-close','minimap-details','minimap-help'])assert(html.includes('id="'+id+'"'));
assert(html.includes('aria-controls="minimap-details"'));
console.log('PASS The shipped GPS template retains connected toggle/details/help/close accessibility targets; physical CSS layout is verified separately in the browser');
