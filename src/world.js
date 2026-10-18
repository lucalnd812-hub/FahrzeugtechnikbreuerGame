import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {CARS} from './race-core.js';
import {clearOfCourse} from './course.js';
import {RENDER_PROFILES} from './performance.js';
import {terrainHeightAt,surfaceHeightAt,roadSurfaceGeometries,drapedPolygonGeometry,drapedRibbonGeometry,resetDrivingOverlays,SURFACE_LAYERS} from './road-surface.js';
import {installLandmarks,modelBuildingIds} from './landmarks.js';
import {createVehicleModel,setVehicleQuality} from './vehicle-models.js';
import {upgradeVillageTextures} from './village-textures.js';
import {material,block,object,sign,logoBoard,surfaceTexture,worldUV,Batch,makeVillage,villageMaterials,makeChurch,makeATM,dressCourse,plantTrees,landscape,upgradePaintedTiles,makeGroundTransitions} from './scenery.js';

const mat=(c,extra={})=>new THREE.MeshStandardMaterial({color:c,roughness:.75,...extra});
const mesh=(g,m,x=0,y=0,z=0)=>{const o=new THREE.Mesh(g,m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;return o;};
const box=(w,h,d,m,x=0,y=0,z=0)=>mesh(new THREE.BoxGeometry(w,h,d),m,x,y,z);
const random=n=>{const v=Math.sin(n*78.233+2.41)*43758.5453;return v-Math.floor(v);};
const sharedQualityMaterials=new WeakMap();

function qualityMaterial(source,level){
 if(level===2||!source.isMeshStandardMaterial)return source;
 const cached=sharedQualityMaterials.get(source);if(cached?.has(level))return cached.get(level);
 const properties={color:source.color,map:level===0&&source.userData.lowMap?source.userData.lowMap:source.map,vertexColors:source.vertexColors,side:source.side,emissive:source.emissive,emissiveMap:source.emissiveMap,emissiveIntensity:source.emissiveIntensity,opacity:source.opacity,transparent:source.transparent,depthWrite:source.depthWrite,alphaTest:source.alphaTest,forceSinglePass:source.forceSinglePass};
 // Opaque blue glass avoids a second transparent vehicle pass on weak GPUs.
 if(level===0&&source.transparent&&!source.userData.keepTransparency){properties.transparent=false;properties.opacity=1;properties.depthWrite=true;}
 if(level===1&&!source.isMeshPhysicalMaterial)return source;
 const variant=level===0?new THREE.MeshLambertMaterial(properties):new THREE.MeshStandardMaterial({...properties,roughness:source.roughness,metalness:source.metalness});
 if(level>0&&source.userData.paintAtlas){variant.onBeforeCompile=source.onBeforeCompile;variant.customProgramCacheKey=source.customProgramCacheKey;variant.userData.paintAtlas={...source.userData.paintAtlas};}
 if(!cached)sharedQualityMaterials.set(source,new Map());sharedQualityMaterials.get(source).set(level,variant);return variant;
}

function applyObjectQuality(object,level){
 if(!object.material)return;
 if(!object.userData.qualityMaterials){
  const original=Array.isArray(object.material)?object.material:[object.material];
  object.userData.qualityMaterials=new Map([[2,original]]);object.userData.materialArray=Array.isArray(object.material);
 }
 const variants=object.userData.qualityMaterials;
 if(!variants.has(level))variants.set(level,variants.get(2).map(m=>qualityMaterial(m,level)));
 const materials=variants.get(level);object.material=object.userData.materialArray?materials:materials[0];
}

function lowCarPart(parent,nodes,material){
 const pieces=[];
 for(const node of nodes){
  node.updateMatrix();let g=node.geometry.clone().applyMatrix4(node.matrix);if(g.index){const indexed=g;g=g.toNonIndexed();indexed.dispose();}
  if(!g.attributes.color){const color=node.material.color,colors=new Float32Array(g.attributes.position.count*3);for(let i=0;i<colors.length;i+=3){colors[i]=color.r;colors[i+1]=color.g;colors[i+2]=color.b;}g.setAttribute('color',new THREE.BufferAttribute(colors,3));}
  for(const name of Object.keys(g.attributes))if(!['position','normal','color'].includes(name))g.deleteAttribute(name);pieces.push(g);
 }
 if(!pieces.length)return null;
 const geometry=mergeGeometries(pieces);pieces.forEach(g=>g.dispose());geometry.computeBoundingSphere();const low=new THREE.Mesh(geometry,material);low.name='car:low-detail';low.visible=false;parent.add(low);return {low,high:nodes};
}

export function setCarQuality(car,level=1){
 if(car.userData.carModel||car.userData.vehicleSpec)return setVehicleQuality(car,level);
 const quality=Math.max(0,Math.min(2,level));car.userData.quality=quality;
 car.traverse(o=>{
  if(!o.isMesh)return;
  if(o.userData.originalCastShadow===undefined)o.userData.originalCastShadow=o.castShadow;
  if(o.userData.originalReceiveShadow===undefined)o.userData.originalReceiveShadow=o.receiveShadow;
  applyObjectQuality(o,quality);
  const basic=(Array.isArray(o.material)?o.material:[o.material]).every(m=>m.isMeshBasicMaterial);
  o.castShadow=quality>0&&o.userData.originalCastShadow&&!basic;o.receiveShadow=quality>0&&o.userData.originalReceiveShadow;
 });
 for(const lod of car.userData.lodGroups||[]){lod.low.visible=quality===0;for(const high of lod.high)high.visible=quality>0;}
}

// Scene environments may be shared with the garage and belong to the caller.
// Dispose all owned geometry, instance buffers and both active/inactive materials.
export function disposeScene(root,{excludeTextures=[]}={}){
 const geometries=new Set(),materials=new Set(),textures=new Set(),excluded=new Set([root.environment,root.background,...excludeTextures].filter(t=>t?.isTexture));
 root.traverse(o=>{
  if(o.geometry)geometries.add(o.geometry);
  for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[])materials.add(m);
  for(const variant of o.userData?.qualityMaterials?.values?.()||[])for(const m of Array.isArray(variant)?variant:[variant])if(m?.isMaterial)materials.add(m);
  if(o.isInstancedMesh)o.dispose();
  if(o.isLight&&o.shadow){o.shadow.map?.dispose();o.shadow.mapPass?.dispose();o.shadow.map=o.shadow.mapPass=null;}
 });
 for(const m of materials){for(const value of Object.values(m))if(value?.isTexture&&!excluded.has(value))textures.add(value);m.dispose();}
 for(const g of geometries)g.dispose();for(const t of textures)t.dispose();
 root.clear();return {geometries:geometries.size,materials:materials.size,textures:textures.size};
}

