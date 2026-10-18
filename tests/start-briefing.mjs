import assert from 'node:assert/strict';
import {StartBriefing} from '../src/start-briefing.js';
import {TouchControls} from '../src/touch-controls.js';
import {mobileDOM} from './mobile-dom.mjs';

const {doc,win,root,surface,portrait,before,timers}=mobileDOM();
const controls=new TouchControls({root,surface,portrait});
let releases=0,readyCalls=0,cancelCalls=0;
const blocks=[];
const briefing=new StartBriefing({host:doc.body,onReleaseInputs:()=>{releases++;controls.clear();},onBlock:blocked=>{blocks.push(blocked);controls.setBlocked('briefing',blocked);}});
const zone=direction=>controls._zones.find(button=>button.dataset.touch===direction);
assert(!briefing.isOpen);assert(briefing.element.hidden);
zone('left').emit('pointerdown',{pointerId:1});assert.equal(controls.read().steer,-1);
let promise=briefing.show({mobile:true,onReady:()=>readyCalls++,onCancel:()=>cancelCalls++});
assert(briefing.isOpen);assert(!briefing.element.hidden);assert.equal(briefing.mobilePanel.hidden,false);assert.equal(briefing.desktopPanel.hidden,true);assert.equal(doc.activeElement,briefing.ready);assert.equal(controls.read().steer,0);assert.equal(controls._pointers.size,0);assert(!controls.available);
zone('right').emit('pointerdown',{pointerId:2});assert.equal(controls.read().steer,0);
assert(win.emit('keydown',{code:'ArrowLeft'}).prevented,'The briefing cannot drive the underlying vehicle');
win.emit('keydown',{code:'Tab'});assert.equal(doc.activeElement,briefing.cancelButton);win.emit('keydown',{code:'Tab',shiftKey:true});assert.equal(doc.activeElement,briefing.ready);
briefing.ready.emit('click');briefing.ready.emit('click');assert.equal(await promise,true);assert.equal(readyCalls,1);assert.equal(cancelCalls,0);assert(!briefing.isOpen);assert(controls.available);assert.equal(doc.activeElement,before);assert.equal(releases,2);assert.deepEqual(blocks,[true,false]);

// A fresh explanation appears every race, not just on the first visit.
promise=briefing.show({mobile:true,onReady:()=>readyCalls++,onCancel:()=>cancelCalls++});assert(briefing.isOpen);win.emit('keydown',{code:'Enter',repeat:true});assert(briefing.isOpen,'A repeated held Enter cannot accidentally start a race');win.emit('keydown',{code:'Escape'});assert.equal(await promise,false);assert.equal(cancelCalls,1);assert.equal(readyCalls,1);assert(controls.available);

// Online readiness has no independent race clock; show can also be a short
// passive reminder during the shared countdown without changing startAt.
promise=briefing.show({mobile:false,network:true,autoContinueMs:900,onReady:()=>readyCalls++});assert(briefing.mobilePanel.hidden);assert(!briefing.desktopPanel.hidden);assert.equal(briefing.element.dataset.network,'true');assert.equal(timers.size,1);assert.equal([...timers.values()][0].delay,900);
const activeTimer=[...timers.values()][0];activeTimer.fn();assert.equal(await promise,true);assert.equal(readyCalls,2);assert.equal(timers.size,0);activeTimer.fn();assert.equal(readyCalls,2,'An expired timer cannot start the same race twice');

// Replacing or closing a briefing resolves its pending operation as cancelled
// but does not invoke the old controller's cancel callback during teardown.
const replaced=briefing.show({mobile:true,onCancel:()=>cancelCalls++,autoContinueMs:1500});assert.equal(timers.size,1);
const staleTimer=[...timers.values()][0];
promise=briefing.show({mobile:false,onReady:()=>readyCalls++});staleTimer.fn();assert(briefing.isOpen,'A queued timer from the previous race cannot dismiss the current briefing');assert.equal(await replaced,false);assert.equal(cancelCalls,1);assert.equal(timers.size,0);assert(briefing.isOpen);briefing.close();assert.equal(await promise,false);assert.equal(readyCalls,2);assert.equal(cancelCalls,1);assert(controls.available);

// Closing one gate must not unblock the game while its pause gate is active.
controls.setBlocked('pause',true);promise=briefing.show({mobile:true,onReady:()=>readyCalls++});briefing.accept();assert.equal(await promise,true);assert(!controls.available);assert(controls.hasBlock('pause'));controls.setBlocked('pause',false);assert(controls.available);
promise=briefing.show({mobile:true,onCancel:()=>cancelCalls++});briefing.cancelButton.focus();win.emit('keydown',{code:'Space'});assert.equal(await promise,false);assert.equal(cancelCalls,2);

promise=briefing.show({mobile:true,onReady:()=>readyCalls++,autoContinueMs:1000});briefing.destroy();briefing.destroy();assert.equal(await promise,false);assert.equal(timers.size,0);assert(!briefing.element.isConnected);assert(controls.available);assert.equal(await briefing.show({}),false);assert.equal(readyCalls,3);
controls.destroy();assert([...win.listeners.values()].every(listeners=>listeners.size===0));
console.log('PASS Per-race steering briefings, pointer/key gates, focus trap/restoration, single start callback, online reminder timing, replacement/teardown cancellation and independent pause gates');
