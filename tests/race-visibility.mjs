import {CARS} from '../src/car-catalog.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {Track} from '../src/race-core.js';
import {TRACKS,sampleGround} from '../src/tracks.js';
import {makeOilDecal,surfaceHeightAt} from '../src/road-surface.js';
import {makeWorld,makeCar,setCarQuality,animateCar} from '../src/world.js';
import {VEHICLE_MODELS} from '../src/vehicle-models.js';

// Only procedural texture painting needs a canvas. The world, cars, matrices,
// frustum and ray tests below all use the production Three.js geometry.
const previousDocument=globalThis.document;
globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({fillRect(){},fillText(){}})}),querySelector:()=>null};
const base=JSON.parse(fs.readFileSync(new URL('../src/tracks/base.json',import.meta.url)));
const identity=new THREE.Matrix4();

function dataFor(id){
 const course=JSON.parse(fs.readFileSync(new URL('../src/tracks/'+id+'.json',import.meta.url)));
 return structuredClone({...base,...course,buildings:base.buildings.filter(b=>course.buildingIds.includes(b.id)),landAreas:base.landAreas.filter(a=>course.landAreaIds.includes(a.id))});
}

// This is the scene/camera update contract of the installed WebGLRenderer.
// Never force an update here: that previously hid the missing-car regression.
function renderMatrices(scene,camera){
 if(scene.matrixWorldAutoUpdate===true)scene.updateMatrixWorld();
 if(camera.parent===null&&camera.matrixWorldAutoUpdate===true)camera.updateMatrixWorld();
}

function expectedLocal(object){
 return new THREE.Matrix4().compose(object.position,object.quaternion,object.scale);
}

function assertMatrix(actual,expected,context){
 for(let i=0;i<16;i++)assert.ok(Math.abs(actual.elements[i]-expected.elements[i])<1e-8,`${context}: stale world matrix component ${i}: ${actual.elements[i]} vs ${expected.elements[i]}`);
}

function assertBranchMatrices(root,context){
 const walk=(object,parent)=>{
  const expected=parent.clone().multiply(expectedLocal(object));
  assertMatrix(object.matrixWorld,expected,context+'/'+object.name);
  for(const child of object.children)walk(child,expected);
 };
 walk(root,identity);
}

function visibleMeshes(root){
 const result=[];
 root.traverseVisible(object=>{if(object.isMesh)result.push(object);});
 return result;
}

function followCamera(position,angle){
 const camera=new THREE.PerspectiveCamera(63,16/9,.1,260);
 camera.position.set(position.x-Math.sin(angle)*11.8,position.y+6,position.z-Math.cos(angle)*11.8);
 camera.lookAt(position.x+Math.sin(angle)*8,position.y+1.15,position.z+Math.cos(angle)*8);
 return camera;
}

function assertVisibleBody(car,camera,index,context){
 const active=car.userData.quality===0?car.userData.lowModel:car.userData.highModel;
 assert.equal(active.visible,true,context+': selected body detail is hidden');
 const meshes=visibleMeshes(active);
 assert.ok(meshes.length>0,context+': selected body has no visible geometry');
 const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
 assert.ok(meshes.some(mesh=>frustum.intersectsObject(mesh)),context+': body is absent from the camera frustum');

 // Build the test ray from the requested local pose, not the possibly stale
 // rendered matrix. At the rear axle it must hit a real painted fender.
 const spec=VEHICLE_MODELS[index],pose=expectedLocal(car);
 const origin=new THREE.Vector3(3,spec.radius+spec.arch+.028,spec.axles[0]).applyMatrix4(pose);
 const direction=new THREE.Vector3(-1,0,0).transformDirection(pose);
 const hits=new THREE.Raycaster(origin,direction,0,6).intersectObjects(meshes,false);
 assert.ok(hits.length>0,context+': no body geometry at its requested track position');
 const paintMaterial=car.userData.quality===0?'vehicle-low':'vehicle-paint';
 assert.ok(hits.some(hit=>hit.object.material.name===paintMaterial),context+': expected painted fender was not hit');
}

function moveCar(car,track,data,distance,lane,time){
 const p=track.at(distance),x=p.x-p.dz*lane,z=p.z+p.dx*lane;
 car.position.set(x,sampleGround(data,x,z)+.09,z);car.rotation.y=p.angle;
 const front=sampleGround(data,x+Math.sin(p.angle)*1.5,z+Math.cos(p.angle)*1.5),back=sampleGround(data,x-Math.sin(p.angle)*1.5,z-Math.cos(p.angle)*1.5);
 car.rotation.x=-Math.atan2(front-back,3);car.rotation.z=.012;
 animateCar(car,24,.4,time,true,.8);
}

