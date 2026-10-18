import * as THREE from 'three';

// Every road, ground overlay and decal is cut on the DGM grid's diagonal.
// Sampling just ribbon edges gives different planes for each road width; a
// bilinear height lookup also differs from the terrain's actual triangles.
export const SURFACE_LAYERS=Object.freeze({terrain:-.035,landuse:-.016,sidewalk:.038,asphalt:.064,paint:.074,pad:.079,padArrow:.086,oilClearance:.01});
const EPS=1e-8,VERTEX_EPS=1e-6,models=new WeakMap(),normalFields=new WeakMap();
const area=p=>p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-b[0]*a[1];},0)/2;
const valid=p=>p.length>=3&&Math.abs(area(p))>EPS;
function ccw(p){return area(p)<0?p.slice().reverse():p;}
function terrainFor(map){const t=map?.terrain;return t&&Array.isArray(t.values)&&Array.isArray(t.origin)&&t.step>0&&t.width>=2&&t.height>=2?t:null;}

export function terrainHeightAt(map,x,z){
 const t=terrainFor(map);if(!t||!Number.isFinite(x)||!Number.isFinite(z))return 0;
 const col=(x-t.origin[0])/t.step,row=(z-t.origin[1])/t.step;
 if(col<0||row<0||col>t.width-1||row>t.height-1)return 0;
 const c=Math.min(t.width-2,Math.floor(col)),r=Math.min(t.height-2,Math.floor(row)),u=col-c,v=row-r;
 const a=t.values[r*t.width+c],b=t.values[r*t.width+c+1],d=t.values[(r+1)*t.width+c],e=t.values[(r+1)*t.width+c+1];
 if(![a,b,d,e].every(Number.isFinite))return 0;
 return u+v<=1?a+(b-a)*u+(d-a)*v:e+(d-e)*(1-u)+(b-e)*(1-v);
}

function normalField(t){
 if(normalFields.has(t))return normalFields.get(t);
 // Area-weighted normals of the original DGM triangles. The position planes
 // are still exact; only their illumination is interpolated. Independent road
 // fragments therefore do not acquire a new sharp lighting edge at each cut.
 const normals=new Float32Array(t.width*t.height*3),point=i=>[(i%t.width)*t.step,t.values[i],Math.floor(i/t.width)*t.step];
 const add=(ia,ib,ic)=>{const a=point(ia),b=point(ib),c=point(ic),u=b.map((v,i)=>v-a[i]),v=c.map((n,i)=>n-a[i]),n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];for(const index of [ia,ib,ic])for(let axis=0;axis<3;axis++)normals[index*3+axis]+=n[axis];};
 for(let r=0;r<t.height-1;r++)for(let c=0;c<t.width-1;c++){const a=r*t.width+c,b=a+1,d=a+t.width,e=d+1;add(a,d,b);add(b,d,e);}
 for(let i=0;i<normals.length;i+=3){const length=Math.hypot(normals[i],normals[i+1],normals[i+2])||1;for(let axis=0;axis<3;axis++)normals[i+axis]/=length;}
 normalFields.set(t,normals);return normals;
}
export function terrainNormalAt(map,x,z,target=new THREE.Vector3()){
 const t=terrainFor(map);if(!t)return target.set(0,1,0);
 const col=(x-t.origin[0])/t.step,row=(z-t.origin[1])/t.step;if(col<0||row<0||col>t.width-1||row>t.height-1)return target.set(0,1,0);
 const c=Math.min(t.width-2,Math.floor(col)),r=Math.min(t.height-2,Math.floor(row)),u=col-c,v=row-r,a=r*t.width+c,b=a+1,d=a+t.width,e=d+1,n=normalField(t);
 const first=u+v<=1?a:e,second=u+v<=1?b:d,third=u+v<=1?d:b,w0=u+v<=1?1-u-v:u+v-1,w1=u+v<=1?u:1-u,w2=u+v<=1?v:1-v;
 return target.set(n[first*3]*w0+n[second*3]*w1+n[third*3]*w2,n[first*3+1]*w0+n[second*3+1]*w1+n[third*3+1]*w2,n[first*3+2]*w0+n[second*3+2]*w1+n[third*3+2]*w2).normalize();
}

