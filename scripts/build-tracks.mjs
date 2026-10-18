import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const round=(n,d=6)=>Number(n.toFixed(d));
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const key=p=>p.join(',');
const edgeKey=(a,b)=>[key(a),key(b)].sort().join('|');
const pointSegment=(p,a,b)=>{
 const dx=b[0]-a[0],dz=b[1]-a[1],d=dx*dx+dz*dz;
 const t=d?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/d)):0;
 const q=[a[0]+dx*t,a[1]+dz*t];return {point:q,distance:dist(p,q),t};
};
const polygonCenter=points=>points.reduce((a,p)=>[a[0]+p[0]/points.length,a[1]+p[1]/points.length],[0,0]);
const DRIVABLE=new Set(['primary','secondary','tertiary','residential','unclassified','living_street']);

export const TRACK_DEFINITIONS=[
 {id:'lammersdorf',name:'Lammersdorf Klassiker',description:'Vor Breuer starten, am Café durch den Kreisel und über den Johannesweg zurück.',difficulty:'Mittel',via:[-99.337,-323.941],accent:'#e83342'},
 {id:'bahnhof',name:'Bahnhof-Runde',description:'Längere Geraden entlang der Bahnhofstraße, danach durch Im Pohl und den Dorfkreisel.',difficulty:'Einfach',via:[-299.501,-500.439],accent:'#f3bb38'},
 {id:'kraemer',name:'Krämer-Kurven',description:'Kirchgasse und Krämerstraße verbinden enge Dorfkurven mit dem gesamten Klassiker.',difficulty:'Schwer',via:[189.707,39.919],accent:'#3cab95'}
];

export function makeGraph(source){
 const graph=new Map();
 const add=(a,b,road)=>{const k=key(a);if(!graph.has(k))graph.set(k,[]);graph.get(k).push({from:a,to:b,distance:dist(a,b),roadId:road.id,name:road.name,junction:road.junction});};
 let nearest={distance:Infinity};
 for(const road of source.roads.filter(r=>DRIVABLE.has(r.type))){
  for(let i=0;i<road.points.length-1;i++){
   const a=road.points[i],b=road.points[i+1],projection=pointSegment(source.start,a,b);
   if(projection.distance<nearest.distance)nearest={...projection,a,b,road};
  }
 }
 if(nearest.distance>.1)throw new Error('The Breuer start must lie on an existing mapped road.');
 const start=nearest.point.map(n=>round(n));
 for(const road of source.roads.filter(r=>DRIVABLE.has(r.type))){
  for(let i=0;i<road.points.length-1;i++){
   const a=road.points[i],b=road.points[i+1];
   // Split only the existing street segment containing the start. No connector is fabricated.
   if(edgeKey(a,b)===edgeKey(nearest.a,nearest.b)){
    if(dist(a,start)>.00001){add(a,start,road);add(start,a,road);}
    if(dist(start,b)>.00001){add(start,b,road);add(b,start,road);}
   }else if(dist(a,b)>.00001){add(a,b,road);add(b,a,road);}
  }
 }
 return {graph,start};
}

function shortestPath(graph,start,end,forbidden=new Set()){
 const costs=new Map([[key(start),0]]),previous=new Map(),queue=[{node:start,cost:0}];
 while(queue.length){
  queue.sort((a,b)=>b.cost-a.cost);const current=queue.pop(),k=key(current.node);
  if(current.cost!==costs.get(k))continue;
  if(k===key(end)){
   const edges=[];let at=k;while(at!==key(start)){const edge=previous.get(at);if(!edge)throw new Error('Incomplete OSM graph path.');edges.push(edge);at=key(edge.from);}return edges.reverse();
  }
  for(const edge of graph.get(k)||[]){
   if(forbidden.has(edgeKey(edge.from,edge.to)))continue;
   const next=key(edge.to),cost=current.cost+edge.distance;
   if(cost<(costs.get(next)??Infinity)){costs.set(next,cost);previous.set(next,edge);queue.push({node:edge.to,cost});}
  }
 }
 throw new Error('No closed route exists within the original street network.');
}

function samplePath(points,maxSpacing=3){
 const route=[points[0].map(n=>round(n))];
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],count=Math.ceil(dist(a,b)/maxSpacing);
  for(let n=1;n<=count;n++)route.push([round(a[0]+(b[0]-a[0])*n/count),round(a[1]+(b[1]-a[1])*n/count)]);
 }
 return route;
}

