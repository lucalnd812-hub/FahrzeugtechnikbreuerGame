import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {clearOfCourse} from './course.js';
import {drapedPolygonGeometry,drapedRingGeometry,landUseSurfaceGeometries,SURFACE_LAYERS} from './road-surface.js';
import {buildingIdentity,facadeAtlasPixels} from './village-identity.js';
import {upgradeVillageTextures} from './village-textures.js';

export const rand=n=>{const v=Math.sin(n*78.233+2.41)*43758.5453;return v-Math.floor(v);};
export const material=(color,extra={})=>new THREE.MeshStandardMaterial({color,roughness:.8,...extra});
const unitBox=new THREE.BoxGeometry(1,1,1).toNonIndexed();
// A clipped mechanical box: six broad faces, twelve softened edges and eight
// corners. Its envelope is exactly the original box; no detail enters a lane.
export function beveledBoxGeometry(w,h,d,r=.06){
 const half=[w/2,h/2,d/2],bevel=Math.min(r,...half.map(v=>v*.36)),positions=[],normals=[],uv=[];
 const face=(points,normal)=>{for(let i=1;i<points.length-1;i++){let tri=[points[0],points[i],points[i+1]],a=new THREE.Vector3(...tri[1]).sub(new THREE.Vector3(...tri[0])),b=new THREE.Vector3(...tri[2]).sub(new THREE.Vector3(...tri[0]));if(a.cross(b).dot(new THREE.Vector3(...normal))<0)tri=[tri[0],tri[2],tri[1]];for(const p of tri){positions.push(...p);normals.push(...normal);uv.push(p[0]/w+.5,p[1]/h+.5);}}};
 for(let axis=0;axis<3;axis++)for(const side of [-1,1]){const axes=[0,1,2].filter(a=>a!==axis),n=[0,0,0];n[axis]=side;face([[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>{const p=[0,0,0];p[axis]=half[axis]*side;p[axes[0]]=a*(half[axes[0]]-bevel);p[axes[1]]=b*(half[axes[1]]-bevel);return p;}),n);}
 for(let along=0;along<3;along++){const [a,b]=[0,1,2].filter(v=>v!==along);for(const sa of [-1,1])for(const sb of [-1,1]){const n=[0,0,0];n[a]=sa*Math.SQRT1_2;n[b]=sb*Math.SQRT1_2;face([[-1,0],[1,0],[1,1],[-1,1]].map(([end,edge])=>{const p=[0,0,0];p[along]=end*(half[along]-bevel);p[a]=sa*(half[a]-(edge?bevel:0));p[b]=sb*(half[b]-(edge?0:bevel));return p;}),n);}}
 for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1]){const sign=[x,y,z],n=sign.map(v=>v/Math.sqrt(3));face([0,1,2].map(axis=>half.map((v,i)=>sign[i]*(v-(i===axis?0:bevel)))),n);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));return g;
}

// One diffuse sample, no extra pass and no tessellating every repeated brick.
// Only medium/high wall/roof materials use this hook; Q0 has ordinary painted
// repeating maps and the forest uses plain cutout geometry without any hook.
export function paintedAtlasMaterial(m,grid=4){
 const source=THREE.ShaderChunk.map_fragment;if(!source.includes('texture2D( map, vMapUv )'))throw Error('Unsupported Three diffuse-map shader contract');
 m.userData.paintAtlas={grid,padding:.035};m.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float paintTile;\nvarying float vPaintTile;').replace('#include <begin_vertex>','#include <begin_vertex>\nvPaintTile = paintTile;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float vPaintTile;');
  const size=grid.toFixed(1),uv=`(vec2(mod(floor(vPaintTile + 0.5), ${size}), ${size} - 1.0 - floor((vPaintTile + 0.5) / ${size})) + vec2(0.035) + fract(vMapUv) * 0.93) / ${size}`;
  const fragment=source.replace('texture2D( map, vMapUv )',`textureGrad( map, ${uv}, dFdx(vMapUv) * (0.93 / ${size}), dFdy(vMapUv) * (0.93 / ${size}) )`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',fragment);
 };
 m.customProgramCacheKey=()=>`breuer-painted-atlas-${grid}-1`;return m;
}
function paintTile(g,slot){g.setAttribute('paintTile',new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(slot),1));return g;}
const buildingIndexes=new WeakMap();
// Exact polygon tests remain authoritative; the grid only narrows candidates.
export function buildingIndex(buildings,cellSize=48){
 if(buildingIndexes.has(buildings))return buildingIndexes.get(buildings);
 const cells=new Map();
 for(const b of buildings){
  const xs=b.points.map(p=>p[0]),zs=b.points.map(p=>p[1]);
  for(let x=Math.floor(Math.min(...xs)/cellSize);x<=Math.floor(Math.max(...xs)/cellSize);x++)for(let z=Math.floor(Math.min(...zs)/cellSize);z<=Math.floor(Math.max(...zs)/cellSize);z++){
   const key=x+','+z;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(b);
  }
 }
 const index={contains(x,z){return (cells.get(Math.floor(x/cellSize)+','+Math.floor(z/cellSize))||[]).some(b=>pointInside(x,z,b.points));}};
 buildingIndexes.set(buildings,index);return index;
}
export function object(g,m,x=0,y=0,z=0){const o=new THREE.Mesh(g,m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;return o;}
export function block(w,h,d,m,x=0,y=0,z=0){return object(new THREE.BoxGeometry(w,h,d),m,x,y,z);}
export function sign(text,width=12,color='#ffffff',bg='#19191d',heightRatio=.21){
 const c=document.createElement('canvas');c.width=width>6?1024:width<1.5?256:512;c.height=Math.round(c.width*heightRatio);const ctx=c.getContext('2d');
 ctx.fillStyle=bg;ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle=color;ctx.font=`900 ${Math.round(c.height*.53)}px Arial`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,c.width/2,c.height/2,c.width*.96);
 const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;
 const m=new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide});m.userData.keepUV=true;const o=object(new THREE.PlaneGeometry(width,width*heightRatio),m);o.castShadow=false;return o;
}
export function logoBoard(width=3){
 const fallback=sign('BREUER',width),img=document.querySelector?.('.logo');
 if(img){const tex=new THREE.Texture(img);tex.colorSpace=THREE.SRGBColorSpace;if(img.complete)tex.needsUpdate=true;else img.addEventListener('load',()=>tex.needsUpdate=true,{once:true});fallback.material.map.dispose();fallback.material.map=tex;fallback.geometry.dispose();fallback.geometry=new THREE.PlaneGeometry(width,width*.42);}
 return fallback;
}
// Small deterministic first-frame textures; generated painted pixels may replace
// these same owned texture objects once ready, without a second material pass.
export function surfaceTexture(kind){
 const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d');
 if(kind==='brick'||kind==='stone'||kind==='redBrick'){
  ctx.fillStyle=kind==='brick'?'#aaa494':'#807b71';ctx.fillRect(0,0,256,256);
  const rows=kind==='stone'?8:16;
  for(let y=0;y<rows;y++)for(let x=-1;x<6;x++){
   const seed=y*41+x*3+32,v=Math.floor(rand(seed)*32),w=kind==='brick'?52:52+Math.floor(rand(seed+8)*7),h=256/rows;
   ctx.fillStyle=kind==='brick'?`rgb(${224+v*.6},${215+v*.6},${189+v*.6})`:kind==='redBrick'?`rgb(${183+v},${92+v*.6},${65+v*.5})`:`rgb(${152+v},${155+v},${151+v})`;
   ctx.fillRect(x*52+(y%2)*26+1,y*h+1,w-2,h-2);
  }
 }else if(kind==='slate'){
  ctx.fillStyle='#4d5c70';ctx.fillRect(0,0,256,256);
  for(let y=0;y<12;y++)for(let x=-1;x<9;x++){const v=Math.floor(rand(y*32+x+60)*3)*5;ctx.fillStyle=`rgb(${77+v},${92+v},${110+v})`;ctx.fillRect(x*32+(y%2)*16+1,y*22+1,30,20);}
 }else if(kind==='paving'){
  ctx.fillStyle='#a4a49f';ctx.fillRect(0,0,256,256);
  for(let y=0;y<12;y++)for(let x=-1;x<9;x++){const v=rand(y*29+x+40)*25;ctx.fillStyle=`rgb(${167+v},${164+v},${155+v})`;ctx.fillRect(x*32+(y%2)*16+1,y*22+1,30,20);}
 }else{
  ctx.fillStyle=(kind==='grass'||kind==='leaf')?'#79a760':kind==='plaster'?'#faf8f2':'#64666a';ctx.fillRect(0,0,256,256);
  for(let i=0;i<7000;i++){const v=Math.floor(rand(i*4+4)*44);ctx.fillStyle=(kind==='grass'||kind==='leaf')?`rgba(${90+v},${126+v},${55+v},.4)`:kind==='plaster'?`rgba(${212+v*.7},${208+v*.7},${199+v*.7},.22)`:`rgba(${72+v},${75+v},${78+v},.3)`;ctx.fillRect(rand(i*3+1)*256,rand(i*3+2)*256,1.3,1.3);}
 }
 const t=new THREE.CanvasTexture(c);t.name='village:surface:'+kind;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;
 if(kind==='grass'||kind==='paving'||kind==='gravel')upgradePaintedTiles('village-ground',2,[{texture:t,slot:kind==='grass'?0:kind==='paving'?1:2}]);
 return t;
}

// One decoded source image can supply several repeating materials. Cropping is
// done once, off the frame loop: the 2x2 ground sheet must never repeat as a
// collage across the village. Texture objects remain owned by each world.
const paintedTileImages=new WeakMap();
const foliageImages=new WeakMap();
function upgradeFoliage(texture){
 let live=true;const disposed=()=>live=false;texture.addEventListener('dispose',disposed);
 return upgradeVillageTextures({'artisan-foliage':texture}).then(results=>{
  if(!live||!results[0]?.loaded)return results;const source=texture.image;
  if(!foliageImages.has(source)){const c=document.createElement('canvas');c.width=source.naturalWidth||source.width;c.height=source.naturalHeight||source.height;const ctx=c.getContext('2d');if(!ctx.drawImage)return results;ctx.drawImage(source,0,0);ctx.fillStyle='#ffffff';ctx.fillRect(0,0,4,4);foliageImages.set(source,c);}
  // A four-pixel white swatch in the transparent atlas margin lets plain wood
  // share the same forest draw. Every visible plant UV starts beyond that pad.
  texture.image=foliageImages.get(source);texture.needsUpdate=true;texture.userData.plainSwatch=[.0015,.9985];return results;
 }).finally(()=>texture.removeEventListener('dispose',disposed));
}
export function upgradePaintedTiles(kind,grid,targets){
 const source=new THREE.Texture(),live=new Map(),listeners=new Map();
 for(const {texture} of targets){live.set(texture,true);const disposed=()=>live.set(texture,false);listeners.set(texture,disposed);texture.addEventListener('dispose',disposed);}
 return upgradeVillageTextures({[kind]:source}).then(([result])=>{
  if(!result?.loaded)return targets.map(({slot})=>({slot,loaded:false}));
  const image=source.image,width=image.naturalWidth||image.width,height=image.naturalHeight||image.height;
  if(!width||!height)return [];
  let cells=paintedTileImages.get(image);if(!cells){cells=new Map();paintedTileImages.set(image,cells);}
  return targets.map(({texture,slot,rect=[0,0,1,1]})=>{
   if(!live.get(texture))return {slot,loaded:false,disposed:true};
   const key=grid+':'+slot+':'+rect.join(',');
   if(!cells.has(key)){
    const c=document.createElement('canvas');c.width=Math.round(width/grid*rect[2]);c.height=Math.round(height/grid*rect[3]);const ctx=c.getContext('2d');
    // Lightweight recording contexts deliberately keep their first-frame pixels.
    if(!ctx?.drawImage)return {slot,loaded:false};
    ctx.drawImage(image,(slot%grid+rect[0])*width/grid,(Math.floor(slot/grid)+rect[1])*height/grid,width/grid*rect[2],height/grid*rect[3],0,0,c.width,c.height);cells.set(key,c);
   }
   texture.image=cells.get(key);texture.needsUpdate=true;texture.userData.generatedDiffuse=kind+':'+slot;texture.userData.paintSlot=slot;return {slot,loaded:true};
  });
 }).finally(()=>{for(const {texture} of targets)texture.removeEventListener('dispose',listeners.get(texture));source.dispose();});
}

