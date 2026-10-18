import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {generateTrackData} from './build-tracks.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const SOURCE_URL='https://ogc-api.nrw.de/3dg/v1/collections/building/items?f=cityjson&bbox=6.2700,50.6290,6.2835,50.6365&limit=1000';
const round=(n,d=3)=>Number(n.toFixed(d));
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const flatIndices=values=>Array.isArray(values)?(typeof values[0]==='number'?values:values.flatMap(flatIndices)):[];
const polygonArea=ring=>Math.abs(ring.reduce((a,p,i)=>{const q=ring[(i+1)%ring.length];return a+p[0]*q[1]-q[0]*p[1];},0)/2);
function center(ring){
 let sum=0,x=0,z=0;
 for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length],s=a[0]*b[1]-b[0]*a[1];sum+=s;x+=(a[0]+b[0])*s;z+=(a[1]+b[1])*s;}
 return Math.abs(sum)>.00001?[x/(3*sum),z/(3*sum)]:ring.reduce((a,p)=>[a[0]+p[0]/ring.length,a[1]+p[1]/ring.length],[0,0]);
}
function inside(p,ring){
 let hit=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const a=ring[i],b=ring[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])hit=!hit;
 }return hit;
}
const bounds=ring=>[Math.min(...ring.map(p=>p[0])),Math.min(...ring.map(p=>p[1])),Math.max(...ring.map(p=>p[0])),Math.max(...ring.map(p=>p[1]))];
function overlap(a,b){
 const aa=bounds(a),bb=bounds(b),xmin=Math.min(aa[0],bb[0]),zmin=Math.min(aa[1],bb[1]),xmax=Math.max(aa[2],bb[2]),zmax=Math.max(aa[3],bb[3]);
 if(aa[0]>bb[2]||aa[2]<bb[0]||aa[1]>bb[3]||aa[3]<bb[1])return 0;
 // Conservative matching only; the exported polygons themselves remain the original measured data.
 let intersection=0,union=0;const n=22;
 for(let row=0;row<n;row++)for(let col=0;col<n;col++){
  const p=[xmin+(col+.5)*(xmax-xmin)/n,zmin+(row+.5)*(zmax-zmin)/n],ia=inside(p,a),ib=inside(p,b);
  if(ia||ib)union++;if(ia&&ib)intersection++;
 }return union?intersection/union:0;
}

export function parseCityJSON(json,origin){
 if(json.type!=='CityJSON'||!json.transform||!json.CityObjects)throw new Error('Expected transformed NRW CityJSON LoD2.');
 const scale=json.transform.scale,offset=json.transform.translate,[lat,lon]=origin,mx=111320*Math.cos(lat*Math.PI/180),mz=111320;
 const vertices=json.vertices.map(v=>[(v[0]*scale[0]+offset[0]-lon)*mx,-(v[1]*scale[1]+offset[1]-lat)*mz,v[2]*scale[2]+offset[2]]);
 const features=[];
 for(const [id,building] of Object.entries(json.CityObjects)){
  if(building.type!=='Building')continue;
  const objects=[building,...(building.children||[]).map(child=>json.CityObjects[child]).filter(Boolean)],parts=[],faces=[];
  for(const object of objects){
   const ownFaces=[];
   for(const geometry of object.geometry||[]){
    if(geometry.type!=='Solid')continue;
    for(let shell=0;shell<geometry.boundaries.length;shell++)for(let face=0;face<geometry.boundaries[shell].length;face++){
     const type=geometry.semantics?.surfaces?.[geometry.semantics.values?.[shell]?.[face]]?.type||'UnknownSurface';
     for(const ring of geometry.boundaries[shell][face]){
      const points=ring.map(index=>vertices[index]);if(points.length<3)continue;
      const clean=points.length>3&&distance(points[0],points.at(-1))<.000001&&Math.abs(points[0][2]-points.at(-1)[2])<.000001?points.slice(0,-1):points;
      if(clean.length>=3){const value={type,points:clean};ownFaces.push(value);faces.push(value);}
     }
    }
   }
   if(ownFaces.length){
    const points=ownFaces.flatMap(face=>face.points),ground=Math.min(...points.map(p=>p[2])),top=Math.max(...points.map(p=>p[2]));
    const roofs=ownFaces.filter(f=>f.type==='RoofSurface').flatMap(f=>f.points),rings=ownFaces.filter(f=>f.type==='GroundSurface').map(f=>f.points.map(p=>p.slice(0,2)));
    parts.push({height:object.attributes?.measuredHeight??top-ground,roofType:object.attributes?.roofType||'9999',groundElevation:ground,roofBase:roofs.length?Math.min(...roofs.map(p=>p[2])):top,area:rings.reduce((a,r)=>a+polygonArea(r),0)});
   }
  }
  if(!faces.length)continue;
  const groundRings=faces.filter(f=>f.type==='GroundSurface').map(f=>f.points.map(p=>p.slice(0,2)));
  if(!groundRings.length)continue;
  const dominant=groundRings.reduce((best,ring)=>polygonArea(ring)>polygonArea(best)?ring:best,groundRings[0]);
  const all=faces.flatMap(f=>f.points),groundElevation=Math.min(...all.map(p=>p[2])),height=Math.max(...all.map(p=>p[2]))-groundElevation;
  const main=parts.reduce((best,part)=>part.area>best.area?part:best,parts[0]);
  features.push({id,addresses:building.address||[],center:center(dominant),groundRings,faces,parts,groundElevation,height,
   roofType:building.attributes?.roofType||main.roofType,wallHeight:Math.max(.4,Math.min(height,main.roofBase-groundElevation)),created:building.attributes?.creationDate,externalId:building.attributes?.externalReferences?.[0]?.name});
 }
 return features;
}

