import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createVehicleModel,setVehicleQuality,setVehicleLights,disposeVehicleModel,setVehicleFinishTextures,VEHICLE_MODELS} from '../src/vehicle-models.js';

function resources(car) {
  const geometry=new Set(),materials=new Set(car.userData.qualityMaterials),textures=new Set();
  car.traverse(o=>{if(o.geometry)geometry.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[])materials.add(m);});
  for(const m of materials)for(const value of Object.values(m))if(value?.isTexture)textures.add(value);
  return {geometry,materials,textures};
}

function visibleStats(car) {
  let triangles=0,draws=0;const bounds=new THREE.Box3();
  car.updateMatrixWorld(true);
  car.traverse(o=>{
    if(!o.isMesh)return;
    for(let a=o;a;a=a.parent)if(!a.visible)return;
    triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;draws++;
    if(o.name!=='contact-shadow'){
      const p=o.geometry.attributes.position,v=new THREE.Vector3();
      for(let n=0;n<p.count;n++)bounds.expandByPoint(v.fromBufferAttribute(p,n).applyMatrix4(o.matrixWorld));
    }
  });
  return {triangles,draws,bounds};
}

assert.deepEqual(VEHICLE_MODELS.map(spec=>spec.id),['kadett','e30','m1','m2','gt3rs']);
assert.equal(VEHICLE_MODELS[3].paint,0x92989d);assert.equal(VEHICLE_MODELS[4].paint,0x267ddb);
assert.equal(VEHICLE_MODELS[3].wheelbase,2.693);assert.equal(VEHICLE_MODELS[4].wheelbase,2.457);

function bodySample(body,from,direction) {
  const hit=new THREE.Raycaster(new THREE.Vector3(...from),new THREE.Vector3(...direction),0,8).intersectObject(body,true)[0];
  assert.ok(hit,'Expected a rendered body surface');
  const colour=new THREE.Color().fromBufferAttribute(hit.object.geometry.attributes.color,hit.face.a);
  return {hit,colour:colour.getHex()};
}