const WALL_TILE_PAINTS=[[239,231,211],[211,214,208],[235,218,171],[179,192,177],[146,154,153],[185,178,157],[218,206,172],[177,112,88],[132,91,77],[95,117,135],[75,89,103],[152,164,157],[225,213,184],[212,181,165],[177,179,169],[105,111,107]];
export function villageFacadeTexture(){
 const size=512,cell=size/4,pixels=new Uint8Array(size*size*4);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const tx=x%cell,ty=y%cell,slot=Math.floor(x/cell)+Math.floor(y/cell)*4,base=WALL_TILE_PAINTS[slot];let shade=(rand(x*3+y*7)-.5)*.025;
  if(slot>=4&&slot<=10||slot===15){const stone=slot===4||slot===5||slot===15,row=Math.floor(ty/(stone?14:8)),wide=stone?29:25;shade+=ty%(stone?14:8)<1||(tx+(row%2)*wide*.5)%wide<1?-.11:(rand(row*91+Math.floor((tx+(row%2)*wide*.5)/wide))-.5)*.13;}
  if(slot===11)shade+=tx%11<1?-.13:(Math.floor(tx/11)%3-1)*.035;
  if(slot===12&&(tx<5||tx>122||ty<5||ty>122||Math.abs(tx-64)<3||Math.abs(ty-64)<3||Math.abs(tx-ty)<3))shade=-.65;
  const i=(y*size+x)*4;for(let a=0;a<3;a++)pixels[i+a]=Math.max(0,Math.min(255,base[a]*(1+shade)));pixels[i+3]=255;
 }
 const canvas=document.createElement('canvas');canvas.width=canvas.height=size;const ctx=canvas.getContext('2d');
 if(ctx.createImageData&&ctx.putImageData){const frame=ctx.createImageData(size,size);frame.data.set(pixels);ctx.putImageData(frame,0,0);}else for(let i=0;i<16;i++){ctx.fillStyle='rgb('+WALL_TILE_PAINTS[i].join(',')+')';ctx.fillRect(i%4*cell,Math.floor(i/4)*cell,cell,cell);}
 // CanvasTexture deliberately remains an ordinary image texture when the
 // generated HTML image arrives; a DataTexture would still expect image.data.
 const texture=new THREE.CanvasTexture(canvas);texture.name='village:facade-materials';texture.colorSpace=THREE.SRGBColorSpace;texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.anisotropy=2;texture.userData.atlasGrid=4;return texture;
}
export function facadeMaterialSlot(profile,kind=profile.wall,band='body'){
 const seed=profile.seed||0;
 if(band==='plinth')return profile.plinth==='dark'?15:14;
 if(kind==='stone')return profile.id==='historic-village-school'?4:4+(seed>>>2)%2;
 if(kind==='brick')return 6;if(kind==='redBrick')return 7+(seed>>>5)%2;
 if(kind==='slate')return 9+(seed>>>3)%2;
 if(band==='upper'&&profile.id==='cream-cottage'&&(seed>>>7)%5===0)return 12;
 return [0,1,2,3,13][seed%5];
}
const facadeUV=(slot,u,v)=>[(slot%4+.015+u*.97)/4,1-(Math.floor(slot/4)+.015+(1-v)*.97)/4];
function gableAtlasUV(g,slot){worldUV(g,.42);return paintTile(g,slot);}
// One small first-frame atlas for near-street landmark details. Its four cells
// share a material; the authored painted image can replace these same pixels.
export function villageDetailTexture(grid=2){
 const c=document.createElement('canvas');c.width=c.height=512;const p=c.getContext('2d');
 p.fillStyle='#ded5bd';p.fillRect(0,0,256,256);
 p.fillStyle='#a8a18e';for(let y=18;y<244;y+=18)for(let x=18;x<244;x+=18)p.fillRect(x,y,2,2);
 for(let i=0;i<5;i++){const x=35+i*43,y=41+(i%2)*31;p.fillStyle='#697880';p.fillRect(x-4,y+12,8,96-i*7);p.fillRect(x-12,y,8,24);p.fillRect(x+4,y,8,24);p.fillRect(x-12,y+16,24,8);p.fillStyle='#a6b1ad';p.fillRect(x-2,y+24,2,69-i*7);}
 p.fillStyle='#bb3f45';p.fillRect(256,0,256,256);for(let i=0;i<5;i++){p.fillStyle=i%2?'#d94c4e':'#cb474a';p.fillRect(269,12+i*47,230,41);p.fillStyle='#663e43';p.fillRect(282,15+i*47,204,3);p.fillStyle='#d2cfc0';p.fillRect(327,24+i*47,110,5);}
 p.fillStyle='#887258';p.fillRect(0,256,256,256);for(let row=0;row<3;row++){const y=279+row*73;p.fillStyle='#e2bc81';for(let i=0;i<4;i++){const x=18+i*61;p.fillRect(x,y+16-(i%2)*5,43,30);p.fillStyle='#f4d6a2';p.fillRect(x+6,y+18-(i%2)*5,29,5);p.fillStyle='#e2bc81';}p.fillStyle='#b59c77';p.fillRect(8,y+50,240,7);}
 p.fillStyle='#9ea9a7';p.fillRect(256,256,256,256);for(let i=0;i<9;i++){p.fillStyle=i%3===0?'#aab4ae':i%3===1?'#9ca8a5':'#b3bbb2';p.fillRect(256+i*30,256,28,256);p.fillStyle='#798d8c';p.fillRect(256+i*30,256,2,256);}
 let image=c;if(grid===4){image=document.createElement('canvas');image.width=image.height=512;const ctx=image.getContext('2d');for(let slot=0;slot<16;slot++){if(ctx.drawImage)ctx.drawImage(c,slot%4%2*256,Math.floor(slot%4/2)*256,256,256,slot%4*128,Math.floor(slot/4)*128,128,128);else{ctx.fillStyle=slot%4===1?'#c14847':slot%4===2?'#c99d65':'#9eaaa0';ctx.fillRect(slot%4*128,Math.floor(slot/4)*128,128,128);}}}
 const texture=new THREE.CanvasTexture(image);texture.name='village:detail-atlas';texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=2;texture.userData.atlasGrid=grid;return texture;
}
export function foliageTexture(){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=512;const ctx=canvas.getContext('2d');
 if(ctx.ellipse)for(let tile=0;tile<16;tile++)for(let leaf=0;leaf<11;leaf++){const col=tile%4,row=Math.floor(tile/4),x=col*128+64+Math.sin(leaf*2.4)*31,z=row*128+66+Math.cos(leaf*2.4)*29;ctx.beginPath();ctx.ellipse(x,z,27,21,leaf*.8,0,Math.PI*2);ctx.fillStyle=tile===15?'#b9a15b':tile===14?'#3e8178':leaf%3?'#7db868':'#a1c777';ctx.fill();}
 else for(let tile=0;tile<16;tile++){ctx.fillStyle='#7aaa63';ctx.fillRect(tile%4*128+20,Math.floor(tile/4)*128+18,88,96);}
 ctx.fillStyle='#ffffff';ctx.fillRect(0,0,4,4);
 const texture=new THREE.CanvasTexture(canvas);texture.name='artisan:foliage';texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=2;return texture;
}
export function worldUV(g,scale=1){
 const p=g.attributes.position,n=g.attributes.normal,uv=[];
 for(let i=0;i<p.count;i++){if(Math.abs(n.getY(i))>.4)uv.push(p.getX(i)*scale,p.getZ(i)*scale);else uv.push((Math.abs(n.getX(i))>.7?p.getZ(i):p.getX(i))*scale,p.getY(i)*scale);}
 g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));return g;
}
export class Batch{
 constructor({chunkSize=0,maxDistance=Infinity,castShadow=true,vertexColors=true,name='scenery',rangeKind='detail',heightAt=null,drape=false,bevelBoxes=false}={}){this.groups=new Map();this.count=0;this.chunkSize=chunkSize;this.maxDistance=maxDistance;this.castShadow=castShadow;this.vertexColors=vertexColors;this.colored=new Map();this.name=name;this.rangeKind=rangeKind;this.heightAt=heightAt;this.drape=drape;this.bevelBoxes=bevelBoxes;}
 add(g,m,x=0,y=0,z=0,angle=0){
  if(!m?.isMaterial){g.dispose();throw Error('Scenery batching requires a Three.js material');}
  if(!g.attributes.position?.count){g.dispose();return;}
  if(g.index){const original=g;g=g.toNonIndexed();original.dispose();}g.rotateY(angle);g.translate(x,y,z);
  if(this.heightAt){
   if(this.drape){const positions=g.attributes.position;for(let i=0;i<positions.count;i++)positions.setY(i,positions.getY(i)+this.heightAt(positions.getX(i),positions.getZ(i)));g.computeVertexNormals();}
   else{g.computeBoundingBox();const b=g.boundingBox;g.translate(0,this.heightAt((b.min.x+b.max.x)/2,(b.min.z+b.max.z)/2),0);}
  }
  if(m.map&&!m.userData.keepUV)worldUV(g,m.userData.uvScale||1);
  if(this.vertexColors&&m.isMeshStandardMaterial&&!m.map&&!m.transparent&&!m.emissive.getHex()&&!m.isMeshPhysicalMaterial){
   if(!m.vertexColors||!g.attributes.color){const colors=new Float32Array(g.attributes.position.count*3);for(let i=0;i<colors.length;i+=3){colors[i]=m.color.r;colors[i+1]=m.color.g;colors[i+2]=m.color.b;}g.setAttribute('color',new THREE.BufferAttribute(colors,3));}
   const key=m.roughness+'|'+m.metalness+'|'+m.side;if(!this.colored.has(key))this.colored.set(key,material(0xffffff,{vertexColors:true,roughness:m.roughness,metalness:m.metalness,side:m.side}));m=this.colored.get(key);
  }
  g.computeBoundingBox();const b=g.boundingBox,key=this.chunkSize?Math.floor((b.min.x+b.max.x)/2/this.chunkSize)+','+Math.floor((b.min.z+b.max.z)/2/this.chunkSize):'all';
  if(!this.groups.has(key))this.groups.set(key,new Map());const materials=this.groups.get(key);if(!materials.has(m))materials.set(m,[]);materials.get(m).push(g);this.count++;
 }
 box(w,h,d,m,x=0,y=0,z=0,a=0){const rounded=this.bevelBoxes&&Math.min(w,h,d)>=.16&&Math.max(w,h,d)<4.6;this.add(rounded?beveledBoxGeometry(w,h,d,Math.min(.085,Math.min(w,h,d)*.20)):unitBox.clone().scale(w,h,d),m,x,y,z,a);}
 flush(scene){const meshes=[];for(const [key,materials] of this.groups)for(const [m,geos] of materials){if(!geos.length)continue;const g=mergeGeometries(geos);if(!g)throw Error('Scenery geometry attributes do not match');g.computeBoundingSphere();const o=object(g,m);o.castShadow=this.castShadow&&!m.isMeshBasicMaterial;o.name=this.name+':'+key;o.userData.maxDistance=this.maxDistance;o.userData.rangeKind=this.rangeKind;scene.add(o);meshes.push(o);for(const a of geos)a.dispose();}this.groups.clear();return meshes;}
}
export function footprint(points,height){
 const shape=new THREE.Shape();points.forEach((p,i)=>i?shape.lineTo(p[0],-p[1]):shape.moveTo(p[0],-p[1]));shape.closePath();
 const g=new THREE.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false});g.rotateX(-Math.PI/2);return g;
}
function chamferFootprint(points,radius=.085){
 const area=points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p[0]*q[1]-q[0]*p[1];},0),sign=area>=0?1:-1,rounded=[];
 for(let i=0;i<points.length;i++){const p=points[i],a=points[(i+points.length-1)%points.length],b=points[(i+1)%points.length],la=Math.hypot(a[0]-p[0],a[1]-p[1]),lb=Math.hypot(b[0]-p[0],b[1]-p[1]),convex=((p[0]-a[0])*(b[1]-p[1])-(p[1]-a[1])*(b[0]-p[0]))*sign>0,r=Math.min(radius,la*.18,lb*.18);if(!convex||r<.006){rounded.push(p);continue;}rounded.push([p[0]+(a[0]-p[0])*r/la,p[1]+(a[1]-p[1])*r/la],[p[0]+(b[0]-p[0])*r/lb,p[1]+(b[1]-p[1])*r/lb]);}
 return rounded;
}
export function softWallBand(points,bottom,top,tint,wallHeight=top,atlasSlot=null,roundCorners=false){
 const tiled=Number.isInteger(atlasSlot);if(tiled||roundCorners)points=chamferFootprint(points);
 const area=points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p[0]*q[1]-q[0]*p[1];},0),sign=area>=0?1:-1;
 const edges=points.map((p,i)=>{const q=points[(i+1)%points.length],length=Math.hypot(q[0]-p[0],q[1]-p[1]);return {p,q,length,nx:sign*(q[1]-p[1])/(length||1),nz:-sign*(q[0]-p[0])/(length||1)};}),positions=[],normals=[],colors=[],uv=[],color=new THREE.Color(tint),repeat=tiled&&(atlasSlot>=4&&atlasSlot<=11||atlasSlot===15)?2.4:8;
 const append=(p,y,n,d)=>{positions.push(p[0],y,p[1]);normals.push(n[0],0,n[1]);const v=Math.min(1,Math.max(0,y/Math.max(1,wallHeight))),shade=.83+Math.sin(v*Math.PI)*.17;colors.push(color.r*shade,color.g*shade,color.b*shade);uv.push(d/repeat,y/repeat);};
 for(let i=0;i<edges.length;i++){
  const e=edges[i];if(e.length<.001)continue;const previous=edges[(i+edges.length-1)%edges.length],next=edges[(i+1)%edges.length],blend=(a,b)=>{const nx=a.nx+b.nx,nz=a.nz+b.nz,d=Math.hypot(nx,nz)||1;return [nx/d,nz/d];},fraction=Math.min(.12/e.length,.2),normal=[e.nx,e.nz],distances=[0,e.length*fraction,e.length*(1-fraction),e.length],left=blend(previous,e),right=blend(e,next);
  const at=d=>{const t=d/e.length,w=d<e.length*fraction?1-d/(e.length*fraction):d>e.length*(1-fraction)?(d-e.length*(1-fraction))/(e.length*fraction):0,b=d<e.length/2?left:right,nx=normal[0]*(1-w)+b[0]*w,nz=normal[1]*(1-w)+b[1]*w,l=Math.hypot(nx,nz)||1;return {p:[e.p[0]+(e.q[0]-e.p[0])*t,e.p[1]+(e.q[1]-e.p[1])*t],n:[nx/l,nz/l]};};
  for(let j=0;j<3;j++){const start=distances[j],end=distances[j+1],a=at(start),b=at(end),verts=sign>0?[[a,start,bottom],[a,start,top],[b,end,bottom],[b,end,bottom],[a,start,top],[b,end,top]]:[[a,start,bottom],[b,end,bottom],[a,start,top],[b,end,bottom],[b,end,top],[a,start,top]];for(const [p,d,y] of verts)append(p.p,y,p.n,d);}
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));if(tiled){g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));paintTile(g,atlasSlot);}else worldUV(g);return g;
}
export function pointInside(x,z,points){let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const [a,b]=points[i],[c,d]=points[j];if(((b>z)!==(d>z))&&(x<(c-a)*(z-b)/(d-b)+a))inside=!inside;}return inside;}
export function orientedBounds(points){
 let best=null;
 for(let i=0;i<points.length;i++){
  const p=points[i],q=points[(i+1)%points.length],d=Math.hypot(q[0]-p[0],q[1]-p[1]);if(d<.5)continue;
  const a=Math.atan2(q[0]-p[0],q[1]-p[1]),c=Math.cos(a),s=Math.sin(a);
  const local=points.map(([x,z])=>[x*c-z*s,x*s+z*c]);const minX=Math.min(...local.map(p=>p[0])),maxX=Math.max(...local.map(p=>p[0])),minZ=Math.min(...local.map(p=>p[1])),maxZ=Math.max(...local.map(p=>p[1]));
  const area=(maxX-minX)*(maxZ-minZ);if(!best||area<best.area){const lx=(minX+maxX)/2,lz=(minZ+maxZ)/2;best={x:lx*c+lz*s,z:-lx*s+lz*c,a,w:maxX-minX,d:maxZ-minZ,area};}
 }
 if(best&&best.w>best.d){[best.w,best.d]=[best.d,best.w];best.a+=Math.PI/2;}return best;
}
export function pitchedRoof(w,d,eaves,rise,hip=false){
 const v=[[-w/2,eaves,-d/2],[w/2,eaves,-d/2],[w/2,eaves,d/2],[-w/2,eaves,d/2],[0,eaves+rise,-d/2+(hip?w/2:0)],[0,eaves+rise,d/2-(hip?w/2:0)]];
 const faces=hip?[[0,4,1],[0,3,5],[0,5,4],[1,4,5],[1,5,2],[2,5,3]]:[[0,3,5],[0,5,4],[1,4,5],[1,5,2]];
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(faces.flatMap(f=>f.flatMap(i=>v[i])),3));g.computeVertexNormals();worldUV(g);return g;
}
function triangle(w,h){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([-w/2,0,0,w/2,0,0,0,h,0],3));g.computeVertexNormals();g.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,.5,1],2));return g;}
function archedPane(width,height){
 const shape=new THREE.Shape();shape.moveTo(-width/2,0);shape.lineTo(-width/2,height-width*.6);shape.quadraticCurveTo(-width*.45,height-width*.16,0,height);shape.quadraticCurveTo(width*.45,height-width*.16,width/2,height-width*.6);shape.lineTo(width/2,0);shape.closePath();return new THREE.ShapeGeometry(shape);
}

