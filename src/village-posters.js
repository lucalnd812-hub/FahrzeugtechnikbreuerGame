import * as THREE from 'three';
import {upgradeVillageTextures} from './village-textures.js';

/** Printed village posters (Higgsfield originals in art/flyers, one 4×3 atlas
 * at nextlevel/village-posters.webp). Advertising columns and A-frame boards
 * stand on the verge; every prop reserves its footprint through dressCourse's
 * `safe` check, so nothing ever reaches the racing surface. */
export const POSTERS=Object.freeze([
 'breuer-grand-prix','breuer-service','breuer-reifenwechsel','kirmes',
 'flohmarkt','feuerwehrfest','sommerkonzert','katze-entlaufen',
 'leo-baeckerei','leo-fruehstueck','kalltalschule-schulfest','kalltalschule-sponsorenlauf'
]);
const COLS=4,ROWS=3,INSET=.004;

function cellUV(cell,u,v){
 const c=cell%COLS,r=Math.floor(cell/COLS);
 const uu=INSET+u*(1-2*INSET),vv=INSET+v*(1-2*INSET);
 return [(c+uu)/COLS,1-(r+1-vv)/ROWS];
}

/** Flat poster facing +Z, bottom edge at y=0. */
export function posterPlane(cell,width,height){
 const g=new THREE.PlaneGeometry(width,height).translate(0,height/2,0),uv=g.attributes.uv;
 for(let i=0;i<uv.count;i++)uv.setXY(i,...cellUV(cell,uv.getX(i),uv.getY(i)));
 return g;
}

/** Poster wrapped round an advertising column between angles a0..a1. */
export function posterWrap(cell,radius,a0,a1,height,y0=0,segments=10){
 const positions=[],uvs=[],index=[];
 for(let s=0;s<=segments;s++){
  const t=s/segments,a=a0+(a1-a0)*t;
  for(const v of [0,1]){positions.push(Math.sin(a)*radius,y0+v*height,Math.cos(a)*radius);uvs.push(...cellUV(cell,t,v));}
 }
 for(let s=0;s<segments;s++){const i=s*2;index.push(i,i+2,i+1,i+1,i+2,i+3);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setIndex(index);g.computeVertexNormals();return g;
}

/** One atlas texture for every poster in a world: the 2048×2304 atlas is
 * uploaded to the GPU once, however many landmarks and verge props use it. */
let sharedMaterial=null;
export function sharedPosterMaterial(){
 if(!sharedMaterial){sharedMaterial=posterMaterial();sharedMaterial.addEventListener("dispose",()=>{sharedMaterial=null;});}
 return sharedMaterial;
}

export function posterMaterial(){
 const texture=new THREE.Texture();texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
 // Plain paper colour until the atlas is decoded. The texture is attached only
 // then: WebGL keeps a texture's first upload size, so a small placeholder image
 // could never be replaced by the 2048×2304 atlas.
 const m=new THREE.MeshStandardMaterial({color:0xe9e2cf,roughness:.78,metalness:0});
 m.name='village-posters';m.userData.keepUV=true;m.userData.posterAtlas=texture;
 upgradeVillageTextures({'village-posters':texture}).then(results=>{
  if(!results?.[0]?.loaded)return;
  m.map=texture;m.color.set(0xffffff);m.needsUpdate=true;
 });
 m.addEventListener('dispose',()=>{if(!m.map)texture.dispose();});
 return m;
}

/** Litfaßsäulen and poster boards along the course. Returns placed props. */
export function addVillagePosters({batch,track,safe,material,rand=Math.random}){
 if(!track?.length||typeof safe!=='function')return [];
 const poster=sharedPosterMaterial(),column=material(0x2e4a3c,{roughness:.6}),trim=material(0x1d2e26,{roughness:.5}),metal=material(0x8c9299,{roughness:.45,metalness:.5});
 const placed=[];let next=0;
 const pick=()=>{const cell=next%POSTERS.length;next++;return cell;};
 // Advertising columns: one near the start/finish, then roughly every 280 m.
 for(let s=36,k=0;s<track.length-20;s+=280,k++){
  for(const tries of [0,30,-30,60]){
   const p=track.at(s+tries),side=k%2?1:-1,x=p.x+p.dz*9.4*side,z=p.z-p.dx*9.4*side;
   if(!safe(x,z,1.5,1.5,p.angle,'poster-column'))continue;
   const R=.56;
   batch.add(new THREE.CylinderGeometry(.66,.7,.32,20),trim,x,.16,z);
   batch.add(new THREE.CylinderGeometry(R,R,2.55,24),column,x,1.6,z);
   batch.add(new THREE.CylinderGeometry(.68,.62,.16,24),trim,x,2.95,z);
   batch.add(new THREE.SphereGeometry(.62,20,8,0,Math.PI*2,0,Math.PI/2).scale(1,.55,1),column,x,3.02,z);
   batch.add(new THREE.SphereGeometry(.09,10,8),trim,x,3.42,z);
   for(let q=0;q<3;q++){const a=p.angle+Math.PI/2*side+q*Math.PI*2/3-.95;batch.add(posterWrap(pick(),R+.006,a,a+1.9,1.55,0),poster,x,1.08,z);}
   placed.push({kind:'column',x,z});break;
  }
 }
 // Two-sided A-frame boards on the pavement, every ~150 m.
 for(let s=110,k=0;s<track.length-20;s+=150,k++){
  const p=track.at(s),side=k%2?-1:1,x=p.x+p.dz*8.7*side,z=p.z-p.dx*8.7*side;
  if(!safe(x,z,.9,.8,p.angle,'poster-board'))continue;
  const facing=p.angle+(side>0?-Math.PI/2:Math.PI/2)+(rand()-.5)*.5;
  for(const flip of [0,1]){
   const a=facing+flip*Math.PI,lean=.2,dx=Math.sin(a)*.17,dz=Math.cos(a)*.17;
   const frame=new THREE.BoxGeometry(.76,1.12,.035).translate(0,.56,0).rotateX(-lean);
   batch.add(frame,metal,x+dx,.0,z+dz,a);
   batch.add(posterPlane(pick(),.66,.99).translate(0,.05,.02).rotateX(-lean),poster,x+dx,.05,z+dz,a);
  }
  placed.push({kind:'board',x,z});
 }
 return placed;
}
