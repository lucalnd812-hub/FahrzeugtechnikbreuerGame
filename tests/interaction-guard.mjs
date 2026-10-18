import assert from 'node:assert/strict';
import {mobileDOM} from './mobile-dom.mjs';
import {installInteractionGuard} from '../src/interaction-guard.js';

const {doc,surface}=mobileDOM();
const garage=doc.createElement('section');garage.setAttribute('id','garage');doc.body.appendChild(garage);
const button=doc.createElement('button'),caption=doc.createElement('span');button.appendChild(caption);garage.appendChild(button);
const image=doc.createElement('img');garage.appendChild(image);
const dispose=installInteractionGuard(doc);
for(const target of [surface,button,caption,image])for(const type of ['contextmenu','selectstart','dragstart']){
 assert.equal(doc.emit(type,{target}).prevented,true,`${type} on a game surface must not open native selection/image menus`);
}
for(const tag of ['input','textarea','select']){
 const target=doc.createElement(tag);garage.appendChild(target);
 for(const type of ['contextmenu','selectstart','dragstart'])assert.notEqual(doc.emit(type,{target}).prevented,true,`${tag} must retain native editing`);
}
const link=doc.createElement('a');link.setAttribute('href','https://www.openstreetmap.org/copyright');garage.appendChild(link);
assert.notEqual(doc.emit('contextmenu',{target:link}).prevented,true,'Attribution and real links retain native actions');
const editable=doc.createElement('div');editable.setAttribute('contenteditable','true');garage.appendChild(editable);
const text=doc.createElement('span');editable.appendChild(text);
assert.notEqual(doc.emit('selectstart',{target:text}).prevented,true,'Nested editable content remains selectable');
editable.setAttribute('contenteditable','false');assert.equal(doc.emit('selectstart',{target:text}).prevented,true);
const outside=doc.createElement('p');doc.body.appendChild(outside);assert.notEqual(doc.emit('selectstart',{target:outside}).prevented,true);
assert.notEqual(doc.emit('pointerdown',{target:button}).prevented,true,'Normal pointer interaction is not intercepted');
assert.notEqual(doc.emit('contextmenu',{target:button,cancelable:false}).prevented,true);
dispose();assert.notEqual(doc.emit('contextmenu',{target:button}).prevented,true,'Cleanup removes capture handlers');
console.log('PASS Long-press game surfaces suppress native selection/image menus while inputs, links, editable text and pointer activation retain native behavior');
