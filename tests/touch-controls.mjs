import assert from 'node:assert/strict';
import {TouchControls,mobilePortrait} from '../src/touch-controls.js';
import {mobileDOM} from './mobile-dom.mjs';

const {doc,win,root,surface,portrait,before,button,item,orientation,coarse}=mobileDOM();
const changed=[],actions=[];
const controls=new TouchControls({root,surface,portrait,onOrientationChange:value=>changed.push(value),onAction:action=>actions.push(action)});
const zone=action=>controls._zones.find(button=>button.dataset.touch===action),press=(action,id)=>zone(action).emit('pointerdown',{pointerId:id});
const empty={gas:0,brake:0,steer:0,drift:false};
assert.equal(controls.blocked,false);assert.deepEqual(controls.read(),empty);assert.equal(root.dataset.layout,'screen');
assert.equal(controls._zones.length,2,'Both whole-screen directions are actual accessible buttons');
for(const direction of ['left','right'])assert(zone(direction).getAttribute('aria-label').includes('Bildschirmhälfte'));
press('left',1);assert.equal(controls.read().steer,-1);assert(zone('left').captures.has(1));assert.equal(zone('left').getAttribute('aria-pressed'),'true');assert.equal(root.dataset.steer,'left');
zone('left').emit('pointerup',{pointerId:99});assert.equal(controls.read().steer,-1,'Another finger cannot release steering');
press('right',2);assert.equal(controls.read().steer,0,'Opposite fingers cancel rather than favouring the last finger');
button('brake').emit('pointerdown',{pointerId:3});button('drift').emit('pointerdown',{pointerId:4});assert.deepEqual(controls.read(),{gas:0,brake:1,steer:0,drift:true});assert.equal(controls._pointers.size,4);
zone('left').emit('pointercancel',{pointerId:1});assert.deepEqual(controls.read(),{gas:0,brake:1,steer:1,drift:true},'Cancel releases only the owning finger');
zone('right').emit('lostpointercapture',{pointerId:2});assert.deepEqual(controls.read(),{gas:0,brake:1,steer:0,drift:true});
controls.clear();assert.deepEqual(controls.read(),empty);assert.equal(root.dataset.steer,'neutral');

// Real touch hardware reports many moves inside the same half; these should
// not repeatedly mutate CSS/ARIA or briefly release held steering on a repeat.
let feedbackWrites=0;
const originalLeftAttribute=zone('left').setAttribute.bind(zone('left'));
zone('left').setAttribute=(...args)=>{feedbackWrites++;return originalLeftAttribute(...args);};
press('left',7);const heldWrites=feedbackWrites;
for(let sample=0;sample<50;sample++)zone('left').emit('pointermove',{pointerId:7,clientX:100+sample,clientY:150});
press('left',7);assert.equal(controls.read().steer,-1);assert.equal(feedbackWrites,heldWrites,'An unchanged held finger restarted feedback');
controls.clear();zone('left').setAttribute=originalLeftAttribute;
zone('left').emit('keydown',{code:'Space'});const keyboardPointer=controls._pointers.get('key:Space');
for(let sample=0;sample<10;sample++)zone('left').emit('keydown',{code:'Space',repeat:true});
assert.equal(controls._pointers.get('key:Space'),keyboardPointer,'Keyboard repeats released and recreated held steering');controls.clear();

// A held finger can cross the split and leave/re-enter the embedded viewport.
surface.bounds={left:120,top:70,width:568,height:320};
press('left',10);zone('left').emit('pointermove',{pointerId:10,clientX:560,clientY:150});assert.equal(controls.read().steer,1);assert.equal(zone('right').getAttribute('aria-pressed'),'true');assert.equal(zone('left').getAttribute('aria-pressed'),'false');
zone('left').emit('pointermove',{pointerId:10,clientX:403,clientY:150});assert.equal(controls.read().steer,-1);
zone('left').emit('pointermove',{pointerId:10,clientX:90,clientY:150});assert.equal(controls.read().steer,0);
zone('left').emit('pointermove',{pointerId:10,clientX:510,clientY:150});assert.equal(controls.read().steer,1);
doc.emit('pointerup',{pointerId:10});assert.deepEqual(controls.read(),empty,'Lifting outside the captured control always releases input');
press('left',11);press('left',12);zone('left').emit('pointerup',{pointerId:11});assert.equal(controls.read().steer,-1);assert(zone('left').classes.has('pressed'));doc.emit('pointercancel',{pointerId:12});assert.deepEqual(controls.read(),empty);