for(let index=0;index<VEHICLE_MODELS.length;index++){
  const spec=VEHICLE_MODELS[index],car=createVehicleModel(index),initial=resources(car);
  assert.equal(car.userData.modelId,spec.id);assert.equal(car.userData.carModel,true);
  assert.equal(car.userData.renderStyle,'arcade');assert.equal(car.userData.modelVersion,'breuer-fleet-6');
  assert.equal(car.userData.bodyPivot.position.y,.65);
  assert.equal(car.userData.highModel.parent,car.userData.bodyPivot);assert.equal(car.userData.lowModel.parent,car.userData.bodyPivot);
  assert.equal(car.userData.highModel.position.y,-.65);assert.equal(car.userData.lowModel.position.y,-.65);
  assert.equal(car.userData.contactShadow.parent,car);assert.equal(car.userData.contactShadow.material.forceSinglePass,true,'Flat contact shadow must not render twice for DoubleSide transparency');
  assert.equal(car.userData.wheels.length,4);assert.equal(car.userData.wheels.filter(w=>w.front).length,2);
  assert.equal(car.userData.shield.visible,false);assert.equal(car.userData.flames.visible,false);assert.equal(car.userData.sparks.visible,false);
  for(const g of initial.geometry){
    assert.ok(g.attributes.position.count>0);assert.ok(g.attributes.normal);
    for(const attr of Object.values(g.attributes))for(const n of attr.array)assert.ok(Number.isFinite(n),`${spec.id}: non-finite geometry`);
    if(g!==car.userData.contactShadow.geometry)for(let n=0;n<g.attributes.normal.count;n++){
      const a=g.attributes.normal,length=Math.hypot(a.getX(n),a.getY(n),a.getZ(n));
      assert(length>.999&&length<1.001,`${spec.id}: a degenerate or unnormalised vertex would break the reflection lookup`);
    }
    g.computeBoundingBox();g.computeBoundingSphere();assert.ok(Number.isFinite(g.boundingSphere.radius));
  }
  for(const m of initial.materials)assert.equal(m.map,null,'Models must work offline before the optional bundled detail atlas has loaded');
  assert.equal(initial.textures.size,1,'Polished finish uses one locally authored reflection lookup per vehicle');
  for(const texture of initial.textures){
    assert.equal(texture.isDataTexture,true);assert.equal(texture.image.data.byteLength,64*64*4);assert.equal(texture.magFilter,THREE.LinearFilter);assert.equal(texture.generateMipmaps,false);
    assert.equal(texture.colorSpace,THREE.SRGBColorSpace);
  }
  for(const m of car.userData.qualityMaterials)assert.ok(m.isMeshMatcapMaterial||m.isMeshBasicMaterial,'Arcade cars must use one cheap matcap lookup without PBR clearcoat or metallic passes');
  for(const material of car.userData.qualityMaterials.filter(m=>m.isMeshMatcapMaterial)){
    const shader={uniforms:{},fragmentShader:THREE.ShaderLib.matcap.fragmentShader};material.onBeforeCompile(shader);
    assert.equal(shader.uniforms.breuerFinishLift.value,.38);assert.equal(shader.uniforms.breuerFinishGain.value,.82);
    assert.equal(shader.uniforms.breuerFinishCoat.value,material.userData.finishCoat);
    assert(shader.fragmentShader.includes('vec3 outgoingLight = diffuseColor.rgb * (vec3(breuerFinishLift)'));
    assert(!shader.fragmentShader.includes('vec3 outgoingLight = diffuseColor.rgb * matcapColor.rgb;'));
    assert.equal((shader.fragmentShader.match(/texture2D\( matcap, uv \)/g)||[]).length,1,'Coat must reuse the existing lookup without sampling again');
    assert.equal(material.customProgramCacheKey(),'breuer-sculpted-finish-v1');
  }
  const glazing=car.userData.qualityMaterials.find(material=>material.name==='vehicle-glass');
  assert.equal(glazing.transparent,true);assert.equal(glazing.opacity,.72);
  assert.equal(glazing.depthWrite,false);assert.equal(glazing.forceSinglePass,true,'Translucent glass must not add a hidden double-sided extra pass');
  for(const wheel of car.userData.wheels){
    assert.equal(wheel.group.position.y,spec.radius);assert.ok(spec.axles.includes(wheel.group.position.z));
    assert.ok(Math.abs(Math.abs(wheel.group.position.x)-spec.track/2)<1e-8);
    assert.equal(wheel.spinning.parent,wheel.group);assert.equal(wheel.high.parent,wheel.spinning);assert.equal(wheel.low.parent,wheel.spinning);
    assert.equal(wheel.group.parent,car,'Unsprung wheels must remain outside the body pivot');
    // The four instances share wheel geometry but have independent transforms.
    assert.equal(wheel.high.children[0].geometry,car.userData.wheels[0].high.children[0].geometry);
  }
  car.userData.wheels[0].spinning.rotation.x=.87;car.userData.wheels[0].group.rotation.y=.22;
  for(let q=0;q<=2;q++){
    setVehicleQuality(car,q);const stats=visibleStats(car);
    const maxTriangles=q===0?6000:16000;
    assert.ok(stats.triangles<=maxTriangles,`${spec.id}: triangle budget ${stats.triangles}`);
    assert.ok(stats.draws<=(q===0?6:15),`${spec.id}: draw budget ${stats.draws}`);
    assert.ok(stats.bounds.min.y>=-1e-6,`${spec.id}: tyre below ground`);
    assert.ok(Math.abs(stats.bounds.min.y)<.004,`${spec.id}: tyre floats`);
    assert.ok(stats.bounds.max.x-stats.bounds.min.x>=spec.width*.97);
    assert.ok(stats.bounds.max.x-stats.bounds.min.x<spec.width*1.20);
    assert.ok(stats.bounds.max.z-stats.bounds.min.z<spec.length*1.07);
    assert.ok(stats.bounds.max.y<=spec.height*1.10,`${spec.id}: vehicle silhouette is disproportionately tall`);
    assert.equal(car.userData.wheels[0].spinning.rotation.x,.87);assert.equal(car.userData.wheels[0].group.rotation.y,.22);
    let transparent=0,estimatedPasses=0;
    car.traverse(mesh=>{if(!mesh.isMesh)return;for(let p=mesh;p;p=p.parent)if(!p.visible)return;for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){if(material.transparent)transparent++;estimatedPasses+=material.transparent&&material.side===THREE.DoubleSide&&!material.forceSinglePass?2:1;}});
    assert.equal(transparent,q===0?1:2);assert.equal(estimatedPasses,stats.draws,'No hidden double-sided transparent second pass');
    console.log(`${spec.id} Q${q}: ${stats.triangles} triangles / ${stats.draws} draws / ${transparent} transparent`);
  }
  // Raycast actual body geometry, excluding wheels: wheel openings must pass
  // through the side panel at axle-centre height, with painted fender above.
  for(const high of [false,true]){
    setVehicleQuality(car,high?2:0);car.updateMatrixWorld(true);
    const body=high?car.userData.highModel:car.userData.lowModel;
    for(const z of spec.axles){
      const opening=new THREE.Raycaster(new THREE.Vector3(3,spec.radius+.02,z),new THREE.Vector3(-1,0,0),0,6);
      assert.equal(opening.intersectObject(body,true).length,0,`${spec.id}: body fills wheel opening`);
      const fender=new THREE.Raycaster(new THREE.Vector3(3,spec.radius+spec.arch+.028,z),new THREE.Vector3(-1,0,0),0,6);
      assert.ok(fender.intersectObject(body,true).length>0,`${spec.id}: no body above wheel opening`);
    }
    // These are raycasts of the submitted geometry at both LODs: features
    // must exist on the actual model, not only as metadata or showroom art.
    if(spec.id==='m2'){
      assert.equal(bodySample(body,[.25,.69,3],[0,0,-1]).colour,0x171c22,'M2 connected kidney grille absent');
      const grilleInset=bodySample(body,[.25,.684,3],[0,0,-1]).hit,grilleBevel=bodySample(body,[.455,.684,3],[0,0,-1]);
      assert.equal(grilleBevel.colour,0x687780,'M2 manufactured grille surround is absent');
      assert(grilleBevel.hit.point.z-grilleInset.point.z>.015,'M2 grille surround must have palpable depth instead of being a flat decal');
      assert.equal(bodySample(body,[.71,.81,-3],[0,0,1]).colour,0xb72934,'M2 L-shaped rear light absent');
      for(const side of [-1,1])for(const x of [.449,.579])assert.equal(bodySample(body,[side*x,.249,-3],[0,0,1]).colour,0x111419,'M2 must have four actual exhaust openings');
    }
    if(spec.id==='m1'){
      // These points lie INSIDE the broad red roof band over the shoulder.
      // Its old four-corner quads cut through the convex roof between vertices.
      for(const z of [-.58,-.48,-.38,-.28])for(const x of [.51,.54,.56])assert.equal(bodySample(body,[x,2,z],[0,-1,0]).colour,0xe82c39,`M1 red roof stripe exposes white paint at ${x},${z} in ${high?'high':'low'} LOD`);
      body.traverse(mesh=>{if(!mesh.isMesh)return;const p=mesh.geometry.attributes.position,colours=mesh.geometry.attributes.color;
        for(let n=0;n<p.count;n++)if(p.getY(n)>1.13&&new THREE.Color().fromBufferAttribute(colours,n).getHex()===0xe82c39){
          const v=(p.getZ(n)-spec.cabin.roofRear[0])/(spec.cabin.roofFront[0]-spec.cabin.roofRear[0]),width=spec.cabin.roofRear[2]+(spec.cabin.roofFront[2]-spec.cabin.roofRear[2])*v;
          assert(Math.abs(p.getX(n))<=width+.00001,'M1 roof decal hangs beyond its actual roof support');
        }
      });
    }
    if(spec.id==='gt3rs'){
      const wing=bodySample(body,[0,2,-1.90],[0,-1,0]);
      assert.equal(wing.colour,0x1d2731,'GT3 RS aerofoil absent');
      assert.ok(wing.hit.point.y>Math.max(spec.cabin.roofFront[1],spec.cabin.roofRear[1])+.09,'GT3 RS wing must sit above the roof line');
      assert.equal(bodySample(body,[.29,2,1.25],[0,-1,0]).colour,0x111419,'GT3 RS radiator outlet absent');
      assert.equal(bodySample(body,[.7,2,1.63],[0,-1,0]).colour,0x24517b,'911 oval headlight is not embedded in the fender');
      for(const x of [-.6,0,.6])assert.equal(bodySample(body,[x,.714,-3],[0,0,1]).colour,0xdb2a3b,'992 full-width red light blade absent');
    }
    if(spec.id==='kadett'){
      assert.equal(bodySample(body,[.557,.594,3],[0,0,-1]).colour,0xd1ded9,'The actual Kadett headlamp lens must remain fitted to its grille');
      const lampCentre=bodySample(body,[.557,.594,3],[0,0,-1]).hit,lampEdge=bodySample(body,[.640,.594,3],[0,0,-1]).hit;
      const interpolated=hit=>{
        const g=hit.object.geometry,p=g.attributes.position,c=g.attributes.color,ids=[hit.face.a,hit.face.b,hit.face.c];
        const triangle=new THREE.Triangle(...ids.map(id=>new THREE.Vector3().fromBufferAttribute(p,id)));
        const local=hit.object.worldToLocal(hit.point.clone()),weights=triangle.getBarycoord(local,new THREE.Vector3());
        return ids.reduce((value,id,k)=>value+c.getX(id)*weights.getComponent(k),0);
      };
      assert(lampCentre.point.z-lampEdge.point.z>.012,'Kadett lens must have genuine shallow convex depth');
      assert(interpolated(lampCentre)>interpolated(lampEdge)+.08,'Kadett lamp still appears as an unshaded white disc');
      const aboveLamp=new THREE.Raycaster(new THREE.Vector3(.557,.729,3),new THREE.Vector3(0,0,-1),0,8).intersectObject(body,true);
      assert(!aboveLamp.some(hit=>new THREE.Color().fromBufferAttribute(hit.object.geometry.attributes.color,hit.face.a).getHex()===0xd1ded9),'Kadett lamp must fit the grille rather than protrude as an oversized white cartoon eye');
      const wheel=car.userData.wheels.find(w=>w.front&&w.group.position.x>0),rim=high?wheel.high:wheel.low;
      const pressed=bodySample(rim,[3,spec.radius+.070,spec.axles[1]],[-1,0,0]);
      const vent=bodySample(rim,[3,spec.radius+.135,spec.axles[1]],[-1,0,0]);
      assert.equal(pressed.colour,0xa9b0b3,'Steel dish is hidden by its backing plate');
      assert.equal(vent.colour,0x242b30,'Period wheel ventilation slot is missing');
      assert(pressed.hit.point.x>spec.track/2+spec.tyreWidth*.3,'The visible steel face must sit ahead of its dark barrel');
    }
    // The door skin is genuinely convex, with normals turning through its
    // height. A colour wash on an otherwise flat side cannot pass these rays.
    const skin=high?body.children.find(mesh=>mesh.material.name==='vehicle-paint'):body;
    const samples=[.30,.48,.66].map(y=>bodySample(skin,[3,y,0],[-1,0,0]).hit);
    assert(samples[1].point.x-(samples[0].point.x+samples[2].point.x)*.5>(high?.018:.005),`${spec.id}: door side is still a flat slab`);
    if(high){assert(samples[0].normal.y<-.15);assert(samples[2].normal.y>.04);}
    body.traverse(mesh=>{if(!mesh.isMesh)return;const p=mesh.geometry.attributes.position,uv=mesh.geometry.attributes.uv;assert(uv&&uv.count===p.count,'All body parts must carry real atlas UVs');for(const value of uv.array)assert(value>=0&&value<=1);});
    // A real continuous painted header closes the old BMW triangular slots.
    // Sample across its whole span at both render qualities, rather than just
    // asserting that some extra 'pillar' vertices were generated somewhere.
    const [rfz,rfy,rfw]=spec.cabin.roofFront;
    for(const u of [-.78,-.4,0,.4,.78]){
      const upperHeader=bodySample(skin,[rfw*u,2,rfz-.004],[0,-1,0]).hit;
      const header=bodySample(body,[rfw*u,upperHeader.point.y-.020,3],[0,0,-1]).hit;
      assert(Math.abs(header.point.z-rfz)<.025,`${spec.id}: windshield/roof header exposes the rear cabin through a gap`);
      if(high)assert.equal(header.object.material.name,'vehicle-paint');
    }
    const seats=high?body.children.find(mesh=>mesh.material.name==='vehicle-trim'):body;
    for(const x of [-.31,.31]){
      const y=(['m1','gt3rs'].includes(spec.id)?.70:.88)+.225;
      const hits=new THREE.Raycaster(new THREE.Vector3(x,y,3),new THREE.Vector3(0,0,-1),0,8).intersectObject(seats,true);
      assert(hits.some(hit=>new THREE.Color().fromBufferAttribute(hit.object.geometry.attributes.color,hit.face.a).getHex()===0x465660),`${spec.id}: upholstered headrest is absent behind the glazing`);
      if(high)assert.equal(bodySample(seats,[x,y,3],[0,0,-1]).colour,0x465660,`${spec.id}: headrest is hidden behind an opaque interior wall`);
    }
    if(high){
      const actualGlass=body.children.find(mesh=>mesh.material.name==='vehicle-glass'),colours=actualGlass.geometry.attributes.color;
      let darkest=1,lightest=0;
      for(let n=0;n<colours.count;n++){darkest=Math.min(darkest,colours.getX(n));lightest=Math.max(lightest,colours.getX(n));}
      assert(lightest>.25&&darkest<.10,`${spec.id}: glazing has no broad illustrated sky reflection/depth range`);
      const [fz,fy,fw]=spec.cabin.front,y=(fy+.020+rfy-.018)*.5+.020;
      const width=(fw+rfw)*.5-.029;
      const glassCentre=bodySample(actualGlass,[0,y,3],[0,0,-1]).hit;
      const left=bodySample(actualGlass,[-.7*width,y,3],[0,0,-1]).hit;
      const right=bodySample(actualGlass,[.7*width,y,3],[0,0,-1]).hit;
      assert(glassCentre.point.z-Math.max(left.point.z,right.point.z)>.015,`${spec.id}: windshield is still a flat CAD pane`);
      assert(left.normal.x<-.04&&right.normal.x>.04,`${spec.id}: curved glass normals do not wrap around the cabin`);
      const paint=body.children.find(mesh=>mesh.material.name==='vehicle-paint');
      assert(paint,'Expected the actual merged coachwork mesh');
      const roofZ=(spec.cabin.roofFront[0]+spec.cabin.roofRear[0])*.5,roofWidth=(spec.cabin.roofFront[2]+spec.cabin.roofRear[2])*.5;
      const roofMiddle=bodySample(paint,[0,2,roofZ],[0,-1,0]).hit,roofShoulder=bodySample(paint,[roofWidth*.94,2,roofZ],[0,-1,0]).hit;
      assert(roofMiddle.point.y-roofShoulder.point.y>.030,`${spec.id}: roof has no broad manufactured shoulder roll`);
      assert(roofShoulder.normal.x>.29,`${spec.id}: roof shoulder remains a shallow folded plane rather than an actual rounded bevel`);
      const height=spec.profile.at(-1)[1]-.12,outerX=spec.profile.at(-1)[2]*.7;
      const centre=bodySample(paint,[0,height,3],[0,0,-1]).hit;
      const corner=bodySample(paint,[outerX,height,3],[0,0,-1]).hit;
      assert(centre.point.z-corner.point.z>.004,`${spec.id}: front remains a flat rectangular cap instead of a rounded manufactured return`);
      assert(centre.point.z-corner.point.z<.09,`${spec.id}: corner sweep distorts its defining proportions`);
      if(['kadett','e30'].includes(spec.id)){
        const bonnet=bodySample(paint,[0,2,1.65],[0,-1,0]).hit;
        const shoulder=bodySample(paint,[spec.width*.43,2,1.65],[0,-1,0]).hit;
        assert(bonnet.point.y-shoulder.point.y>.035,`${spec.id}: rolled bonnet shoulder is absent from the actual surface`);
        assert(Math.abs(shoulder.normal.x)>.15,`${spec.id}: curved shoulder must have a real smoothly varying surface normal`);
      }
      if(spec.id==='gt3rs'){
        const bonnet=bodySample(paint,[0,2,1.8],[0,-1,0]).hit;
        const wing=bodySample(paint,[.70,2,1.8],[0,-1,0]).hit;
        assert(wing.point.y>bonnet.point.y+.10,'911 front fenders must rise distinctly above the low centre bonnet');
        const roof=bodySample(paint,[0,2,-.25],[0,-1,0]).hit;
        assert(roof.point.y>1.29,'The 911 cabin must keep its recognisable roof arc instead of a flattened generic coupe roof');
      }
    }
  }
  // Chassis lean rotates only the visible/hidden body LODs. Both body meshes
  // genuinely change their world matrices while all wheel contacts stay put.
  car.updateMatrixWorld(true);
  const highBase=car.userData.highModel.children[0].matrixWorld.clone(),lowBase=car.userData.lowModel.children[0].matrixWorld.clone();
  const wheelBases=car.userData.wheels.map(w=>w.group.matrixWorld.clone()),shadowBase=car.userData.contactShadow.matrixWorld.clone();
  car.userData.bodyPivot.rotation.set(-.045,0,.11);
  for(let q=0;q<=2;q++){
    setVehicleQuality(car,q);car.updateMatrixWorld(true);
    assert.equal(car.userData.highModel.children[0].matrixWorld.equals(highBase),false,'High body must visibly lean');
    assert.equal(car.userData.lowModel.children[0].matrixWorld.equals(lowBase),false,'Low body must visibly lean');
    assert.equal(car.userData.highModel.visible,q>0);assert.equal(car.userData.lowModel.visible,q===0);
    for(const [i,w]of car.userData.wheels.entries())assert.deepEqual(w.group.matrixWorld.elements,wheelBases[i].elements,'Chassis lean must not tilt or lift wheels');
    assert.deepEqual(car.userData.contactShadow.matrixWorld.elements,shadowBase.elements);
  }
  car.userData.bodyPivot.rotation.set(0,0,0);car.updateMatrixWorld(true);
  assert.deepEqual(car.userData.highModel.children[0].matrixWorld.elements,highBase.elements);
  assert.deepEqual(car.userData.lowModel.children[0].matrixWorld.elements,lowBase.elements);
  // The visible garage light switch also changes the merged inexpensive LOD.
  // A second car must never inherit the first car's preview state.
  const other=createVehicleModel(index,{quality:0}),otherLight=other.userData.lightMaterial.color.clone();
  const lowColours=car.userData.lowModel.children[0].geometry.attributes.color,baseColours=lowColours.array.slice();
  assert.equal(setVehicleLights(car,true),true);assert.equal(car.userData.lightsOn,true);
  assert.notDeepEqual(lowColours.array,baseColours,'Merged low-detail lamps must visibly brighten');
  assert.ok(car.userData.lightMaterial.color.r>1,'High-detail lamps must visibly brighten');
  setVehicleQuality(car,0);assert.equal(car.userData.lightsOn,true);
  assert.deepEqual(other.userData.lightMaterial.color,otherLight);assert.equal(other.userData.lightsOn,false);
  assert.equal(setVehicleLights(car,false),true);assert.deepEqual(lowColours.array,baseColours,'Light preview must restore original pigment exactly');
  assert.equal(setVehicleLights(null,true),false);disposeVehicleModel(other);assert.equal(setVehicleLights(other,true),false);
  for(let n=0;n<60;n++)setVehicleQuality(car,n%3);
  const after=resources(car);assert.deepEqual(after.geometry,initial.geometry);assert.deepEqual(after.materials,initial.materials);assert.deepEqual(after.textures,initial.textures);
  const notices=new Map();for(const resource of [...initial.geometry,...initial.materials,...initial.textures])resource.addEventListener('dispose',()=>notices.set(resource,(notices.get(resource)||0)+1));
  disposeVehicleModel(car);disposeVehicleModel(car);
  assert.equal(notices.size,initial.geometry.size+initial.materials.size+initial.textures.size);assert.ok([...notices.values()].every(n=>n===1));
}
const parked=createVehicleModel(0,{quality:0,parked:true});assert.equal(parked.userData.parked,true);assert.equal(parked.userData.wheels.length,4);disposeVehicleModel(parked);
const invalid=createVehicleModel(NaN,{quality:NaN});assert.equal(invalid.userData.quality,0);disposeVehicleModel(invalid);
const upper=createVehicleModel(999,{quality:0});assert.equal(upper.userData.modelId,'gt3rs');disposeVehicleModel(upper);
const lower=createVehicleModel(-999,{quality:0});assert.equal(lower.userData.modelId,'kadett');disposeVehicleModel(lower);
// Loading bundled art after model creation updates the existing fleet. The
// lightweight per-car Texture clones retain the caller's shared Source and
// therefore remain safe when one model is disposed or an atlas is replaced.
const ownerMatcap=new THREE.DataTexture(new Uint8Array([210,215,220,255]),1,1,THREE.RGBAFormat),ownerAtlas=new THREE.DataTexture(new Uint8Array(4*4*4).fill(255),4,4,THREE.RGBAFormat);
ownerMatcap.colorSpace=ownerAtlas.colorSpace=THREE.SRGBColorSpace;
let callerDisposals=0;ownerMatcap.addEventListener('dispose',()=>callerDisposals++);ownerAtlas.addEventListener('dispose',()=>callerDisposals++);
const loadedA=createVehicleModel(0),loadedB=createVehicleModel(3);
assert.equal(setVehicleFinishTextures({matcap:{}}),false);
assert.equal(setVehicleFinishTextures({matcap:ownerMatcap,details:ownerAtlas}),true);
const finish=car=>car.userData.qualityMaterials.find(m=>m.name==='vehicle-paint');
assert.notEqual(finish(loadedA).matcap,ownerMatcap);assert.notEqual(finish(loadedA).matcap,finish(loadedB).matcap);
assert.equal(finish(loadedA).matcap.source,ownerMatcap.source);assert.equal(finish(loadedA).map.source,ownerAtlas.source);
assert.equal(finish(loadedB).map.source,ownerAtlas.source);assert.equal(resources(loadedA).textures.size,2);
let bDisposals=0;for(const texture of resources(loadedB).textures)texture.addEventListener('dispose',()=>bDisposals++);
disposeVehicleModel(loadedA);assert.equal(callerDisposals,0);assert.equal(bDisposals,0);
assert.equal(setVehicleFinishTextures({details:null}),true);assert.equal(finish(loadedB).map,null);assert.equal(bDisposals,2);assert.equal(callerDisposals,0);
assert.equal(setVehicleFinishTextures({matcap:null,details:null}),true);disposeVehicleModel(loadedB);assert.equal(callerDisposals,0);
ownerMatcap.dispose();ownerAtlas.dispose();assert.equal(callerDisposals,2);
const physical=createVehicleModel(3,{style:'physical'});assert.equal(physical.userData.renderStyle,'physical');assert.equal(physical.userData.highModel.children[0].material.isMeshPhysicalMaterial,true);assert.equal(resources(physical).textures.size,0);disposeVehicleModel(physical);
assert.equal(setVehicleQuality(new THREE.Group(),1),false);
console.log('PASS: five sculpted matcap vehicles, convex door skins, unit normals, bowed glass, closed headers, real atlas UVs, safe live texture ownership, wheel/lamps/cabin identity, 6/15 draw LODs and single disposal.');