function routeDistance(route,p){
 let best=Infinity;for(let i=1;i<route.length;i++)best=Math.min(best,pointSegment(p,route[i-1],route[i]).distance);return best;
}

function nearRoute(points,route,radius){
 if(points.some(p=>routeDistance(route,p)<=radius))return true;
 const center=polygonCenter(points);
 // Large grounds are kept if the course passes their envelope, even with remote vertices.
 const extent=Math.max(...points.map(p=>dist(p,center)));
 return routeDistance(route,center)<=Math.min(extent,65)+radius;
}

function compactRoads(roads,route,radius=95){
 const result=[];
 for(const road of roads){
  let points=[];
  for(let i=1;i<road.points.length;i++){
   const a=road.points[i-1],b=road.points[i],middle=[(a[0]+b[0])/2,(a[1]+b[1])/2];
   const near=Math.min(routeDistance(route,a),routeDistance(route,b),routeDistance(route,middle))<=radius;
   if(near){if(!points.length)points.push(a);points.push(b);}
   else if(points.length){result.push({...road,points});points=[];}
  }
  if(points.length)result.push({...road,points});
 }
 return result;
}

const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0,12);

export function sampleTerrain(terrain,x,z){
 if(!terrain||!Array.isArray(terrain.values)||!Array.isArray(terrain.origin)||!(terrain.step>0)||terrain.width<2||terrain.height<2||!Number.isFinite(x)||!Number.isFinite(z))return 0;
 const col=(x-terrain.origin[0])/terrain.step,row=(z-terrain.origin[1])/terrain.step;
 if(col<0||row<0||col>terrain.width-1||row>terrain.height-1)return 0;
 const c=Math.min(terrain.width-2,Math.floor(col)),r=Math.min(terrain.height-2,Math.floor(row)),fx=col-c,fz=row-r;
 const a=terrain.values[r*terrain.width+c],b=terrain.values[r*terrain.width+c+1],d=terrain.values[(r+1)*terrain.width+c],e=terrain.values[(r+1)*terrain.width+c+1];
 if(!Number.isFinite(a)||!Number.isFinite(b)||!Number.isFinite(d)||!Number.isFinite(e))return 0;
 return (a*(1-fx)+b*fx)*(1-fz)+(d*(1-fx)+e*fx)*fz;
}

export function generateTrackData(source,enrichment=null){
 const {graph,start}=makeGraph(source),tracks=[];
 const school=source.buildings.find(b=>b.id===93722360);
 const pois=source.pois.map(p=>p.id==='school'&&school?{...p,buildingId:school.id,osmAreaId:p.osmAreaId,point:polygonCenter(school.points).map(n=>round(n)),footprintSource:'OSM building way 93722360'}:p);
 const mandatory=new Set(pois.filter(p=>['breuer','church','bakery','atm','school'].includes(p.id)).map(p=>p.buildingId).filter(Boolean));
 const enrichedBuildings=source.buildings.map(b=>{
  const measured=enrichment?.buildings?.find(m=>m.osmId===b.id);
  return measured?{...b,height:measured.wallHeight,geodata:measured}:b;
 });
 for(const definition of TRACK_DEFINITIONS){
  const outward=shortestPath(graph,start,definition.via),forbidden=new Set(outward.map(e=>edgeKey(e.from,e.to)));
  const returning=shortestPath(graph,definition.via,start,forbidden),edges=[...outward,...returning];
  const vertices=[start,...edges.map(e=>e.to)],route=samplePath(vertices),length=round(route.slice(1).reduce((sum,p,i)=>sum+dist(p,route[i]),0));
  const streets=[...new Set(edges.map(e=>e.name).filter(Boolean))];
  const buildings=enrichedBuildings.filter(b=>mandatory.has(b.id)||nearRoute(b.points,route,68));
  const landAreas=source.landAreas.filter(a=>nearRoute(a.points,route,140));
  const preview=route.filter((_,i)=>i%8===0||i===route.length-1);
  const version='1-'+hash({route,roadIds:edges.map(e=>e.roadId)});
  const elevation=route.map(p=>sampleTerrain(enrichment?.terrain,p[0],p[1]));
  const terrainRange={min:round(Math.min(...elevation),2),max:round(Math.max(...elevation),2)};
  tracks.push({meta:{id:definition.id,name:definition.name,description:definition.description,difficulty:definition.difficulty,accent:definition.accent,length,version,streets,preview,terrainRange},
   data:{trackId:definition.id,trackVersion:version,route,start,routeLength:length,routeNames:streets,routeRoadIds:[...new Set(edges.map(e=>e.roadId))],routeVertices:vertices,buildingIds:buildings.map(b=>b.id),landAreaIds:landAreas.map(a=>a.id),roads:compactRoads(source.roads,route),corridorRadius:68,terrainRange}});
 }
 const buildingIds=new Set(tracks.flatMap(t=>t.data.buildingIds)),areaIds=new Set(tracks.flatMap(t=>t.data.landAreaIds));
 const base={origin:source.origin,workshop:source.workshop,source:source.source,fetched:source.fetched,pois,roundabout:source.roundabout,
  visualAccuracy:{...source.visualAccuracy,roads:'Closed paths on original OSM centerlines; no artificial street connections',heights:enrichment?'Matched NRW LoD2 heights where available; other heights remain approximate':'Approximate; not a measured digital twin'},
  buildings:enrichedBuildings.filter(b=>buildingIds.has(b.id)),landAreas:source.landAreas.filter(a=>areaIds.has(a.id)),trees:source.trees,
  ...(enrichment?.terrain?{terrain:enrichment.terrain}:{}),geodataSources:enrichment?.sources||[]};
 const worldVersion='1-'+hash(base);
 return {tracks,base,worldVersion};
}

