/** Browser-side, read-only observations. No DOM or application state is changed.
 * This function is self-contained so it can also be evaluated in the supported
 * shared browser after the normal HTTPS page has been opened. */
export function readLayoutState(){
 const round=value=>Math.round(value*100)/100;
 const box=element=>{const rect=element.getBoundingClientRect();return {x:round(rect.x),y:round(rect.y),width:round(rect.width),height:round(rect.height),right:round(rect.right),bottom:round(rect.bottom)};};
 const style=element=>getComputedStyle(element);
 const visible=element=>{
  if(!element||element.getBoundingClientRect().width<=0||element.getBoundingClientRect().height<=0)return false;
  for(let current=element;current;current=current.parentElement){const computed=style(current);if(current.hidden||current.inert||computed.display==='none'||computed.visibility==='hidden'||Number(computed.opacity)===0)return false;}
  return true;
 };
 const identifier=element=>element.id?'#'+element.id:element.dataset.car!==undefined?'[data-car="'+element.dataset.car+'"]':element.dataset.setupStep?'[data-setup-step="'+element.dataset.setupStep+'"]':element.dataset.settingsPage?'[data-settings-page="'+element.dataset.settingsPage+'"]':element.tagName.toLowerCase()+'.'+[...element.classList].slice(0,3).join('.');
 const roots=['#orientation-lock','#entry-screen','.race-briefing','#course-loading','#dialog','#pause-screen','#results','#tour-ui','#garage','#hud'].map(selector=>document.querySelector(selector)).filter(visible);
 roots.sort((a,b)=>(Number.parseInt(style(b).zIndex)||0)-(Number.parseInt(style(a).zIndex)||0));
 const root=roots[0]||document.body;
 const controls=[...root.querySelectorAll('button,select,input:not([type=hidden]),a[href]')].filter(visible).map(element=>{
  const rect=box(element),computed=style(element),outside=rect.x<-.75||rect.y<-.75||rect.right>innerWidth+.75||rect.bottom>innerHeight+.75;
  const clippedBy=[];
  for(let parent=element.parentElement;parent;parent=parent.parentElement){
   const ps=style(parent),pb=box(parent),horizontal=/(hidden|clip)/.test(ps.overflowX),vertical=/(hidden|clip)/.test(ps.overflowY);
   if(horizontal&&(rect.x<pb.x-.75||rect.right>pb.right+.75)||vertical&&(rect.y<pb.y-.75||rect.bottom>pb.bottom+.75))clippedBy.push(identifier(parent));
  }
  const centerX=Math.max(0,Math.min(innerWidth-1,rect.x+rect.width/2)),centerY=Math.max(0,Math.min(innerHeight-1,rect.y+rect.height/2)),hit=document.elementFromPoint(centerX,centerY);
  const covered=!element.disabled&&computed.pointerEvents!=='none'&&hit!==element&&!element.contains(hit);
  const isSmall=!['checkbox','radio','range'].includes(element.type)&&element.tagName!=='A'&&(rect.width<43.5||rect.height<43.5);
  const text=(element.getAttribute('aria-label')||element.textContent||'').trim().replace(/\s+/g,' ').slice(0,100);
  return {selector:identifier(element),text,tag:element.tagName.toLowerCase(),disabled:element.disabled===true,rect,outside,clippedBy,covered,coveredBy:covered&&hit?identifier(hit):null,smallTouchTarget:isSmall,fontSize:computed.fontSize};
 });
 const slot=document.getElementById('showroom-slot'),canvas=document.getElementById('view'),previewImages=slot?[...slot.querySelectorAll('img')].map(img=>({source:new URL(img.currentSrc||img.src,location.href).pathname,complete:img.complete,naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight,rect:box(img),visible:visible(img)})):[];
 const slotRect=slot?box(slot):null;
 const previewLayers=slotRect&&slotRect.width>0&&slotRect.height>0?document.elementsFromPoint(slotRect.x+slotRect.width/2,slotRect.y+slotRect.height/2).slice(0,10).map(element=>({selector:identifier(element),zIndex:style(element).zIndex,background:style(element).backgroundColor})):[];
 const scrollers=[...root.querySelectorAll('*')].filter(visible).filter(element=>/(auto|scroll)/.test(style(element).overflowY)&&element.scrollHeight>element.clientHeight+1).map(element=>({selector:identifier(element),clientHeight:element.clientHeight,scrollHeight:element.scrollHeight}));
 const video=document.getElementById('entry-video'),garage=document.getElementById('garage');
 return {
  viewport:{width:innerWidth,height:innerHeight,visualWidth:globalThis.visualViewport?.width??null,visualHeight:globalThis.visualViewport?.height??null,devicePixelRatio,coarse:matchMedia('(pointer: coarse)').matches,screenOrientation:screen.orientation?.type??null},
  root:identifier(root),garageStep:garage?.getAttribute('data-setup-current')??null,garageView:garage?.getAttribute('data-garage-view')??null,
  document:{clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,clientHeight:document.documentElement.clientHeight,scrollHeight:document.documentElement.scrollHeight,overflowX:document.documentElement.scrollWidth>innerWidth+1,overflowY:document.documentElement.scrollHeight>innerHeight+1},
  controls,issues:controls.filter(control=>control.outside||control.clippedBy.length||control.covered||control.smallTouchTarget),scrollers,
  preview:{slot:slotRect,visible:visible(slot),images:previewImages,layers:previewLayers,canvas:canvas?{rect:box(canvas),width:canvas.width,height:canvas.height,zIndex:style(canvas).zIndex}:null},
  video:video?{paused:video.paused,readyState:video.readyState,errorCode:video.error?.code??null}:null,
  rendererLabel:document.getElementById('renderer-mode')?.textContent.trim()??null,
  fontsReady:document.fonts?.status??null
 };
}

export const VIEWPORT_CASES=Object.freeze([
 {name:'small-phone',width:568,height:320,mobile:true},
 {name:'phone',width:667,height:375,mobile:true},
 {name:'large-phone',width:844,height:390,mobile:true},
 {name:'short-tablet',width:1024,height:351,mobile:true},
 {name:'wide-tablet',width:1180,height:360,mobile:true},
 {name:'short-desktop',width:1024,height:351,mobile:false},
 {name:'laptop',width:1280,height:720,mobile:false},
 {name:'desktop',width:1440,height:900,mobile:false}
]);
