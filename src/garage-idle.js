/** Living showroom car: when a car is chosen it starts up (a shake and a dark
 * puff), then idles on the turntable with a gentle engine shake and a steady
 * wisp of exhaust smoke. Pure 2D on top of the pre-rendered turntable views:
 * the exhaust pipes are projected with the same camera that rendered them
 * (art/blender/ai_sprites.py), so the smoke leaves the actual tailpipes.
 * Smoke behind the car (rear facing away) is drawn under the car canvas,
 * smoke towards the viewer above it. One small rAF loop, only while visible. */

// Sprite camera: level, 0.738 m high, 5.224 m back; car pivot 0.6 m nearer.
const CAMERA={height:.738,back:5.224,pivot:.6,focal:664,cx:672,horizon:372};
// Real car length, tailpipe offsets across the car and tailpipe height (m).
const EXHAUST=[
 {length:4.18,pipes:[-.42],height:.3},
 {length:4.345,pipes:[-.5],height:.3},
 {length:4.36,pipes:[-.38,.38],height:.36},
 {length:4.461,pipes:[-.6,-.48,.48,.6],height:.32},
 {length:4.572,pipes:[-.1,.1],height:.42},
];
const FRAMES=16;

/** Tailpipe screen points (sprite pixels) for one turntable view. */
export function exhaustPoints(car,frame){
 const spec=EXHAUST[car];if(!spec)return [];
 const phi=-frame*Math.PI*2/FRAMES,c=Math.cos(phi),s=Math.sin(phi),rearY=spec.length/2-.04,out=[];
 const project=(x,y,z)=>{const wx=x*c-y*s,wy=x*s+y*c-CAMERA.pivot,depth=wy+CAMERA.back;return {u:CAMERA.cx+CAMERA.focal*wx/depth,v:CAMERA.horizon-CAMERA.focal*(z-CAMERA.height)/depth,depth};};
 for(const x of spec.pipes){
  const at=project(x,rearY,spec.height),out2=project(x,rearY+.6,spec.height+.05);
  // Rear pointing away from the camera: the smoke is behind the body.
  out.push({u:at.u,v:at.v,du:out2.u-at.u,dv:out2.v-at.v,behind:x*s+rearY*c>0});
 }
 return out;
}

export function createGarageIdle({document,view=globalThis,carCanvas,host}){
 const make=z=>{const c=document.createElement('canvas');c.className='garage-smoke';c.setAttribute('aria-hidden','true');
  Object.assign(c.style,{position:'absolute',pointerEvents:'none',zIndex:String(z)});host.insertBefore(c,z===0?host.firstChild:null);return c;};
 const back=make(0),front=make(2),contexts=[back,front].map(c=>{try{return c.getContext('2d');}catch{return null;}});
 let geometry=null,car=0,frame=0,rev=0,start=0,visible=true,frameId=null,last=0,emitDebt=0,disposed=false;
 const particles=[];
 const now=()=>view.performance?.now?.()??Date.now();
 function place(box,transform,dpr){
  geometry={box,transform,dpr};
  // Called on every preview update: assigning a canvas size clears it, so
  // only touch the bitmap when the size really changes.
  const w=Math.max(1,Math.round(box.width*dpr)),h=Math.max(1,Math.round(box.height*dpr));
  for(const c of [back,front]){Object.assign(c.style,{left:box.left+'px',top:box.top+'px',width:box.width+'px',height:box.height+'px'});
   if(c.width!==w)c.width=w;if(c.height!==h)c.height=h;}
  wake();
 }
 function emit(count,{dark=false,burst=1}={}){
  if(!geometry)return;const {transform:t}=geometry;
  for(const p of exhaustPoints(car,frame))for(let i=0;i<count;i++){
   const len=Math.hypot(p.du,p.dv)||1,speed=(46+Math.random()*34)*burst;
   particles.push({x:t.x+p.u*t.scale,y:t.y+p.v*t.scale,vx:(p.du/len)*speed*t.scale+(Math.random()-.5)*6,vy:(p.dv/len)*speed*t.scale-(16+Math.random()*12)*t.scale,
    r:(5+Math.random()*4)*t.scale,grow:(34+Math.random()*22)*t.scale,age:0,life:2.2+Math.random()*1.2,behind:p.behind,dark});
  }
  if(particles.length>140)particles.splice(0,particles.length-140);
 }
 function tick(time){
  frameId=null;if(disposed||!visible||!geometry||document.hidden)return;
  const dt=Math.min(.05,last?(time-last)/1000:.016);last=time;
  start=Math.max(0,start-dt/1.1);
  // Engine shake: a soft idle, harder for a moment after the start and while revving.
  const amp=(.45+start*2.4+rev*1.5)*geometry.transform.scale,s=time/1000;
  const y=Math.sin(s*31)*amp*.6+Math.sin(s*17.3)*amp*.4,r=Math.sin(s*23.7)*amp*.05;
  carCanvas.style.transform=`translate(0px,${y.toFixed(2)}px) rotate(${r.toFixed(3)}deg)`;
  emitDebt+=dt*(8+rev*26+start*18);
  while(emitDebt>=1){emit(1,{burst:1+rev*.8});emitDebt--;}
  const {dpr}=geometry;
  for(const [index,ctx] of contexts.entries()){
   if(!ctx)continue;ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,back.width,back.height);ctx.setTransform(dpr,0,0,dpr,0,0);
   for(const p of particles){if(p.behind!==(index===0))continue;const k=p.age/p.life;if(k>=1)continue;
    const radius=p.r+p.grow*k,alpha=(p.dark?.62:.48)*Math.sin(Math.min(1,k*4)*Math.PI/2)*(1-k);
    const g=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,radius),tone=p.dark?'64,68,76':'150,156,166';
    g.addColorStop(0,`rgba(${tone},${alpha.toFixed(3)})`);g.addColorStop(1,`rgba(${tone},0)`);ctx.fillStyle=g;ctx.beginPath();ctx.arc(p.x,p.y,radius,0,Math.PI*2);ctx.fill();}
  }
  for(const p of particles){p.age+=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=1-dt*.9;p.vy=p.vy*(1-dt*.8)-9*geometry.transform.scale*dt;}
  for(let i=particles.length-1;i>=0;i--)if(particles[i].age>=particles[i].life)particles.splice(i,1);
  frameId=view.requestAnimationFrame?.(tick)??null;
 }
 function wake(){if(frameId===null&&!disposed&&visible&&geometry&&!document.hidden&&view.requestAnimationFrame){last=0;frameId=view.requestAnimationFrame(tick);}}
 const onVisibility=()=>wake();document.addEventListener?.('visibilitychange',onVisibility);
 return {
  place,
  /** A newly chosen car starts up: shake, dark puff, then idles. */
  setCar(next,viewFrame){const changed=next!==car;car=next;frame=viewFrame;if(changed){particles.length=0;start=1;emit(5,{dark:true,burst:1.6});}wake();},
  setFrame(next){frame=next;},
  setRev(value){rev=Math.max(0,Math.min(1,value||0));},
  setVisible(value){visible=!!value;if(!visible){particles.length=0;carCanvas.style.transform='';for(const c of [back,front])c.getContext?.('2d')?.clearRect(0,0,c.width,c.height);}wake();},
  dispose(){disposed=true;if(frameId!==null)view.cancelAnimationFrame?.(frameId);document.removeEventListener?.('visibilitychange',onVisibility);back.remove();front.remove();carCanvas.style.transform='';},
 };
}