export function label(text,width=12,color='#ffc629',bg='#171c1c'){
  const c=document.createElement('canvas');c.width=1024;c.height=220;
  const ctx=c.getContext('2d');ctx.fillStyle=bg;ctx.fillRect(0,0,1024,220);ctx.fillStyle=color;
  ctx.font='900 110px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,512,110,970);
  const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;
  const m=new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide});
  return mesh(new THREE.PlaneGeometry(width,width*220/1024),m);
}

export function makeCar(index=0,parked=false,quality=2){
 return createVehicleModel(index,{parked,quality});
}

export function roadGeometry(points,width,y=.03,heightAt=()=>0){
  const positions=[],indices=[];
  for(let i=0;i<points.length;i++){
    const prev=points[Math.max(0,i-1)],next=points[Math.min(points.length-1,i+1)],p=points[i];
    let dx=next[0]-prev[0],dz=next[1]-prev[1],d=Math.hypot(dx,dz)||1;dx/=d;dz/=d;
    const lx=p[0]-dz*width/2,lz=p[1]+dx*width/2,rx=p[0]+dz*width/2,rz=p[1]-dx*width/2;
    positions.push(lx,heightAt(lx,lz)+y,lz,rx,heightAt(rx,rz)+y,rz);
    if(i<points.length-1){const a=i*2;indices.push(a,a+2,a+1,a+1,a+2,a+3);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();return g;
}

function terrainGeometry(terrain){
 const positions=[],indices=[];
 for(let z=0;z<terrain.height;z++)for(let x=0;x<terrain.width;x++){
  positions.push(terrain.origin[0]+x*terrain.step,terrain.values[z*terrain.width+x]-.035,terrain.origin[1]+z*terrain.step);
  if(z<terrain.height-1&&x<terrain.width-1){const a=z*terrain.width+x;indices.push(a,a+terrain.width,a+1,a+1,a+terrain.width,a+terrain.width+1);}
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();return g;
}

// Split existing triangles rather than rebuilding joins. Road contours remain
// exactly the same at cell boundaries, including irregular village junctions.
export function chunkGeometry(geometry,cellSize=96){
 const source=geometry.index?geometry.toNonIndexed():geometry,position=source.attributes.position,groups=new Map();
 for(let i=0;i<position.count;i+=3){
  const x=(position.getX(i)+position.getX(i+1)+position.getX(i+2))/3,z=(position.getZ(i)+position.getZ(i+1)+position.getZ(i+2))/3,key=Math.floor(x/cellSize)+','+Math.floor(z/cellSize);
  if(!groups.has(key)){const attributes={};for(const name of Object.keys(source.attributes))attributes[name]=[];groups.set(key,attributes);}
  const attributes=groups.get(key);
  for(const [name,attribute] of Object.entries(source.attributes))for(let j=i;j<i+3;j++)for(let k=0;k<attribute.itemSize;k++)attributes[name].push(attribute.array[j*attribute.itemSize+k]);
 }
 const result=[];
 for(const [key,attributes] of groups){const g=new THREE.BufferGeometry();g.userData.chunkKey=key;for(const [name,values] of Object.entries(attributes))g.setAttribute(name,new THREE.Float32BufferAttribute(values,source.attributes[name].itemSize));result.push(g);}
 if(source!==geometry)source.dispose();geometry.dispose();return result;
}

export function makeWorld(data,track){
 resetDrivingOverlays(data);
 const scene=new THREE.Scene();scene.background=new THREE.Color(0x83d0e9);scene.fog=new THREE.Fog(0xc0e1dd,105,285);
 const lowSky=scene.background,skyCanvas=document.createElement('canvas');skyCanvas.width=256;skyCanvas.height=128;const skyContext=skyCanvas.getContext('2d');skyContext.fillStyle='#9acedd';skyContext.fillRect(0,0,256,128);const sky=new THREE.CanvasTexture(skyCanvas);sky.name='artisan:sky';sky.colorSpace=THREE.SRGBColorSpace;sky.mapping=THREE.EquirectangularReflectionMapping;upgradeVillageTextures({'artisan-sky':sky});scene.userData.skyTexture=sky;
 const heightAt=(x,z)=>terrainHeightAt(data,x,z),drivingHeightAt=(x,z)=>surfaceHeightAt(data,x,z);
 const M=villageMaterials();scene.add(new THREE.HemisphereLight(0xf2f5eb,0x9eae85,1.8));
 const sun=new THREE.DirectionalLight(0xffedd8,1.4);sun.position.set(-100,150,80);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-85,right:85,top:85,bottom:-85,near:10,far:380});sun.shadow.bias=-.0003;sun.shadow.normalBias=.09;scene.add(sun,sun.target);
 sun.shadow.camera.updateProjectionMatrix();sun.shadow.radius=2;
 const grass=material(0xf2f3e3,{map:surfaceTexture('grass'),roughness:1});
 if(data.terrain&&data.terrain.values?.length===data.terrain.width*data.terrain.height){
  const groundBatch=new Batch({chunkSize:192,maxDistance:430,castShadow:false,name:'terrain',rangeKind:'base'});grass.userData.uvScale=.25;
  for(const g of chunkGeometry(terrainGeometry(data.terrain),192))groundBatch.add(g,grass);groundBatch.flush(scene);
 }else{const groundGeo=worldUV(new THREE.PlaneGeometry(6500,6500).rotateX(-Math.PI/2),.25),ground=object(groundGeo,grass,0,-.035,0);ground.castShadow=false;scene.add(ground);}
 landscape(scene,data,M,heightAt);
 const groundTransitions=makeGroundTransitions(scene,data,track,M);
 const asphalt=material(0xffffff,{map:surfaceTexture('asphalt'),roughness:.96});asphalt.userData.uvScale=.40;const sidewalk=M.paving;
 // One quiet Higgsfield painted tile replaces coarse procedural noise for every
 // road. The late image cannot revive a world disposed during track selection.
 upgradePaintedTiles('village-ground',2,[{texture:asphalt.map,slot:3}]);
 const roadSurfaces=roadSurfaceGeometries(data),roads=new Batch({chunkSize:192,maxDistance:430,castShadow:false,name:'roads',rangeKind:'base'});
 for(const g of chunkGeometry(roadSurfaces.background,192))roads.add(g,asphalt);
 for(const g of chunkGeometry(roadSurfaces.backgroundSidewalk,192))roads.add(g,sidewalk);
 roads.flush(scene);
 // The whole village loop must not be submitted as one giant visible mesh.
 // Reuse the existing triangle-preserving chunker: joins and height planes are
 // identical, while the camera and distance profiles can skip distant tiles.
 const courseTiles=[];
 for(const [kind,geometry,m,scale] of [['asphalt',roadSurfaces.course,asphalt,.40],['sidewalk',roadSurfaces.courseSidewalk,sidewalk,.72]]){
  const pieces=chunkGeometry(geometry,96);for(const [index,piece] of pieces.entries()){
   const tile=object(worldUV(piece,scale),m);tile.name='course:'+kind+(index?':'+piece.userData.chunkKey:'');tile.castShadow=false;tile.userData.maxDistance=430;tile.userData.rangeKind='base';courseTiles.push(tile);scene.add(tile);
  }
 }
 const village=makeVillage(scene,data,track,M,modelBuildingIds,heightAt),get=id=>data.buildings.find(b=>b.id===id),landmarks=installLandmarks(scene,data,track,2,{THREE,material,block,object,sign,logoBoard,Batch,makeCar,materials:M,sampleGround:terrainHeightAt});
 const workshop=landmarks.byId.breuer,bakery=landmarks.byId.bakery,school=landmarks.byId.school,church=get(93722401)?makeChurch(scene,get(93722401),M):null,atmPoi=data.pois.find(p=>p.id==='atm'),atm=atmPoi?makeATM(scene,atmPoi,M):null;
 for(const [id,model] of [['church',church],['atm',atm]]){const poi=data.pois.find(p=>p.id===id);if(poi&&model)model.position.y+=heightAt(...poi.point);}
 const spectators=dressCourse(scene,data,track,M,heightAt),trees=plantTrees(scene,data,track,M,heightAt);
 const props=new Batch({chunkSize:96,maxDistance:450,castShadow:false,vertexColors:true,heightAt,drape:true}),kerbs=[];
 // Red/white event kerbs and short dashed markings make the course readable.
 for(let s=0;s<track.length;s+=3){const p=track.at(s);for(const side of [-1,1]){const x=p.x+p.dz*5.4*side,z=p.z-p.dx*5.4*side;if(!clearOfCourse(track,x,z,.38,2.85,p.angle,5.12))continue;props.box(.38,.09,2.85,Math.floor(s/3)%2?M.red:M.white,x,.11,z,p.angle);kerbs.push({x,z,w:.38,d:2.85,a:p.angle});}}
 const coursePaint=new Batch({name:'course:markings',castShadow:false}),coursePoint=(p,x,z)=>[p.x+Math.cos(p.angle)*x+Math.sin(p.angle)*z,p.z-Math.sin(p.angle)*x+Math.cos(p.angle)*z];
 for(let s=30;s<track.length;s+=18){const p=track.at(s);coursePaint.add(drapedPolygonGeometry(data,[coursePoint(p,-.065,-1.35),coursePoint(p,.065,-1.35),coursePoint(p,.065,1.35),coursePoint(p,-.065,1.35)],SURFACE_LAYERS.paint,{drivingSurface:true}),M.white);}
 for(let s=45;s<track.length;s+=65){const p=track.at(s);coursePaint.add(drapedPolygonGeometry(data,[coursePoint(p,-1,-1),coursePoint(p,0,1.5),coursePoint(p,1,-1)],SURFACE_LAYERS.paint,{drivingSurface:true}),M.white);}
 coursePaint.flush(scene);
 const p=track.at(0),gate=new THREE.Group(),gateBatch=new Batch();gate.position.set(p.x,heightAt(p.x,p.z),p.z);gate.rotation.y=p.angle;gate.name='breuer:start-finish';
 let gateWidth=7.2;while(gateWidth<11&&[-1,1].some(side=>!clearOfCourse(track,p.x+p.dz*gateWidth*side,p.z-p.dx*gateWidth*side,.7,.8,p.angle,6.55)))gateWidth+=.4;
 for(const side of [-1,1]){gateBatch.box(.7,6.5,.8,M.red,side*gateWidth,3.25,0);spectators.safety.push({x:p.x+p.dz*gateWidth*side,z:p.z-p.dx*gateWidth*side,w:.7,d:.8,a:p.angle,kind:'gate'});}gateBatch.box(gateWidth*2+.7,1,.8,M.dark,0,6.05,0);
 for(const side of [-1,1]){const name=sign('BREUER GRAND PRIX',11.9,'#ffffff','#1f2024',.075);name.position.set(0,6.05,side*.42);gate.add(name);}
 // Ground-level start graphics belong to the terrain, not the flat gantry.
 // This also keeps the long blue launch pad from covering oil on gradients.
 const gatePoint=(x,z)=>[p.x+Math.cos(p.angle)*x+Math.sin(p.angle)*z,p.z-Math.sin(p.angle)*x+Math.cos(p.angle)*z];
 const startSurfaces=new Batch({name:'race:start-surfaces',castShadow:false});
 const groundRectangle=(x,z,w,d,offset,m)=>startSurfaces.add(drapedPolygonGeometry(data,[gatePoint(x-w/2,z-d/2),gatePoint(x+w/2,z-d/2),gatePoint(x+w/2,z+d/2),gatePoint(x-w/2,z+d/2)],offset,{drivingSurface:true}),m);
 for(let j=0;j<10;j++)for(let k=0;k<3;k++)groundRectangle(-4.5+j,-.55+k*.55,1,.55,SURFACE_LAYERS.paint,(j+k)%2?M.white:M.dark);
 groundRectangle(0,9,9.5,12,SURFACE_LAYERS.pad,material(0x438bd5,{emissive:0x156dda,emissiveIntensity:.25}));
 for(let i=0;i<4;i++)for(const side of [-1,0,1]){
  const z=4.7+i*2.7,x=side*1.8;startSurfaces.add(drapedPolygonGeometry(data,[gatePoint(x-.65,z-.42),gatePoint(x,z+.37),gatePoint(x+.65,z-.42),gatePoint(x+.43,z-.42),gatePoint(x,z+.1),gatePoint(x-.43,z-.42)],SURFACE_LAYERS.padArrow,{drivingSurface:true}),M.white);
 }
 startSurfaces.flush(scene);
 for(const side of [-1,1]){const logo=logoBoard(2.6);logo.position.set(side*(gateWidth+.45),3.1,1.2);gateBatch.box(2.7,1.5,.15,M.dark,side*(gateWidth+.45),3.1,1.1);gate.add(logo);}
 gateBatch.flush(gate);scene.add(gate);props.flush(scene);
 const courseHighlight=object(drapedRibbonGeometry(data,data.route,.85,.24),new THREE.MeshBasicMaterial({color:0xed2742,side:THREE.DoubleSide,depthTest:false,transparent:true,opacity:.85}));courseHighlight.visible=false;courseHighlight.renderOrder=5;scene.add(courseHighlight);
 // Light, scattered cloud groups, with no terrain fabricated as survey data.
 const cloudGeo=new THREE.SphereGeometry(1,8,5),cloudMat=new THREE.MeshBasicMaterial({color:0xf8fcff,transparent:true,opacity:.78});
 const clouds=new THREE.InstancedMesh(cloudGeo,cloudMat,90),dummy=new THREE.Object3D();for(let i=0;i<90;i++){const cluster=Math.floor(i/5),j=i%5;dummy.position.set((random(cluster+3)-.5)*2600+j*17,165+random(cluster+16)*90,(random(cluster+54)-.5)*2600);dummy.scale.set(35+random(i)*25,8+random(i+1)*8,21+random(i+7)*17);dummy.updateMatrix();clouds.setMatrixAt(i,dummy.matrix);}scene.add(clouds);
 const crates=[];for(let s=85;s<track.length-30;s+=145){const p=track.at(s);for(const offset of [-2.2,2.2]){const g=new THREE.Group();g.add(block(1.05,1.05,1.05,material(0xf6c747,{emissive:0xe39118,emissiveIntensity:.15}),0,.9,0));for(const side of [-1,1]){const question=sign('?',.7,'#fffcec','#de7333',.8);question.position.set(0,.9,side*.54);g.add(question);}const x=p.x-p.dz*offset,z=p.z+p.dx*offset,groundY=drivingHeightAt(x,z);g.position.set(x,groundY,z);g.userData.baseY=groundY;g.rotation.y=p.angle;scene.add(g);crates.push({s,x,z,groundY,mesh:g,available:0});}}
 const obstacles=[];
 for(const h of track.obstacles){
  const g=new THREE.Group();g.name='obstacle:'+h.id;g.position.set(h.x,drivingHeightAt(h.x,h.z),h.z);g.rotation.y=h.angle;const hb=new Batch();
  if(h.kind==='bale'){hb.box(1.45,.95,.9,material(0xb98e41),0,.56,0);for(const x of [-.45,.45])hb.box(.065,1,.93,M.dark,x,.56,0);hb.box(1.4,.14,.93,M.yellow,0,.93,0);}
  else for(let i=0;i<4;i++){const tyre=new THREE.TorusGeometry(.58,.16,6,12);tyre.rotateX(Math.PI/2);hb.add(tyre,M.dark,0,.22+i*.29,0);if(i===3)hb.add(new THREE.TorusGeometry(.58,.025,4,12).rotateX(Math.PI/2),M.yellow,0,.22+i*.29+.15,0);}
  const warning=sign(h.side>0?'‹ ‹':'› ›',1.1,'#292a30','#ffcc36',.38);warning.position.set(0,1.0,.47);g.add(warning);
  hb.flush(g);scene.add(g);obstacles.push({...h,mesh:g});
  const p=track.at(h.s-7);for(const offset of [-6.85,6.85]){const x=p.x+p.dz*offset,z=p.z-p.dx*offset;if(!clearOfCourse(track,x,z,.46,.46,p.angle,6.55))continue;const cone=new THREE.ConeGeometry(.23,.75,7);props.add(cone,M.yellow,x,.43,z,p.angle);}
 }
 props.flush(scene);
 // Short, pooled tyre marks give feedback without creating meshes during a drift.
 const markCount=144,marks=new THREE.InstancedMesh(new THREE.PlaneGeometry(.15,1).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.55,depthWrite:false}),markCount),markDummy=new THREE.Object3D(),markColor=new THREE.Color(),asphaltColor=new THREE.Color(0x64666a),zeroScale=new THREE.Vector3(0,0,0),history=new Float32Array(markCount).fill(-100);
 marks.frustumCulled=false;marks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);scene.add(marks);let markHead=0,lastMark=-1,lastFade=-1;
 for(let i=0;i<markCount;i++){markDummy.scale.setScalar(0);markDummy.updateMatrix();marks.setMatrixAt(i,markDummy.matrix);marks.setColorAt(i,new THREE.Color(0x252931));}
 const skid=(v,time)=>{
  if(time<lastMark){history.fill(-100);lastMark=-1;}
  if(v?.drifting&&v.speed>11&&time-lastMark>.05){lastMark=time;for(const side of [-1,1]){const i=markHead++%markCount;history[i]=time;const x=v.x-Math.sin(v.angle)*1.35+Math.cos(v.angle)*side*.87,z=v.z-Math.cos(v.angle)*1.35-Math.sin(v.angle)*side*.87,a=v.angle+v.slip,length=Math.min(2.2,v.speed*.067),front=heightAt(x+Math.sin(a)*length/2,z+Math.cos(a)*length/2),back=heightAt(x-Math.sin(a)*length/2,z-Math.cos(a)*length/2);markDummy.position.set(x,heightAt(x,z)+.092,z);markDummy.rotation.set(-Math.atan2(front-back,length),a,0);markDummy.scale.set(1,1,length);markDummy.updateMatrix();marks.setMatrixAt(i,markDummy.matrix);marks.setColorAt(i,new THREE.Color(0x252931));}marks.instanceMatrix.needsUpdate=marks.instanceColor.needsUpdate=true;}
  if(time-lastFade<.1&&time>=lastFade)return;lastFade=time;
  for(let i=0;i<markCount;i++){if(history[i]===-100)continue;const age=time-history[i];if(age>3.6){marks.getMatrixAt(i,markDummy.matrix);markDummy.matrix.scale(zeroScale);marks.setMatrixAt(i,markDummy.matrix);history[i]=-100;}else{markColor.set(0x252931).lerp(asphaltColor,Math.max(0,(age-1.6)/2));marks.setColorAt(i,markColor);}}
  marks.instanceMatrix.needsUpdate=marks.instanceColor.needsUpdate=true;
 };
 scene.updateMatrixWorld(true);const ranged=[],treeTiles=[],casters=[],qualityObjects=[],carModels=[],sourceMaterials=new Map();let appliedQuality=-1,disposed=false;
 for(const crate of crates)crate.mesh.userData.detailDistance=180;
 scene.traverse(o=>{
  if(o.userData.treeTile)treeTiles.push(o);
  if(o.userData.carModel)carModels.push(o);
  if(o.material){qualityObjects.push(o);for(const m of Array.isArray(o.material)?o.material:[o.material])if(!sourceMaterials.has(m))sourceMaterials.set(m,{bumpMap:m.bumpMap,envMapIntensity:m.envMapIntensity});}
  if(Number.isFinite(o.userData.detailDistance))ranged.push({mesh:o,center:new THREE.Vector3().setFromMatrixPosition(o.matrixWorld),radius:8,range:o.userData.detailDistance});
  if(o.geometry){
   if(o.isInstancedMesh&&!o.boundingSphere)o.computeBoundingSphere();else if(!o.geometry.boundingSphere)o.geometry.computeBoundingSphere();
   const b=o.isInstancedMesh?o.boundingSphere:o.geometry.boundingSphere,center=b.center.clone().applyMatrix4(o.matrixWorld);
   if(Number.isFinite(o.userData.maxDistance))ranged.push({mesh:o,center,radius:b.radius,range:o.userData.maxDistance,kind:o.userData.rangeKind});
   if(o.castShadow)casters.push({mesh:o,center,radius:b.radius});
  }
  if(o.userData.originalReceiveShadow===undefined)o.userData.originalReceiveShadow=o.receiveShadow;
 });
 // Freeze static transforms, including distant inactive objects. Keep the scene
 // root live so the renderer updates vehicles and effects added after this pass.
 // Item crates and moving lights also retain their automatic matrices.
 const dynamicObjects=new Set([scene,sun,sun.target]);for(const crate of crates)crate.mesh.traverse(o=>dynamicObjects.add(o));
 scene.traverse(o=>{if(!dynamicObjects.has(o)){o.matrixAutoUpdate=false;o.matrixWorldAutoUpdate=false;}});
 const setQuality=(level=0)=>{
  if(disposed)return;const quality=Math.max(0,Math.min(2,Math.round(level)));if(appliedQuality===quality)return;appliedQuality=quality;
  const profile=RENDER_PROFILES[quality];scene.fog.near=profile.fogNear;scene.fog.far=profile.fogFar;scene.environmentIntensity=quality===0?.12:quality===1?.25:.4;
  scene.background=quality===0?lowSky:sky;
  sun.castShadow=quality>0;const mapSize=quality===2?1024:512;
  if(sun.shadow.mapSize.x!==mapSize){sun.shadow.map?.dispose();sun.shadow.map=null;sun.shadow.mapSize.set(mapSize,mapSize);}sun.shadow.needsUpdate=true;
  for(const [m,original] of sourceMaterials){if(m.isMeshStandardMaterial){const bump=quality===2?original.bumpMap:null;if(m.bumpMap!==bump){m.bumpMap=bump;m.needsUpdate=true;}}}
  for(const o of qualityObjects){applyObjectQuality(o,quality);o.receiveShadow=quality>0&&o.userData.originalReceiveShadow;if(o.userData.minimumQuality!==undefined||o.userData.maximumQuality!==undefined)o.visible=quality>=(o.userData.minimumQuality??0)&&quality<=(o.userData.maximumQuality??2);}
  for(const car of carModels)setCarQuality(car,quality);
  for(const part of casters)part.mesh.castShadow=quality>0;
  clouds.visible=quality>0;
 };
 const updateVisibility=(camera,quality=appliedQuality)=>{
  if(disposed)return;setQuality(quality);const profile=RENDER_PROFILES[appliedQuality],p=camera.position;
  scene.fog.far=Math.min(profile.fogFar,camera.far*.96);scene.fog.near=Math.min(profile.fogNear,scene.fog.far*.62);
  for(const part of ranged){const dx=p.x-part.center.x,dz=p.z-part.center.z,scale=part.kind==='base'?(appliedQuality===0?.7:appliedQuality===1?.88:1):profile.detailScale;part.mesh.visible=appliedQuality>=(part.mesh.userData.minimumQuality??0)&&appliedQuality<=(part.mesh.userData.maximumQuality??2)&&dx*dx+dz*dz<(part.range*scale+part.radius)**2;}
  for(const part of casters){const dx=p.x-part.center.x,dz=p.z-part.center.z;part.mesh.castShadow=appliedQuality>0&&dx*dx+dz*dz<(profile.shadowDistance+part.radius)**2;}
  for(const tile of treeTiles){const dx=p.x-tile.userData.center.x,dz=p.z-tile.userData.center.z,d2=dx*dx+dz*dz;const close=profile.treeDistance>0&&p.y<90&&d2<profile.treeDistance**2;tile.userData.setNear(close);}
 };
 const animate=(time,reduced=false,focus=null)=>{if(!disposed)spectators.animate(time,reduced,focus,appliedQuality);};
 const dispose=()=>{if(disposed)return;disposed=true;const result=disposeScene(scene);sky.dispose();ranged.length=treeTiles.length=casters.length=qualityObjects.length=carModels.length=0;sourceMaterials.clear();return result;};
 setQuality(0);
 scene.userData.stats={...village,...landmarks.stats,groundTransitions,spectatorCount:spectators.spectatorCount,treeCount:trees,obstacleCount:obstacles.length};delete scene.userData.stats.centers;
 return {scene,sun,gate,crates,workshop,church,bakery,school,atm,courseHighlight,courseTiles,obstacles,courseProps:spectators.safety,kerbs,skid,updateVisibility,setQuality,dispose,animate,stats:scene.userData.stats};
}