// LoD2 roof vertices are already in the local map X/Z frame and in metres
// above each building's surveyed ground. No arbitrary roof shape is invented.
function surveyedRoof(surfaces,wallHeight){
 const positions=[],gablePositions=[],edges=new Map();
 for(const ring of surfaces){
  if(ring.length<3)continue;
  const points=ring.length>3&&ring[0].every((v,i)=>Math.abs(v-ring.at(-1)[i])<.001)?ring.slice(0,-1):ring;
  const triangles=THREE.ShapeUtils.triangulateShape(points.map(p=>new THREE.Vector2(p[0],p[2])),[]);
  for(const triangle of triangles){const [a,b,c]=triangle.map(i=>points[i]),cross=(b[2]-a[2])*(c[0]-a[0])-(b[0]-a[0])*(c[2]-a[2]);positions.push(...a,...(cross>=0?b:c),...(cross>=0?c:b));}
  for(let i=0;i<points.length;i++){
   const a=points[i],b=points[(i+1)%points.length],key=[a.map(v=>Math.round(v*1000)).join(','),b.map(v=>Math.round(v*1000)).join(',')].sort().join('|');
   if(edges.has(key))edges.get(key).count++;else edges.set(key,{a,b,count:1});
  }
 }
 for(const {a,b,count} of edges.values())if(count===1&&Math.max(a[1],b[1])>wallHeight+.12&&Math.hypot(a[0]-b[0],a[2]-b[2])>.2){
  const bottomA=[a[0],wallHeight,a[2]],bottomB=[b[0],wallHeight,b[2]];
  if(a[1]>wallHeight+.05)gablePositions.push(...bottomA,...a,...bottomB);
  if(b[1]>wallHeight+.05)gablePositions.push(...a,...b,...bottomB);
 }
 const geometry=values=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(values,3));g.computeVertexNormals();worldUV(g);return g;};
 return {roof:geometry(positions),gables:gablePositions.length?geometry(gablePositions):null};
}

export function villageMaterials(){
 const brick=surfaceTexture('brick'),stone=surfaceTexture('stone'),slate=surfaceTexture('slate'),paving=surfaceTexture('paving');
 const M={white:material(0xfff6df),trim:material(0xf0dfb7),glass:material(0x88bccb,{roughness:.65,metalness:.04}),dark:material(0x344353),red:material(0xe32a35),metal:material(0xb6c2c6,{metalness:.18,roughness:.70}),wood:material(0x80603e),hedge:material(0x60984f),stone:material(0xe1d9c8,{map:stone}),brick:material(0xffffff,{map:brick}),roof:material(0xffffff,{map:slate}),paving:material(0xffffff,{map:paving}),flower:material(0xf185b3),yellow:material(0xffd145),lawn:material(0x96bd72)};
 M.roof.side=THREE.DoubleSide;M.stone.userData.uvScale=.42;M.brick.userData.uvScale=.7;M.roof.userData.uvScale=.55;M.paving.userData.uvScale=.72;
 // Painted diffuse colour supplies the detail; no normal/bump maps are needed
 // for this deliberately graphic arcade world, including the high profile.
 // One atlas covers every facade style, rather than creating a window texture
 // for each house or retaining the unused legacy window/material palette.
 const atlas=facadeAtlasPixels(),canvas=document.createElement('canvas');canvas.width=canvas.height=atlas.width;const ctx=canvas.getContext('2d');if(ctx.createImageData&&ctx.putImageData){const image=ctx.createImageData(atlas.width,atlas.height);image.data.set(atlas.data);ctx.putImageData(image,0,0);}else{ctx.fillStyle='#7796a6';ctx.fillRect(0,0,atlas.width,atlas.height);}canvas.data=atlas.data;
 const facade=new THREE.CanvasTexture(canvas);facade.name='artisan:windows';facade.colorSpace=THREE.SRGBColorSpace;facade.anisotropy=2;
 M.facade=material(0xffffff,{map:facade,roughness:.58});M.facade.userData.keepUV=true;
 M.houseSurface=paintedAtlasMaterial(material(0xffffff,{map:villageFacadeTexture(),vertexColors:true,side:THREE.DoubleSide,roughness:.92}));M.houseSurface.name='village:painted-wall-materials';M.houseSurface.userData.keepUV=true;
 M.house={plaster:M.houseSurface,brick:M.houseSurface,stone:M.houseSurface,slate:M.houseSurface,redBrick:M.houseSurface};
 M.paintedPlaster=material(0xffffff,{map:surfaceTexture('plaster'),roughness:.98});M.paintedPlaster.userData.uvScale=.24;
 M.paintedWood=material(0xffffff,{map:surfaceTexture('plaster'),roughness:.96});M.paintedWood.userData.uvScale=.45;
 M.paintedCream=M.brick;M.brick.roughness=.97;M.brick.userData.uvScale=.58;
 M.paintedStone=M.stone;M.stone.color.setHex(0xffffff);M.stone.roughness=1;M.stone.userData.uvScale=.45;
 M.lowHouse={plaster:M.paintedPlaster.clone(),brick:M.brick.clone(),stone:M.stone.clone(),slate:M.roof.clone(),redBrick:material(0xffffff,{map:surfaceTexture('redBrick'),roughness:.97})};
 for(const m of Object.values(M.lowHouse)){m.vertexColors=true;m.side=THREE.DoubleSide;}M.lowHouse.redBrick.userData.uvScale=.58;
 M.grass=material(0xffffff,{map:surfaceTexture('grass'),roughness:1,vertexColors:true});M.grass.userData.uvScale=.22;
 M.gravel=material(0xffffff,{map:surfaceTexture('gravel'),roughness:1,vertexColors:true});M.gravel.userData.uvScale=.25;
 M.houseRoof=paintedAtlasMaterial(material(0xffffff,{map:surfaceTexture('slate'),vertexColors:true,side:THREE.DoubleSide,roughness:.9}),2);M.houseRoof.map.name='artisan:roof-atlas';M.houseRoof.userData.uvScale=.48;M.houseRoof.userData.lowMap=M.roof.map;
 M.metalRoof=material(0xffffff,{map:surfaceTexture('slate'),roughness:.86,metalness:.02,side:THREE.DoubleSide});M.metalRoof.userData.uvScale=.35;
 M.decor=material(0xffffff,{map:villageDetailTexture(4),roughness:.92});M.decor.name='village:detail-atlas';M.decor.userData.keepUV=true;
 M.roadside=material(0xffffff,{map:villageFacadeTexture(),roughness:.95});M.roadside.name='artisan:roadside';M.roadside.userData.keepUV=true;
 M.foliage=material(0xffffff,{map:foliageTexture(),roughness:1,alphaTest:.48,side:THREE.DoubleSide,vertexColors:true});M.foliage.name='artisan:foliage';M.foliage.userData.keepUV=true;
 M.leafPaint=material(0xffffff,{map:surfaceTexture('leaf'),roughness:1});M.pinePaint=material(0xffffff,{map:surfaceTexture('leaf'),roughness:1});
 M.glass.map=surfaceTexture('plaster');M.glass.color.setHex(0xffffff);M.glass.userData.uvScale=.20;M.glass.roughness=.66;M.glass.metalness=0;
 M.textureUpgrade=Promise.all([
  upgradeVillageTextures({'village-facades':M.houseSurface.map,'artisan-roofs':M.houseRoof.map,'artisan-windows':M.facade.map,'artisan-workshop':M.decor.map,'artisan-roadside':M.roadside.map}),
  upgradeFoliage(M.foliage.map),
  upgradePaintedTiles('artisan-roofs',2,[{texture:M.roof.map,slot:0},{texture:M.metalRoof.map,slot:2}]),
  upgradePaintedTiles('artisan-foliage',4,[{texture:M.leafPaint.map,slot:0,rect:[.25,.23,.5,.5]},{texture:M.pinePaint.map,slot:14,rect:[.23,.24,.54,.60]}]),
  upgradePaintedTiles('artisan-windows',4,[{texture:M.glass.map,slot:13,rect:[.18,.34,.72,.48]}]),
  upgradePaintedTiles('village-facades',4,[{texture:M.paintedPlaster.map,slot:0},{texture:M.paintedWood.map,slot:11},{texture:M.paintedCream.map,slot:6},{texture:M.paintedStone.map,slot:4},{texture:M.lowHouse.redBrick.map,slot:7}]),
 ]);
 return M;
}

