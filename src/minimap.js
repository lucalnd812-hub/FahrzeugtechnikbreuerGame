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

/** Road polylines with their bounds, built once per map for the local GPS. */
const roadIndex=new WeakMap();
function roadsOf(map){
 let list=roadIndex.get(map);if(list)return list;
 list=(map.roads||[]).filter(r=>r.points?.length>1).map(r=>{let x0=Infinity,x1=-Infinity,z0=Infinity,z1=-Infinity;for(const [x,z] of r.points){x0=Math.min(x0,x);x1=Math.max(x1,x);z0=Math.min(z0,z);z1=Math.max(z1,z);}return {points:r.points,x0,x1,z0,z1};});
 roadIndex.set(map,list);return list;
}
export const LOCAL_GPS_AHEAD=100;
/** Heading-up GPS around the player: only the next ~100 m of the course, side
 * streets as faint context, everything dissolving into a soft round fade. No
 * panel, no cached bitmap: a few dozen line segments per frame. */
function drawLocalMinimap(ctx,{w,h,dpr,map,track,drivers,own,player}){
 ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,w*dpr,h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
 const me=drivers.find(own)||player;if(!me||!finite(me.x)||!finite(me.z))return;
 const cx=w/2,cy=h*.66,radius=Math.min(w,h)*.5,ppm=(cy-h*.06)/LOCAL_GPS_AHEAD,a=me.angle||0,sa=Math.sin(a),ca=Math.cos(a);
 const U=(x,z)=>cx+((z-me.z)*sa-(x-me.x)*ca)*ppm,V=(x,z)=>cy-((x-me.x)*sa+(z-me.z)*ca)*ppm;
 const reach=(Math.hypot(w,h)/ppm)*.75;
 // A dark glassy disc keeps the lines readable over sunny grass and pale road.
 // Gradients are optional: minimal canvas implementations still get the lines.
 const radial=(r0,stops)=>{const g=ctx.createRadialGradient?.(cx,h*.5,r0,cx,h*.5,radius);if(!g?.addColorStop)return null;for(const [o,c] of stops)g.addColorStop(o,c);return g;};
 const glass=radial(0,[[0,'rgba(12,20,30,.5)'],[.7,'rgba(12,20,30,.32)'],[1,'rgba(12,20,30,0)']]);if(glass){ctx.fillStyle=glass;ctx.fillRect(0,0,w,h);}
 ctx.lineCap=ctx.lineJoin='round';
 // Side streets: barely there, just enough to read a junction coming up.
 ctx.strokeStyle='rgba(255,255,255,.28)';ctx.lineWidth=Math.max(2.5,5*ppm);
 for(const r of roadsOf(map)){
  if(r.x1<me.x-reach||r.x0>me.x+reach||r.z1<me.z-reach||r.z0>me.z+reach)continue;
  ctx.beginPath();r.points.forEach(([x,z],i)=>i?ctx.lineTo(U(x,z),V(x,z)):ctx.moveTo(U(x,z),V(x,z)));ctx.stroke();
 }
 // The course itself: from a short tail behind the car to the next 100 m.
 if(track?.at){
  const s=finite(me.s)?me.s:track.nearest(me.x,me.z).s,pts=[];
  for(let d=-24;d<=LOCAL_GPS_AHEAD+12;d+=3){const p=track.at(s+d);pts.push([U(p.x,p.z),V(p.x,p.z)]);}
  const line=()=>{ctx.beginPath();pts.forEach(([u,v],i)=>i?ctx.lineTo(u,v):ctx.moveTo(u,v));};
  line();ctx.strokeStyle='rgba(10,16,24,.55)';ctx.lineWidth=Math.max(9,12*ppm);ctx.stroke();
  line();ctx.strokeStyle='#ffffff';ctx.lineWidth=Math.max(5,7*ppm);ctx.stroke();
  // Start/finish: a small chequered bar across the road when it is close.
  const start=map.start||map.route[0],ahead=track.delta(0,s);
  if(Math.abs(ahead)<LOCAL_GPS_AHEAD+15){const p=track.at(0),u=U(start[0],start[1]),v=V(start[0],start[1]);
   ctx.save();ctx.translate(u,v);ctx.rotate(a-p.angle);for(let i=-3;i<3;i++)for(let j=0;j<2;j++){ctx.fillStyle=(i+j)%2?'#fffdf4':'#1d2630';ctx.fillRect(i*2.4,-2.4+j*2.4,2.4,2.4);}ctx.restore();}
 }
 // Rivals in range as small coloured dots, the player's arrow on top.
 for(const d of drivers){if(own(d))continue;const u=U(d.x,d.z),v=V(d.x,d.z);if(Math.hypot(u-cx,v-cy)>radius*1.05)continue;
  ctx.beginPath();ctx.arc(u,v,3.6,0,Math.PI*2);ctx.fillStyle=d.finish!=null?'rgba(255,255,255,.6)':'#ff4d5e';ctx.fill();ctx.lineWidth=1.4;ctx.strokeStyle='rgba(16,24,32,.7)';ctx.stroke();}
 ctx.save();ctx.translate(cx,cy);ctx.beginPath();ctx.moveTo(0,-8.5);ctx.lineTo(6,6);ctx.lineTo(0,3);ctx.lineTo(-6,6);ctx.closePath();
 ctx.fillStyle='#ffd23f';ctx.fill();ctx.lineWidth=1.8;ctx.strokeStyle='#1b2430';ctx.stroke();ctx.restore();
 // Soft round fade: full strength around the car, gone at the rim.
 const fade=radial(radius*.32,[[0,'rgba(0,0,0,1)'],[.62,'rgba(0,0,0,.75)'],[1,'rgba(0,0,0,0)']]);
 if(fade){ctx.globalCompositeOperation='destination-in';ctx.fillStyle=fade;ctx.fillRect(0,0,w,h);ctx.globalCompositeOperation='source-over';}
}

