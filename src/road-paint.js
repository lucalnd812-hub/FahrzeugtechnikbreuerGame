import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

/** Painted race markings on the asphalt: big "BREUER" lettering after the
 * start line and before the finish, and chevron arrows ahead of every sharp
 * corner. One canvas atlas, one merged mesh, one draw call. Each decal is a
 * small grid draped onto the road surface so it never floats or sinks. */

const CELLS=3; // 0: BREUER lettering, 1: left chevrons, 2: right chevrons
function atlas(){
 const doc=globalThis.document;if(!doc?.createElement)return null;
 const c=doc.createElement('canvas'),w=512,h=128;c.width=w;c.height=h*CELLS;const g=c.getContext?.('2d');
 if(!g||typeof g.fillText!=='function'||typeof g.clearRect!=='function')return null;
 g.clearRect(0,0,w,h*CELLS);
 // Lettering, stretched like real road paint so it reads at a shallow angle.
 g.save();g.font='900 104px "Arial Black",Impact,Arial,sans-serif';const fit=Math.min(1,(w-36)/Math.max(1,g.measureText?.('BREUER')?.width||w));
 g.translate(w/2,h/2);g.scale(fit,1.15);g.textAlign='center';g.textBaseline='middle';
 g.fillStyle='rgba(255,255,255,.92)';g.fillText('BREUER',0,4);g.restore();
 // Chevrons pointing left (cell 1) and right (cell 2), red-edged white.
 for(const [cell,dir] of [[1,-1],[2,1]]){
  const y0=cell*h;g.save();g.translate(w/2,y0+h/2);
  for(let i=-1;i<=1;i++){g.beginPath();const x=i*120*dir;g.moveTo(x-34*dir,-44);g.lineTo(x+34*dir,0);g.lineTo(x-34*dir,44);g.lineWidth=26;g.lineJoin='miter';g.strokeStyle='rgba(255,255,255,.95)';g.stroke();}
  g.restore();
 }
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;t.name='road-paint';return t;
}

function decal(track,heightAt,s,length,width,cell,offset=0){
 // Grid along the road: x across, z along; every vertex sits on the surface.
 const nx=4,nz=8,g=new THREE.PlaneGeometry(width,length,nx,nz);g.rotateX(-Math.PI/2);
 const pos=g.attributes.position,uv=g.attributes.uv;
 for(let i=0;i<pos.count;i++){
  const lx=pos.getX(i),lz=-pos.getZ(i),p=track.at(s+lz),x=p.x-p.dz*(lx+offset),z=p.z+p.dx*(lx+offset);
  pos.setXYZ(i,x,heightAt(x,z)+.077,z); // terrain + paint layer, just above the course asphalt (+.064)
  uv.setY(i,(CELLS-1-cell+uv.getY(i))/CELLS);
 }
 g.computeVertexNormals();return g;
}

export function paintRoad(scene,track,heightAt=()=>0){
 if(!track?.at||!(track.length>200))return {decals:0,mesh:null};
 const parts=[],L=track.length;
 // Lettering reads in driving direction: rotate the cell so its top faces ahead.
 const letter=(s)=>{const g=decal(track,heightAt,s,9.5,3.4,0);const uv=g.attributes.uv;for(let i=0;i<uv.count;i++){const u=uv.getX(i),v=uv.getY(i)*CELLS%1;uv.setXY(i,v,(CELLS-1)/CELLS+u/CELLS);}parts.push(g);};
 letter(30);letter(L-45);
 // Chevrons before corners whose heading turns more than ~40 degrees within 35 m.
 let last=-Infinity;
 for(let s=60;s<L-60;s+=6){
  const a=track.at(s+8).angle,b=track.at(s+40).angle;let turn=b-a;while(turn>Math.PI)turn-=Math.PI*2;while(turn<-Math.PI)turn+=Math.PI*2;
  if(Math.abs(turn)<.7||s-last<90)continue;last=s;
  parts.push(decal(track,heightAt,s,3.2,4.2,turn>0?1:2));
 }
 const map=atlas();if(!parts.length||!map){parts.forEach(g=>g.dispose());return {decals:0,mesh:null};}
 const geometry=mergeGeometries(parts);parts.forEach(g=>g.dispose());
 const material=new THREE.MeshStandardMaterial({name:'road-paint',map,transparent:true,depthWrite:false,roughness:.85,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
 // The phone profile swaps to Lambert and drops transparency; paint needs its alpha.
 material.userData.keepTransparency=true;
 const mesh=new THREE.Mesh(geometry,material);mesh.name='course:paint';mesh.receiveShadow=true;mesh.renderOrder=1;scene.add(mesh);
 return {decals:parts.length,mesh};
}