function colorGeometry(g,hex){const color=new THREE.Color(hex),colors=new Float32Array(g.attributes.position.count*3);for(let i=0;i<colors.length;i+=3){colors[i]=color.r;colors[i+1]=color.g;colors[i+2]=color.b;}g.setAttribute('color',new THREE.BufferAttribute(colors,3));return g;}
function roofGeometry(g,hex,sourceBuilding=-1,slot=0){paintTile(g,slot);colorGeometry(g,hex);g.setAttribute('sourceBuilding',new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(sourceBuilding),1));return g;}
export function atlasPane(tile,width,height){const g=new THREE.PlaneGeometry(width,height),uv=g.attributes.uv,c=tile%4,r=Math.floor(tile/4);for(let i=0;i<uv.count;i++)uv.setXY(i,(c+.045+uv.getX(i)*.91)/4,1-(r+.045+(1-uv.getY(i))*.91)/4);return g;}
export function windowReveal(width,height){
 const ring=(w,h,r,z)=>[[-w/2+r,-h/2,z],[w/2-r,-h/2,z],[w/2,-h/2+r,z],[w/2,h/2-r,z],[w/2-r,h/2,z],[-w/2+r,h/2,z],[-w/2,h/2-r,z],[-w/2,-h/2+r,z]],outer=ring(width+.14,height+.14,.075,0),inner=ring(width,height,.052,.065),positions=[],uv=[];
 for(let i=0;i<8;i++){const j=(i+1)%8;for(const p of [outer[i],outer[j],inner[i],outer[j],inner[j],inner[i]]){positions.push(...p);uv.push(p[0]/width+.5,p[1]/height+.5);}}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeVertexNormals();return g;
}
function footprintWalls(batch,b,h,ground,profile,M,useAtlas=true,roundLow=false){
 // Adjacent wall bands share edges, rather than overlapping a second facade.
 const base=Math.min(.38,h*.12),split=profile.split&&h>3.5?Math.min(3.0,h*.53):h;
 const add=(start,end,kind,tint,band)=>{if(end-start<.01)return;batch.add(softWallBand(b.points,start,end,tint,h,useAtlas?facadeMaterialSlot(profile,kind,band):null,roundLow),useAtlas?M.houseSurface:M.lowHouse[kind]||M.lowHouse.plaster,0,ground,0);};
 add(0,base,'stone',0xe8e2d5,'plinth');add(base,split,profile.wall,profile.tint,'body');add(split,h,profile.upper,profile.upper==='slate'?0xf2f4f2:profile.tint,'upper');
}
function safeVillageDetail(data,track,x,z,w,d,a,clearance=6.8){
 if(!clearOfCourse(track,x,z,w,d,a,clearance))return false;
 const c=Math.cos(a),s=Math.sin(a),points=[[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2],[0,0]].map(([lx,lz])=>[x+c*lx+s*lz,z-s*lx+c*lz]);
 // New gardens also avoid non-racing streets, not just the selected course.
 for(const road of data.roads||[]){const limit=(road.width||6)/2+.45;for(let i=1;i<road.points.length;i++){const p=road.points[i-1],q=road.points[i],dx=q[0]-p[0],dz=q[1]-p[1],length=dx*dx+dz*dz;if(!length)continue;for(const [px,pz] of points){const t=Math.max(0,Math.min(1,((px-p[0])*dx+(pz-p[1])*dz)/length));if((px-p[0]-dx*t)**2+(pz-p[1]-dz*t)**2<limit*limit)return false;}}}
 return true;
}
export function makeVillage(scene,data,track,M,excludedBuildingIds=[],heightAt=()=>0){
 // Both the mapped building bodies and their facades are spatially culled.
 const batch=new Batch({chunkSize:192,maxDistance:430,name:'buildings',rangeKind:'base'}),lowWalls=new Batch({chunkSize:192,maxDistance:430,name:'buildings-low-walls',rangeKind:'base'}),details=new Batch({chunkSize:96,maxDistance:215,castShadow:false,vertexColors:true,name:'facades'}),gardens=new Batch({chunkSize:96,maxDistance:145,castShadow:false,name:'village-gardens',bevelBoxes:true}),landmarkIds=new Set([...data.pois.filter(p=>['breuer','church','bakery','atm'].includes(p.id)).map(p=>p.buildingId),...excludedBuildingIds]);let detailed=0,windows=0,mappedRoofs=0,doors=0,shutters=0,solarRoofs=0;
 const identities=[],gardenDetails=[],familyCounts={},gardenIndex=buildingIndex(data.buildings),bedMaterial=material(0x80654f),gardenBud=new THREE.SphereGeometry(1,6,4);
 const centers=data.buildings.map((b,index)=>({b,sourceBuilding:index,...orientedBounds(b.points)}));
 for(const ob of centers){
  const b=ob.b;
  if(landmarkIds.has(b.id))continue;
  if(!Number.isFinite(ob.x))continue;const near=track.nearest(ob.x,ob.z),detail=near.distance<100,ground=b.points.reduce((sum,p)=>sum+heightAt(p[0],p[1]),0)/b.points.length;
  let h=['garage','garages','shed','hut'].includes(b.kind)?2.6:b.height;
  const profile=buildingIdentity(b,ob),industrial=profile.industrial,wall=M.house[profile.upper]||M.house.plaster,roof=M.houseRoof;
  identities.push({id:b.id,family:profile.id,signature:profile.signature,window:profile.window,wall:profile.wall,upper:profile.upper,height:h,sourceRoof:!!b.geodata?.roofSurfaces?.length});familyCounts[profile.id]=(familyCounts[profile.id]||0)+1;
  footprintWalls(batch,b,h,ground,profile,M);
  // The low GPU profile keeps the original six-triangle wall bands and five
  // shared repeating painted materials. It never submits the tiled high mesh.
  footprintWalls(lowWalls,b,h,ground,profile,M,false,near.distance<32);
  if(b.geodata?.roofSurfaces?.length){
   const measured=surveyedRoof(b.geodata.roofSurfaces,h);batch.add(roofGeometry(measured.roof,profile.roofTint,ob.sourceBuilding,profile.roofTile),roof,0,ground,0);if(measured.gables){lowWalls.add(colorGeometry(measured.gables.clone(),profile.upper==='slate'?0xf2f4f2:profile.tint),M.lowHouse[profile.upper],0,ground,0);batch.add(colorGeometry(gableAtlasUV(measured.gables,facadeMaterialSlot(profile,profile.upper,'upper')),profile.upper==='slate'?0xf2f4f2:profile.tint),wall,0,ground,0);}mappedRoofs++;
  }else if(!industrial&&ob.w>3&&ob.w<25&&ob.d<40){
   const rise=Math.min(4.5,ob.w*.37),w=ob.w+.5,d=ob.d+.5;batch.add(roofGeometry(pitchedRoof(w,d,h,rise,rand(b.id+2)>.6),profile.roofTint,-1,profile.roofTile),roof,ob.x,ground,ob.z,ob.a);
   if(rand(b.id+2)<=.6)for(const side of [-1,1]){const x=ob.x+Math.sin(ob.a)*ob.d/2*side,z=ob.z+Math.cos(ob.a)*ob.d/2*side,a=ob.a+(side<0?Math.PI:0),tint=profile.upper==='slate'?0xf2f4f2:profile.tint;lowWalls.add(colorGeometry(triangle(ob.w,rise),tint),M.lowHouse[profile.upper],x,ground+h,z,a);batch.add(colorGeometry(gableAtlasUV(triangle(ob.w,rise),facadeMaterialSlot(profile,profile.upper,'upper')),tint),wall,x,ground+h,z,a);}
   if(detail){batch.box(.65,1.8,.65,M.stone,ob.x+.9,ground+h+rise*.6,ob.z-.8);}
  }else batch.add(roofGeometry(new THREE.BoxGeometry(ob.w+.25,.16,ob.d+.25),profile.roofTint,-1,profile.roofTile),roof,ob.x,ground+h+.08,ob.z,ob.a);
  if(!detail)continue;detailed++;
  // Windows follow the actual polygon faces, including annexes and recesses.
  const points=b.points;let area=0;points.forEach((p,i)=>{const q=points[(i+1)%points.length];area+=p[0]*q[1]-q[0]*p[1];});
  let entrance=null;
  for(let i=0;i<points.length;i++){
   const p=points[i],q=points[(i+1)%points.length],dx=q[0]-p[0],dz=q[1]-p[1],len=Math.hypot(dx,dz);if(len<3.5)continue;
   const a=Math.atan2(dx,dz),nx=(area>0?1:-1)*dz/len,nz=-(area>0?1:-1)*dx/len;
   const toward=(near.x-(p[0]+q[0])/2)*nx+(near.z-(p[1]+q[1])/2)*nz;
   if(!entrance||toward>entrance.score)entrance={x:(p[0]+q[0])/2,z:(p[1]+q[1])/2,nx,nz,a:Math.atan2(nx,nz),score:toward,len};
   const faceNear=track.nearest((p[0]+q[0])/2,(p[1]+q[1])/2),streetFacing=(faceNear.x-(p[0]+q[0])/2)*nx+(faceNear.z-(p[1]+q[1])/2)*nz;
   if(streetFacing<-.75&&faceNear.distance>12)continue;
   if(['garage','garages','shed','hut'].includes(b.kind))continue;
   const count=Math.max(1,Math.floor(len/(industrial?4.4:profile.spacing))),levels=Math.max(1,Math.floor((h+.2)/2.7)),windowH=Math.min(profile.windowH,Math.max(.7,h-.65)),windowW=Math.min(profile.windowW,len/count*.57),levelHeight=Math.min(2.7,(h-.15)/levels);
   for(let floor=0;floor<levels;floor++)for(let j=0;j<count;j++){
    const t=(j+.5)/count,x=p[0]+dx*t+nx*.075,z=p[1]+dz*t+nz*.075,y=ground+Math.min(levelHeight*.58,h-windowH/2-.18)+floor*levelHeight,angle=Math.atan2(nx,nz);
    details.add(atlasPane(profile.window,windowW,windowH),M.facade,x,y,z,angle);windows++;
    // Shallow reveals and a warm sill catch daylight around painted blue glass.
    // These are collected into the existing trim batch, never a mesh per window.
    details.add(windowReveal(windowW,windowH),M.trim,x+nx*.015,y,z+nz*.015,angle);
    if(profile.shutterColor&&!industrial&&j%2===0){const m=material(profile.shutterColor);for(const side of [-1,1])details.box(windowW*.34,windowH,.065,m,x+dx/len*(windowW*.69)*side,y,z+dz/len*(windowW*.69)*side,angle);shutters+=2;}
    if(profile.flowers&&floor===0&&j%3===0){details.box(windowW+.1,.18,.27,M.wood,x+nx*.18,y-windowH*.49-.12,z+nz*.18,angle);for(let f=0;f<3;f++){const along=(f-1)*windowW*.28;details.add(new THREE.IcosahedronGeometry(.11,0),f%2?M.flower:M.yellow,x+dx/len*along+nx*.2,y-windowH*.49,z+dz/len*along+nz*.2);}}
   }
   // Gutters and stone/painted sill bands are cheap vertex-colour boxes, merged
   // with all other trim in the tile. Their lengths follow the actual edges.
   details.box(.20,.20,len+.06,M.trim,(p[0]+q[0])/2+nx*.075,ground+h-.10,(p[1]+q[1])/2+nz*.075,a);
   details.box(.24,.08,len+.10,M.dark,(p[0]+q[0])/2+nx*.09,ground+h+.025,(p[1]+q[1])/2+nz*.09,a);
   details.box(.13,.11,len+.04,M.metal,(p[0]+q[0])/2+nx*.10,ground+h+.065,(p[1]+q[1])/2+nz*.10,a);
   if(i%3===0)details.box(.075,Math.max(.3,h-.15),.075,M.metal,p[0]+nx*.17,ground+h/2,p[1]+nz*.17);
  }
  if(entrance&&h>2.3){const {x,z,nx,nz,a}=entrance,w=industrial?Math.min(3.2,entrance.len*.38):1.04,doorH=Math.min(h-.18,industrial?2.3:2.12);details.add(atlasPane(profile.door,w,doorH),M.facade,x+nx*.09,ground+doorH/2+.06,z+nz*.09,a);doors++;}
  if(detail&&profile.pv&&b.geodata?.roofSurfaces?.length){
   const surfaces=b.geodata.roofSurfaces.filter(r=>r.length>=3&&Math.max(...r.map(p=>p[1]))-Math.min(...r.map(p=>p[1]))>.7),ring=surfaces.sort((a,b)=>b.length-a.length)[0];
   if(ring){const cx=ring.reduce((s,p)=>s+p[0],0)/ring.length,cy=ring.reduce((s,p)=>s+p[1],0)/ring.length,cz=ring.reduce((s,p)=>s+p[2],0)/ring.length,scaled=ring.map(p=>[cx+(p[0]-cx)*.60,cy+(p[1]-cy)*.60+.065,cz+(p[2]-cz)*.60]),panel=surveyedRoof([scaled],Infinity).roof,pos=panel.attributes.position,minX=Math.min(...scaled.map(p=>p[0])),minZ=Math.min(...scaled.map(p=>p[2])),maxX=Math.max(...scaled.map(p=>p[0])),maxZ=Math.max(...scaled.map(p=>p[2])),uv=[];for(let i=0;i<pos.count;i++)uv.push((.045+(pos.getX(i)-minX)/Math.max(.01,maxX-minX)*.91)/4,1-(3+.045+(pos.getZ(i)-minZ)/Math.max(.01,maxZ-minZ)*.91)/4);panel.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));details.add(panel,M.facade,0,ground,0);solarRoofs++;}
  }
  if(near.distance>14&&near.distance<60&&ob.w<28&&entrance){
   const {nx,nz}=entrance,a=Math.atan2(nx,nz),px=entrance.x+nx*2.7,pz=entrance.z+nz*2.7;
   for(const side of [-1,1]){
    const x=px+Math.cos(a)*2.2*side,z=pz-Math.sin(a)*2.2*side,w=.58,d=2.8;
    if(!safeVillageDetail(data,track,x,z,w,d,a))continue;
    const rec={x,z,w,d,a,buildingId:b.id,kind:profile.fence};gardenDetails.push(rec);
    if(profile.fence==='stone')gardens.box(w,.65,d,M.stone,x,heightAt(x,z)+.325,z,a);
    else if(profile.fence==='hedge'){const hedge=new THREE.SphereGeometry(1,8,5);hedge.scale(w*.50,.43,d*.50);gardens.add(hedge,M.hedge,x,heightAt(x,z)+.40,z,a);}
    else{for(let k=-1;k<=1;k++){const xx=x+Math.sin(a)*k*1.2,zz=z+Math.cos(a)*k*1.2;gardens.box(.09,.8,.09,profile.fence==='metal'?M.metal:M.wood,xx,heightAt(xx,zz)+.4,zz,a);}for(const y of [.32,.66])gardens.box(.07,.08,d,profile.fence==='metal'?M.metal:M.wood,x,heightAt(x,z)+y,z,a);}
    if(profile.garden===1){const fx=x+nx*.85,fz=z+nz*.85;if(safeVillageDetail(data,track,fx,fz,.8,.8,0)&&!gardenIndex.contains(fx,fz)){gardens.box(.65,.35,.65,M.stone,fx,heightAt(fx,fz)+.175,fz);gardens.add(gardenBud.clone().scale(.34,.27,.34),M.flower,fx,heightAt(fx,fz)+.51,fz);gardenDetails.push({x:fx,z:fz,w:.8,d:.8,a:0,buildingId:b.id,kind:'planter'});}}
    else if(profile.garden===2){
     // Rounded planted islands vary the near-street silhouettes. Their bounds
     // are recorded and checked against every ordinary road as well as the
     // race corridor, exactly like the existing fences; no road mesh overlaps.
     const fx=x+Math.cos(a)*.98*side,fz=z-Math.sin(a)*.98*side,w=1.5,d=1.75,c=Math.cos(a),s=Math.sin(a),corners=[[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]];
     if(safeVillageDetail(data,track,fx,fz,w,d,a)&&corners.every(([dx,dz])=>!gardenIndex.contains(fx+c*dx+s*dz,fz-s*dx+c*dz))){
      gardens.add(gardenBud.clone().scale(.72,.10,.85),bedMaterial,fx,heightAt(fx,fz)+.09,fz,a);
      for(let j=0;j<3;j++){const along=(j-1)*.46,xx=fx+Math.sin(a)*along,zz=fz+Math.cos(a)*along,y=heightAt(xx,zz);gardens.add(gardenBud.clone().scale(.28,.29,.29),M.hedge,xx,y+.31,zz,a);gardens.add(gardenBud.clone().scale(.14,.12,.14),j%2?M.yellow:M.flower,xx+.06,y+.55,zz,a);}
      gardenDetails.push({x:fx,z:fz,w,d,a,buildingId:b.id,kind:'flowerbed'});
     }
    }
   }
  }
 }
 gardenBud.dispose();const buildingMeshes=batch.flush(scene),lowWallMeshes=lowWalls.flush(scene),facadeMeshes=details.flush(scene),gardenMeshes=gardens.flush(scene);
 for(const mesh of buildingMeshes)if(mesh.material===M.houseSurface){mesh.userData.minimumQuality=1;mesh.visible=false;}
 for(const mesh of lowWallMeshes)mesh.userData.maximumQuality=0;
 return {detailedHouses:detailed,windowCount:windows,buildingCount:data.buildings.length,mappedRoofs,doorCount:doors,shutterCount:shutters,solarRoofCount:solarRoofs,villageStyleCounts:familyCounts,villageIdentities:identities,gardenDetails,buildingMeshCount:buildingMeshes.length,lowWallMeshCount:lowWallMeshes.length,facadeMeshCount:facadeMeshes.length,gardenMeshCount:gardenMeshes.length,centers};
}