let checkedCars=0,checkedGhosts=0,checkedCrates=0,checkedOil=0;
try{
 for(const meta of TRACKS){
  const data=dataFor(meta.id),track=new Track(data.route),world=makeWorld(data,track);
  try{
   // Racing vehicles are attached only after makeWorld freezes static scenery.
   const cars=Array.from({length:6},(_,i)=>{const car=makeCar(i%CARS.length,false,0);world.scene.add(car);return car;});
   const ghost=makeCar(2,false,0);
   ghost.traverse(object=>{if(object.isMesh)for(const material of Array.isArray(object.material)?object.material:[object.material]){material.transparent=true;material.opacity=.24;material.depthWrite=false;}});
   world.scene.add(ghost);
   const road=world.scene.getObjectByName('course:asphalt'),staticRoadMatrix=road.matrixWorld.clone();
   let oil=null;

   for(const [phase,quality] of [0,2,1,0].entries()){
    world.setQuality(quality);cars.forEach(car=>setCarQuality(car,quality));
    for(let frame=0;frame<3;frame++){
     const distance=track.length*(.16+phase*.18)+frame*7,time=phase+.1*frame;
     for(const [i,car] of cars.entries()){
      moveCar(car,track,data,distance-Math.floor(i/2)*6,i%2?1.7:-1.7,time);
      const camera=followCamera(car.position,car.rotation.y);
      world.updateVisibility(camera,quality);renderMatrices(world.scene,camera);
      const context=`${meta.id} Q${quality} frame${frame} car${i}`;
      assertBranchMatrices(car,context);assertVisibleBody(car,camera,i%CARS.length,context);checkedCars++;
     }
     moveCar(ghost,track,data,distance+14,0,time);
     const ghostCamera=followCamera(ghost.position,ghost.rotation.y);
     world.updateVisibility(ghostCamera,quality);renderMatrices(world.scene,ghostCamera);
     assertBranchMatrices(ghost,meta.id+' ghost');assertVisibleBody(ghost,ghostCamera,2,meta.id+' ghost');checkedGhosts++;

     const crate=world.crates[0];assert.ok(crate,meta.id+': no action item crate');
     crate.mesh.position.y=crate.groundY+Math.sin(time*2+crate.s)*.1;
     crate.mesh.children[0].rotation.y=time*.9;
     const crateCamera=followCamera(crate.mesh.position,crate.mesh.rotation.y);
     world.updateVisibility(crateCamera,quality);renderMatrices(world.scene,crateCamera);
     assert.equal(crate.mesh.visible,true,meta.id+': nearby item crate is hidden');
     assertBranchMatrices(crate.mesh,meta.id+' animated item crate');
     const cube=crate.mesh.children[0],origin=new THREE.Vector3(crate.x,crate.mesh.position.y+5,crate.z);
     assert.ok(new THREE.Raycaster(origin,new THREE.Vector3(0,-1,0),0,6).intersectObject(cube,false).length>0,meta.id+': animated crate left its intended world position');checkedCrates++;

     // Oil meshes are another late scene insertion during an active race.
     if(oil){world.scene.remove(oil);oil.geometry.dispose();oil.material.dispose();}
     oil=makeOilDecal(data,ghost.position.x,ghost.position.z);world.scene.add(oil);
     renderMatrices(world.scene,ghostCamera);assertBranchMatrices(oil,meta.id+' oil');
     const oilOrigin=new THREE.Vector3(oil.position.x,surfaceHeightAt(data,oil.position.x,oil.position.z)+4,oil.position.z);
     assert.ok(new THREE.Raycaster(oilOrigin,new THREE.Vector3(0,-1,0),0,5).intersectObject(oil,false).length>0,meta.id+': late oil mesh has no geometry at its requested position');checkedOil++;

     // Keeping scenery transforms frozen still avoids recomposing static roads.
     assert.equal(road.matrixAutoUpdate,false,meta.id+': static road lost matrix optimisation');
     assert.equal(road.matrixWorldAutoUpdate,false,meta.id+': static road lost world-matrix optimisation');
     assertMatrix(road.matrixWorld,staticRoadMatrix,meta.id+' static road');
    }
   }
  }finally{world.dispose();}
 }
}finally{
 if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;
}
console.log(`PASS: ${checkedCars} real racing-car poses, ${checkedGhosts} ghosts, ${checkedCrates} animated crates and ${checkedOil} late oil meshes keep current world matrices across all three courses and quality changes; car bodies intersect the camera frustum and raycast at their requested positions. CPU geometry regression, not a GPU/FPS measurement.`);
