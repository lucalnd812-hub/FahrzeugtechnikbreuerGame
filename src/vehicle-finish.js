import * as THREE from 'three';
import {setVehicleFinishTextures} from './vehicle-models.js';
import {upgradeVillageTextures} from './village-textures.js';

// Loaded at the first race, never to open the image-backed garage. Models use
// their local fallback immediately; successful images update existing models.
// This module owns the two sources. Models clone Texture objects and share only
// decoded image pixels, so disposing a course cannot destroy the next car's art.
let pending;
export function loadVehicleFinishes(){
 if(pending)return pending;
 if(typeof globalThis.Image!=='function')return Promise.resolve({loaded:false});
 const matcap=new THREE.Texture(),details=new THREE.Texture();
 for(const texture of [matcap,details]){
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping;
  texture.magFilter=THREE.LinearFilter;
  texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps=true;
 }
 pending=upgradeVillageTextures({'car-finish':matcap,'car-details':details}).then(results=>{
  const a=results.find(r=>r.kind==='car-finish')?.loaded;
  const b=results.find(r=>r.kind==='car-details')?.loaded;
  if(a||b)setVehicleFinishTextures({...(a?{matcap}:{}),...(b?{details}:{})});
  if(!a)matcap.dispose();if(!b)details.dispose();
  return {loaded:!!a&&!!b,matcap:!!a,details:!!b};
 }).catch(()=>{matcap.dispose();details.dispose();return {loaded:false};});
 return pending;
}