export function makeChurch(scene,b,M){
 const group=new THREE.Group();group.name='landmark:church';const batch=new Batch();
 // Axis determined by the mapped footprint. Entrance tower is the southwest end.
 const ob=orientedBounds(b.points);let a=ob.a;if(Math.sin(a)>0)a+=Math.PI;
 const c=Math.cos(a),s=Math.sin(a),center=[83.5,-48.9];group.position.set(...[center[0],0,center[1]]);group.rotation.y=a;
 const local=b.points.map(([x,z])=>[(x-center[0])*c-(z-center[1])*s,(x-center[0])*s+(z-center[1])*c]);
 batch.add(footprint(local,9.7),M.stone);
 batch.add(pitchedRoof(12.3,29.2,10,7.2),M.roof,0,0,-.6);
 for(const z of [-15.2,14])batch.add(triangle(11.7,7.2),M.stone,0,10,z,z<0?Math.PI:0);
 // Long nave, tall pointed stained glass and pale buttresses.
 for(const side of [-1,1])for(const z of [-10,-5.7,-1.4,2.9,7.2]){
  batch.box(.7,8.8,.8,M.stone,side*6.05,4.4,z-1.7);batch.box(.82,.3,1.0,M.trim,side*6.05,8.6,z-1.7);
  batch.add(archedPane(2,5.8),M.trim,side*6.12,2.5,z,side*Math.PI/2);batch.add(archedPane(1.6,5.35),M.glass,side*6.14,2.7,z,side*Math.PI/2);
  batch.box(.08,4.5,.09,M.trim,side*6.17,4.95,z);batch.box(.12,.08,1.6,M.trim,side*6.17,4.8,z);
  for(let f=-1;f<=1;f++)batch.box(.03,.9,.35,f%2?M.red:M.yellow,side*6.19,3.7,z+f*.44);
 }
 // Tower front lies within the southwest end of the original footprint.
 const tz=Math.max(...local.map(p=>p[1]))-2.96;batch.box(6.1,22,6.0,M.stone,0,11,tz);
 for(const x of [-2.9,2.9]){batch.box(.65,23,6.4,M.trim,x,11.5,tz);batch.box(.83,.3,6.6,M.trim,x,22.7,tz);}
 batch.box(6.6,.35,6.6,M.trim,0,22,tz);batch.add(triangle(6.6,4.2),M.stone,0,22,tz+3.3);batch.add(triangle(6.6,4.2),M.stone,0,22,tz-3.3,Math.PI);
 const spire= new THREE.ConeGeometry(3.55,15,8);spire.rotateY(Math.PI/8);batch.add(spire,M.roof,0,29.5,tz);
 batch.add(new THREE.SphereGeometry(.22,8,6),M.yellow,0,37.3,tz);batch.box(.1,1.9,.1,M.metal,0,38.3,tz);batch.box(1,.1,.1,M.metal,0,38.6,tz);
 batch.add(new THREE.ConeGeometry(6.8,4.7,6),M.roof,0,12.05,-17.7);
 batch.add(archedPane(2.6,4.2),M.trim,0,.35,tz+3.04);batch.add(archedPane(2.17,3.8),material(0x983e2b),0,.36,tz+3.065);batch.box(.05,2.9,.05,M.dark,0,1.9,tz+3.08);
 // Rose window and visible black clock face.
 batch.add(new THREE.CircleGeometry(1.1,24),M.trim,0,7.7,tz+3.06);batch.add(new THREE.CircleGeometry(.86,24),M.glass,0,7.7,tz+3.08);
 for(let i=0;i<12;i++){const g=new THREE.BoxGeometry(.05,.85,.04);g.rotateZ(i*Math.PI/6);batch.add(g,M.trim,0,7.7,tz+3.11);}
 batch.add(archedPane(2,5.5),M.trim,0,12.3,tz+3.07);batch.add(archedPane(1.7,5.05),M.dark,0,12.45,tz+3.09);
 for(let i=0;i<12;i++)batch.box(1.5,.09,.06,M.wood,0,12.8+i*.3,tz+3.12);
 batch.add(new THREE.CircleGeometry(1.05,32),M.dark,0,23.3,tz+3.34);
 for(let i=0;i<12;i++){const ang=i*Math.PI/6,g=new THREE.BoxGeometry(.07,.16,.04);g.rotateZ(-ang);batch.add(g,M.yellow,Math.sin(ang)*.82,23.3+Math.cos(ang)*.82,tz+3.37);}
 batch.box(.045,.7,.045,M.white,0,23.64,tz+3.39);const hand=new THREE.BoxGeometry(.045,.55,.045);hand.rotateZ(-1.05);batch.add(hand,M.white,.2,23.42,tz+3.39);
 batch.box(9,.12,6.5,M.paving,0,.07,tz+6.5);batch.flush(group);scene.add(group);return group;
}

