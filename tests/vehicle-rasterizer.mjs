import assert from 'node:assert/strict';
import * as THREE from 'three';
import {readTexture,sampleTexture,matcapCoordinates,neutralToneMapping,collectTriangles,rasterize} from '../scripts/render-vehicles.mjs';

const close=(actual,expected,tolerance=1e-6)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} ≠ ${expected}`);
const rgba=(width,height,pixel)=>{
 const data=new Uint8Array(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)data.set(pixel(x,y),4*(y*width+x));
 const texture=new THREE.DataTexture(data,width,height,THREE.RGBAFormat);
 texture.colorSpace=THREE.SRGBColorSpace;texture.flipY=false;texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.needsUpdate=true;return texture;
};

// The CPU projection must follow the same tangent basis as THREE's native
// meshmatcap fragment shader, including cameras that are not dead centre.
for(let i=0;i<200;i++){
 const n=new THREE.Vector3(Math.sin(i*.31),Math.cos(i*.73),Math.sin(i*.89)).normalize();
 const view=new THREE.Vector3(Math.sin(i*.17)*.4,Math.cos(i*.23)*.35,1).normalize();
 const right=new THREE.Vector3(view.z,0,-view.x).normalize(),up=new THREE.Vector3().crossVectors(view,right);
 const uv=matcapCoordinates(n.x,n.y,n.z,view.x*7,view.y*7,view.z*7);
 close(uv[0],right.dot(n)*.495+.5);close(uv[1],up.dot(n)*.495+.5);
}

// A texture is decoded once, with filtering performed in linear space just as
// on the GPU. Neighbouring atlas tiles do not acquire nearest-neighbour steps.
const colors=rgba(2,2,(x,y)=>[x?255:0,y?255:0,x===y?255:0,255]);
const sampled=readTexture(colors);assert.equal(readTexture(colors),sampled,'Decoded source pixels are shared');
assert.deepEqual(sampleTexture(sampled,colors,.25,.25),[0,0,1,1]);
assert.deepEqual(sampleTexture(sampled,colors,.75,.75),[1,1,1,1]);
assert.deepEqual(sampleTexture(sampled,colors,.5,.5),[.5,.5,.5,1]);
colors.flipY=true;assert.deepEqual(sampleTexture(sampled,colors,.25,.25),[0,1,0,1]);colors.flipY=false;
const grey=rgba(2,1,x=>[x?255:128,x?255:128,x?255:128,255]);
const greyLinear=((128/255+.055)/1.055)**2.4;
close(sampleTexture(readTexture(grey),grey,.5,.5)[0],(greyLinear+1)*.5);
grey.colorSpace=THREE.NoColorSpace;close(sampleTexture(readTexture(grey),grey,.5,.5)[0],(128/255+1)*.5);
colors.offset.set(.5,0);colors.repeat.set(.5,1);colors.updateMatrix();
close(sampleTexture(sampled,colors,.5,.25)[0],1);colors.offset.set(0,0);colors.repeat.set(1,1);colors.updateMatrix();
colors.wrapS=THREE.RepeatWrapping;
close(sampleTexture(sampled,colors,1.25,.25)[0],sampleTexture(sampled,colors,.25,.25)[0]);

function render(mesh,options){
 const camera=new THREE.OrthographicCamera(-1.4,1.4,1.4,-1.4,.01,20);camera.position.set(0,.35,4);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
 const triangles=collectTriangles(mesh,camera,160,160),result=rasterize(triangles,160,160,options);
 return {triangles,pixels:result.canvas.getContext('2d').getImageData(0,0,160,160).data};
}
const finish=rgba(64,64,(x,y)=>{
 const u=x/63,v=y/63,key=Math.exp(-((u-.25)**2/.04+(v-.25)**2/.12)),value=Math.round(72+110*(1-v)+70*key);
 return [value,Math.min(255,value+4),Math.min(255,value+9),255];
});
const sphereGeometry=new THREE.SphereGeometry(1,24,16),material=new THREE.MeshMatcapMaterial({color:0x7996b5,matcap:finish});
const sculpted=render(new THREE.Mesh(sphereGeometry,material));
const opaque=[];for(let i=0;i<sculpted.pixels.length;i+=4)if(sculpted.pixels[i+3]===255)opaque.push(sculpted.pixels[i]);
assert.ok(opaque.length>8000,'The actual rounded mesh is rasterized, not replaced by a flat mockup');
assert.ok(Math.max(...opaque)-Math.min(...opaque)>60,'Curved normals reveal the broad reflected finish');
assert.ok(new Set(opaque).size>70,'Soft reflections keep a continuous gradient across the surface');
assert.ok(sculpted.triangles.every(t=>t.data.matcap&&t.cameraNormal&&t.vertices.every(v=>v.viewPosition)));
finish.offset.set(.3,.1);finish.repeat.set(.5,.4);finish.updateMatrix();
const uvIndependent=render(new THREE.Mesh(sphereGeometry,material));
assert.deepEqual(Array.from(uvIndependent.pixels),Array.from(sculpted.pixels),'Native matcap coordinates ignore the diffuse texture UV matrix');
const even=rgba(2,2,()=>[180,180,180,255]);material.matcap=even;
const constant=render(new THREE.Mesh(sphereGeometry,material)),constantColors=new Set();
for(let i=0;i<constant.pixels.length;i+=4)if(constant.pixels[i+3]===255)constantColors.add(constant.pixels[i]);
assert.equal(constantColors.size,1,'Matcap materials are not accidentally multiplied by flat Toon/diffuse lighting');

// The fleet's optional single-pass coat uses the same metadata/uniform values
// in CPU and WebGL; neutral highlights must not bleach dark tyres or trim.
const coatedMaterial=material.clone();coatedMaterial.matcap=rgba(2,2,()=>[255,255,255,255]);
Object.assign(coatedMaterial.userData,{finishLift:.38,finishGain:.82,finishCoat:.34});
const coated=render(new THREE.Mesh(sphereGeometry,coatedMaterial));
const srgb=value=>255*(value<=.0031308?12.92*value:1.055*value**(1/2.4)-.055);
const base=coatedMaterial.color.toArray(),tint=[.96,.985,1],centre=(80*160+80)*4;
for(let channel=0;channel<3;channel++)close(coated.pixels[centre+channel],Math.min(255,Math.round(srgb(base[channel]*1.2+tint[channel]*.34))),1);
const tyreMaterial=coatedMaterial.clone();tyreMaterial.color.set(0x111111);
const tyre=render(new THREE.Mesh(sphereGeometry,tyreMaterial));
assert.ok(tyre.pixels[centre]<25&&tyre.pixels[centre+1]<25&&tyre.pixels[centre+2]<25,'Coat mask preserves dark rubber and trim');

// Match the actual game's exposure/tone mapping at bake time. The exported
// generic rasterizer stays opt-in so map QA is not silently recoloured.
const middle=neutralToneMapping([.1,.2,.3]);for(const [i,expected] of [.065,.17,.275].entries())close(middle[i],expected);
const dark=neutralToneMapping([.01,.02,.03]);for(const [i,expected] of [.0006890625,.0111890625,.0216890625].entries())close(dark[i],expected);
for(const value of neutralToneMapping([1,1,1]))close(value,.8824489795918368);
assert.deepEqual(neutralToneMapping([0,0,0]),[0,0,0]);
const compressed=neutralToneMapping([2,0,0]);assert.ok(compressed[0]<1&&compressed[1]>0&&compressed[1]===compressed[2],'Hot highlights compress and gently desaturate instead of clipping');
const toned=render(new THREE.Mesh(sphereGeometry,coatedMaterial),{toneMapping:'neutral',exposure:1.05});
assert.notDeepEqual(Array.from(toned.pixels.slice(centre,centre+3)),Array.from(coated.pixels.slice(centre,centre+3)));
coatedMaterial.toneMapped=false;
const excluded=render(new THREE.Mesh(sphereGeometry,coatedMaterial),{toneMapping:'neutral',exposure:1.05});
assert.deepEqual(Array.from(excluded.pixels),Array.from(coated.pixels),'Materials that disable tone mapping keep their native output');

// Real atlas UVs/alphaTest go through the same depth-tested rasterizer. The
// transparent texels reveal the background rather than darkening it or writing depth.
const atlas=rgba(8,8,x=>x<4?[255,0,0,255]:[0,255,0,0]);
const cutoutMaterial=new THREE.MeshMatcapMaterial({color:0xffffff,matcap:rgba(2,2,()=>[255,255,255,255]),map:atlas,alphaTest:.5});
const panel=render(new THREE.Mesh(new THREE.PlaneGeometry(2,2),cutoutMaterial));
let red=0,clear=0;for(let y=35;y<125;y++)for(let x=35;x<125;x++){
 const at=(y*160+x)*4;if(panel.pixels[at+3]===0)clear++;else if(panel.pixels[at]>180&&panel.pixels[at+1]<60)red++;
}
assert.ok(red>2500&&clear>2500,'Atlas alpha cutouts and colored detail areas remain independently visible');
console.log('PASS native CPU vehicle finish: THREE camera-space matcap basis, smooth rounded-normal reflections, identical single-pass lift/coat with dark-trim mask, opt-in NeutralToneMapping/exposure, cached sRGB bilinear atlas sampling, texture transforms/wrap/flipY and alpha-tested detail geometry.');