function clipHalf(p,a,b,inside=true){
 if(!p.length)return [];const length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(length<VERTEX_EPS)return p;
 const out=[],cross=q=>((b[0]-a[0])*(q[1]-a[1])-(b[1]-a[1])*(q[0]-a[0]))/length;
 for(let i=0;i<p.length;i++){
  const q=p[i],r=p[(i+1)%p.length],dq=cross(q),dr=cross(r),iq=inside?dq>=0:dq<=0,ir=inside?dr>=0:dr<=0;
  if(iq)out.push(q);
  if(iq!==ir){const f=dq/(dq-dr);out.push([q[0]+(r[0]-q[0])*f,q[1]+(r[1]-q[1])*f]);}
 }
 const clean=[];for(const q of out)if(!clean.length||Math.hypot(q[0]-clean.at(-1)[0],q[1]-clean.at(-1)[1])>VERTEX_EPS)clean.push(q);
 if(clean.length>1&&Math.hypot(clean[0][0]-clean.at(-1)[0],clean[0][1]-clean.at(-1)[1])<=VERTEX_EPS)clean.pop();
 return clean;
}
function intersection(p,mask){let result=p;for(let i=0;i<mask.length&&result.length;i++)result=clipHalf(result,mask[i],mask[(i+1)%mask.length]);return valid(result)?result:[];}
function difference(p,mask){
 // Adjacent ribbons and grid cuts touch frequently. Splitting a polygon on
 // every *extended* mask edge, despite no actual overlap, explodes the mesh.
 if(!intersection(p,mask).length)return [p];
 let remainder=p;const result=[];
 for(let i=0;i<mask.length&&valid(remainder);i++){
  const outside=clipHalf(remainder,mask[i],mask[(i+1)%mask.length],false);if(valid(outside))result.push(outside);
  remainder=clipHalf(remainder,mask[i],mask[(i+1)%mask.length]);
 }
 return result;
}
function union(polygons){
 const accepted=[];
 for(const polygon of polygons){let fresh=[polygon];for(const previous of accepted){fresh=fresh.flatMap(p=>difference(p,previous));if(!fresh.length)break;}accepted.push(...fresh);}
 return accepted;
}
function subtract(polygons,masks){let result=polygons;for(const mask of masks){result=result.flatMap(p=>difference(p,mask));if(!result.length)break;}return result;}
function pointInside(polygon,x,z){for(let i=0;i<polygon.length;i++){const a=polygon[i],b=polygon[(i+1)%polygon.length],length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(length<VERTEX_EPS)continue;if(((b[0]-a[0])*(z-a[1])-(b[1]-a[1])*(x-a[0]))/length<-.000001)return false;}return true;}

// The contour is the existing measured street ribbon, including its joins.
// Closed routes share the first and last cross-section to avoid a start seam.
export function ribbonPolygons(points,width){
 if(points.length<2)return [];const closed=Math.hypot(points[0][0]-points.at(-1)[0],points[0][1]-points.at(-1)[1])<.00001,edges=[];
 for(let i=0;i<points.length;i++){
  const prev=points[i?i-1:closed?points.length-2:0],next=points[i<points.length-1?i+1:closed?1:i],p=points[i];
  const dx=next[0]-prev[0],dz=next[1]-prev[1],scale=width/(2*(Math.hypot(dx,dz)||1));edges.push([[p[0]-dz*scale,p[1]+dx*scale],[p[0]+dz*scale,p[1]-dx*scale]]);
 }
 const result=[];for(let i=0;i<edges.length-1;i++){const [a,b]=edges[i],[c,d]=edges[i+1];for(const triangle of [[a,c,b],[b,c,d]])if(valid(triangle))result.push(ccw(triangle));}return result;
}

function cellsFor(map,polygons){
 const t=terrainFor(map),cells=new Map();
 const add=(key,polygon)=>{if(!valid(polygon))return;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(ccw(polygon));};
 for(const polygon of polygons){
  if(!valid(polygon))continue;if(!t){add('flat',polygon);continue;}
  const xs=polygon.map(p=>p[0]),zs=polygon.map(p=>p[1]),minC=Math.max(0,Math.floor((Math.min(...xs)-t.origin[0])/t.step)),maxC=Math.min(t.width-2,Math.floor((Math.max(...xs)-t.origin[0])/t.step)),minR=Math.max(0,Math.floor((Math.min(...zs)-t.origin[1])/t.step)),maxR=Math.min(t.height-2,Math.floor((Math.max(...zs)-t.origin[1])/t.step));
  for(let r=minR;r<=maxR;r++)for(let c=minC;c<=maxC;c++){
   const x=t.origin[0]+c*t.step,z=t.origin[1]+r*t.step,a=[x,z],b=[x+t.step,z],d=[x,z+t.step],e=[x+t.step,z+t.step];
   add(c+','+r+',0',intersection(polygon,[a,b,d]));add(c+','+r+',1',intersection(polygon,[b,e,d]));
  }
 }
 return cells;
}
function unionCells(cells){const result=new Map();for(const [key,polygons] of cells){const combined=union(polygons);if(combined.length)result.set(key,combined);}return result;}
function mergeCells(...sets){const result=new Map();for(const cells of sets)for(const [key,polygons] of cells){if(!result.has(key))result.set(key,[]);result.get(key).push(...polygons);}return result;}
function subtractCells(cells,...masks){const result=new Map();for(const [key,polygons] of cells){const remainder=subtract(polygons,masks.flatMap(mask=>mask.get(key)||[]));if(remainder.length)result.set(key,remainder);}return result;}
function modelFor(map){
 if(models.has(map))return models.get(map);
 const course=unionCells(cellsFor(map,ribbonPolygons(map.route||[],10))),background=unionCells(cellsFor(map,(map.roads||[]).flatMap(r=>ribbonPolygons(r.points,r.width)))),asphalt=unionCells(mergeCells(course,background));
 const courseOuter=unionCells(cellsFor(map,ribbonPolygons(map.route||[],13))),backgroundOuter=unionCells(cellsFor(map,(map.roads||[]).filter(r=>r.type!=='service').flatMap(r=>ribbonPolygons(r.points,r.width+2.8))));
 const courseSidewalk=subtractCells(courseOuter,asphalt),backgroundSidewalk=subtractCells(backgroundOuter,asphalt,courseOuter);
 const result={course,background:subtractCells(background,course),courseSidewalk,backgroundSidewalk,asphalt,sidewalk:mergeCells(courseSidewalk,backgroundSidewalk),landuse:new Map(),overlays:new Map()};models.set(map,result);return result;
}