export function makeWorkshop(scene,b,M,makeCar){
 const group=new THREE.Group();group.name='landmark:breuer';const batch=new Batch();
 // An actual hollow hall, with the mapped perimeter and an open forecourt.
 batch.add(footprint(b.points,.08),M.paving);batch.add(footprint(b.points,.16),M.roof,0,4.26,0);
 for(let i=2;i<14;i++){const p=b.points[i],q=b.points[(i+1)%b.points.length],d=Math.hypot(q[0]-p[0],q[1]-p[1]);if(d<.4)continue;batch.box(.28,4.3,d,M.brick,(p[0]+q[0])/2,2.15,(p[1]+q[1])/2,Math.atan2(q[0]-p[0],q[1]-p[1]));}
 const main=[[-9.13,15.07],[-18.35,-4.27],[-10.65,-9.3],[-1.6,11.44]],ob=orientedBounds(main);
 batch.add(footprint(main,7.2),M.brick);batch.add(pitchedRoof(ob.w+.4,ob.d+.6,7.2,3.1),M.roof,ob.x,0,ob.z,ob.a);
 for(const side of [-1,1])batch.add(triangle(ob.w,3.1),M.brick,ob.x+Math.sin(ob.a)*ob.d/2*side,7.2,ob.z+Math.cos(ob.a)*ob.d/2*side,ob.a+(side<0?Math.PI:0));
 for(const level of [2.1,5.5])for(let i=0;i<3;i++){const t=(i+.5)/3,x=-9.13+7.53*t,z=15.07-3.63*t,a=Math.atan2(3.63,7.53);batch.box(1.45,1.38,.12,M.dark,x+.06,level,z+.12,a);batch.box(1.25,1.18,.13,M.glass,x+.07,level,z+.15,a);}
 const p1=[-4,6.19],p2=[11.36,1.97],dx=p2[0]-p1[0],dz=p2[1]-p1[1],a=Math.atan2(-dz,dx),cx=(p1[0]+p2[0])/2,cz=(p1[1]+p2[1])/2;
 const front=new THREE.Group();front.position.set(cx,0,cz);front.rotation.y=a;front.name='breuer:facade';
 const metal=M.dark,glass=material(0x40616c,{roughness:.16,metalness:.42}),concrete=material(0xb7b9b2),led=material(0xfff2cf,{emissive:0xffe6b5,emissiveIntensity:1.6}),lift=material(0xd52335,{roughness:.45,metalness:.35});
 const fb=new Batch();fb.box(15.7,.87,.18,metal,0,4.0,.14);
 // Reception glazing beside two raised sectional doors: the lifts can be seen from the road.
 fb.box(5.1,3.15,.12,metal,-5.3,1.73,.13);
 for(let col=0;col<4;col++)fb.box(1.12,2.65,.07,glass,-7.08+col*1.23,1.77,.22);
 fb.box(.05,1.0,.08,M.metal,-4.05,1.55,.29);
 for(const x of [-2.6,2.65,7.85])fb.box(.28,3.7,.4,M.brick,x,1.85,.02);
 const hall=new THREE.Group();hall.name='breuer:open-workshop';hall.userData.detailDistance=120;front.add(hall);
 const hb=new Batch();hb.box(10.3,.04,11,concrete,2.6,.045,-5.3);hb.box(10.3,.16,11,M.roof,2.6,4.3,-5.3);
 hb.box(10.3,4.2,.18,M.white,2.6,2.1,-10.8);hb.box(.18,4.2,10.8,M.white,7.85,2.1,-5.4);
 for(const x of [0,5.25]){
  for(let row=0;row<3;row++){hb.box(4.85,.19,.08,M.metal,x,3.2+row*.19,.18);for(let col=0;col<3;col++)hb.box(1.5,.14,.025,glass,x-1.59+col*1.59,3.2+row*.19,.24);}
  for(const side of [-1,1]){hb.box(.065,.06,10.3,M.metal,x+side*2.43,3.57,-5.05);hb.box(.065,3.55,.065,M.metal,x+side*2.43,1.8,-.18);}
  hb.box(3.6,.07,.18,led,x,4.1,-3.0);hb.box(3.6,.07,.18,led,x,4.1,-7.4);
 }
 for(const [index,x,z,h] of [[2,0,-4.2,1.55],[0,5.15,-5.9,.95]]){
  const station=new THREE.Group();station.name='breuer:lift-'+index;station.position.set(x,0,z);const lb=new Batch();
  for(const side of [-1,1]){lb.box(.28,3.55,.4,lift,side*1.25,1.8,0);lb.box(.6,.07,.68,M.dark,side*1.25,.095,0);lb.box(.16,.32,.32,M.metal,side*1.25,h+.15,0);lb.box(1.15,.12,.18,M.yellow,side*.85,h,-.8);lb.box(1.15,.12,.18,M.yellow,side*.85,h,.8);lb.box(.28,.12,4.05,M.dark,side*.64,h+.05,0);lb.box(.07,3.0,.06,M.metal,side*1.26,1.8,.23);}
  lb.box(2.8,.2,.45,lift,0,3.48,0);lb.flush(station);const raised=makeCar(index);raised.name='breuer:car-on-lift';raised.position.y=h+.16;raised.scale.setScalar(.83);station.add(raised);hall.add(station);
 }
 for(let i=0;i<3;i++){const x=-1.4+i*3.7;hb.box(2.7,.85,.65,M.red,x,.48,-10.15);hb.box(2.85,.1,.75,M.metal,x,.95,-10.15);for(let d=0;d<4;d++)hb.box(2.42,.025,.025,M.dark,x,.21+d*.18,-9.8);hb.box(2.6,1.25,.06,M.dark,x,1.75,-10.65);for(let j=0;j<7;j++){hb.box(.055,.35,.07,M.metal,x-1.1+j*.34,1.7,-10.56);hb.box(.16,.045,.07,M.metal,x-1.1+j*.34,1.87,-10.56);}}
 // Floor parking lines, hose reel, compressed air tank, tool trolley and a mechanic.
 for(const x of [-2.25,2.25,7.45])hb.box(.07,.012,9.8,M.yellow,x,.082,-5.3);
 hb.box(.8,1.8,.65,M.red,-2,1.0,-8.9);hb.add(new THREE.CylinderGeometry(.28,.28,1.55,10),M.metal,7.2,.9,-9.5);
 const reel=new THREE.TorusGeometry(.25,.09,6,12);reel.rotateX(Math.PI/2);hb.add(reel,M.yellow,7.55,1.8,-8.4);
 hb.box(.48,.78,.32,M.red,1.75,.95,-3.7);hb.add(new THREE.SphereGeometry(.2,8,6),M.trim,1.75,1.56,-3.7);for(const side of [-1,1]){hb.box(.16,.65,.19,M.dark,1.75+side*.13,.34,-3.7);hb.box(.13,.55,.14,M.trim,1.75+side*.3,1.2,-3.55);}hb.box(.85,.75,.5,M.red,2,.43,-2.5);hb.box(.88,.05,.52,M.metal,2,.84,-2.5);
 hb.flush(hall);const services=sign('SERVICE · MOTORSPORT · LEIDENSCHAFT',9.3,'#ffffff','#202126',.11);services.position.set(2.65,3.05,-10.66);hall.add(services);
 // Upper terrace parapet, transparent railing and street-side windows.
 fb.box(15.8,.47,.28,M.brick,0,4.65,-.18);fb.box(15.95,.1,.4,M.white,0,4.93,-.18);
 for(let i=-7;i<=7;i++)fb.box(.05,.8,.05,M.metal,i,5.35,-.18);fb.box(15.3,.05,.05,M.metal,0,5.75,-.18);
 fb.box(5.3,.06,8,M.paving,-5.25,4.34,-4);
 for(const x of [-5.6,-3.0])fb.box(1.65,1.5,.1,M.dark,x,6.05,-7.95);
 fb.flush(front);fb.maxDistance=130;
 const logo=logoBoard(4.1);logo.position.set(-4.6,4.02,.26);front.add(logo);
 const name=sign('Fahrzeugtechnik',8.5,'#ffffff','#19191d',.1);name.position.set(2.2,4.03,.25);front.add(name);
 const number=sign('27',.7,'#282629','#ddd1ae',.8);number.position.set(-7.78,2.2,.22);front.add(number);
 const corner=logoBoard(2.3);corner.position.set(-8.3,6.0,1.0);front.add(block(2.5,1.35,.16,M.dark,-8.3,6,1),corner);
 // Event forecourt: tyre service, parked classics and pit team are race dressing.
 fb.box(18,.03,8.6,M.paving,0,.02,4.4);fb.box(.06,.01,7.2,M.yellow,-7.0,.053,4.1);fb.box(.06,.01,7.2,M.yellow,6.9,.053,4.1);
 for(const x of [-6.6,6.8])for(let i=0;i<4;i++)fb.add(new THREE.TorusGeometry(.43,.17,8,12),M.dark,x,.22+i*.32,2.2,0);
 for(let i=0;i<3;i++){fb.box(1.1,.65,.65,M.red,5.9-i*1.1,.35,1.15);fb.box(1.05,.06,.66,M.metal,5.9-i*1.1,.7,1.15);}
 for(const x of [-6.5,5.7]){fb.box(.48,.75,.33,M.red,x,.96,3.0);fb.add(new THREE.SphereGeometry(.2,10,8),M.trim,x,1.57,3);for(const side of [-1,1])fb.box(.16,.64,.2,M.dark,x+side*.14,.34,3);fb.box(.12,.65,.15,M.trim,x+.33,1.02,3);fb.box(.12,.5,.15,M.trim,x-.33,1.1,3);}
 fb.flush(front);
 for(const [index,x] of [[1,-4.5],[0,1.5]]){const car=makeCar(index);car.position.set(x,.03,4.8);car.rotation.y=.4;car.scale.setScalar(.86);car.userData.detailDistance=150;front.add(car);}
 const banner=sign('MAX’ BOXENSTOPP',6,'#ffffff','#dc2636',.18);banner.position.set(2.8,5.7,1.0);front.add(banner);
 const pit=sign('BREUER · PIT LANE',4.8,'#ffffff','#dc2636',.22);pit.position.set(-5.2,2.6,2.1);pit.rotation.y=.3;front.add(pit);
 group.add(front);scene.add(group);return group;
}

export function makeBakery(scene,b,M){
 const group=new THREE.Group();group.name='landmark:bakery';const batch=new Batch(),ob=orientedBounds(b.points);
 batch.add(footprint(b.points,7.1),M.stone);batch.add(pitchedRoof(ob.w+.6,ob.d+.6,7.1,4.0,true),M.roof,ob.x,0,ob.z,ob.a);batch.box(ob.w+.9,.28,ob.d+.9,M.trim,ob.x,7.13,ob.z,ob.a);
 // Frontage of Kirchstraße 40 faces northwest toward the roundabout.
 const a=-2.15,front=new THREE.Group();front.position.set(208.1,0,-73.6);front.rotation.y=a;const fb=new Batch();
 for(let j=0;j<5;j++){const x=-7.2+j*3.4;fb.add(archedPane(1.55,2.05),M.white,x,4.25,0);fb.add(archedPane(1.26,1.75),M.glass,x,4.39,.03);fb.box(.055,1.77,.04,M.white,x,5.25,.06);fb.box(1.28,.05,.04,M.white,x,5.1,.06);for(const side of [-1,1])fb.box(.38,2.1,.08,M.dark,x+side*1.03,5.25,.035);}
 fb.box(6.1,3.0,.16,M.dark,1.2,1.7,.08);for(let i=0;i<4;i++)fb.box(1.33,2.6,.06,M.glass,-1.0+i*1.48,1.65,.2);
 fb.box(7,.32,1.9,M.dark,1.2,3.38,.8);fb.box(17,.3,7.5,M.stone,0,.15,4.6);fb.box(17,.055,7.4,M.paving,0,.33,4.6);
 for(const x of [-6.7,-3.5,.3,4.1,7]){
  fb.add(new THREE.CylinderGeometry(.65,.65,.09,12),M.wood,x,1.03,4.5);fb.box(.08,.72,.08,M.metal,x,.62,4.5);
  for(const side of [-1,1]){fb.box(.55,.08,.55,M.wood,x+side*.9,.68,4.5);fb.box(.55,.53,.08,M.wood,x+side*.9,.98,4.15);}
 }
 for(const x of [-5,2.3,6.5]){fb.box(.055,3,.055,M.metal,x,1.83,5.5);fb.add(new THREE.ConeGeometry(1.7,.55,8),M.trim,x,3.3,5.5);}
 for(let i=-8;i<=8;i+=2)fb.box(.05,1,.05,M.metal,i,.95,8.25);fb.box(17,.05,.05,M.metal,0,1.4,8.25);
 fb.flush(front);const name=sign('LEO · CAFÉ ZUR POL-ECKE',7.6,'#f8ead0','#292a2a',.15);name.position.set(1.2,3.38,1.8);front.add(name);group.add(front);batch.flush(group);scene.add(group);return group;
}

export function makeATM(scene,poi,M){
 const g=new THREE.Group();g.name='landmark:atm';g.position.set(poi.point[0],0,poi.point[1]);const batch=new Batch();
 // A compact rectangular SB pavilion by the church, rather than a fantasy
 // cylindrical bank tower. The mapped position stays exactly unchanged.
 batch.box(2.38,2.74,2.32,M.white,0,1.37,0);batch.box(2.58,.23,2.53,M.red,0,2.85,0);batch.box(2.40,.14,2.34,M.dark,0,.07,0);
 batch.box(.99,2.02,.08,M.dark,-.57,1.15,1.20);batch.box(.84,1.84,.035,M.glass,-.57,1.16,1.255);batch.box(.045,.41,.04,M.metal,-.22,1.13,1.28);
 batch.box(.90,1.72,.12,M.metal,.54,1.16,1.24);batch.box(.61,.42,.035,M.glass,.54,1.48,1.32);batch.box(.49,.075,.04,M.dark,.54,.96,1.34);
 for(let row=0;row<3;row++)for(let col=0;col<3;col++)batch.box(.055,.039,.016,M.white,.43+col*.10,1.19-row*.065,1.355);
 batch.box(1.94,.13,.04,M.red,0,2.39,1.19);batch.flush(g);
 const s=sign('S · Sparkasse',3.7,'#ffffff','#e21f35',.22);s.position.set(0,3.35,0);g.add(s);scene.add(g);return g;
}

