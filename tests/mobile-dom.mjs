/** Minimal DOM used only to exercise pointer/focus/timer behaviour in Node. */
export class Target{
 constructor(tag='div',doc=null){
  this.tagName=tag.toUpperCase();this.ownerDocument=doc;this.listeners=new Map();this.classes=new Set();this.dataset={};this.style={};this.attrs={};this.captures=new Set();this.children=[];this.parentElement=null;this.isConnected=true;this.hidden=false;this.disabled=false;this.inert=false;this.textContent='';
  this.classList={add:name=>this.classes.add(name),remove:name=>this.classes.delete(name),toggle:(name,force)=>{const on=force??!this.classes.has(name);if(on)this.classes.add(name);else this.classes.delete(name);return on;},contains:name=>this.classes.has(name)};
 }
 set className(value){this.classes=new Set(value.split(/\s+/).filter(Boolean));}get className(){return [...this.classes].join(' ');}
 addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(fn);}
 removeEventListener(type,fn){this.listeners.get(type)?.delete(fn);}
 emit(type,values={}){const event={target:this,pointerId:1,button:0,clientX:50,clientY:50,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;},...values};for(const fn of [...(this.listeners.get(type)||[])]){fn(event);if(event.stopped)break;}return event;}
 focus(){this.ownerDocument.activeElement=this;}
 setPointerCapture(id){this.captures.add(id);}hasPointerCapture(id){return this.captures.has(id);}releasePointerCapture(id){this.captures.delete(id);}
 getBoundingClientRect(){return this.bounds||{left:0,top:0,width:800,height:400};}
 setAttribute(name,value){this.attrs[name]=String(value);if(name==='class')this.className=value;if(name.startsWith('data-'))this.dataset[name.slice(5).replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase())]=String(value);}
 getAttribute(name){return this.attrs[name]??null;}
 appendChild(child){child.parentElement=this;this.children.push(child);return child;}
 remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(child=>child!==this);this.parentElement=null;this.isConnected=false;}
 descendants(){return this.children.flatMap(child=>[child,...child.descendants()]);}
 matches(selector){return selector.split(',').some(item=>{const value=item.trim();if(value.startsWith('.'))return this.classes.has(value.slice(1));if(value.startsWith('#'))return this.attrs.id===value.slice(1);const attr=value.match(/^([a-z]*)\[([\w-]+)(?:="([^"]*)")?\]$/i);if(attr)return (!attr[1]||attr[1].toUpperCase()===this.tagName)&&(attr[2]in this.attrs)&&(attr[3]===undefined||attr[3]===this.attrs[attr[2]]);return value.toUpperCase()===this.tagName;});}
 closest(selector){return this.matches(selector)?this:this.parentElement?.closest(selector)||null;}
 querySelectorAll(selector){return this.descendants().filter(child=>child.matches(selector));}querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
 set innerHTML(html){this.children=[];const stack=[this],voidTags=new Set(['BR','INPUT','IMG','HR']);for(const match of html.matchAll(/<\/?([a-z][\w-]*)\b([^>]*)>/gi)){if(match[0][1]==='/'){const at=stack.findLastIndex(node=>node.tagName===match[1].toUpperCase());if(at>0)stack.splice(at);continue;}const child=new Target(match[1],this.ownerDocument);for(const attr of match[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g))child.setAttribute(attr[1],attr[2]??'');stack.at(-1).appendChild(child);if(!voidTags.has(child.tagName))stack.push(child);}}
}

export function mobileDOM(){
 const doc=new Target('document'),win=new Target('window');doc.defaultView=win;win.document=doc;doc.ownerDocument=doc;doc.hidden=false;
 doc.body=new Target('body',doc);doc.createElement=tag=>new Target(tag,doc);doc.getElementById=id=>doc.body.querySelector('#'+id);
 const orientation=new Target(),coarse=new Target();coarse.matches=true;orientation.type='landscape-primary';win.screen={width:800,height:400,orientation};win.navigator={};win.matchMedia=()=>coarse;
 let timerId=0;const timers=new Map();win.setTimeout=(fn,delay)=>{const id=++timerId;timers.set(id,{fn,delay});return id;};win.clearTimeout=id=>timers.delete(id);
 const root=doc.createElement('div');root.className='touch-controls';doc.body.appendChild(root);
 const surface=doc.createElement('canvas');surface.setAttribute('id','view');doc.body.appendChild(surface);
 const portrait=doc.createElement('section');portrait.hidden=true;portrait.setAttribute('id','orientation-lock');doc.body.appendChild(portrait);
 const before=doc.createElement('button');doc.body.appendChild(before);before.focus();
 const buttons=['gas','brake','left','right','drift'].map(action=>{const button=doc.createElement('button');button.setAttribute('data-touch',action);root.appendChild(button);return button;});
 const item=doc.createElement('button');item.setAttribute('data-touch-action','item');root.appendChild(item);
 return {doc,win,root,surface,portrait,before,buttons,item,orientation,coarse,timers,button:action=>buttons.find(button=>button.dataset.touch===action)};
}
