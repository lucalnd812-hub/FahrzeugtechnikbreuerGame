/** Native GPS controls and a cached map. No renderer, physics or network state. */
const fallbackCache=new WeakMap();
const finite=Number.isFinite;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
function path(ctx,points,X,Z){
 if(!Array.isArray(points)||!points.length)return false;
 ctx.beginPath();for(let i=0;i<points.length;i++){const p=points[i];if(i===0)ctx.moveTo(X(p[0]),Z(p[1]));else ctx.lineTo(X(p[0]),Z(p[1]));}return true;
}
function fitMap(map,w,h){
 const bounds=map.route.reduce((box,p)=>[Math.min(box[0],p[0]),Math.max(box[1],p[0]),Math.min(box[2],p[1]),Math.max(box[3],p[1])],[Infinity,-Infinity,Infinity,-Infinity]);
 const pad=clamp(Math.min(w,h)*.105,12,24),scale=Math.min(Math.max(1,w-pad*2)/Math.max(1,bounds[1]-bounds[0]),Math.max(1,h-pad*2)/Math.max(1,bounds[3]-bounds[2]));
 return {w,h,scale,X:x=>(x-(bounds[0]+bounds[1])/2)*scale+w/2,Z:z=>(z-(bounds[2]+bounds[3])/2)*scale+h/2};
}
function paintBase(base,map,track,fit,dpr){
 const c=base.getContext('2d'),{w,h,scale,X,Z}=fit;c.setTransform(dpr,0,0,dpr,0,0);
 c.fillStyle='#e8edda';c.fillRect(0,0,w,h);
 for(const area of map.landAreas||[]){if(!path(c,area.points,X,Z))continue;c.closePath();c.fillStyle=['forest','wood'].includes(area.kind)?'#cbd9ba':'#e0e7cd';c.fill();}
 c.fillStyle='#c5cbbd';for(const building of map.buildings||[]){if(!path(c,building.points,X,Z))continue;c.closePath();c.fill();}
 c.lineCap=c.lineJoin='round';for(const road of map.roads||[]){if(!path(c,road.points,X,Z))continue;c.strokeStyle='#fcfcf2';c.lineWidth=Math.max(1.2,(road.width||8)*scale);c.stroke();}
 for(const [shade,width] of [['#fffef0',8],['#c9253d',4.5]]){path(c,map.route,X,Z);c.strokeStyle=shade;c.lineWidth=width;c.stroke();}
 if(track?.at)for(let s=65;s<track.length;s+=Math.max(140,track.length/9)){
  const p=track.at(s);c.save();c.translate(X(p.x),Z(p.z));c.rotate(-p.angle);c.beginPath();c.moveTo(0,4);c.lineTo(-2.7,-2.2);c.lineTo(2.7,-2.2);c.closePath();c.fillStyle='#fff9dd';c.fill();c.restore();
 }
 const start=map.start||map.route[0],sx=X(start[0]),sz=Z(start[1]);
 c.fillStyle='#fdf7db';c.beginPath();c.arc(sx,sz,7,0,Math.PI*2);c.fill();c.strokeStyle='#24303c';c.lineWidth=1.5;c.stroke();
 c.strokeStyle='#24303c';c.lineWidth=1.5;c.beginPath();c.moveTo(sx+4,sz+5);c.lineTo(sx+4,sz-9);c.stroke();
 for(let x=0;x<3;x++)for(let y=0;y<2;y++){c.fillStyle=(x+y)%2?'#fffefa':'#26313d';c.fillRect(sx+4+x*3,sz-9+y*3,3,3);}
 c.font='bold 10px Arial';c.fillStyle='#35483f';c.textAlign='right';c.textBaseline='top';c.fillText('N ↑',w-5,5);c.textAlign='left';c.textBaseline='alphabetic';
}

/** The static route is rebuilt only for a new map, CSS size or pixel ratio.
 * Moving markers reuse that bitmap. Identical paused/countdown states do no work.
 * Callers retain the existing 90 ms HUD cadence; this function adds no loop. */