export function dressCourse(scene,data,track,M,heightAt=()=>0){
 const batch=new Batch({chunkSize:96,maxDistance:260,castShadow:false,vertexColors:true,heightAt}),surfaces=new Batch({chunkSize:96,maxDistance:300,castShadow:false,name:'roundabout:surfaces',rangeKind:'base'}),crowd=[],arms=[],safety=[],index=buildingIndex(data.buildings),inside=(x,z)=>index.contains(x,z);
 const railSigns=[sign('LAMMERSDORF GP',3.3,'#ffffff','#d72a39',.18),sign('BREUER',3.3,'#ffffff','#d72a39',.18)];
 const safe=(x,z,w,d,a,kind='rail')=>{if(inside(x,z)||!clearOfCourse(track,x,z,w,d,a,6.55))return false;safety.push({x,z,w,d,a,kind});return true;};
 // Street View shows a wide pale drivable apron, radial joints, a raised soil
 // island and young trees. All of this stays inside the mapped race-lane ring.
 const rc=data.roundabout.center,outer=Math.max(2,data.roundabout.radius-5.15),soil=Math.max(1.35,outer*.61),apron=M.paving.clone(),joint=material(0x9d9788);apron.color.setHex(0xe5ddc6);apron.roughness=1;
 const ring=(inside,outside,y,m)=>surfaces.add(drapedRingGeometry(data,rc,inside,outside,y,64,{drivingSurface:true}),m);
 ring(soil,outer,.13,apron);ring(outer-.12,outer+.09,.145,M.white);ring(soil-.08,soil+.12,.31,M.paving);
 // The central soil follows the same DGM planes as the drivable apron. A flat
 // cylinder previously floated/embedded on the roundabout's measured gradient.
 ring(0,soil,.29,material(0xd4b994,{map:M.gravel.map,roughness:1}));
 for(let i=0;i<24;i++){const a=i*Math.PI/12,length=outer-soil-.12,r=(outer+soil)/2,x=rc[0]+Math.cos(a)*r,z=rc[1]+Math.sin(a)*r,rotation=Math.PI/2-a,point=(lx,lz)=>[x+Math.cos(rotation)*lx+Math.sin(rotation)*lz,z-Math.sin(rotation)*lx+Math.cos(rotation)*lz];surfaces.add(drapedPolygonGeometry(data,[point(-.014,-length/2),point(.014,-length/2),point(.014,length/2),point(-.014,length/2)],.151,{drivingSurface:true}),joint);}
 for(const [i,x,z] of [[0,-2.4,-1.8],[1,2.5,-1.2],[2,.3,2.7]]){batch.add(new THREE.CylinderGeometry(.065,.09,2.8,6),M.wood,rc[0]+x,1.7,rc[1]+z);batch.add(new THREE.SphereGeometry(.77,8,6),M.hedge,rc[0]+x,3.15+i*.15,rc[1]+z);for(const side of [-1,1])batch.box(.07,1.5,.07,M.wood,rc[0]+x+side*.24,.98,rc[1]+z);}
 const islandBud=new THREE.SphereGeometry(1,6,4);
 for(let i=0;i<28;i++){
  const a=i*2.399963,r=Math.sqrt(rand(i+734))*Math.max(.2,soil-.7),x=rc[0]+Math.cos(a)*r,z=rc[1]+Math.sin(a)*r;
  if(!safe(x,z,.60,.60,0,'roundabout-planting'))continue;
  batch.add(islandBud.clone().scale(.23,.13,.23),M.hedge,x,.38,z);
  for(const side of [-1,1])batch.add(islandBud.clone().scale(.105,.10,.105),i%3===0?M.yellow:i%3===1?M.flower:M.white,x+side*.11,.52,z+side*.08);
 }
 islandBud.dispose();
 for(const a of [1.32,3.45,5.53]){
  const x=rc[0]+Math.sin(a)*(data.roundabout.radius+11),z=rc[1]+Math.cos(a)*(data.roundabout.radius+11);
  for(let i=-3;i<=3;i++){
   const px=x+Math.cos(a)*i,pz=z-Math.sin(a)*i,point=(lx,lz)=>[px+Math.cos(a)*lx+Math.sin(a)*lz,pz-Math.sin(a)*lx+Math.cos(a)*lz];
   surfaces.add(drapedPolygonGeometry(data,[point(-.3,-1.75),point(.3,-1.75),point(.3,1.75),point(-.3,1.75)],SURFACE_LAYERS.paint,{drivingSurface:true}),M.white);
  }
  const px=x+Math.cos(a)*6.7,pz=z-Math.sin(a)*6.7;
  if(safe(px,pz,1.65,4.8,a,'traffic-island')){
   const island=new THREE.CylinderGeometry(.68,.78,.14,12);island.scale(1,1,3);batch.add(island,M.paving,px,.13,pz,a);batch.box(.07,1.6,.07,M.metal,px,.89,pz);const keep=sign('↘',.7,'#ffffff','#2077b7',1);keep.position.set(px,heightAt(px,pz)+1.72,pz);keep.rotation.y=a;scene.add(keep);
  }
  if(safe(px,pz,1.1,.2,a,'crossing-sign')){batch.box(.12,2.2,.12,M.metal,px,1.1,pz);const board=sign('ZEBRA',1.1,'#ffffff','#2678b6',.8);board.position.set(px,heightAt(px,pz)+2.25,pz);board.rotation.y=a;scene.add(board);}
 }
 // Safety rails and spectators on sidewalks, away from road junctions and footprints.
 const cloth=[0xe62c41,0xffc538,0xf0eee4,0x3291d7,0x657abb,0xec9567].map(c=>material(c)),skin=[0xf3c99e,0xd7a274,0xa66945].map(c=>material(c));
 for(let s=14;s<track.length;s+=4){
  const p=track.at(s),turn=Math.abs(Math.atan2(Math.sin(track.at(s+9).angle-track.at(s-9).angle),Math.cos(track.at(s+9).angle-track.at(s-9).angle)));
  for(const side of [-1,1]){
   const offset=7.9,x=p.x+p.dz*offset*side,z=p.z-p.dx*offset*side;if(inside(x,z))continue;
   if((turn>.15||s%58<22||s%86<=29)&&safe(x,z,.85,3.8,p.angle)){
    batch.box(.12,1.15,3.6,M.metal,x,.65,z,p.angle);for(const end of [-1,1])batch.box(.75,.06,.2,M.metal,x+p.dx*1.55*end,.13,z+p.dz*1.55*end,p.angle);
    if(Math.floor(s/4)%3===0){const template=railSigns[Math.floor(s/4)%6?0:1];batch.add(template.geometry.clone(),template.material,x,.75,z,p.angle+Math.PI/2);}
   }
   if(s%86>29||turn>1||rand(s*2+side)>.72)continue;
   for(let j=0;j<3;j++){
    const px=x+p.dz*1.35*side+p.dx*(j-1)*.8,pz=z-p.dx*1.35*side+p.dz*(j-1)*.8;if(inside(px,pz)||!clearOfCourse(track,px,pz,1,1,0,6.6))continue;
    const height=.84+rand(s+j+30)*.3,y=.86*height,shirt=cloth[Math.floor(rand(s+j)*cloth.length)],sk=skin[Math.floor(rand(s+j+3)*skin.length)],facing=p.angle-side*Math.PI/2;
    batch.box(.42*height,.63*height,.28*height,shirt,px,y,pz,facing);batch.add(new THREE.SphereGeometry(.19*height,8,6),sk,px,y+.49*height,pz);
    for(const leg of [-1,1])batch.box(.14*height,.63*height,.17*height,M.dark,px+Math.cos(facing)*.12*leg,.35*height,pz-Math.sin(facing)*.12*leg,facing);
    batch.add(new THREE.SphereGeometry(.195*height,8,5,0,Math.PI*2,0,Math.PI/2),rand(s+j)>.5?M.dark:shirt,px,y+.53*height,pz);
    for(const arm of [-1,1])arms.push({x:px+Math.cos(facing)*.29*arm,y:heightAt(px,pz)+y+.15*height,z:pz-Math.sin(facing)*.29*arm,a:facing,phase:s+j*2+arm,height,side:arm});
    crowd.push({x:px,z:pz});
   }
  }
 }
 // Lamp posts, street signs, warm gardens, bins and benches add scale to the village.
 for(let s=25;s<track.length;s+=38){const p=track.at(s),side=Math.floor(s/38)%2?1:-1,x=p.x+p.dz*8*side,z=p.z-p.dx*8*side;if(!safe(x,z,2.1,.4,p.angle,'lamp'))continue;batch.add(new THREE.CylinderGeometry(.07,.09,6.2,7),M.metal,x,3.1,z);batch.box(1.15,.1,.35,M.dark,x-p.dz*.45*side,6.18,z+p.dx*.45*side,p.angle);batch.box(.85,.055,.23,M.white,x-p.dz*.45*side,6.12,z+p.dx*.45*side,p.angle);}
 for(const name of data.routeNames){const road=data.roads.find(r=>r.name===name);if(!road)continue;const p=track.nearest(...road.points[0]),x=p.x+p.dz*8.8,z=p.z-p.dx*8.8;if(!safe(x,z,3.4,.2,p.angle,'street-sign'))continue;batch.box(.07,2.6,.07,M.metal,x,1.3,z);const plate=sign(name,3.4,'#f7f8ef','#325781',.22);plate.position.set(x,heightAt(x,z)+2.6,z);plate.rotation.y=p.angle;scene.add(plate);}
 for(const poi of data.pois.filter(p=>['school','kindergarten','mandala','mobile-bank'].includes(p.id))){const p=track.nearest(...poi.point),dx=poi.point[0]-p.x,dz=poi.point[1]-p.z,d=Math.hypot(dx,dz)||1,x=p.x+dx/d*10,z=p.z+dz/d*10,a=Math.atan2(-dx,-dz);if(!safe(x,z,4.8,.2,a,'poi-sign'))continue;batch.box(.09,2.25,.09,M.metal,x,1.12,z);const plate=sign(poi.id==='mobile-bank'?'Sparkasse · mobile Filiale':poi.name,4.8,'#ffffff',poi.id==='mobile-bank'?'#d62c3c':'#397888',.19);plate.position.set(x,heightAt(x,z)+2.25,z);plate.rotation.y=a;scene.add(plate);}
 for(let s=60;s<track.length;s+=45){const p=track.at(s),next=track.at(s+28),turn=Math.atan2(Math.sin(next.angle-p.angle),Math.cos(next.angle-p.angle));if(Math.abs(turn)<.24)continue;const x=p.x+p.dz*9.2,z=p.z-p.dx*9.2;if(!safe(x,z,3.5,.2,p.angle,'chevron'))continue;const arrow=sign(turn>0?'› › ›':'‹ ‹ ‹',3.5,'#dc293a','#fff7df',.3);arrow.position.set(x,heightAt(x,z)+1.85,z);arrow.rotation.y=p.angle;scene.add(arrow);batch.box(.1,1.5,.1,M.metal,x,.75,z);}
 batch.flush(scene);surfaces.flush(scene);
 const chunks=new Map();for(const arm of arms){const key=Math.floor(arm.x/64)+','+Math.floor(arm.z/64);if(!chunks.has(key))chunks.set(key,[]);chunks.get(key).push(arm);}
 const dummy=new THREE.Object3D(),animated=[];
 for(const arr of chunks.values()){const mesh=new THREE.InstancedMesh(new THREE.CylinderGeometry(.075,.075,.63,5),M.trim,arr.length);mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.userData.maxDistance=260;scene.add(mesh);animated.push({mesh,arr,tick:-1});}
 const animate=(time,reduced=false,focus=null,quality=2)=>{for(const part of animated){
  const tick=Math.floor(time*(quality===0?8:quality===1?14:20));if(part.tick===tick||reduced&&part.tick>=0)continue;
  if(focus){const b=part.mesh.boundingSphere;if(b&&Math.hypot(focus.x-b.center.x,focus.z-b.center.z)>(quality===0?80:quality===1?110:140)+b.radius)continue;}
  part.arr.forEach((arm,i)=>{const wave=reduced?.6:.6+Math.sin(time*3+arm.phase)*.32;dummy.position.set(arm.x,arm.y+.2,arm.z);dummy.rotation.set(0,arm.a,arm.side*wave);dummy.scale.setScalar(arm.height);dummy.updateMatrix();part.mesh.setMatrixAt(i,dummy.matrix);});part.mesh.instanceMatrix.needsUpdate=true;part.tick=tick;
  if(!part.mesh.boundingSphere){part.mesh.computeBoundingSphere();part.mesh.boundingSphere.radius+=1;}
 }};animate(0);
 return {spectatorCount:crowd.length,animate,crowd,safety};
}

