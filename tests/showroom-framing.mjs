import assert from 'node:assert/strict';
import * as THREE from 'three';
import {makePremiumShowroom} from '../src/premium-showroom.js';
import {createVehicleModel} from '../src/vehicle-models.js';
import {frameShowroom,SHOWROOM_ELEVATION} from '../src/showroom-framing.js';
const showroom=makePremiumShowroom({makeCar:index=>createVehicleModel(index,{quality:2}),disposeScene(){}});
const camera=new THREE.PerspectiveCamera(35,1,.1,120);
for(const car of showroom.cars)for(const aspect of [1.2,1.6,2,2.8,4])for(let angle=0;angle<Math.PI*2;angle+=Math.PI/8){
 car.rotation.y=angle;frameShowroom(camera,car,aspect);camera.updateMatrixWorld(true);
 assert.ok(Math.abs(Math.atan2(camera.position.y-.63,camera.position.z)-SHOWROOM_ELEVATION)<1e-10,'Fixed12degree elevation at all screen sizes');
 const b=car.userData.showroomBounds,c=Math.cos(angle),s=Math.sin(angle),p=new THREE.Vector3();let extent=0;
 for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z]){
  p.set(x*c+z*s,y,-x*s+z*c).project(camera);assert.ok(Math.abs(p.x)<=.880001&&Math.abs(p.y)<=.840001,'Entire car fits without clipped roof/wheels');extent=Math.max(extent,Math.abs(p.x)/.88,Math.abs(p.y)/.84);
 }
 assert.ok(extent>.9999,'Car fills available width or height on phone and desktop');
}
console.log('PASS all five showroom models: fixed elevation, full fit and viewport occupation at 5 aspect ratios ×16 rotations');

let modelCalls=0,disposeCalls=0;
const painted=makePremiumShowroom({renderModels:false,makeCar(){modelCalls++;throw new Error('Painted garage must not allocate unused vehicle meshes');},disposeScene(scene){assert.equal(scene,painted.scene);disposeCalls++;}});
assert.equal(modelCalls,0);assert.equal(painted.cars.length,5);
let meshes=0;painted.scene.traverse(node=>{if(node.isMesh)meshes++;});assert.equal(meshes,0,'Image-backed garage avoids all five unused 3D models');
painted.setLights(false);assert.equal(painted.scene.userData.previewLights,false);
painted.setLights(true);assert.equal(painted.scene.userData.previewLights,true);
painted.dispose();assert.equal(disposeCalls,1);
console.log('PASS painted garage: selection and lighting states without unused model allocation');
