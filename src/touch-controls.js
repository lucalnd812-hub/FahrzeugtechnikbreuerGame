/**
 * Each finger owns one input. Mobile steering uses the whole left/right half of
 * the game, with HUD actions above those areas. Automatic gas stays in the race
 * controller, so pausing or a briefing can never start a car from this module.
 */
const clamp=(value,min=-1,max=1)=>Math.max(min,Math.min(max,value));
const EMPTY_INPUT=Object.freeze({gas:0,brake:0,steer:0,drift:false});
const GAME_KEYS=new Set(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyA','KeyS','KeyD','Space','KeyE','KeyR','KeyC','Escape','Enter','Tab']);

/** Screen orientation, rather than an embedded game's viewport orientation. */
export function mobilePortrait(win=window){
 const screen=win.screen;
 const coarse=win.matchMedia?.('(any-pointer: coarse)').matches===true||win.matchMedia?.('(pointer: coarse)').matches===true;
 const mobile=coarse||win.navigator?.userAgentData?.mobile===true;
 if(!mobile||!screen)return false;
 const type=screen.orientation?.type;
 if(type?.startsWith('portrait'))return true;
 if(type?.startsWith('landscape'))return false;
 // iOS exposes this even when Screen Orientation is unavailable in an iframe.
 if(typeof win.orientation==='number')return Math.abs(win.orientation)%180===0;
 const width=Number(screen.width),height=Number(screen.height);
 return Number.isFinite(width)&&Number.isFinite(height)&&width>0&&height>0&&width<height;
}

export class TouchControls{
 constructor({root,surface,portrait,onOrientationChange=()=>{},onAction=()=>{}}={}){
  if(!root)throw new TypeError('TouchControls needs its control element.');
  this.root=root.matches?.('.touch-controls')?root:root.querySelector('.touch-controls')||root;
  this.doc=this.root.ownerDocument||document;
  this.win=this.doc.defaultView||window;
  this.surface=surface||this.doc.getElementById('view')||this.root;
  this.portrait=portrait||this.doc.getElementById('orientation-lock');
  this.onOrientationChange=onOrientationChange;
  this.onAction=onAction;
  this.enabled=true;
  this.layout='screen';
  this.sensitivity=1;
  this.blocked=false;
  this._blocks=new Set();
  this._orientationKnown=false;
  this._pointers=new Map();
  this._listeners=[];
  this._clearing=false;
  this._focusBeforePortrait=null;
  this._zones=this._createScreenZones();
  this.buttons=[...this.root.querySelectorAll('[data-touch]')];
  this.setOptions();

  for(const button of this.buttons){
   this._listen(button,'pointerdown',event=>this._pressButton(button,event),{passive:false});
   this._listen(button,'pointermove',event=>this._movePointer(event),{passive:false});
   this._listen(button,'pointerup',event=>this._release(event.pointerId),{passive:false});
   this._listen(button,'pointercancel',event=>this._release(event.pointerId));
   this._listen(button,'lostpointercapture',event=>this._release(event.pointerId));
   this._listen(button,'contextmenu',event=>event.preventDefault());
   // Real buttons remain keyboard-operable without synthesising a pointer.
   this._listen(button,'keydown',event=>{
    if(!['Space','Enter'].includes(event.code)||!this._available()||button.disabled)return;
    event.preventDefault();this._hold(button,'key:'+event.code,button.dataset.touch);
   });
   this._listen(button,'keyup',event=>{if(['Space','Enter'].includes(event.code)){event.preventDefault();this._release('key:'+event.code);}});
   this._listen(button,'blur',()=>{for(const [id,pointer] of this._pointers)if(typeof id==='string'&&pointer.element===button)this._release(id);});
  }
  for(const button of this.root.querySelectorAll('[data-touch-action]')){
   this._listen(button,'click',event=>{
    if(!this._available()||button.disabled||this._elementBlocked(button)){event.preventDefault();return;}
    this.onAction(button.dataset.touchAction,event);
   });
  }
  // Capture may be unavailable in old embedded browsers; lifting anywhere still
  // releases the owning finger, including outside the game rectangle.
  this._listen(this.doc,'pointerup',event=>this._release(event.pointerId),{capture:true});
  this._listen(this.doc,'pointercancel',event=>this._release(event.pointerId),{capture:true});
  this._listen(this.win,'blur',()=>this.clear());
  this._listen(this.doc,'visibilitychange',()=>{if(this.doc.hidden)this.clear();});
  this._listen(this.win,'orientationchange',()=>this._updateOrientation());
  this._listen(this.win,'resize',()=>{this.clear();this._updateOrientation();});
  this._listen(this.win.screen?.orientation,'change',()=>this._updateOrientation());
  const coarse=this.win.matchMedia?.('(any-pointer: coarse)');
  if(coarse?.addEventListener)this._listen(coarse,'change',()=>{this.clear();this._updateOrientation();});
  else if(coarse?.addListener){
   const handler=()=>{this.clear();this._updateOrientation();};coarse.addListener(handler);
   this._listeners.push(()=>coarse.removeListener(handler));
  }
  // The screen lock stops keyboard controls from reaching the game beneath.
  this._listen(this.win,'keydown',event=>{
   if(this.blocked&&!event.metaKey&&!event.ctrlKey&&GAME_KEYS.has(event.code)){
    event.preventDefault();event.stopImmediatePropagation();
   }
  },{capture:true});
  this._updateOrientation();
 }

 _createScreenZones(){
  const present=[...this.root.querySelectorAll('[data-touch-zone]')];
  if(present.length)return present;
  if(!this.doc.createElement||!this.root.appendChild)return [];
  const container=this.doc.createElement('div');container.className='touch-screen-zones';
  const zones=['left','right'].map((action,index)=>{
   const button=this.doc.createElement('button');button.type='button';button.className='touch-screen-zone touch-screen-'+action;
   button.dataset.touch=action;button.dataset.touchZone=action;
   button.setAttribute('data-touch',action);button.setAttribute('data-touch-zone',action);
   button.setAttribute('aria-label',action==='left'?'Linke Bildschirmhälfte halten: nach links lenken':'Rechte Bildschirmhälfte halten: nach rechts lenken');
   button.setAttribute('aria-pressed','false');
   const label=this.doc.createElement('span');label.className='touch-zone-label';label.setAttribute('aria-hidden','true');label.textContent=index===0?'‹ LINKS':'RECHTS ›';
   button.appendChild(label);container.appendChild(button);return button;
  });
  this.root.appendChild(container);this._zoneContainer=container;return zones;
 }
 _listen(target,type,handler,options){
  if(!target?.addEventListener)return;
  target.addEventListener(type,handler,options);
  this._listeners.push(()=>target.removeEventListener(type,handler,options));
 }
 get available(){return this._available();}
 hasBlock(reason){return this._blocks.has(reason);}
 _available(){return this.enabled&&!this.blocked&&!this._blocks.size&&!this.doc.hidden&&!this._elementBlocked(this.root);}
 _elementBlocked(element){
  for(let ancestor=element;ancestor;ancestor=ancestor.parentElement)if(ancestor.hidden||ancestor.inert)return true;
  return false;
 }
 _capture(element,pointerId){try{element.setPointerCapture?.(pointerId);}catch{}}
 _hold(button,id,action){
  const current=this._pointers.get(id);
  if(current?.element===button&&current.action===action)return;
  this._release(id);
  const kind=button.dataset.touchZone?'zone':'button';
  this._pointers.set(id,{kind,action,element:button});this._updateFeedback();
 }
 _pressButton(button,event){
  if(!this._available()||button.disabled||this._elementBlocked(button)||event.button>0)return;
  event.preventDefault();
  this._hold(button,event.pointerId,button.dataset.touch);this._capture(button,event.pointerId);
 }
 _movePointer(event){
  const pointer=this._pointers.get(event.pointerId);
  if(!pointer||pointer.kind!=='zone')return;
  if(!this._available()){this.clear();return;}
  const bounds=this.surface.getBoundingClientRect();
  if(!bounds.width||!Number.isFinite(event.clientX)||!Number.isFinite(event.clientY))return;
  event.preventDefault();
  // A slide can change direction. Moving outside the embedded game neutralises
  // this finger while retaining capture until its lift or re-entry.
  const action=event.clientX<bounds.left||event.clientX>bounds.left+bounds.width||event.clientY<bounds.top||event.clientY>bounds.top+bounds.height?null:event.clientX<bounds.left+bounds.width/2?'left':'right';
  if(pointer.action===action)return;
  pointer.action=action;
  this._updateFeedback();
 }
 _release(pointerId){
  const pointer=this._pointers.get(pointerId);
  if(!pointer)return;
  this._pointers.delete(pointerId);this._updateFeedback();
  try{if(typeof pointerId==='number'&&pointer.element.hasPointerCapture?.(pointerId))pointer.element.releasePointerCapture(pointerId);}catch{}
 }
 _updateFeedback(){
  let left=false,right=false;
  for(const pointer of this._pointers.values()){
   if(pointer.action==='left')left=true;
   if(pointer.action==='right')right=true;
  }
  const direction=left&&right?'neutral':left?'left':right?'right':'neutral';
  if(this.root.dataset.steer!==direction)this.root.dataset.steer=direction;
  for(const button of this.buttons||[]){
   const held=button.dataset.touchZone?button.dataset.touch==='left'?left:right:[...this._pointers.values()].some(pointer=>pointer.element===button&&pointer.action!==null);
   if(button.classList.contains('pressed')!==held)button.classList.toggle('pressed',held);
   if(button.dataset.touchZone&&button.getAttribute?.('aria-pressed')!==String(held))button.setAttribute?.('aria-pressed',String(held));
  }
 }
 _updateAvailability(){
  const available=this.enabled&&!this.blocked&&!this._blocks.size&&!this.doc.hidden;this.root.dataset.enabled=String(this.enabled);this.root.dataset.blocked=String(!available);
  for(const zone of this._zones)zone.disabled=!available;
 }

 /** Mobile steering always uses screen halves; stale layout choices are ignored. */
 setOptions({sensitivity=this.sensitivity,enabled=this.enabled}={}){
  const nextSensitivity=Number(sensitivity);
  if(!enabled)this.clear();
  if(Number.isFinite(nextSensitivity))this.sensitivity=clamp(nextSensitivity,.6,1.6);
  this.enabled=!!enabled;this.root.dataset.layout=this.layout;this._updateAvailability();
 }

 /** Independent lifecycle gates cannot accidentally enable one another. */
 setBlocked(reason,value=true){
  if(!reason)throw new TypeError('An input block needs a reason.');
  if(value){this._blocks.add(reason);this.clear();}else this._blocks.delete(reason);
  this._updateAvailability();
 }

 read(){
  if(!this._available())return {...EMPTY_INPUT};
  let gas=0,brake=0,left=0,right=0,drift=false;
  for(const pointer of this._pointers.values()){
   if(pointer.action==='gas')gas=1;
   else if(pointer.action==='brake')brake=1;
   else if(pointer.action==='left')left=1;
   else if(pointer.action==='right')right=1;
   else if(pointer.action==='drift')drift=true;
  }
  return {gas,brake,steer:clamp((right-left)*this.sensitivity),drift};
 }

 clear(){
  if(this._clearing)return;
  this._clearing=true;
  const pointers=[...this._pointers.entries()];this._pointers.clear();this._updateFeedback();
  for(const [pointerId,pointer] of pointers){
   try{if(typeof pointerId==='number'&&pointer.element.hasPointerCapture?.(pointerId))pointer.element.releasePointerCapture(pointerId);}catch{}
  }
  this._clearing=false;
 }

 _updateOrientation(){
  const portrait=mobilePortrait(this.win);
  const changed=!this._orientationKnown||portrait!==this.blocked;
  this._orientationKnown=true;this.blocked=portrait;
  if(this.portrait)this.portrait.hidden=!portrait;
  this.doc.body?.classList.toggle('orientation-portrait',portrait);this._updateAvailability();
  if(!changed)return;
  this.clear();
  if(portrait){
   this._focusBeforePortrait=this.doc.activeElement;
   try{this.portrait?.focus({preventScroll:true});}catch{}
  }else if(this._focusBeforePortrait){
   try{if(this._focusBeforePortrait.isConnected&&!this._focusBeforePortrait.disabled)this._focusBeforePortrait.focus({preventScroll:true});}catch{}
   this._focusBeforePortrait=null;
  }
  this.onOrientationChange(portrait);
 }

 destroy(){
  this.clear();this.enabled=false;this._updateAvailability();for(const remove of this._listeners.splice(0))remove();
  this._zoneContainer?.remove?.();
  if(this.portrait)this.portrait.hidden=true;
  this.doc.body?.classList.remove('orientation-portrait');
  this.onOrientationChange=()=>{};this.onAction=()=>{};
 }
}
