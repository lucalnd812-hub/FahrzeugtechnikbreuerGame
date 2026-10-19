import * as THREE from 'three';

/** Comic-style roof finish for any roof given as a triangle soup (surveyed
 * LoD2 roofs and the generated pitched roofs alike):
 *  - an overhang that continues every roof plane past its outline,
 *  - a painted fascia/bargeboard along the overhang edge (reads like an ink
 *    outline from the street),
 *  - a dark soffit underneath, so the roof gains visible thickness,
 *  - corner fills where two overhang edges meet.
 * Pure geometry, no materials: callers batch the parts like other scenery. */

const key=p=>p.map(v=>Math.round(v*1000)).join(',');

function plain(values,uvScale=1){
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(values,3));g.computeVertexNormals();
 const p=g.attributes.position,uv=new Float32Array(p.count*2);
 for(let i=0;i<p.count;i++){uv[i*2]=(p.getX(i)+p.getZ(i))*uvScale;uv[i*2+1]=p.getY(i)*uvScale;}
 g.setAttribute('uv',new THREE.BufferAttribute(uv,2));return g;
}

/** positions: flat [x,y,z,...] triangles. Returns geometries or null parts. */
export function roofTrim(positions,{overhang=.32,fascia=.2,minEdge=.35}={}){
 const edges=new Map(),centre=new THREE.Vector3(),tri=[new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3()];
 const count=positions.length/9;if(!count)return {overhang:null,fascia:null,soffit:null,outline:[]};
 for(let t=0;t<count;t++){
  for(let k=0;k<3;k++)tri[k].fromArray(positions,t*9+k*3);
  const normal=new THREE.Vector3().subVectors(tri[1],tri[0]).cross(new THREE.Vector3().subVectors(tri[2],tri[0]));
  if(normal.lengthSq()<1e-10)continue;normal.normalize();if(normal.y<0)normal.negate();
  for(let k=0;k<3;k++){
   const a=tri[k],b=tri[(k+1)%3],id=[key(a.toArray()),key(b.toArray())].sort().join('|');
   const e=edges.get(id);if(e)e.count++;else edges.set(id,{a:a.clone(),b:b.clone(),normal,count:1});
   centre.add(a);
  }
 }
 centre.divideScalar(count*3);
 const roof=[],board=[],under=[],corners=new Map(),outline=[];
 for(const e of edges.values()){
  if(e.count!==1)continue;
  const along=new THREE.Vector3().subVectors(e.b,e.a);if(along.length()<minEdge)continue;
  // In-plane direction perpendicular to the edge, pointing away from the roof.
  const out=new THREE.Vector3().crossVectors(e.normal,along).normalize();
  const mid=new THREE.Vector3().addVectors(e.a,e.b).multiplyScalar(.5);
  if(out.x*(mid.x-centre.x)+out.z*(mid.z-centre.z)<0)out.negate();
  if(Math.hypot(out.x,out.z)<.2)continue;
  const a2=e.a.clone().addScaledVector(out,overhang),b2=e.b.clone().addScaledVector(out,overhang),drop=new THREE.Vector3(0,-fascia,0);
  const a3=a2.clone().add(drop),b3=b2.clone().add(drop);
  roof.push(...e.a.toArray(),...b2.toArray(),...e.b.toArray(),...e.a.toArray(),...a2.toArray(),...b2.toArray());
  board.push(...a2.toArray(),...a3.toArray(),...b3.toArray(),...a2.toArray(),...b3.toArray(),...b2.toArray());
  const ua=e.a.clone().add(drop.clone().multiplyScalar(.35)),ub=e.b.clone().add(drop.clone().multiplyScalar(.35));
  under.push(...a3.toArray(),...ua.toArray(),...ub.toArray(),...a3.toArray(),...ub.toArray(),...b3.toArray());
  for(const [p,q] of [[e.a,a2],[e.b,b2]]){const k=key(p.toArray());if(!corners.has(k))corners.set(k,{p,ends:[]});corners.get(k).ends.push(q);}
  outline.push([e.a.toArray(),e.b.toArray()]);
 }
 // Fill the wedge between two overhang edges that share an outline vertex.
 for(const {p,ends} of corners.values()){
  if(ends.length!==2||ends[0].distanceTo(ends[1])<.01)continue;
  const [q,r]=ends,drop=new THREE.Vector3(0,-fascia,0);
  roof.push(...p.toArray(),...q.toArray(),...r.toArray());
  board.push(...q.toArray(),...q.clone().add(drop).toArray(),...r.clone().add(drop).toArray(),...q.toArray(),...r.clone().add(drop).toArray(),...r.toArray());
 }
 // Faces render double sided through the batch materials; normals only shade.
 return {overhang:roof.length?plain(roof,.5):null,fascia:board.length?plain(board,1):null,soffit:under.length?plain(under,1):null,outline};
}

/** A chimney on the ridge: the highest outline vertex pulled inwards. */
export function chimneySpot(positions,seed=0){
 let best=null;
 for(let i=0;i<positions.length;i+=3){const y=positions[i+1];if(!best||y>best[1]+.01)best=[positions[i],y,positions[i+2]];}
 if(!best)return null;
 // Several ridge points share the top height: choose one along the ridge.
 const ridge=[];for(let i=0;i<positions.length;i+=3)if(Math.abs(positions[i+1]-best[1])<.05)ridge.push([positions[i],positions[i+2]]);
 const pick=ridge[Math.floor(Math.abs(Math.sin(seed*12.9898)*43758.5453)%1*ridge.length)]||[best[0],best[2]];
 return {x:pick[0],y:best[1],z:pick[1]};
}

export function chimneyGeometry(height=1.25,width=.62){
 const stack=new THREE.BoxGeometry(width,height,width).translate(0,height/2-.35,0).toNonIndexed();
 const cap=new THREE.BoxGeometry(width+.16,.12,width+.16).translate(0,height-.29,0).toNonIndexed();
 return {stack,cap};
}
