import {buildingIdentity} from './village-identity.js';
import {CARS} from './car-catalog.js';
import {loadVehicleArt,drawVehicleArt} from './vehicle-art.js';
// A GPU-free compatibility view. The race controller still owns every car,
// checkpoint and collision; this file only draws the same coordinates in 2D.
const COLORS=CARS.map(car=>'#'+car.color.toString(16).padStart(6,'0'));
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const color=value=>typeof value==='number'?'#'+value.toString(16).padStart(6,'0'):value?.getStyle?.()||value||'#e8e4dc';
const point=value=>Array.isArray(value)?{x:value[0],z:value.length>2?value[2]:value[1]}:value;
function bounds(points){return points.reduce((b,p)=>({minX:Math.min(b.minX,p[0]),maxX:Math.max(b.maxX,p[0]),minZ:Math.min(b.minZ,p[1]),maxZ:Math.max(b.maxZ,p[1])}),{minX:Infinity,maxX:-Infinity,minZ:Infinity,maxZ:-Infinity});}
const intersects=(a,b)=>a.maxX>=b.minX&&a.minX<=b.maxX&&a.maxZ>=b.minZ&&a.minZ<=b.maxZ;
const validPoints=points=>Array.isArray(points)&&points.length>=2&&points.every(p=>Array.isArray(p)&&finite(p[0])&&finite(p[1]));
function tint(hex,factor){const n=parseInt(hex.slice(1),16);return '#'+[n>>16,(n>>8)&255,n&255].map(v=>clamp(Math.round(v*factor),0,255).toString(16).padStart(2,'0')).join('');}
function polygon(ctx,points){if(!points?.length)return;ctx.beginPath();ctx.moveTo(points[0][0],points[0][1]);for(let i=1;i<points.length;i++)ctx.lineTo(points[i][0],points[i][1]);ctx.closePath();}
function line(ctx,points){if(!points?.length)return;ctx.beginPath();ctx.moveTo(points[0][0],points[0][1]);for(let i=1;i<points.length;i++)ctx.lineTo(points[i][0],points[i][1]);}
function rounded(ctx,x,y,w,h,r=5){r=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();}
const SLATE_PAINTS=['#677a90','#7a8b99','#607488','#817e7c','#6c8190'],LEAF_PAINTS=['#78aa69','#8ab578','#6fa48a','#a2b975','#72a383'];
const WALL_PAINTS={stone:'#d8c5ab',plaster:'#f3e5c9',redBrick:'#c98667',brick:'#e4d6b5',slate:'#84969e'};
function roofLight(surface){
 if(surface.length<3)return 1;const [a,b,c]=surface,ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
 if(ny<0){nx=-nx;ny=-ny;nz=-nz;}const length=Math.hypot(nx,ny,nz)||1;return .88+.23*Math.max(0,(-nx*.48+ny*.75+nz*.44)/length);
}
function spatialGrid(records,cell){const grid=new Map();for(const r of records){const key=Math.floor(r.x/cell)+','+Math.floor(r.z/cell);if(!grid.has(key))grid.set(key,[]);grid.get(key).push(r);}return grid;}
function rectAt(frame,x,z,w,d){const c=Math.cos(frame.a),s=Math.sin(frame.a);return [[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]].map(([dx,dz])=>[frame.x+(x+dx)*c+(z+dz)*s,frame.z-(x+dx)*s+(z+dz)*c]);}