function geometryFor(map,cells,offset){
 const positions=[],uv=[];for(const polygons of cells.values())for(const polygon of polygons){const p=ccw(polygon);for(let i=1;i<p.length-1;i++){
  const triangle=[p[0],p[i+1],p[i]],twiceArea=Math.abs((triangle[1][0]-triangle[0][0])*(triangle[2][1]-triangle[0][1])-(triangle[1][1]-triangle[0][1])*(triangle[2][0]-triangle[0][0])),longest=Math.max(...triangle.map((a,j)=>Math.hypot(a[0]-triangle[(j+1)%3][0],a[1]-triangle[(j+1)%3][1])));
  // Sub-20-micrometre clipping slivers are below the float32 coordinate
  // precision of this metre-based village. Drop them before they can flip
  // winding or overlap a neighbouring edge after conversion to GPU buffers.
  if(twiceArea<longest*.00002)continue;
  for(const [x,z] of triangle){positions.push(x,terrainHeightAt(map,x,z)+offset,z);uv.push(x,z);}
 }}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
 const normals=new Float32Array(positions.length),normal=new THREE.Vector3();for(let i=0;i<positions.length;i+=3){terrainNormalAt(map,positions[i],positions[i+2],normal);normals[i]=normal.x;normals[i+1]=normal.y;normals[i+2]=normal.z;}g.setAttribute('normal',new THREE.BufferAttribute(normals,3));g.computeBoundingSphere();return g;
}
export function roadSurfaceGeometries(map){const model=modelFor(map);return Object.fromEntries(['course','background','courseSidewalk','backgroundSidewalk'].map(key=>[key,geometryFor(map,model[key],key.includes('Sidewalk')?SURFACE_LAYERS.sidewalk:SURFACE_LAYERS.asphalt)]));}
function registerOverlay(map,cells,offset){
 const overlays=modelFor(map).overlays;for(const [key,polygons] of cells){if(!overlays.has(key))overlays.set(key,[]);const patches=overlays.get(key);for(const polygon of polygons)patches.push({polygon,offset});patches.sort((a,b)=>b.offset-a.offset);}
}
export function resetDrivingOverlays(map){modelFor(map).overlays.clear();}
export function drapedPolygonGeometry(map,points,offset=SURFACE_LAYERS.landuse,{excludeRoads=false,drivingSurface=false}={}){
 const vectors=points.map(p=>new THREE.Vector2(...p)),polygons=THREE.ShapeUtils.triangulateShape(vectors,[]).map(indices=>ccw(indices.map(i=>points[i])));let cells=cellsFor(map,polygons);
 if(excludeRoads){const model=modelFor(map);cells=subtractCells(cells,model.asphalt,model.sidewalk);}
 if(drivingSurface)registerOverlay(map,cells,offset);
 return geometryFor(map,cells,offset);
}
export function landUseSurfaceGeometries(map){
 const priority={forest:1,meadow:2,grass:3,farmland:4,park:5,cemetery:6,playground:7,pitch:8},model=modelFor(map),occupied=new Map(),result=[];
 // OSM land-use polygons can overlap (a park within a meadow, for example).
 // Keep a single visible semantic surface rather than coplanar coloured decks.
 for(const area of [...(map.landAreas||[])].sort((a,b)=>(priority[b.kind]||0)-(priority[a.kind]||0))){
  const vectors=area.points.map(p=>new THREE.Vector2(...p)),polygons=THREE.ShapeUtils.triangulateShape(vectors,[]).map(indices=>ccw(indices.map(i=>area.points[i]))),raw=cellsFor(map,polygons),cells=subtractCells(raw,model.asphalt,model.sidewalk,occupied);
  for(const [key,parts] of cells){if(!occupied.has(key))occupied.set(key,[]);occupied.get(key).push(...parts);}
  result.push({area,geometry:geometryFor(map,cells,SURFACE_LAYERS.landuse)});
 }
 model.landuse=occupied;return result;
}
export function drapedRibbonGeometry(map,points,width,offset){return geometryFor(map,cellsFor(map,ribbonPolygons(points,width)),offset);}
export function drapedRingGeometry(map,center,inner,outer,offset,segments=64,{drivingSurface=false}={}){
 const polygons=[];for(let i=0;i<segments;i++){const a=i*Math.PI*2/segments,b=(i+1)*Math.PI*2/segments,point=(r,t)=>[center[0]+Math.cos(t)*r,center[1]+Math.sin(t)*r],p=point(inner,a),q=point(outer,a),r=point(inner,b),s=point(outer,b);polygons.push(ccw([p,q,r]),ccw([q,s,r]));}
 const cells=cellsFor(map,polygons);if(drivingSurface)registerOverlay(map,cells,offset);return geometryFor(map,cells,offset);
}
function cellKey(map,x,z){const t=terrainFor(map);if(!t)return 'flat';const c=Math.min(t.width-2,Math.floor((x-t.origin[0])/t.step)),r=Math.min(t.height-2,Math.floor((z-t.origin[1])/t.step)),u=(x-t.origin[0])/t.step-c,v=(z-t.origin[1])/t.step-r;return c+','+r+','+(u+v<=1?0:1);}
export function surfaceHeightAt(map,x,z){
 const model=modelFor(map),key=cellKey(map,x,z);let offset=SURFACE_LAYERS.terrain;
 if((model.asphalt.get(key)||[]).some(p=>pointInside(p,x,z)))offset=SURFACE_LAYERS.asphalt;
 else if((model.sidewalk.get(key)||[]).some(p=>pointInside(p,x,z)))offset=SURFACE_LAYERS.sidewalk;
 else if((model.landuse.get(key)||[]).some(p=>pointInside(p,x,z)))offset=SURFACE_LAYERS.landuse;
 for(const patch of model.overlays.get(key)||[]){if(patch.offset<=offset)break;if(pointInside(patch.polygon,x,z)){offset=patch.offset;break;}}
 return terrainHeightAt(map,x,z)+offset;
}
export function makeOilDecal(map,x,z,radius=2.2){
 const points=Array.from({length:32},(_,i)=>{const a=i*Math.PI/16;return [x+Math.cos(a)*radius,z+Math.sin(a)*radius];});
 const vectors=points.map(p=>new THREE.Vector2(...p)),polygons=THREE.ShapeUtils.triangulateShape(vectors,[]).map(indices=>ccw(indices.map(i=>points[i]))),cells=cellsFor(map,polygons),model=modelFor(map),parts=[];
 for(const [key,polygons] of cells){
  let remaining=polygons;
  const layers=[...(model.overlays.get(key)||[]),...(model.asphalt.get(key)||[]).map(polygon=>({polygon,offset:SURFACE_LAYERS.asphalt})),...(model.sidewalk.get(key)||[]).map(polygon=>({polygon,offset:SURFACE_LAYERS.sidewalk})),...(model.landuse.get(key)||[]).map(polygon=>({polygon,offset:SURFACE_LAYERS.landuse}))].sort((a,b)=>b.offset-a.offset);
  for(const {polygon:mask,offset} of layers){
   const covered=[];for(const p of remaining){const overlap=intersection(p,mask);if(overlap.length)covered.push(overlap);}
   if(covered.length)parts.push(geometryFor(map,new Map([[key,covered]]),offset+SURFACE_LAYERS.oilClearance));remaining=subtract(remaining,[mask]);if(!remaining.length)break;
  }
  if(remaining.length)parts.push(geometryFor(map,new Map([[key,remaining]]),SURFACE_LAYERS.terrain+SURFACE_LAYERS.oilClearance));
 }
 // One draw call per oil item, even when the splash crosses a curb, start paint
 // or grid diagonal. Preserve depth testing against tyres, cars and buildings.
 const positions=[],uv=[];for(const part of parts){positions.push(...part.attributes.position.array);uv.push(...part.attributes.uv.array);part.dispose();}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.computeVertexNormals();geometry.computeBoundingSphere();geometry.translate(-x,0,-z);
 const material=new THREE.MeshBasicMaterial({color:0x111a20,transparent:true,opacity:.86,depthWrite:false,depthTest:true,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
 const mesh=new THREE.Mesh(geometry,material);mesh.name='race:oil';mesh.position.set(x,0,z);mesh.renderOrder=2;mesh.castShadow=false;mesh.receiveShadow=false;return mesh;
}
