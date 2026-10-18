import * as THREE from 'three';
import {setVehicleLights} from './vehicle-models.js';

/** Real interactive models over a single painted environment: no idle video,
 * environment convolution, reflective floor, pedestal or extra shadow pass. */
export function makePremiumShowroom({makeCar, disposeScene, renderModels=true}) {
  const scene = new THREE.Scene();
  // The production menu paints its model views in a separate DOM canvas. Keep
  // selection/light state without constructing five unused high-detail meshes.
  if(!renderModels){
    const cars=Array.from({length:5},(_,index)=>{const car=new THREE.Group();car.name='garage-selection:'+index;car.visible=false;scene.add(car);return car;});
    scene.userData.paintedGarage=true;scene.userData.modelsAllocated=false;
    return {scene,cars,setLights(enabled){scene.userData.previewLights=!!enabled;for(const car of cars)car.userData.previewLights=!!enabled;},dispose:()=>disposeScene(scene)};
  }
  const fill = new THREE.HemisphereLight(0xe9f5ff, 0x626071, 2.1);
  const key = new THREE.DirectionalLight(0xffe9c4, 3.35);
  key.position.set(-4, 8, 7);
  const rim = new THREE.DirectionalLight(0xcbe3ff, 1.7);
  rim.position.set(5, 4, -3);
  scene.add(fill, key, rim);
  const cars = Array.from({length: 5}, (_, index) => {
    const car = makeCar(index, false, 2);
    car.position.set(0, .025, 0);
    car.updateMatrixWorld(true);
    const bounds=new THREE.Box3();
    car.traverse(node=>{
      if(!node.isMesh||node===car.userData.contactShadow)return;
      for(let parent=node;parent&&parent!==car;parent=parent.parent)if(!parent.visible)return;
      node.geometry.computeBoundingBox();bounds.union(node.geometry.boundingBox.clone().applyMatrix4(node.matrixWorld));
    });
    car.userData.showroomBounds=bounds;
    car.visible = false;
    scene.add(car);
    return car;
  });
  scene.userData.paintedGarage = true;
  function setLights(enabled) {
    scene.userData.previewLights = !!enabled;
    key.intensity = enabled ? 3.8 : 3.35;
    rim.intensity = enabled ? 2.1 : 1.7;
    for (const car of cars) {
      car.userData.previewLights = !!enabled;
      setVehicleLights(car, enabled);
    }
  }
  return {scene, cars, setLights, dispose: () => disposeScene(scene)};
}