const deciduousTones=[0x73ae67,0x80b97a,0x63a18a,0x9bbb66,0x6da07b],pineTones=[0x4f856c,0x4a7d7c,0x648f79];
function foliageShading(geometry){
 const p=geometry.attributes.position,colors=new Float32Array(p.count*3);geometry.computeBoundingBox();const bottom=geometry.boundingBox.min.y,height=Math.max(.01,geometry.boundingBox.max.y-bottom);
 for(let i=0;i<p.count;i++){const shade=.77+.23*Math.sqrt(Math.max(0,(p.getY(i)-bottom)/height));for(let channel=0;channel<3;channel++)colors[i*3+channel]=shade;}
 geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));return geometry;
}
export function plantTrees(scene,data,track,M,heightAt=()=>0){
 const pts=(data.trees||[]).map(t=>[...t.point,t.height,false]),index=buildingIndex(data.buildings),inside=(x,z)=>index.contains(x,z);
 const terrain=data.terrain,bounds=terrain?[terrain.origin[0],terrain.origin[1],(terrain.width-1)*terrain.step,(terrain.height-1)*terrain.step]:[-950,-950,1900,1900];
 for(let i=0;i<1300;i++){const x=bounds[0]+rand(i*3+1)*bounds[2],z=bounds[1]+rand(i*3+2)*bounds[3];const near=track.nearest(x,z);if(near.distance<13||inside(x,z))continue;let onRoad=false;for(const r of data.roads){if(r.points.some(p=>Math.hypot(p[0]-x,p[1]-z)<r.width/2+2)){onRoad=true;break;}}if(onRoad)continue;pts.push([x,z,4+rand(i)*5,rand(i+7)>.6]);}
 const dummy=new THREE.Object3D(),tiles=new Map(),trunkGeo=new THREE.CylinderGeometry(.16,.28,1,6),decidGeo=foliageShading(new THREE.SphereGeometry(1,12,8)),pineGeo=foliageShading(new THREE.ConeGeometry(1,1,10,2)),leafMat=material(0xffffff,{vertexColors:true,map:M.leafPaint.map,roughness:1}),pineMat=material(0xffffff,{vertexColors:true,map:M.pinePaint.map,roughness:1});
 for(const p of pts){const key=Math.floor(p[0]/96)+','+Math.floor(p[1]/96);if(!tiles.has(key))tiles.set(key,[]);tiles.get(key).push(p);}
 // Crossed, alpha-tested crown cards share one texture/material per forest
 // tile. Their static UVs need no custom shader, including the low GPU profile.
 // Trunks share one plain batch; compared with the old two species batches,
 // this preserves the submission count while removing most distant vertices.
 scene.userData.treeRecords=pts.map(([x,z,h,pine])=>({x,z,h,pine}));
 const farTiles=new Map();for(const p of pts){const key=Math.floor(p[0]/192)+','+Math.floor(p[1]/192);if(!farTiles.has(key))farTiles.set(key,[]);farTiles.get(key).push(p);}
 for(const [key,arr] of farTiles){
  const crownP=[],crownN=[],crownUV=[],crownC=[],trunkP=[],trunkN=[],trunkUV=[],trunkC=[],ranges=[];
  const quad=(positions,normals,uv,colors,points,tex,shade)=>{const n=new THREE.Vector3(...points[1]).sub(new THREE.Vector3(...points[0])).cross(new THREE.Vector3(...points[2]).sub(new THREE.Vector3(...points[0]))).normalize();for(const i of [0,1,2,0,2,3]){positions.push(...points[i]);normals.push(n.x,n.y,n.z);uv.push(...tex[i]);colors.push(...shade);}};
  for(const p of arr){
   const [x,z,h,pine]=p,y=heightAt(x,z),seed=rand(x*7.3+z*.8),slot=pine?14:seed>.91?15:seed>.43?13:12,c=slot%4,r=Math.floor(slot/4),uv=[[0,0],[1,0],[1,1],[0,1]].map(([u,v])=>[(c+.035+u*.93)/4,1-(r+.035+(1-v)*.93)/4]),startC=crownP.length,startT=trunkP.length,a=rand(x+z)*Math.PI;
   for(const rotation of [a,a+Math.PI/2]){
    const dx=Math.cos(rotation),dz=Math.sin(rotation),bottom=pine?.15:.34,top=1.09,wide=pine?.40:.44;
    quad(crownP,crownN,crownUV,crownC,[[-1,bottom],[1,bottom],[1,top],[-1,top]].map(([side,up])=>[x+dx*h*wide*side,y+h*up,z+dz*h*wide*side]),uv,[1,1,1]);
    quad(trunkP,trunkN,trunkUV,trunkC,[[-1,0],[1,0],[1,.68],[-1,.68]].map(([side,up])=>[x+dx*h*.025*side,y+h*up,z+dz*h*.025*side]),[[.0015,.9985],[.0015,.9985],[.0015,.9985],[.0015,.9985]],[.33,.23,.14]);
   }
   ranges.push({p,startC,countC:crownP.length-startC,startT,countT:trunkP.length-startT});
  }
  const geo=(positions,normals,uv,colors)=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.computeBoundingSphere();g.attributes.position.setUsage(THREE.DynamicDrawUsage);return g;};
  const combined=[...crownP,...trunkP],mesh=object(geo(combined,[...crownN,...trunkN],[...crownUV,...trunkUV],[...crownC,...trunkC]),M.foliage);mesh.name='trees:far:'+key;mesh.castShadow=false;mesh.receiveShadow=true;mesh.userData.maxDistance=370;mesh.userData.rangeKind='base';scene.add(mesh);
  const original=new Float32Array(combined);for(const {p,startC,countC,startT,countT} of ranges)p[4]={parts:[[mesh,startC,countC,original],[mesh,crownP.length+startT,countT,original]]};

 }
 for(const arr of tiles.values()){
  const tile=new THREE.Group();tile.name='trees:near';tile.visible=false;tile.userData.treeTile=true;tile.userData.center={x:arr.reduce((s,p)=>s+p[0],0)/arr.length,z:arr.reduce((s,p)=>s+p[1],0)/arr.length};let nearby=false;
  tile.userData.setNear=close=>{tile.visible=close;if(close===nearby)return;nearby=close;for(const p of arr){const f=p[4];for(const [mesh,start,count,original] of f.parts){const positions=mesh.geometry.attributes.position;if(close)positions.array.fill(0,start,start+count);else positions.array.set(original.subarray(start,start+count),start);positions.needsUpdate=true;}}};
  const trunks=new THREE.InstancedMesh(trunkGeo,M.wood,arr.length);trunks.castShadow=true;
  arr.forEach(([x,z,h],i)=>{dummy.position.set(x,heightAt(x,z)+h*.28,z);dummy.scale.set(1,h*.56,1);dummy.rotation.set(0,0,0);dummy.updateMatrix();trunks.setMatrixAt(i,dummy.matrix);});trunks.computeBoundingSphere();tile.add(trunks);
  for(const pine of [false,true]){
   const trees=arr.filter(p=>p[3]===pine);if(!trees.length)continue;const leaves=new THREE.InstancedMesh(pine?pineGeo:decidGeo,pine?pineMat:leafMat,trees.length*3);leaves.name=pine?'trees:painted-pines':'trees:painted-crowns';leaves.castShadow=true;leaves.receiveShadow=true;
   trees.forEach(([x,z,h],i)=>{const tones=pine?pineTones:deciduousTones,tint=new THREE.Color(tones[Math.min(tones.length-1,Math.floor(rand(x*7.3+z*.8)*tones.length))]).lerp(new THREE.Color(0xffffff),.72);for(let j=0;j<3;j++){dummy.position.set(x+(j-1)*.45,heightAt(x,z)+h*.61+j*.55,z+(j%2)*.5);dummy.scale.set(h*(pine?.32:.34),h*(pine?.8:.37),h*.34);dummy.rotation.set(0,rand(x+z)*6,0);dummy.updateMatrix();leaves.setMatrixAt(i*3+j,dummy.matrix);leaves.setColorAt(i*3+j,tint);}});leaves.computeBoundingSphere();tile.add(leaves);
  }
  scene.add(tile);
 }
 return pts.length;
}

export function landscape(scene,data,M,heightAt=()=>0){
 const batch=new Batch({chunkSize:160,castShadow:false,name:'land-use',rangeKind:'base'}),walls=new Batch({chunkSize:160,castShadow:false,heightAt}),palette={meadow:0xf0efdc,grass:0xe3ead7,forest:0xbacdc0,farmland:0xe9e2c2,cemetery:0xd8dfcf,park:0xe2ead8,playground:0xf0e3d3,pitch:0xc9dfcf};
 for(const {area,geometry} of landUseSurfaceGeometries(data)){
  const m=area.kind==='playground'||area.kind==='farmland'?M.gravel:M.grass;batch.add(colorGeometry(geometry,palette[area.kind]||0xe3e8d4),m);
  if(area.kind==='cemetery')for(let i=0;i<area.points.length;i++){const p=area.points[i],q=area.points[(i+1)%area.points.length],d=Math.hypot(q[0]-p[0],q[1]-p[1]);walls.box(.4,.75,d,M.stone,(p[0]+q[0])/2,.37,(p[1]+q[1])/2,Math.atan2(q[0]-p[0],q[1]-p[1]));}
 }
 batch.flush(scene);walls.flush(scene);
}

export function makeGroundTransitions(scene,data,track,M){
 // One static transparent material supplies feathered verge and wall-contact
 // colour. Every polygon is cut against the complete asphalt/sidewalk mask and
 // draped onto the DGM, so this cannot create a barrier or cover an oil slick.
 const paint=material(0xffffff,{map:M.gravel.map,roughness:1,vertexColors:true,transparent:true,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true});paint.name='village:ground-contact';paint.userData.uvScale=.28;paint.userData.keepTransparency=true;
 const batch=new Batch({chunkSize:96,maxDistance:155,castShadow:false,name:'ground-transitions'});let verges=0,contacts=0;
 const distance=(x,z,p,q)=>{const dx=q[0]-p[0],dz=q[1]-p[1],t=Math.max(0,Math.min(1,((x-p[0])*dx+(z-p[1])*dz)/(dx*dx+dz*dz||1)));return Math.hypot(x-p[0]-t*dx,z-p[1]-t*dz);};
 const fade=(points,p,q,width,hex,opacity)=>{
  const g=drapedPolygonGeometry(data,points,SURFACE_LAYERS.landuse+.004,{excludeRoads:true}),a=g.attributes.position;if(!a.count){g.dispose();return false;}
  const col=new THREE.Color(hex),rgba=new Float32Array(a.count*4);
  for(let i=0;i<a.count;i++){const edge=Math.max(0,1-distance(a.getX(i),a.getZ(i),p,q)/width),alpha=edge*edge*opacity;rgba.set([col.r,col.g,col.b,alpha],i*4);}
  g.setAttribute('color',new THREE.BufferAttribute(rgba,4));batch.add(g,paint);return true;
 };
 for(let s=0;s<track.length;s+=8){
  const a=track.at(s),b=track.at(Math.min(track.length,s+8));
  for(const side of [-1,1]){const p=[a.x+a.dz*6.47*side,a.z-a.dx*6.47*side],q=[b.x+b.dz*6.47*side,b.z-b.dx*6.47*side],r=[b.x+b.dz*8.65*side,b.z-b.dx*8.65*side],t=[a.x+a.dz*8.65*side,a.z-a.dx*8.65*side];if(fade([p,q,r,t],p,q,2.18,0xe3d8bc,.24))verges++;}
 }
 for(const b of data.buildings){
  const n=b.points.length,c=b.points.reduce((p,q)=>[p[0]+q[0]/n,p[1]+q[1]/n],[0,0]);if(track.nearest(c[0],c[1]).distance>55)continue;
  const area=b.points.reduce((sum,p,i)=>{const q=b.points[(i+1)%n];return sum+p[0]*q[1]-q[0]*p[1];},0),sign=area>=0?1:-1;
  for(let i=0;i<n;i++){const p=b.points[i],q=b.points[(i+1)%n],length=Math.hypot(q[0]-p[0],q[1]-p[1]);if(length<.6)continue;const nx=sign*(q[1]-p[1])/length,nz=-sign*(q[0]-p[0])/length,width=.65;if(fade([p,q,[q[0]+nx*width,q[1]+nz*width],[p[0]+nx*width,p[1]+nz*width]],p,q,width,0x4d5c51,.19))contacts++;}
 }
 const meshes=batch.flush(scene);for(const mesh of meshes){mesh.renderOrder=1;mesh.userData.minimumQuality=1;mesh.visible=false;}if(!meshes.length)paint.dispose();return {vergeSections:verges,contactEdges:contacts,meshCount:meshes.length,minimumQuality:1};
}