const knownAddresses=new Map([[93722360,{street:'Im Pohl',numbers:['7']}],[93722395,{street:'Kirchstraße',numbers:['27','27a']}],[93722401,{street:'Kirchstraße',numbers:['35']}],[93699138,{street:'Kirchstraße',numbers:['40']}]]);
const normalize=v=>String(v||'').trim().toLocaleLowerCase('de').replace(/\s+/g,'');
function matchingAddress(building,feature){
 const expected=knownAddresses.get(building.id)||{street:building.tags?.['addr:street'],numbers:String(building.tags?.['addr:housenumber']||'').split(',')};
 return Boolean(expected.street&&expected.numbers.length&&feature.addresses.some(a=>normalize(a.ThoroughfareName)===normalize(expected.street)&&expected.numbers.map(normalize).includes(normalize(a.ThoroughfareNumber))));
}

export function matchBuildings(buildings,features){
 const matches=[];
 for(const building of buildings){
  const centroid=center(building.points),candidates=features.filter(f=>distance(f.center,centroid)<65).map(feature=>{
   const agreement=Math.max(...feature.groundRings.map(ring=>overlap(building.points,ring))),address=matchingAddress(building,feature);
   return {feature,agreement,address,score:agreement+(address?2:0)};
  }).filter(c=>(c.address&&c.agreement>.1)||c.agreement>.45).sort((a,b)=>b.score-a.score);
  const best=candidates[0];if(!best)continue;
  const {feature}=best,landmark=knownAddresses.has(building.id);
  const convertFace=face=>face.points.map(p=>[round(p[0]),round(p[2]-feature.groundElevation),round(p[1])]);
  matches.push({osmId:building.id,nrwId:feature.id,externalId:feature.externalId,source:'Geobasis NRW LoD2 / OGC API',retrieved:'2026-10-08',dataCreated:feature.created,
   matchedBy:best.address?'address-and-footprint':'footprint-overlap',footprintAgreement:round(best.agreement),height:round(feature.height),wallHeight:round(feature.wallHeight),
   groundElevation:round(feature.groundElevation),roofType:feature.roofType,parts:feature.parts.map(p=>({height:round(p.height),roofType:p.roofType,groundElevation:round(p.groundElevation),area:round(p.area)})),
   roofSurfaces:feature.faces.filter(f=>f.type==='RoofSurface').map(convertFace),...(landmark?{wallSurfaces:feature.faces.filter(f=>f.type==='WallSurface').map(convertFace)}:{}),
   groundRings:feature.groundRings.map(ring=>ring.map(p=>p.map(n=>round(n))))});
 }
 return matches;
}

function terrainRelative(input){
 if(!Array.isArray(input.absoluteValues)||input.absoluteValues.length!==input.width*input.height||input.absoluteValues.some(n=>!Number.isFinite(n)||n<400||n>700))throw new Error('Invalid DGM values; refusing fabricated terrain.');
 const sample=(x,z)=>{
  const col=(x-input.origin[0])/input.step,row=(z-input.origin[1])/input.step,c=Math.floor(col),r=Math.floor(row),fx=col-c,fz=row-r;
  const a=input.absoluteValues[r*input.width+c],b=input.absoluteValues[r*input.width+c+1],d=input.absoluteValues[(r+1)*input.width+c],e=input.absoluteValues[(r+1)*input.width+c+1];
  return (a*(1-fx)+b*fx)*(1-fz)+(d*(1-fx)+e*fx)*fz;
 };
 const baseElevation=round(sample(0,0));
 const values=input.absoluteValues.map(n=>round(n-baseElevation,2));
 return {origin:input.origin,step:input.step,width:input.width,height:input.height,values,baseElevation,min:Math.min(...values),max:Math.max(...values),
  source:'Geobasis NRW DGM1, WCS bilinear resampling to 10 m',sourceUrl:input.source,retrieved:input.retrieved,verticalReference:'DHHN2016',axisOrder:'row-major; x east, z south; y relative to Breuer'};
}

