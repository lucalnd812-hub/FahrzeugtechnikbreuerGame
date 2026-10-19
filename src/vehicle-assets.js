import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';

/** Blender-built fleet (art/blender, exported by art/blender/export.py).
 * Each <id>-<lod>.glb holds a merged 'body' and one 'wheel' (outer face +X,
 * centred on the hub). Missing or failed files simply keep the procedural
 * vehicle, so the game never waits on or breaks because of art. */
const cache=new Map(),pending=new Map();
let manifest=null;

export function vehicleAsset(id,lod){return cache.get(id+':'+lod)||null;}
export function vehicleAssetLayout(id){return manifest?.cars?.[id]||null;}

function prepare(gltf,lod){
 const body=gltf.scene.getObjectByName('body'),wheel=gltf.scene.getObjectByName('wheel');
 if(!body||!wheel)return null;
 for(const root of [body,wheel])root.traverse(o=>{
  if(!o.isMesh)return;
  o.castShadow=lod==='high';o.receiveShadow=false;
  for(const m of Array.isArray(o.material)?o.material:[o.material]){
   // Screen-space transmission needs an extra full render pass; glass and
   // lenses use cheap alpha instead. Low detail also drops the clear coat.
   if(m.transmission>0){m.transmission=0;m.transparent=true;m.opacity=Math.min(m.opacity??1,.55);m.depthWrite=false;}
   if(m.transparent)m.depthWrite=false;
   if(lod!=='high'&&m.clearcoat)m.clearcoat=0;
   m.defines={...m.defines,SMOOTH_SHADING:''};
   m.needsUpdate=true;
  }
 });
 body.position.set(0,0,0);wheel.position.set(0,0,0);
 return {body,wheel};
}

export async function loadVehicleManifest(root='./vehicles3d/'){
 if(manifest)return manifest;
 try{const r=await fetch(root+'manifest.json');manifest=r.ok?await r.json():{cars:{}};}catch{manifest={cars:{}};}
 return manifest;
}

/** Load the requested levels; resolves when all settled, never rejects. */
export async function loadVehicleAssets({high=[],low=[],root='./vehicles3d/'}={}){
 if(typeof fetch!=='function')return [];
 const m=await loadVehicleManifest(root);
 const jobs=[...high.map(id=>[id,'high']),...low.map(id=>[id,'low'])].filter(([id])=>m.cars?.[id]);
 const loader=new GLTFLoader();loader.setMeshoptDecoder(MeshoptDecoder);
 return Promise.all(jobs.map(([id,lod])=>{
  const key=id+':'+lod;
  if(cache.has(key))return cache.get(key);
  if(!pending.has(key))pending.set(key,loader.loadAsync(root+id+'-'+lod+'.glb').then(gltf=>{
   const asset=prepare(gltf,lod);if(asset)cache.set(key,asset);pending.delete(key);return asset;
  }).catch(error=>{pending.delete(key);console.warn('Vehicle art unavailable:',key,error?.message||error);return null;}));
  return pending.get(key);
 }));
}

/** Build the body + four wheels for one car. Geometry and materials are
 * shared with the cache; the caller must not dispose them per car. */
export function instantiateVehicle(id,lod,spec){
 const asset=vehicleAsset(id,lod)||vehicleAsset(id,lod==='high'?'low':'high');
 if(!asset)return null;
 const layout=vehicleAssetLayout(id)||{};
 const body=asset.body.clone(true);body.name='glb-body:'+lod;
 const track=layout.track??spec.track,radius=layout.radius??spec.radius,axles=layout.axles??spec.axles;
 const wheels=[];
 for(const z of axles)for(const side of [-1,1]){
  const w=asset.wheel.clone(true);w.scale.x=side;w.name='glb-wheel';
  wheels.push({z,side,mesh:w});
 }
 body.traverse(o=>{if(o.isMesh)o.userData.sharedVehicleAsset=true;});
 for(const w of wheels)w.mesh.traverse(o=>{if(o.isMesh)o.userData.sharedVehicleAsset=true;});
 return {body,wheels,track,radius,axles};
}
