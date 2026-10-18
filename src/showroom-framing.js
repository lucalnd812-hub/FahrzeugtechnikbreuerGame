import * as THREE from 'three';

export const SHOWROOM_ELEVATION=12*Math.PI/180;
/** A constant eye height with a viewport fit; portrait/landscape never changes
 * the car's elevation or makes it recede into the painted floor. */
export function frameShowroom(camera,car,aspect){
 const box=car.userData.showroomBounds;
 camera.aspect=Math.max(.2,aspect);camera.zoom=1;
 camera.position.set(0,.63+Math.sin(SHOWROOM_ELEVATION)*9,Math.cos(SHOWROOM_ELEVATION)*9);
 camera.lookAt(0,.63,0);camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
 if(!box)return;
 const c=Math.cos(car.rotation.y),s=Math.sin(car.rotation.y),p=new THREE.Vector3();
 let maxX=.01,maxY=.01;
 for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
  p.set(x*c+z*s,y,-x*s+z*c).project(camera);maxX=Math.max(maxX,Math.abs(p.x));maxY=Math.max(maxY,Math.abs(p.y));
 }
 camera.zoom=Math.min(.88/maxX,.84/maxY);camera.updateProjectionMatrix();
}