const loaderSource=(metadata,worldVersion)=>`// Generated from original OSM street edges by scripts/build-tracks.mjs.
// This module is safe for server imports: it has no DOM, Three.js or large JSON imports.
export const WORLD_VERSION=${JSON.stringify(worldVersion)};
function freezeMetadata(value){if(value&&typeof value==='object'){Object.values(value).forEach(freezeMetadata);Object.freeze(value);}return value;}
export const TRACKS=freezeMetadata(${JSON.stringify(metadata)});
${sampleTerrain.toString()}
export function sampleGround(map,x,z){return sampleTerrain(map?.terrain,x,z);}
const dataCache=new Map();
async function readData(url,signal){
 const cacheable=!signal;
 if(cacheable&&dataCache.has(url))return dataCache.get(url);
 const request=fetch(url,{signal}).then(async response=>{
  if(!response.ok)throw new Error('Die Streckendaten konnten nicht geladen werden ('+response.status+').');
  return response.json();
 });
 if(cacheable){dataCache.set(url,request);request.catch(()=>dataCache.delete(url));}
 return request;
}
export async function loadTrack(id='lammersdorf',{signal,baseUrl='/tracks/'}={}){
 const meta=TRACKS.find(track=>track.id===id);
 if(!meta)throw new Error('Unbekannte Strecke: '+id);
 const base=baseUrl.replace(/\\/?$/,'/');
 const [world,course]=await Promise.all([
  readData(base+'base.json?v='+WORLD_VERSION,signal),
  readData(base+id+'.json?v='+meta.version,signal)
 ]);
 if(course.trackId!==id||course.trackVersion!==meta.version)throw new Error('Die Strecke wurde aktualisiert. Bitte lade das Spiel neu.');
 const buildings=new Set(course.buildingIds),areas=new Set(course.landAreaIds);
 const map={...world,...course,buildings:world.buildings.filter(b=>buildings.has(b.id)),landAreas:world.landAreas.filter(a=>areas.has(a.id)),trackMeta:meta};
 return typeof structuredClone==='function'?structuredClone(map):JSON.parse(JSON.stringify(map));
}
`;

export async function buildTracks(){
 const source=JSON.parse(await readFile(path.join(ROOT,'src/map.json'),'utf8'));
 let enrichment=null;try{enrichment=JSON.parse(await readFile(path.join(ROOT,'src/tracks/nrw-enrichment.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
 const result=generateTrackData(source,enrichment),directory=path.join(ROOT,'src/tracks');await mkdir(directory,{recursive:true});
 await writeFile(path.join(directory,'base.json'),JSON.stringify(result.base));
 for(const track of result.tracks)await writeFile(path.join(directory,track.meta.id+'.json'),JSON.stringify(track.data));
 await writeFile(path.join(ROOT,'src/tracks.js'),loaderSource(result.tracks.map(t=>t.meta),result.worldVersion));
 for(const track of result.tracks)console.log(`${track.meta.id}: ${track.meta.length}m; ${track.data.buildingIds.length} buildings; ${track.meta.version}`);
 console.log(`Shared corridor: ${result.base.buildings.length} buildings (was ${source.buildings.length}); ${JSON.stringify(result.base).length} bytes.`);
 return result;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await buildTracks();