export function drawRaceMinimap(canvas,{map,track,drivers=[],player,cache=fallbackCache,pixelRatio=globalThis.devicePixelRatio||1}={}){
 if(!canvas||!map?.route?.length)return {painted:false,cacheRebuilt:false};
 const w=Math.round(Number(canvas.clientWidth)||0),h=Math.round(Number(canvas.clientHeight)||0);if(w<1||h<1)return {painted:false,cacheRebuilt:false};
 const dpr=clamp(Number(pixelRatio)||1,1,2),width=Math.round(w*dpr),height=Math.round(h*dpr),ctx=canvas.getContext('2d');if(!ctx)return {painted:false,cacheRebuilt:false};
 let entry=cache.get(canvas),rebuilt=false;
 if(!entry||entry.map!==map||entry.w!==w||entry.h!==h||entry.dpr!==dpr||canvas.width!==width||canvas.height!==height){
  const doc=canvas.ownerDocument||globalThis.document,base=doc.createElement('canvas');base.width=width;base.height=height;canvas.width=width;canvas.height=height;
  const fit=fitMap(map,w,h);paintBase(base,map,track,fit,dpr);entry={base,map,w,h,dpr,fit,last:null};cache.set(canvas,entry);rebuilt=true;
 }
 const own=driver=>driver===player||(player?.id!=null&&driver.id===player.id);
 const visible=drivers.filter(driver=>finite(driver.x)&&finite(driver.z));
 const snapshot=visible.flatMap(driver=>[driver.id,driver.x,driver.z,own(driver)?driver.angle:0,own(driver),driver.finish!=null]);
 if(!rebuilt&&entry.last?.length===snapshot.length&&snapshot.every((value,index)=>value===entry.last[index]))return {painted:false,cacheRebuilt:false};
 entry.last=snapshot;
 ctx.setTransform(1,0,0,1,0,0);ctx.drawImage(entry.base,0,0);ctx.setTransform(dpr,0,0,dpr,0,0);
 const {X,Z}=entry.fit,room=Math.min(w,h),rivalSize=room>=180?5.5:4.3,playerSize=room>=180?9.5:8;
 // Rivals go first; the player's high-contrast heading arrow always stays on top.
 for(const driver of visible){if(own(driver))continue;ctx.save();ctx.globalAlpha=driver.finish!=null?.75:1;ctx.beginPath();ctx.arc(X(driver.x),Z(driver.z),rivalSize,0,Math.PI*2);ctx.fillStyle='#1774bc';ctx.fill();ctx.strokeStyle='#fffef4';ctx.lineWidth=1.8;ctx.stroke();ctx.restore();}
 for(const driver of visible){if(!own(driver))continue;ctx.save();ctx.translate(X(driver.x),Z(driver.z));ctx.beginPath();ctx.arc(0,0,playerSize+2.2,0,Math.PI*2);ctx.fillStyle='#fff9dddf';ctx.fill();ctx.rotate(-driver.angle||0);ctx.beginPath();ctx.moveTo(0,playerSize);ctx.lineTo(-playerSize*.7,-playerSize*.72);ctx.lineTo(0,-playerSize*.32);ctx.lineTo(playerSize*.7,-playerSize*.72);ctx.closePath();ctx.fillStyle='#ffd64e';ctx.fill();ctx.strokeStyle='#253344';ctx.lineWidth=2;ctx.stroke();ctx.restore();}
 return {painted:true,cacheRebuilt:rebuilt};
}

/** Expanding a GPS never owns a steering pointer. Interaction clears the game's
 * held input through onInteract, and normal button activation stays accessible. */
export function createMiniMap({root,onChange=()=>{},onInteract=()=>{}}={}){
 if(!root)return null;
 const doc=root.ownerDocument||document,win=doc.defaultView||globalThis.window;
 const button=root.querySelector('#minimap-toggle'),close=root.querySelector('#minimap-close'),details=root.querySelector('#minimap-details'),caption=root.querySelector('#minimap-caption'),course=root.querySelector('#minimap-course-name');
 if(!button||!close||!details)return null;
 let expanded=false,destroyed=false,queued=false,frame=null;const removers=[];
 const listen=(target,type,fn,options)=>{target?.addEventListener?.(type,fn,options);removers.push(()=>target?.removeEventListener?.(type,fn,options));};
 const redraw=()=>{if(queued||destroyed)return;queued=true;const paint=()=>{queued=false;frame=null;if(!destroyed)onChange(expanded);};if(win?.requestAnimationFrame)frame=win.requestAnimationFrame(paint);else paint();};
 const update=()=>{root.dataset.expanded=String(expanded);button.setAttribute('aria-expanded',String(expanded));button.setAttribute('aria-label',expanded?'Streckenkarte verkleinern':'Streckenkarte vergrößern');details.hidden=!expanded;if(caption)caption.textContent=expanded?'ANTIPPEN ZUM VERKLEINERN':'STRECKE VERGRÖSSERN';};
 const set=(value,{focus=true}={})=>{if(destroyed||expanded===!!value)return;onInteract();expanded=!!value;update();redraw();if(focus)(expanded?close:button).focus({preventScroll:true});};
 const handleKeydown=event=>{if(event.code!=='Escape'||!expanded)return false;event.preventDefault();event.stopPropagation?.();set(false);return true;};
 listen(button,'click',()=>set(!expanded));listen(close,'click',()=>set(false));
 listen(root,'pointerdown',event=>{onInteract();event.stopPropagation?.();});
 listen(root,'keydown',event=>{if(handleKeydown(event))return;if(['Space','Enter'].includes(event.code)&&event.target.closest?.('button')){onInteract();event.stopPropagation?.();}});
 listen(win,'resize',redraw);
 const Observer=win?.ResizeObserver||globalThis.ResizeObserver;const observer=typeof Observer==='function'?new Observer(redraw):null;observer?.observe(root);
 update();
 return {get expanded(){return expanded;},toggle:()=>set(!expanded),expand:options=>set(true,options),collapse:options=>set(false,options),handleKeydown,
  setTrack(name){if(course&&course.textContent!==name)course.textContent=name;},invalidate:redraw,
  destroy(){if(destroyed)return;destroyed=true;for(const remove of removers)remove();observer?.disconnect();if(frame!==null)win?.cancelAnimationFrame?.(frame);}
 };
}
