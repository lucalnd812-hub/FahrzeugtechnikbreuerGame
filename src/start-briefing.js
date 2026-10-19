/**
 * A short, per-race control briefing. This module owns no race clock, network
 * start time or vehicle state. The controller starts only after show() resolves.
 */
const GAME_KEYS=new Set(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyA','KeyS','KeyD','Space','KeyE','KeyR','KeyC']);
let sequence=0;

export class StartBriefing{
 constructor({host,onReleaseInputs=()=>{},onBlock=()=>{}}={}){
  if(!host?.ownerDocument&&!host?.createElement)throw new TypeError('StartBriefing needs a DOM host.');
  this.host=host.body||host;this.doc=this.host.ownerDocument||host;this.win=this.doc.defaultView||window;
  this.onReleaseInputs=onReleaseInputs;this.onBlock=onBlock;this._pending=null;this._timer=null;this._destroyed=false;this._listeners=[];
  const id='race-briefing-title-'+(++sequence);
  this.element=this.doc.createElement('section');this.element.className='race-briefing';this.element.hidden=true;
  this.element.setAttribute('role','dialog');this.element.setAttribute('aria-modal','true');this.element.setAttribute('aria-labelledby',id);
  this.element.setAttribute('tabindex','-1');
  this.element.innerHTML=`<div class="race-briefing-card">
   <header class="race-briefing-head"><span class="race-briefing-brand">BREUER <b>GRAND PRIX</b></span><span class="race-briefing-kicker">VOR DEM START</span></header>
   <h2 id="${id}" class="race-briefing-title"></h2>
   <div class="race-briefing-mobile" data-briefing-mobile>
    <div class="race-briefing-phone" aria-hidden="true"><div class="race-briefing-half race-briefing-half-left"><i>‹</i><strong>LINKS</strong><span class="race-briefing-finger"></span></div><div class="race-briefing-half race-briefing-half-right"><i>›</i><strong>RECHTS</strong><span class="race-briefing-finger"></span></div></div>
    <div class="race-briefing-instructions"><p><b>Links halten</b> = links lenken.<br><b>Rechts halten</b> = rechts lenken.</p><p>Du kannst überall auf die jeweilige Bildschirmhälfte tippen. Das Auto gibt automatisch Gas.</p><span class="race-briefing-tools">BREMSE &amp; ITEM bleiben in der Mitte erreichbar.</span></div>
   </div>
   <div class="race-briefing-desktop" data-briefing-desktop><div class="race-briefing-key-row"><span><kbd>←</kbd><kbd>→</kbd><b>Lenken</b></span><span><kbd>↑</kbd><kbd>↓</kbd><b>Gas / Bremse</b></span></div><p>Auch WASD funktioniert. <b>Leertaste</b> zum Driften, <b>E</b> für dein Item.</p></div>
   <footer class="race-briefing-footer"><button type="button" class="race-briefing-back" data-icon="left" data-briefing-cancel>Zurück</button><span class="race-briefing-note" role="status"></span><button type="button" class="race-briefing-ready" data-icon="flag" data-briefing-ready>Los geht’s</button></footer>
  </div>`;
  this.title=this.element.querySelector('.race-briefing-title');this.mobilePanel=this.element.querySelector('[data-briefing-mobile]');this.desktopPanel=this.element.querySelector('[data-briefing-desktop]');
  this.ready=this.element.querySelector('[data-briefing-ready]');this.cancelButton=this.element.querySelector('[data-briefing-cancel]');this.note=this.element.querySelector('.race-briefing-note');
  this.host.appendChild(this.element);
  this._listen(this.ready,'click',()=>this.accept());this._listen(this.cancelButton,'click',()=>this.cancel());
  this._listen(this.win,'keydown',event=>this._keydown(event),{capture:true});
 }
 _listen(target,type,fn,options){target.addEventListener(type,fn,options);this._listeners.push(()=>target.removeEventListener(type,fn,options));}
 get isOpen(){return !!this._pending;}
 /**
  * Await before the local countdown or before sending online Ready. If the
  * controller already has a shared startAt, autoContinueMs may show a passive
  * reminder; the controller must retain that shared time unchanged.
  */
 show({mobile=this.win.matchMedia?.('(pointer: coarse)').matches===true,network=false,onReady=()=>{},onCancel=()=>{},autoContinueMs=0}={}){
  if(this._destroyed)return Promise.resolve(false);
  if(this._pending)this._settle(false,'replaced',false);
  this.onReleaseInputs();this.onBlock(true);this._focusBefore=this.doc.activeElement;
  this.element.dataset.mobile=String(!!mobile);this.element.dataset.network=String(!!network);this.element.hidden=false;
  this.mobilePanel.hidden=!mobile;this.desktopPanel.hidden=!!mobile;
  this.title.textContent=mobile?'Links halten. Rechts halten.':'Deine nächste Runde wartet.';
  this.ready.textContent=network?'Bereit fürs Rennen':'Los geht’s';
  this.note.textContent=network?'Alle fahren gleichzeitig los.':'Danach startet der Countdown.';
  const promise=new Promise(resolve=>{this._pending={resolve,onReady,onCancel};});
  try{this.ready.focus({preventScroll:true});}catch{this.element.focus?.();}
  const delay=Number(autoContinueMs);
  if(Number.isFinite(delay)&&delay>0){
   this.note.textContent='Das Rennen startet gleich.';
   const pending=this._pending;
   this._timer=this.win.setTimeout(()=>{if(this._pending===pending)this.accept();},Math.max(0,delay));
  }
  return promise;
 }
 _keydown(event){
  if(!this.isOpen||event.metaKey||event.ctrlKey||event.altKey)return;
  if(event.code==='Tab'){
   event.preventDefault();event.stopImmediatePropagation();
   const next=this.doc.activeElement===this.ready?this.cancelButton:this.ready;next.focus({preventScroll:true});return;
  }
  if(event.code==='Escape'){
   event.preventDefault();event.stopImmediatePropagation();if(!event.repeat)this.cancel();return;
  }
  if(event.code==='Enter'||event.code==='Space'){
   event.preventDefault();event.stopImmediatePropagation();
   if(!event.repeat){if(this.doc.activeElement===this.cancelButton)this.cancel();else this.accept();}return;
  }
  if(GAME_KEYS.has(event.code)){event.preventDefault();event.stopImmediatePropagation();}
 }
 _settle(ready,reason,notify=true){
  const pending=this._pending;if(!pending)return false;
  this._pending=null;if(this._timer!==null){this.win.clearTimeout(this._timer);this._timer=null;}
  this.element.hidden=true;this.onReleaseInputs();this.onBlock(false);
  try{if(this._focusBefore?.isConnected&&!this._focusBefore.disabled)this._focusBefore.focus({preventScroll:true});}catch{}
  this._focusBefore=null;
  // Clear pending before the callback: a callback may immediately open a new
  // briefing, and an old click/timer must not dismiss that new race's briefing.
  pending.resolve(ready);
  if(notify)(ready?pending.onReady:pending.onCancel)(reason);
  return true;
 }
 accept(){return this._settle(true,'ready');}
 cancel(){return this._settle(false,'cancelled');}
 close(){return this._settle(false,'closed',false);}
 destroy(){if(this._destroyed)return;this.close();this._destroyed=true;for(const remove of this._listeners.splice(0))remove();this.element.remove();this.onReleaseInputs=()=>{};this.onBlock=()=>{};}
}