function downloadCityJSON(){
 const program="import urllib.request,sys\nwith urllib.request.urlopen(sys.argv[1],timeout=30) as r: sys.stdout.buffer.write(r.read())";
 const result=spawnSync('python',['-c',program,SOURCE_URL],{maxBuffer:20*1024*1024,encoding:'utf8',timeout:35000});
 if(result.status!==0)throw new Error('NRW CityJSON download failed: '+(result.stderr||result.error?.message||result.status));return JSON.parse(result.stdout);
}

function downloadTerrain(){
 const program=`import urllib.request,urllib.parse,json,math,sys,io,datetime
from PIL import Image
lat,lon=50.63067,6.27689
mx=111320*math.cos(math.radians(lat));mz=111320
bbox=[lon-425/mx,lat-165/mz,lon+425/mx,lat+645/mz]
parameters={'SERVICE':'WCS','VERSION':'1.0.0','REQUEST':'GetCoverage','COVERAGE':'nw_dgm','CRS':'EPSG:4326','RESPONSE_CRS':'EPSG:4326','BBOX':','.join(map(str,bbox)),'WIDTH':85,'HEIGHT':81,'FORMAT':'image/tiff','INTERPOLATION':'BILINEAR'}
url='https://www.wcs.nrw.de/geobasis/wcs_nw_dgm?'+urllib.parse.urlencode(parameters)
with urllib.request.urlopen(url,timeout=30) as response: data=response.read()
image=Image.open(io.BytesIO(data))
if image.size!=(85,81) or image.mode!='F': raise ValueError('Expected a genuine single-channel Float32 DGM raster')
pixels=list(image.get_flattened_data() if hasattr(image,'get_flattened_data') else image.getdata())
json.dump({'origin':[-420,-640],'step':10,'width':85,'height':81,'absoluteValues':[round(float(value),3) for value in pixels],'retrieved':datetime.date.today().isoformat(),'source':url,'crs':'EPSG:4326'},sys.stdout)
`;
 const result=spawnSync('python',['-c',program],{maxBuffer:2*1024*1024,encoding:'utf8',timeout:35000});
 if(result.status!==0)throw new Error('NRW DGM download failed: '+(result.stderr||result.error?.message||result.status));return JSON.parse(result.stdout);
}

export async function enrichGeodata({cityjsonPath,terrainPath,skipTerrain=false}={}){
 const source=JSON.parse(await readFile(path.join(ROOT,'src/map.json'),'utf8')),corridor=generateTrackData(source).base.buildings;
 const json=cityjsonPath?JSON.parse(await readFile(cityjsonPath,'utf8')):downloadCityJSON();
 const features=parseCityJSON(json,source.origin),buildings=matchBuildings(corridor,features);
 let terrain=null;if(!skipTerrain)terrain=terrainRelative(terrainPath?JSON.parse(await readFile(terrainPath,'utf8')):downloadTerrain());
 const data={schemaVersion:1,origin:source.origin,retrieved:'2026-10-08',buildings,terrain,sources:[
  {name:'Geobasis NRW LoD2',url:SOURCE_URL,license:'Datenlizenz Deutschland – Zero 2.0',licenseUrl:'https://www.govdata.de/dl-de/zero-2-0',featuresReceived:features.length,matchedBuildings:buildings.length},
  ...(terrain?[{name:'Geobasis NRW DGM1',url:terrain.sourceUrl,license:'Datenlizenz Deutschland – Zero 2.0',resampledStep:terrain.step}]:[])]};
 await mkdir(path.join(ROOT,'src/tracks'),{recursive:true});await writeFile(path.join(ROOT,'src/tracks/nrw-enrichment.json'),JSON.stringify(data));
 console.log(`Matched ${buildings.length}/${corridor.length} corridor buildings to NRW LoD2.`);
 console.log(`Terrain: ${terrain?`${terrain.width}×${terrain.height} measured samples; base ${terrain.baseElevation}m`:'not available; no synthetic values written'}.`);
 return data;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),value=name=>{const index=args.indexOf(name);return index<0?undefined:args[index+1];};
 await enrichGeodata({cityjsonPath:value('--cityjson'),terrainPath:value('--terrain'),skipTerrain:args.includes('--skip-terrain')});
}