export function animateCar(car,speed,steer=0,time=0,drifting=false,charge=0,dynamics=null){
 const dt=Math.max(0,Math.min(.1,time-(car.userData.lastWheelTime??time)));car.userData.lastWheelTime=time;car.userData.wheelSpin=((car.userData.wheelSpin||0)+speed*dt/(car.userData.wheelRadius||.42))%(Math.PI*2);
 for(const wheel of car.userData.wheels||[]){wheel.spinning.rotation.x=car.userData.wheelSpin;wheel.group.rotation.y=wheel.front?steer*.32:0;}
 const body=car.userData.bodyPivot;if(body){const blend=1-Math.exp(-Math.max(dt,1/120)*12);body.rotation.z+=((dynamics?.bodyRoll||0)-body.rotation.z)*blend;body.rotation.x+=((dynamics?.bodyPitch||0)-body.rotation.x)*blend;}
 const sparks=car.userData.sparks;if(sparks){sparks.visible=drifting&&speed>11;sparks.material.color.setHex(charge>.6?0xffca42:0x67d7ff);sparks.scale.z=.85+Math.sin(time*31)*.18;}
}

export function makeShowroom(){
 const scene=new THREE.Scene();scene.background=new THREE.Color(0xe7f2f2);scene.fog=new THREE.Fog(0xe7f2f2,24,65);const red=material(0xdc2635),dark=material(0x1c1d22),white=material(0xe5e2db);
 scene.add(new THREE.HemisphereLight(0xf8fcff,0xb6b0a4,2.8));const key=new THREE.DirectionalLight(0xfff2db,4.8);key.position.set(-4,8,7);scene.add(key);const rim=new THREE.DirectionalLight(0xc3e4ff,2.5);rim.position.set(5,4,-3);scene.add(rim);
 const floor=object(new THREE.PlaneGeometry(100,100),material(0xc9dedb,{roughness:.9,metalness:0}));floor.rotation.x=-Math.PI/2;scene.add(floor);
 scene.add(block(18,7,.2,white,0,3.5,-8),block(18,1.25,.23,red,0,1.35,-7.85),block(6.5,2.9,.3,dark,0,3.8,-7.76));const logo=logoBoard(5.8);logo.position.set(0,3.9,-7.58);scene.add(logo);
 for(const x of [-8,8])scene.add(block(.5,7,.5,red,x,3.5,-7.5));
 const platform=object(new THREE.CylinderGeometry(3.5,3.55,.12,80),material(0x44464a,{roughness:.52,metalness:.28}),0,.04,0);scene.add(platform);
 const ring=object(new THREE.TorusGeometry(3.47,.045,8,80),new THREE.MeshBasicMaterial({color:0xf04449}),0,.106,0);ring.rotation.x=-Math.PI/2;scene.add(ring);
 const grid=new THREE.GridHelper(36,24,0xafaaa3,0xbdb8b1);grid.position.y=.012;scene.add(grid);
 const cars=CARS.map((_,i)=>{const c=makeCar(i);c.position.set(0,.12,0);c.rotation.y=.5;c.visible=false;scene.add(c);return c;});
 return {scene,cars,dispose:()=>disposeScene(scene)};
}