/** The static route is rebuilt only for a new map, CSS size or pixel ratio.
 * Moving markers reuse that bitmap. Identical paused/countdown states do no work.
 * Callers retain the existing 90 ms HUD cadence; this function adds no loop. */
export function drawRaceMinimap(canvas,{map,track,drivers=[],player,cache=fallbackCache,pixelRatio=globalThis.devicePixelRatio||1,local=false}={}){
 if(!canvas||!map?.route?.length)return {painted:false,cacheRebuilt:false};
 const w=Math.round(Number(canvas.clientWidth)||0),h=Math.round(Number(canvas.clientHeight)||0);if(w<1||h<1)return {painted:false,cacheRebuilt:false};
 const dpr=clamp(Number(pixelRatio)||1,1,2),width=Math.round(w*dpr),height=Math.round(h*dpr),ctx=canvas.getContext('2d');if(!ctx)return {painted:false,cacheRebuilt:false};
 const own=driver=>driver===player||(player?.id!=null&&driver.id===player.id);
 if(local){
  if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
  cache.delete(canvas);drawLocalMinimap(ctx,{w,h,dpr,map,track,drivers:drivers.filter(d=>finite(d.x)&&finite(d.z)),own,player});
  return {painted:true,cacheRebuilt:false};
 }
 let entry=cache.get(canvas),rebuilt=false;
 if(!entry||entry.map!==map||entry.w!==w||entry.h!==h||entry.dpr!==dpr||canvas.width!==width||canvas.height!==height){
  const doc=canvas.ownerDocument||globalThis.document,base=doc.createElement('canvas');base.width=width;base.height=height;canvas.width=width;canvas.height=height;
  const fit=fitMap(map,w,h);paintBase(base,map,track,fit,dpr);entry={base,map,w,h,dpr,fit,last:null};cache.set(canvas,entry);rebuilt=true;
 }
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