// HUD actions never create steering ownership and disabled items stay inert.
item.emit('click');assert.deepEqual(actions,['item']);assert.equal(controls._pointers.size,0);
item.disabled=true;item.emit('click');assert.equal(actions.length,1);item.disabled=false;
button('brake').emit('pointerdown',{pointerId:15});assert.equal(controls.read().steer,0);assert.equal(controls.read().brake,1);controls.clear();
zone('right').emit('pointerdown',{pointerId:16,button:2});assert.deepEqual(controls.read(),empty,'Secondary mouse clicks cannot steer');

// Lifecycle gates are independent; clearing the briefing cannot unpause input.
press('right',20);controls.setBlocked('briefing',true);assert.deepEqual(controls.read(),empty);assert.equal(controls._pointers.size,0);assert(!controls.available);assert(zone('left').disabled);
controls.setBlocked('pause',true);controls.setBlocked('briefing',false);assert(controls.hasBlock('pause'));assert(!controls.available);press('left',21);item.emit('click');assert.deepEqual(controls.read(),empty);assert.equal(actions.length,1);
controls.setBlocked('pause',false);assert(controls.available);assert(!zone('left').disabled);press('left',22);assert.equal(controls.read().steer,-1);controls.clear();
controls.setOptions({layout:'analog',sensitivity:9});assert.equal(controls.sensitivity,1.6);assert.equal(root.dataset.layout,'screen','Stale saved layouts cannot restore the analog stick');press('left',23);assert.equal(controls.read().steer,-1);
controls.setOptions({enabled:false});assert.deepEqual(controls.read(),empty);press('right',24);assert.equal(controls._pointers.size,0);controls.setOptions({enabled:true,sensitivity:1});
root.inert=true;press('right',25);assert.deepEqual(controls.read(),empty);root.inert=false;root.hidden=true;press('right',25);assert.deepEqual(controls.read(),empty);root.hidden=false;

// Buttons remain keyboard accessible, with no stuck key after focus changes.
zone('left').emit('keydown',{code:'Space'});assert.equal(controls.read().steer,-1);zone('left').emit('blur');assert.deepEqual(controls.read(),empty);zone('right').emit('keydown',{code:'Enter'});assert.equal(controls.read().steer,1);zone('right').emit('keyup',{code:'Enter'});assert.deepEqual(controls.read(),empty);
press('right',30);win.emit('blur');assert.deepEqual(controls.read(),empty);
press('left',31);doc.hidden=true;doc.emit('visibilitychange');assert.deepEqual(controls.read(),empty);doc.hidden=false;
press('right',32);win.emit('resize');assert.deepEqual(controls.read(),empty,'Viewport changes never keep a stale held direction');

press('left',40);orientation.type='portrait-primary';orientation.emit('change');assert(controls.blocked);assert(!portrait.hidden);assert.equal(doc.activeElement,portrait);assert.deepEqual(controls.read(),empty);assert(doc.body.classes.has('orientation-portrait'));assert(win.emit('keydown',{code:'ArrowUp'}).prevented);assert(!win.emit('keydown',{code:'KeyW',ctrlKey:true}).prevented);item.emit('click');assert.equal(actions.length,1);
orientation.type='landscape-secondary';orientation.emit('change');assert(!controls.blocked);assert(portrait.hidden);assert.equal(doc.activeElement,before);assert.deepEqual(changed,[false,true,false]);
win.innerWidth=300;win.innerHeight=800;win.emit('resize');assert(!controls.blocked,'A tall Wix iframe must not lock a physically landscape phone');
assert.equal(mobilePortrait({screen:{width:400,height:800,orientation:{type:'portrait-primary'}},matchMedia:()=>({matches:false}),navigator:{}}),false,'Desktop portrait windows are playable');
assert.equal(mobilePortrait({screen:{width:400,height:800},orientation:90,matchMedia:()=>({matches:true})}),false,'iOS landscape overrides natural screen dimensions');
assert.equal(mobilePortrait({screen:{width:800,height:400},orientation:0,matchMedia:()=>({matches:true})}),true);
assert.equal(mobilePortrait({screen:{width:400,height:800},matchMedia:()=>({matches:true})}),true);
controls.destroy();assert(!controls.enabled);assert(portrait.hidden);assert([...win.listeners.values()].every(listeners=>listeners.size===0));press('left',45);assert.equal(controls._pointers.size,0);assert.equal(root.querySelectorAll('[data-touch-zone]').length,0);
console.log('PASS Whole-screen binary steering, cross-half slides, four fingers, independent pointer cancellation, blocked HUD actions, briefing/pause gates, keyboard/focus cleanup and physical-phone orientation');