export class LightweightCanvasRenderer{
 constructor({canvas}={}){
  if(!canvas)throw new TypeError('The 2D renderer needs a canvas.');
  this.domElement=canvas;this.context=canvas.getContext('2d',{alpha:true,desynchronized:true});
  if(!this.context)throw new Error('Auch die 2D-Darstellung ist in diesem Browser nicht verfügbar.');
  this.isCanvasRenderer=true;this.isCompatibilityRenderer=true;this.renderMode='2d';
  this.info={render:{calls:0,triangles:0,lines:0,points:0},memory:{geometries:0,textures:0},mode:'canvas2d'};
  this.shadowMap={enabled:false,autoUpdate:false,needsUpdate:false};this.renderLists={dispose(){}};
  this._ratio=1;this._width=canvas.clientWidth||640;this._height=canvas.clientHeight||400;this._clear='#e8e4dc';
  this._viewport={x:0,y:0,w:this._width,h:this._height};this._scissor={...this._viewport};this._scissorTest=false;
  this._garageArtRequested=new Map();this.onInvalidate=null;this._world=null;this._garage=null;this._vehicles=null;this._focus=null;this._tour=null;this._disposed=false;
  this.setSize(this._width,this._height,false);
 }
 getContext(){return this.context;}
 setSize(width,height,updateStyle=true){
  if(!finite(width)||!finite(height)||width<=0||height<=0)return;
  this._width=width;this._height=height;this.domElement.width=Math.round(width*this._ratio);this.domElement.height=Math.round(height*this._ratio);
  if(updateStyle&&this.domElement.style){this.domElement.style.width=width+'px';this.domElement.style.height=height+'px';}
  this._viewport={x:0,y:0,w:width,h:height};this._scissor={...this._viewport};
 }
 setPixelRatio(ratio){if(finite(ratio)&&ratio>0){this._ratio=clamp(ratio,.5,2);this.setSize(this._width,this._height,false);}}
 getPixelRatio(){return this._ratio;}
 setViewport(x,y,w,h){if([x,y,w,h].every(finite))this._viewport={x,y:this._height-y-h,w,h};}
 setScissor(x,y,w,h){if([x,y,w,h].every(finite))this._scissor={x,y:this._height-y-h,w,h};}
 setScissorTest(value){this._scissorTest=!!value;}
 setClearColor(value,alpha=1){this._clear=color(value);this._clearAlpha=alpha;}
 clear(){if(!this.context)return;const c=this.context;c.save();c.setTransform(this._ratio,0,0,this._ratio,0,0);if(this._clearAlpha===0&&c.clearRect)c.clearRect(0,0,this._width,this._height);else{c.fillStyle=this._clear;c.fillRect(0,0,this._width,this._height);}c.restore();}
 setGarage(scene,cars){
  this._garage={scene,cars:cars||[]};
  if(typeof globalThis.Image==='function')for(let index=0;index<CARS.length;index++)loadVehicleArt(index,{angle:Math.PI/4,all:false}).then(()=>{if(!this._disposed)this.onInvalidate?.();}).catch(()=>{});
 }
 setFocus(pose){this._focus=pose&&finite(pose.x)&&finite(pose.z)?pose:null;if(this._focus)this._tour=null;}
 setTour(lookPoint){const p=point(lookPoint);this._tour=p&&finite(p.x)&&finite(p.z)?p:null;if(this._tour)this._focus=null;}
 setVehicles(vehicles){this._vehicles=Array.isArray(vehicles)?vehicles:null;}
 setWorld(data,track,scene){
  if(!data||!track){this._world=null;return;}
  const landmarkIds=new Map((data.pois||[]).filter(p=>p.buildingId).map(p=>[p.buildingId,p.id]));landmarkIds.set(93729467,'museum');landmarkIds.set(466484934,'chapelTower');
  const landmarkFrames=new Map();for(const id of ['breuer','school','bakery','church','chapelTower','museum','atm']){const model=scene?.getObjectByName?.('landmark:'+id);if(model)landmarkFrames.set(id,{x:model.position.x,z:model.position.z,a:model.rotation.y});}
  const buildings=(data.buildings||[]).flatMap((building,index)=>{
   const landmark=landmarkIds.get(building.id);
   const rings=building.geodata?.groundRings?.filter(validPoints)||[];
   // The matched NRW house body omits the mapped Breuer hall and school's low
   // extension. Their complete OSM outlines already drive those native models.
   const polygons=(landmark==='breuer'||landmark==='school')&&validPoints(building.points)?[building.points]:rings.length?rings:validPoints(building.points)?[building.points]:[];
   const roofSurfaces=(building.geodata?.roofSurfaces||[]).map(surface=>surface.map(p=>[p[0],p[2]])).filter(validPoints);
   const identity=buildingIdentity(building);
   const roofTag=building.tags?.['roof:colour'];let roofColor=/^#[0-9a-f]{6}$/i.test(roofTag||'')?roofTag:SLATE_PAINTS[(identity.seed>>>4)%SLATE_PAINTS.length];
   if(landmark==='breuer')roofColor='#5f7288';else if(landmark==='school')roofColor='#7b96ad';
   const roofPaints=(building.geodata?.roofSurfaces||[]).map(surface=>tint(roofColor,roofLight(surface))),wallColor=landmark==='school'?'#e8e0cf':landmark==='breuer'?'#eeddb9':WALL_PAINTS[identity.wall]||'#eadbc2';
   return polygons.map(points=>({points,bounds:bounds(points),roofSurfaces,roofPaints,color:roofColor,wallColor,wallMaterial:identity.wall,roofTile:identity.roofTile,landmark,landmarkFrame:landmarkFrames.get(landmark),visualStyle:identity.id,source:building}));
  });
  const grid=new Map(),cell=64;
  for(const building of buildings)for(let x=Math.floor(building.bounds.minX/cell);x<=Math.floor(building.bounds.maxX/cell);x++)for(let z=Math.floor(building.bounds.minZ/cell);z<=Math.floor(building.bounds.maxZ/cell);z++){const key=x+','+z;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(building);}
  const roads=(data.roads||[]).filter(road=>validPoints(road.points)).map(road=>({...road,bounds:bounds(road.points)}));
  const areas=(data.landAreas||[]).filter(area=>validPoints(area.points)).map(area=>({...area,bounds:bounds(area.points)}));
  const kerbs=[],arrows=[];for(let s=0;s<track.length;s+=6){const a=track.at(s),b=track.at(Math.min(track.length-.001,s+5.5));for(const side of [-1,1])kerbs.push({points:[[a.x+a.dz*5.8*side,a.z-a.dx*5.8*side],[b.x+b.dz*5.8*side,b.z-b.dx*5.8*side]],color:Math.floor(s/6)%2?'#fff9e8':'#eb545a',x:a.x,z:a.z});}
  for(let s=40;s<track.length;s+=65)arrows.push(track.at(s));
  // Cache the existing 3D world's tree positions once, including its low-detail
  // forest instances. No new trees or map coordinates are invented by Canvas.
  const trees=[];for(const t of scene?.userData?.treeRecords||[])trees.push({x:t.x,z:t.z,r:clamp(t.h*.34,1.35,4.2)});
  if(!trees.length)for(const mesh of scene?.children||[]){if(!mesh.isInstancedMesh||!mesh.name?.startsWith('trees:far:'))continue;const a=mesh.instanceMatrix?.array;if(!a)continue;for(let i=0;i<mesh.count;i++){const k=i*16,x=a[k+12],z=a[k+14],h=Math.hypot(a[k],a[k+1],a[k+2]);if(!finite(x)||!finite(z)||h<.01)continue;trees.push({x,z,r:clamp(h*.34,1.35,4.2)});}}
  if(!trees.length)for(const tree of data.trees||[]){const p=point(tree.point);if(p&&finite(p.x)&&finite(p.z))trees.push({x:p.x,z:p.z,r:clamp((tree.height||6)*.34,1.35,4.2)});}
  for(const tree of trees){const n=Math.sin(tree.x*7.3+tree.z*.8)*43758.5453;tree.color=LEAF_PAINTS[Math.floor((n-Math.floor(n))*LEAF_PAINTS.length)];tree.highlight=tint(tree.color,1.12);}
  const gardens=(scene?.userData?.stats?.gardenDetails||[]).filter(r=>finite(r.x)&&finite(r.z)&&finite(r.w)&&finite(r.d));
  const courts=[];for(const [id,x,z,w,d,paint] of [['breuer',1.1,.88,17.9,10,'#dad4c0'],['school',-2,23.6,40,17.5,'#d3cabc'],['bakery',0,13.84,13.5,6.38,'#e2d4bc']]){const frame=landmarkFrames.get(id);if(!frame)continue;const points=rectAt(frame,x,z,w,d);courts.push({id,frame,points,bounds:bounds(points),paint});}
  const surfaceTextures=new Map();scene?.traverse?.(mesh=>{for(const m of Array.isArray(mesh.material)?mesh.material:mesh.material?[mesh.material]:[]){const map=m.map;if(map?.name?.startsWith('village:surface:'))surfaceTextures.set(map.name.slice(16),map);if(map?.name==='artisan:roof-atlas')for(let tile=0;tile<4;tile++)surfaceTextures.set('roof'+tile,map);}});
  this._world={data,track,scene,buildings,grid,cell,roads,areas,kerbs,arrows,trees,treeGrid:spatialGrid(trees,cell),gardens,gardenGrid:spatialGrid(gardens,cell),courts,surfaceTextures,patterns:new Map(),atm:landmarkFrames.get('atm'),bounds:bounds(data.route),crateMeshes:(scene?.children||[]).filter(child=>finite(child.userData?.baseY))};
  this._vehicles=null;this._focus=null;this._tour=null;
 }
 render(scene,camera){
  if(!this.context||this._disposed)return;const c=this.context,v=this._viewport;
  this.info.render.calls=0;this.info.render.triangles=0;this.info.render.lines=0;this.info.render.points=0;
  if(v.w<=0||v.h<=0)return;
  c.save();c.setTransform(this._ratio,0,0,this._ratio,0,0);c.beginPath();c.rect(v.x,v.y,v.w,v.h);c.clip();
  if(this._scissorTest){const s=this._scissor;c.beginPath();c.rect(s.x,s.y,s.w,s.h);c.clip();}
  const garage=this._garage?.scene===scene||(!this._world&&this._garage);
  if(garage)this._drawGarage(c,v,camera);
  else if(this._world)this._drawWorld(c,v,camera);
  else{c.fillStyle=this._clear;c.fillRect(v.x,v.y,v.w,v.h);}
  c.restore();
 }
 _call(){this.info.render.calls++;}
 _visible(x,z,b){return x>=b.minX&&x<=b.maxX&&z>=b.minZ&&z<=b.maxZ;}
 _worldPattern(c,kind,metres=2.4){
  if(!c.createPattern||typeof globalThis.DOMMatrix!=='function')return null;
  const texture=this._world.surfaceTextures.get(kind),image=texture?.image;if(!image||ArrayBuffer.isView(image.data)||!image.width||!image.height)return null;
  const key=kind+':'+metres,cached=this._world.patterns.get(key);if(cached?.image===image)return cached.pattern;
  // Prefilter once instead of sampling hundreds of painted gravel texels into
  // each screen pixel. This also gives the Canvas view a calm, softer surface.
  let painted=image;if(globalThis.document?.createElement){const tile=document.createElement('canvas');tile.width=tile.height=64;const p=tile.getContext('2d');if(p?.drawImage){p.imageSmoothingEnabled=true;p.imageSmoothingQuality='high';if(kind.startsWith('roof')){const slot=Number(kind.slice(4));p.drawImage(image,slot%2*image.width/2,Math.floor(slot/2)*image.height/2,image.width/2,image.height/2,0,0,64,64);}else p.drawImage(image,0,0,64,64);painted=tile;}}
  const pattern=c.createPattern(painted,'repeat');if(!pattern?.setTransform)return null;
  pattern.setTransform(new DOMMatrix([metres/painted.width,0,0,metres/painted.height,0,0]));this._world.patterns.set(key,{image,pattern});return pattern;
 }
 _drawWorld(c,v,camera){
  const world=this._world,focus=this._focus;let center,rotation=0,scale,anchor=.5;
  if(focus){const top=finite(focus.cameraTop)?clamp(focus.cameraTop,0,1):((camera?.position?.y||0)-(focus.y||0)>45?1:0);center={x:focus.cameraX??focus.x,z:focus.cameraZ??focus.z};rotation=((focus.cameraAngle??focus.angle)||0)-Math.PI;anchor=.62-.12*top;scale=clamp(v.h/95,5.5,8)*(1-top)+clamp(v.h/210,2.1,4.5)*top;}
  else{
   center=this._tour||this._cameraCenter(camera)||{x:(world.bounds.minX+world.bounds.maxX)/2,z:(world.bounds.minZ+world.bounds.maxZ)/2};
   scale=(camera?.position?.y||0)>110?Math.min(v.w/(world.bounds.maxX-world.bounds.minX+80),v.h/(world.bounds.maxZ-world.bounds.minZ+80)):clamp(v.h/105,3.5,7);
  }
  const radius=Math.hypot(v.w,v.h)/scale,b={minX:center.x-radius,maxX:center.x+radius,minZ:center.z-radius,maxZ:center.z+radius};
  const cosine=Math.cos(rotation),sine=Math.sin(rotation),X=x=>v.x+v.w/2+x*scale,Y=z=>v.y+v.h*anchor+z*scale;
  const project=(x,z)=>({x:X((x-center.x)*cosine-(z-center.z)*sine),y:Y((x-center.x)*sine+(z-center.z)*cosine)});
  const ground=c.createLinearGradient?.(v.x,v.y,v.x,v.y+v.h);if(ground){ground.addColorStop(0,'#d0e2b9');ground.addColorStop(1,'#b8d0a0');}c.fillStyle=ground||'#c4d9ae';c.fillRect(v.x,v.y,v.w,v.h);c.save();c.translate(v.x+v.w/2,v.y+v.h*anchor);c.scale(scale,scale);c.rotate(rotation);c.translate(-center.x,-center.z);
  const grassPattern=this._worldPattern(c,'grass',4),pavingPattern=this._worldPattern(c,'paving',2.4),asphaltPattern=this._worldPattern(c,'asphalt',3.2),roofPattern=this._worldPattern(c,'slate',2.4);
  if(grassPattern){c.fillStyle=grassPattern;c.globalAlpha=.34;c.fillRect(b.minX,b.minZ,b.maxX-b.minX,b.maxZ-b.minZ);c.globalAlpha=1;}
  for(const area of world.areas){if(!intersects(area.bounds,b))continue;polygon(c,area.points);c.fillStyle=({forest:'#a3bf94',wood:'#a3bf94',meadow:'#cddfaf',grass:'#c0d5a2',cemetery:'#bbc7ab',residential:'#dbdfc2',industrial:'#ded8c6',farmland:'#dcd7aa',pitch:'#94bd91',parking:'#ddd7c5'})[area.kind]||'#c7d8b0';c.fill();this._call();}
  this._drawGroundDetails(c,world,b,scale);
  c.lineCap=c.lineJoin='round';
  for(const road of world.roads){if(!intersects(road.bounds,b))continue;line(c,road.points);c.strokeStyle='#a5b58b35';c.lineWidth=(road.width||8)+6;c.stroke();c.strokeStyle='#d6ccb460';c.lineWidth=(road.width||8)+4.4;c.stroke();c.strokeStyle=pavingPattern||'#e8e3ce';c.lineWidth=(road.width||8)+3.2;c.stroke();c.strokeStyle=asphaltPattern||'#747b7b';c.lineWidth=road.width||8;c.stroke();this._call();}
  // The ribbon follows every original route vertex. Its edge stays outside the lane.
  line(c,world.data.route);c.strokeStyle='#94aa7d2e';c.lineWidth=16.7;c.stroke();c.strokeStyle='#cec4aa55';c.lineWidth=14.2;c.stroke();c.strokeStyle=pavingPattern||'#f5f0de';c.lineWidth=12.3;c.stroke();c.strokeStyle=asphaltPattern||'#626b70';c.lineWidth=10.5;c.stroke();this._call();
  for(const kerb of world.kerbs){if(!this._visible(kerb.x,kerb.z,b))continue;line(c,kerb.points);c.strokeStyle=kerb.color;c.lineWidth=.75;c.stroke();this.info.render.lines++;}
  const island=world.data.roundabout;
  if(island&&this._visible(...island.center,b)){const radius=Math.max(2,island.radius-5.5),soil=Math.max(1.35,radius*.61);c.beginPath();c.arc(island.center[0],island.center[1],radius,0,Math.PI*2);c.fillStyle=pavingPattern||'#e0d5bc';c.fill();c.strokeStyle='#fff6df';c.lineWidth=.5;c.stroke();c.beginPath();c.arc(island.center[0],island.center[1],soil,0,Math.PI*2);c.fillStyle=grassPattern||'#aabf83';c.fill();
   if(scale>2){for(let i=0;i<12;i++){const a=i*2.399963,r=Math.sqrt((i+.5)/12)*(soil-.6),x=island.center[0]+Math.cos(a)*r,z=island.center[1]+Math.sin(a)*r;c.beginPath();c.arc(x,z,.24,0,Math.PI*2);c.fillStyle=i%3===0?'#e7a0ac':i%3===1?'#f5d67d':'#f2ecda';c.fill();}}
   this._call();}
  const candidates=new Set();for(let x=Math.floor(b.minX/world.cell);x<=Math.floor(b.maxX/world.cell);x++)for(let z=Math.floor(b.minZ/world.cell);z<=Math.floor(b.maxZ/world.cell);z++)for(const building of world.grid.get(x+','+z)||[])candidates.add(building);
  for(const building of candidates){if(!intersects(building.bounds,b))continue;c.save();c.translate(.65,.95);polygon(c,building.points);c.fillStyle='#51655326';c.fill();c.restore();polygon(c,building.points);c.fillStyle=building.color;c.fill();c.strokeStyle=building.wallColor;c.lineWidth=.35;c.stroke();
   const buildingRoof=this._worldPattern(c,'roof'+(building.roofTile||0),2.4)||roofPattern;
   for(const [index,surface] of building.roofSurfaces.entries()){polygon(c,surface);c.fillStyle=building.roofPaints[index]||building.color;c.fill();if(buildingRoof&&scale>2.2){c.fillStyle=buildingRoof;c.globalAlpha=.28;c.fill();c.globalAlpha=1;}c.strokeStyle='#f0efde38';c.lineWidth=.13;c.stroke();}
   // Rounded warm eaves and restrained highlights soften the exact surveyed
   // polygon silhouette. Roof colours/light factors were cached in setWorld.
   c.save();polygon(c,building.points);c.clip();c.strokeStyle=building.wallColor;c.lineWidth=1.5;c.stroke();const wallPattern=scale>2.2?this._worldPattern(c,building.wallMaterial,2.4):null;if(wallPattern){c.strokeStyle=wallPattern;c.globalAlpha=.48;c.stroke();c.globalAlpha=1;}c.restore();
   if(building.landmark&&scale>2.2)this._drawLandmarkRoof(c,building);
   this._call();
  }
  for(const arrow of world.arrows){if(!this._visible(arrow.x,arrow.z,b))continue;polygon(c,[[arrow.x+arrow.dx*2.3,arrow.z+arrow.dz*2.3],[arrow.x-arrow.dx*1.5+arrow.dz*1.2,arrow.z-arrow.dz*1.5-arrow.dx*1.2],[arrow.x-arrow.dx*.55,arrow.z-arrow.dz*.55],[arrow.x-arrow.dx*1.5-arrow.dz*1.2,arrow.z-arrow.dz*1.5+arrow.dx*1.2]]);c.fillStyle='#fbe7a0';c.fill();this._call();}
  this._drawStart(c,world.track);
  const action=world.track.raceConfig?.rules!=='classic';
  if(action)for(const obstacle of world.track.obstacles||[]){if(!this._visible(obstacle.x,obstacle.z,b))continue;c.save();c.translate(obstacle.x,obstacle.z);c.rotate(-obstacle.angle);if(obstacle.kind==='tyres'){c.beginPath();c.arc(0,0,obstacle.radius||.86,0,Math.PI*2);c.fillStyle='#28323a';c.fill();c.strokeStyle='#ffa447';c.lineWidth=.24;c.stroke();c.beginPath();c.arc(0,0,.32,0,Math.PI*2);c.fillStyle='#6c7475';c.fill();}else{c.fillStyle='#efca7c';c.fillRect(-.9,-.75,1.8,1.5);c.strokeStyle='#a96b3d';c.lineWidth=.2;c.strokeRect(-.9,-.75,1.8,1.5);c.beginPath();c.moveTo(-.6,-.65);c.lineTo(-.6,.65);c.moveTo(.6,-.65);c.lineTo(.6,.65);c.stroke();}c.restore();this._call();}
  if(action)for(const mesh of world.crateMeshes){if(mesh.visible===false||!this._visible(mesh.position.x,mesh.position.z,b))continue;c.save();c.translate(mesh.position.x,mesh.position.z);c.fillStyle='#f9c947';c.fillRect(-.65,-.65,1.3,1.3);c.strokeStyle='#fff9d9';c.lineWidth=.2;c.strokeRect(-.65,-.65,1.3,1.3);c.fillStyle='#94502d';c.font='bold 1.1px Arial';c.textAlign='center';c.textBaseline='middle';c.fillText('?',0,.05);c.restore();this._call();}
  const vehicles=this._vehicles||(world.scene?.children||[]).filter(mesh=>mesh.userData?.carModel&&mesh.visible!==false).map(mesh=>({x:mesh.position.x,z:mesh.position.z,angle:mesh.rotation.y,car:Math.max(0,CARS.findIndex(spec=>spec.id===mesh.userData?.modelId||mesh.name?.includes(spec.id))),shield:mesh.userData.shield?.visible?1:0,boost:mesh.userData.flames?.visible?1:0}));
  // Oil is a real controller-created scene object; never invent a road hazard.
  for(const mesh of world.scene?.children||[]){if((mesh.name==='race:oil'||mesh.geometry?.type==='CircleGeometry'&&mesh.material?.color?.getHex?.()===0x121a18)&&mesh.visible!==false&&this._visible(mesh.position.x,mesh.position.z,b)){c.beginPath();c.ellipse(mesh.position.x,mesh.position.z,2.2,1.7,0,0,Math.PI*2);c.fillStyle='#152a35b3';c.fill();this._call();}}
  for(const vehicle of vehicles){if(!finite(vehicle.x)||!finite(vehicle.z)||!this._visible(vehicle.x,vehicle.z,b))continue;this._drawCar(c,vehicle,focus?.id?vehicle.id===focus.id:vehicle===focus||vehicle.id==='you');}
  c.restore();
  this._drawLabels(c,v,world.data.pois||[],project);
  this._badge(c,v,'2D-KOMPATIBILITÄT · ECHTE STRECKE');
 }
 _drawGroundDetails(c,world,b,scale){
  // Ground decor goes first. Every authored street then paints over it, so
  // gardens, workshop yards and canopy edges cannot hide the driving surface.
  for(const court of world.courts){if(!intersects(court.bounds,b))continue;polygon(c,court.points);c.fillStyle=court.paint;c.fill();c.strokeStyle='#f7ecd4';c.lineWidth=.30;c.stroke();
   if(scale>2.2){c.save();c.translate(court.frame.x,court.frame.z);c.rotate(-court.frame.a);
    if(court.id==='breuer'){c.fillStyle='#5e6d79';rounded(c,-7.5,-3.9,4.6,1.55,.28);c.fill();rounded(c,-1.2,-3.9,4.6,1.55,.28);c.fill();c.fillStyle='#e55252';for(const x of [-5.4,.2])c.fillRect(x-.15,-3.65,.3,1.05);}
    else if(court.id==='bakery'){for(const x of [-4.3,0,4.3]){for(let i=0;i<4;i++){c.beginPath();c.moveTo(x,14);c.arc(x,14,1.55,i*Math.PI/2,(i+1)*Math.PI/2);c.closePath();c.fillStyle=i%2?'#dab095':'#fff2da';c.fill();}c.beginPath();c.arc(x,14,.2,0,Math.PI*2);c.fillStyle='#d59b78';c.fill();}}
    else if(court.id==='school'){c.strokeStyle='#b07885';c.lineWidth=.26;c.beginPath();c.moveTo(-11,20.3);c.lineTo(-4,26.3);c.moveTo(-4,20.3);c.lineTo(-11,26.3);c.stroke();c.fillStyle='#92846f';rounded(c,10.5,20.6,3,.7,.15);c.fill();for(const [i,x,z] of [[0,3.8,24.8],[1,3.8,25.55],[2,3.38,26.3],[3,4.22,26.3],[4,3.8,27.05],[5,3.38,27.8],[6,4.22,27.8],[7,3.8,28.55]]){c.fillStyle=i%3===0?'#f1ce70':i%3===1?'#dd6c72':'#f5edda';c.fillRect(x-.32,z-.32,.64,.64);}}
    c.restore();
   }this._call();
  }
  if(world.atm&&this._visible(world.atm.x,world.atm.z,b)){c.save();c.translate(world.atm.x,world.atm.z);c.rotate(-world.atm.a);rounded(c,-1.29,-1.265,2.58,2.53,.16);c.fillStyle='#d94f59';c.fill();rounded(c,-1.04,-1.04,2.08,2.08,.12);c.fillStyle='#f0e7d1';c.fill();c.fillStyle='#6c8994';c.fillRect(.12,.51,.62,.43);c.restore();this._call();}
  for(let x=Math.floor(b.minX/world.cell);x<=Math.floor(b.maxX/world.cell);x++)for(let z=Math.floor(b.minZ/world.cell);z<=Math.floor(b.maxZ/world.cell);z++){
   const key=x+','+z;
   for(const garden of world.gardenGrid.get(key)||[]){if(!this._visible(garden.x,garden.z,b))continue;c.save();c.translate(garden.x,garden.z);c.rotate(-garden.a);rounded(c,-garden.w/2,-garden.d/2,garden.w,garden.d,.24);c.fillStyle=garden.kind==='hedge'?'#77a56d':garden.kind==='flowerbed'?'#9b8063':garden.kind==='planter'?'#d4c4a8':garden.kind==='metal'?'#889a97':garden.kind==='timber'?'#ac8c69':'#c4b99f';c.fill();
    if(scale>2.2&&(garden.kind==='planter'||garden.kind==='flowerbed'))for(let j=0;j<3;j++){c.beginPath();c.arc(0,(j-1)*garden.d*.24,Math.min(.21,garden.w*.23),0,Math.PI*2);c.fillStyle=j%2?'#eed18b':'#df9cac';c.fill();}c.restore();this._call();
   }
   for(const tree of world.treeGrid.get(key)||[]){if(!this._visible(tree.x,tree.z,b))continue;if(scale>2.2){c.beginPath();c.ellipse(tree.x+.5,tree.z+.75,tree.r*1.13,tree.r*.9,0,0,Math.PI*2);c.fillStyle='#52715424';c.fill();}c.beginPath();c.arc(tree.x,tree.z,tree.r,0,Math.PI*2);c.fillStyle=tree.color;c.fill();if(scale>2.2){c.beginPath();c.arc(tree.x-tree.r*.21,tree.z-tree.r*.24,tree.r*.69,0,Math.PI*2);c.fillStyle=tree.highlight;c.fill();}this._call();}
  }
 }
 _drawLandmarkRoof(c,building){
  const b=building.bounds,x=(b.minX+b.maxX)/2,z=(b.minZ+b.maxZ)/2,w=b.maxX-b.minX,d=b.maxZ-b.minZ;c.save();polygon(c,building.points);c.clip();
  if(building.landmark==='breuer'){
   if(building.landmarkFrame){const f=building.landmarkFrame;c.translate(f.x,f.z);c.rotate(-f.a);rounded(c,-8.15,-15.4,11.1,11.0,.28);c.fillStyle='#ba8875';c.fill();
    for(const [i,x,z] of [[2,-5.35,-10.2],[0,.2,-11.1]]){c.fillStyle='#d64f58';for(const side of [-1,1])c.fillRect(x+side*1.12-.10,z-2.1,.20,4.2);rounded(c,x-.78,z-1.73,1.56,3.46,.22);c.fillStyle=i===0?'#f1cd55':'#eee8d7';c.fill();rounded(c,x-.58,z-.75,1.16,1.45,.12);c.fillStyle='#7ba1ad';c.fill();}
    for(let i=0;i<3;i++){rounded(c,-7.8+i*3.4,-15.13,2.6,.63,.10);c.fillStyle='#c8565b';c.fill();}c.fillStyle='#e05a5c';rounded(c,-8.1,-4.83,18.7,.70,.16);c.fill();
   }else{c.fillStyle='#df5255';rounded(c,x-w*.37,z-.55,w*.74,1.1,.25);c.fill();}
  }
  else if(building.landmark==='school'){polygon(c,building.points);c.strokeStyle='#a68bad';c.lineWidth=.45;c.stroke();}
  else if(building.landmark==='church'||building.landmark==='chapelTower'){c.strokeStyle='#e5d5aa';c.lineWidth=.45;c.beginPath();c.moveTo(x,z-1.7);c.lineTo(x,z+1.7);c.moveTo(x-1.1,z-.45);c.lineTo(x+1.1,z-.45);c.stroke();}
  else if(building.landmark==='museum'){c.strokeStyle='#ccb88f';c.lineWidth=.24;c.beginPath();if(w>d){c.moveTo(b.minX,z);c.lineTo(b.maxX,z);}else{c.moveTo(x,b.minZ);c.lineTo(x,b.maxZ);}c.stroke();}
  c.restore();
 }
 _cameraCenter(camera){
  if(!camera?.position)return null;camera.updateMatrixWorld?.();const m=camera.matrixWorld?.elements;
  if(m&&m[9]>.01){const t=camera.position.y/m[9];return {x:camera.position.x-m[8]*t,z:camera.position.z-m[10]*t};}
  return {x:camera.position.x,z:camera.position.z};
 }
 _drawStart(c,track){const p=track.at(0);c.save();c.translate(p.x,p.z);c.rotate(-p.angle);for(let x=0;x<10;x++)for(let y=0;y<2;y++){c.fillStyle=(x+y)%2?'#fffbe7':'#27323b';c.fillRect(x-5,y*.6-.6,1,.6);}c.restore();this._call();}
 _drawCar(c,v,isPlayer){
  c.save();c.translate(v.x,v.z);c.rotate(-(v.angle||0));
  if(v.shield>0){c.beginPath();c.ellipse(0,0,2,3.1,0,0,Math.PI*2);c.fillStyle='#78dff22e';c.fill();c.strokeStyle='#a0edff';c.lineWidth=.22;c.stroke();}
  if(v.boost>0){polygon(c,[[-.5,-2.05],[0,-3.6],[.5,-2.05]]);c.fillStyle='#ffba3e';c.fill();}
  c.fillStyle='#28313b';for(const side of [-1,1])for(const z of [-1.35,1.25])c.fillRect(side*.9-.18,z-.42,.36,.84);
  rounded(c,-.91,-2.15,1.82,4.3,.25);c.fillStyle=COLORS[v.car]||COLORS[0];c.fill();c.strokeStyle=isPlayer?'#ffed99':'#263342';c.lineWidth=isPlayer?.32:.18;c.stroke();
  rounded(c,-.68,-.85,1.36,1.55,.17);c.fillStyle='#497685';c.fill();c.fillStyle=COLORS[v.car]||COLORS[0];c.fillRect(-.66,-.55,1.32,.75);
  c.fillStyle='#fff7b6';c.fillRect(-.73,1.9,.44,.15);c.fillRect(.29,1.9,.44,.15);c.fillStyle='#e54342';c.fillRect(-.75,-2.06,.4,.13);c.fillRect(.35,-2.06,.4,.13);
  if(v.car===1||v.car===2){for(const [index,shade] of ['#438cba','#264960','#e34f43'].entries()){c.fillStyle=shade;c.fillRect(-.27+index*.16,.9,.13,.86);}c.fillStyle='#343c44';c.fillRect(-1.05,-1.8,2.1,.2);}
  if(v.drifting){c.fillStyle=v.drift>.6?'#ffb82e':'#4de0ff';for(const side of [-1,1]){c.beginPath();c.arc(side*1.2,-1.5,.22,0,Math.PI*2);c.fill();}}
  c.restore();this._call();
 }
 _drawLabels(c,v,pois,project){
  const placed=[];c.font='bold 10px Arial';c.textBaseline='middle';
  for(const poi of [...pois].sort((a,b)=>(a.id==='breuer'?-1:0)-(b.id==='breuer'?-1:0))){const p=project(poi.point[0],poi.point[1]);if(p.x<v.x+12||p.x>v.x+v.w-12||p.y<v.y+30||p.y>v.y+v.h-40)continue;const text=poi.id==='breuer'?'BREUER · WERKSTATT':poi.id==='bakery'?'LEO · CAFÉ':poi.id==='church'?'ST. JOHANNES':poi.id==='school'?'KALLTALSCHULE':poi.id==='roundabout'?'DORFKREISEL':poi.id==='atm'?'SPARKASSE':poi.name;
   const width=Math.min(190,c.measureText(text).width+16),box={x:clamp(p.x-width/2,v.x+8,v.x+v.w-width-8),y:p.y+13,w:width,h:21};if(placed.some(a=>box.x<a.x+a.w&&box.x+box.w>a.x&&box.y<a.y+a.h&&box.y+box.h>a.y))continue;placed.push(box);
   rounded(c,box.x,box.y,box.w,box.h,5);c.fillStyle=poi.id==='breuer'?'#ca2840':'#fff9e8eb';c.fill();c.strokeStyle=poi.id==='breuer'?'#ffbe95':'#8c9e8050';c.lineWidth=1;c.stroke();c.fillStyle=poi.id==='breuer'?'#fff8e5':'#415342';c.textAlign='center';c.fillText(text,box.x+box.w/2,box.y+box.h/2);this._call();
  }
 }
 _badge(c,v,text){c.save();c.font='bold 9px Arial';c.textAlign='center';c.textBaseline='bottom';c.fillStyle='#193d29';c.fillText(text,v.x+v.w/2,v.y+v.h-8);c.restore();}
 _drawGarage(c,v,camera){
  const car=this._garage?.cars.find(model=>model.visible!==false)||this._garage?.cars[0];
  const index=Math.max(0,CARS.findIndex(spec=>spec.id===car?.userData?.modelId||car?.name?.includes(spec.id)));
  const angle=Math.atan2(camera?.position?.x||6.8,camera?.position?.z||8.4)-(car?.rotation?.y||0);
  if(typeof globalThis.Image==='function'&&(this._garageArtRequested.get(index)||0)<Date.now()){
   this._garageArtRequested.set(index,Infinity);
   loadVehicleArt(index,{angle,all:true}).then(()=>{if(!this._disposed)this.onInvalidate?.();}).catch(()=>{this._garageArtRequested.set(index,Date.now()+3000);});
  }
  // Transparent model layer, over the same painted garage as WebGL.
  // Each actual-model sprite includes its own aligned contact shadow.
  const artTop=.015,artHeight=.97,cx=v.x+v.w*.5;
  const offset=(car?.position?.x||0)*v.w*.09;
  const drawn=drawVehicleArt(c,index,angle,{x:v.x+v.w*.06+offset,y:v.y+v.h*artTop,width:v.w*.88,height:v.h*artHeight,contentFit:true});
  if(!drawn){c.font='600 13px Arial';c.textAlign='center';c.fillStyle='#f8ead2';c.fillText('Dein Klassiker wird geladen…',cx,v.y+v.h*.47);}
  this._call();
 }

 dispose(){this._disposed=true;this._world=null;this._garage=null;this._vehicles=null;this._focus=this._tour=null;this.context=null;this.info.render.calls=0;this.info.memory.geometries=this.info.memory.textures=0;}
}
