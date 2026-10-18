/**
 * Offline, deterministic rendering of the actual THREE car meshes.
 * No browser, WebGL context, remote service or invented replacement model is used.
 *
 * node scripts/render-vehicles.mjs [--frames=16] [--size=640] [--samples=3]
 *   [--elevation=18] [--yaw=0]
 *   [--model=src/vehicle-models.js] [--out=assets/vehicles]
 *   [--finish=assets/nextlevel/car-finish.webp] [--details=assets/nextlevel/car-details.webp]
 *   [--cars=m2,gt3rs] [--quality=0|1|2] [--qa=../qa/fleet.png]
 *
 * The Codex runtime supplies @napi-rs/canvas and sharp. Outside that runtime,
 * install these two packages locally before running this optional art-build step.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import * as THREE from 'three';

const root = fileURLToPath(new URL('../', import.meta.url));
const localRequire = createRequire(import.meta.url);
const runtimeRequire = process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
  ? createRequire(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, '../package.json'))
  : localRequire;
function dependency(name) {
  try { return localRequire(name); }
  catch { return runtimeRequire(name); }
}
const {createCanvas, loadImage} = dependency('@napi-rs/canvas');
const sharp = dependency('sharp');
const args = Object.fromEntries(process.argv.slice(2).map(arg => {
  const [key, value = 'true'] = arg.replace(/^--/, '').split('=');
  return [key, value];
}));
const width = Math.round(Math.max(128, Math.min(1600, Number(args.size) || 640)));
const height = Math.round(width / 1.6);
const frames = Math.round(Math.max(1, Math.min(64, Number(args.frames) || 16)));
const samples = Math.round(Math.max(1, Math.min(4, Number(args.samples) || 3)));
const elevation=clampArgument(Number(args.elevation)||18,10,30),targetHeight=.66,orthographicWidth=6.26;
const yawOffset=Number.isFinite(Number(args.yaw))?Number(args.yaw):0;
function clampArgument(value,min,max){return Math.max(min,Math.min(max,value));}
const out = path.resolve(root, args.out || 'assets/vehicles');
const modelPath = path.resolve(root, args.model || 'src/vehicle-models.js');

// Legacy canvas labels are supported for comparisons; the new models need no DOM.
globalThis.document ??= {createElement(tag) {
  if (tag !== 'canvas') throw new Error(`Unsupported offline element: ${tag}`);
  return createCanvas(1, 1);
}, querySelector() { return null; }};
const textureCache = new WeakMap();
// Workshop windows supply a broad warm key from the left, with cool open-door
// fill. This stays in world space as the camera goes around the car.
const light = new THREE.Vector3(-.58, .82, .24).normalize();
const fill = new THREE.Vector3(.72, .46, -.42).normalize();
const workshopTint=[1.012,.997,.975],doorFillTint=[-.012,.005,.035];
const finishCoatTint=[.96,.985,1];
const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const srgb = value => 255 * (value <= .0031308 ? 12.92 * value : 1.055 * Math.pow(value, 1 / 2.4) - .055);
const linear = value => value <= .04045 ? value / 12.92 : Math.pow((value + .055) / 1.055, 2.4);

export function readTexture(map) {
  if (!map?.image) return null;
  if (textureCache.has(map.image)) return textureCache.get(map.image);
  const image = map.image;
  // The native model's small procedural matcap needs no DOM or image decoder.
  if(image.data&&image.width&&image.height){
    const channels=image.data.length/(image.width*image.height),rgba=new Uint8ClampedArray(image.width*image.height*4);
    const float=image.data instanceof Float32Array||image.data instanceof Float64Array;
    for(let i=0;i<image.width*image.height;i++){
      for(let c=0;c<3;c++)rgba[i*4+c]=(image.data[i*channels+(channels===1?0:Math.min(c,channels-1))]??1)*(float?255:1);
      rgba[i*4+3]=channels===4?image.data[i*channels+3]*(float?255:1):255;
    }
    const pixels={width:image.width,height:image.height,data:rgba};textureCache.set(image,pixels);return pixels;
  }
  let canvas = image;
  if (!image.getContext) {
    canvas = createCanvas(image.width, image.height);
    canvas.getContext('2d').drawImage(image, 0, 0);
  }
  const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  textureCache.set(image, pixels);
  return pixels;
}

/** Matches THREE's native meshmatcap fragment shader, in camera space. */
export function matcapCoordinates(nx,ny,nz,vx,vy,vz,out=[0,0]){
  const vl=Math.hypot(vx,vy,vz)||1;vx/=vl;vy/=vl;vz/=vl;
  const horizontal=Math.hypot(vx,vz);
  if(horizontal<1e-8){out[0]=nx*.495+.5;out[1]=(vz*ny-vy*nz)*.495+.5;return out;}
  out[0]=(vz*nx-vx*nz)/horizontal*.495+.5;
  out[1]=(-vy*vx*nx/horizontal+horizontal*ny-vy*vz*nz/horizontal)*.495+.5;
  return out;
}

/** Exact installed THREE NeutralToneMapping; used by the vehicle bake only. */
export function neutralToneMapping(color,exposure=1.05,out=color){
  let r=color[0]*exposure,g=color[1]*exposure,b=color[2]*exposure;
  const x=Math.min(r,g,b),offset=x<.08?x-6.25*x*x:.04;
  r-=offset;g-=offset;b-=offset;
  const peak=Math.max(r,g,b);
  if(peak<.76){out[0]=r;out[1]=g;out[2]=b;return out;}
  const d=1-.76,newPeak=1-d*d/(peak+d-.76),scale=newPeak/peak;
  const blend=1-1/(.15*(peak-newPeak)+1);
  out[0]=r*scale*(1-blend)+newPeak*blend;
  out[1]=g*scale*(1-blend)+newPeak*blend;
  out[2]=b*scale*(1-blend)+newPeak*blend;
  return out;
}

const wrappedUv=(value,mode)=>mode===THREE.RepeatWrapping?((value%1)+1)%1:mode===THREE.MirroredRepeatWrapping?1-Math.abs(((value%2)+2)%2-1):clamp(value,0,1);
const wrappedIndex=(value,length,mode)=>mode===THREE.RepeatWrapping?((value%length)+length)%length:clamp(value,0,length-1);
function texturePixels(texture,srgb){
  const key=srgb?'linearPixels':'normalisedPixels';if(texture[key])return texture[key];
  const result=new Float32Array(texture.data.length);
  for(let i=0;i<result.length;i++){const value=texture.data[i]/255;result[i]=srgb&&i%4!==3?linear(value):value;}
  texture[key]=result;return result;
}
/** GPU-style texel centres and bilinear filtering keep broad highlights smooth. */
export function sampleTexture(texture,map,u,v,out=[1,1,1,1],applyMatrix=true){
  if(!texture){out[0]=out[1]=out[2]=out[3]=1;return out;}
  if(applyMatrix&&map?.matrix){const m=map.matrix.elements,originalU=u;u=m[0]*u+m[3]*v+m[6];v=m[1]*originalU+m[4]*v+m[7];}
  u=wrappedUv(u,map?.wrapS);v=wrappedUv(v,map?.wrapT);if(map?.flipY!==false)v=1-v;
  const x=u*texture.width-.5,y=v*texture.height-.5,x0=Math.floor(x),y0=Math.floor(y),tx=x-x0,ty=y-y0;
  const xa=wrappedIndex(x0,texture.width,map?.wrapS),xb=wrappedIndex(x0+1,texture.width,map?.wrapS);
  const ya=wrappedIndex(y0,texture.height,map?.wrapT),yb=wrappedIndex(y0+1,texture.height,map?.wrapT);
  const a=(ya*texture.width+xa)*4,b=(ya*texture.width+xb)*4,c=(yb*texture.width+xa)*4,d=(yb*texture.width+xb)*4;
  const wa=(1-tx)*(1-ty),wb=tx*(1-ty),wc=(1-tx)*ty,wd=tx*ty;
  const pixels=texturePixels(texture,map?.colorSpace===THREE.SRGBColorSpace);
  for(let channel=0;channel<4;channel++){
    out[channel]=pixels[a+channel]*wa+pixels[b+channel]*wb+pixels[c+channel]*wc+pixels[d+channel]*wd;
  }
  return out;
}

export function materialData(material) {
  const color = material.color || new THREE.Color(0xffffff);
  const emissive = material.emissive || new THREE.Color(0x000000);
  return {
    base: [color.r, color.g, color.b],
    emission: [emissive.r, emissive.g, emissive.b].map(v => v * (material.emissiveIntensity ?? 1)),
    opacity: material.transparent ? material.opacity : 1,
    transparent: !!material.transparent,
    alphaTest: material.alphaTest||0,
    depthWrite: material.depthWrite !== false,
    metal: material.metalness ?? 0,
    roughness: material.roughness ?? .8,
    clearcoat: material.clearcoat ?? 0,
    basic: !!material.isMeshBasicMaterial,
    toneMapped: material.toneMapped!==false,
    toon: !!material.isMeshToonMaterial,
    matcap: !!material.isMeshMatcapMaterial,
    matcapTexture: readTexture(material.matcap),
    matcapMap: material.matcap,
    finishLift: Number(material.userData?.finishLift)||0,
    finishGain: Number.isFinite(material.userData?.finishGain)?material.userData.finishGain:1,
    finishCoat: Number(material.userData?.finishCoat)||0,
    toonRamp: material.gradientMap?.image?.data ? Array.from(material.gradientMap.image.data, value=>value/255) : null,
    vertexColors: !!material.vertexColors,
    side: material.side,
    texture: readTexture(material.map),
    map: material.map
  };
}

export function collectTriangles(model, camera, W, H) {
  model.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  const projection = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  const cameraNormal=new THREE.Matrix3().setFromMatrix4(camera.matrixWorldInverse).elements;
  const p = new THREE.Vector3(), n = new THREE.Vector3();
  const cameraPoint=new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();
  const view = new THREE.Vector3();
  const materials = new Map(), triangles = [];
  const instanceMatrix = new THREE.Matrix4(), transform = new THREE.Matrix4();
  model.traverse(mesh => {
    if (!mesh.isMesh || !mesh.geometry) return;
    for (let parent = mesh; parent; parent = parent.parent) if (!parent.visible) return;
    // Gameplay effects and the legacy blob are not part of the showroom body.
    if (mesh.name === 'contact-shadow' || mesh.material?.wireframe || mesh.material?.opacity < .3) return;
    const geometry = mesh.geometry;
    const positions = geometry.attributes.position;
    const normals = geometry.attributes.normal;
    const colors = geometry.attributes.color;
    const uv = geometry.attributes.uv;
    const indices = geometry.index;
    const count = indices?.count ?? positions.count;
    for (let instance = 0; instance < (mesh.isInstancedMesh ? mesh.count : 1); instance++) {
      if (mesh.isInstancedMesh) {
        mesh.getMatrixAt(instance, instanceMatrix);
        transform.multiplyMatrices(mesh.matrixWorld, instanceMatrix);
      } else transform.copy(mesh.matrixWorld);
      normalMatrix.getNormalMatrix(transform);
      const vertices = Array.from({length: positions.count}, (_, i) => {
        p.fromBufferAttribute(positions, i).applyMatrix4(transform);
        const world = [p.x, p.y, p.z];
        cameraPoint.copy(p).applyMatrix4(camera.matrixWorldInverse).multiplyScalar(-1);
        const e = projection.elements;
        const w = p.x * e[3] + p.y * e[7] + p.z * e[11] + e[15];
        p.applyMatrix4(projection);
        if (normals) n.fromBufferAttribute(normals, i).applyMatrix3(normalMatrix).normalize();
        else n.set(0, 1, 0);
        return {
          screen: [(p.x * .5 + .5) * W, (-p.y * .5 + .5) * H, p.z],
          world, normal: [n.x, n.y, n.z],viewPosition:cameraPoint.toArray(),
          color: colors ? [colors.getX(i), colors.getY(i), colors.getZ(i)] : [1, 1, 1],
          uv: uv ? [uv.getX(i), uv.getY(i)] : [0, 0], invW: 1 / w
        };
      });
      for (let offset = 0; offset < count; offset += 3) {
        const ids = [0, 1, 2].map(i => indices ? indices.getX(offset + i) : offset + i);
        const verticesOfFace = ids.map(i => vertices[i]);
        const group = geometry.groups.find(g => offset >= g.start && offset < g.start + g.count);
        const material = Array.isArray(mesh.material) ? mesh.material[group?.materialIndex ?? 0] : mesh.material;
        if (!material || !material.visible) continue;
        if (!materials.has(material)) {
          if(material.map?.matrixAutoUpdate)material.map.updateMatrix();
          materials.set(material, materialData(material));
        }
        const data = materials.get(material);
        const [a, b, c] = verticesOfFace;
        const aa = new THREE.Vector3(...a.world), bb = new THREE.Vector3(...b.world), cc = new THREE.Vector3(...c.world);
        const faceNormal = bb.sub(aa).cross(cc.sub(aa)).normalize();
        const center = a.world.map((value, axis) => (value + b.world[axis] + c.world[axis]) / 3);
        view.copy(camera.position).sub(new THREE.Vector3(...center)).normalize();
        const face = faceNormal.dot(view);
        if (data.side !== THREE.DoubleSide && (data.side === THREE.BackSide ? face > 0 : face < 0)) continue;
        if (verticesOfFace.some(v => v.invW <= 0 || v.screen[2] < -1)) continue;
        if ([0, 1].some(axis => verticesOfFace.every(v => v.screen[axis] < 0) || verticesOfFace.every(v => v.screen[axis] > (axis ? H : W)))) continue;
        const normalSign = face < 0 ? -1 : 1;
        const halfKey = light.clone().add(view).normalize();
        const halfFill = fill.clone().add(view).normalize();
        triangles.push({vertices: verticesOfFace, data, normalSign,cameraNormal, view: view.toArray(), halfKey: halfKey.toArray(), halfFill: halfFill.toArray(), depth: center.reduce((sum, value, axis) => sum + (value - camera.position.getComponent(axis)) ** 2, 0)});
      }
    }
  });
  // Opaque depth resolves intersecting geometry; glass is blended back to front.
  triangles.sort((a, b) => Number(a.data.transparent) - Number(b.data.transparent) || (a.data.transparent ? b.depth - a.depth : a.depth - b.depth));
  return triangles;
}

export function rasterize(triangles, W, H,{toneMapping='none',exposure=1.05}={}) {
  const canvas = createCanvas(W, H), context = canvas.getContext('2d');
  const image = context.createImageData(W, H), pixels = image.data;
  const depthBuffer = new Float32Array(W * H).fill(Infinity);
  let visiblePixels = 0;
  for (const triangle of triangles) {
    const {vertices: [v0, v1, v2], data, normalSign,cameraNormal, view, halfKey, halfFill} = triangle;
    const [a, b, c] = [v0.screen, v1.screen, v2.screen];
    const denominator = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
    if (Math.abs(denominator) < .01) continue;
    const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]))), maxX = Math.min(W - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
    const minY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))), maxY = Math.min(H - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
    const ax = (b[1] - c[1]) / denominator, ay = (c[0] - b[0]) / denominator;
    const bx = (c[1] - a[1]) / denominator, by = (a[0] - c[0]) / denominator;
    const exponent = 14 + (1 - data.roughness) ** 2 * 260;
    const diffuseAmount = 1 - data.metal * .42;
    const reflective=!data.basic&&!data.toon&&!data.matcap;
    const texel=[1,1,1,1],finishTexel=[1,1,1,1],finishUv=[.5,.5],outgoing=[0,0,0];
    for (let y = minY; y <= maxY; y++) {
      let w0 = ax * (minX + .5 - c[0]) + ay * (y + .5 - c[1]);
      let w1 = bx * (minX + .5 - c[0]) + by * (y + .5 - c[1]);
      for (let x = minX; x <= maxX; x++, w0 += ax, w1 += bx) {
        const w2 = 1 - w0 - w1;
        if (w0 < -.0001 || w1 < -.0001 || w2 < -.0001) continue;
        const depth = w0 * a[2] + w1 * b[2] + w2 * c[2];
        const pixel = y * W + x;
        if (depth > depthBuffer[pixel] + .00002 || depth > 1) continue;
        const inverse = w0 * v0.invW + w1 * v1.invW + w2 * v2.invW;
        const f0 = w0 * v0.invW / inverse, f1 = w1 * v1.invW / inverse, f2 = 1 - f0 - f1;
        let nx = (f0 * v0.normal[0] + f1 * v1.normal[0] + f2 * v2.normal[0]) * normalSign;
        let ny = (f0 * v0.normal[1] + f1 * v1.normal[1] + f2 * v2.normal[1]) * normalSign;
        let nz = (f0 * v0.normal[2] + f1 * v1.normal[2] + f2 * v2.normal[2]) * normalSign;
        const nLength = Math.hypot(nx, ny, nz) || 1;
        nx /= nLength; ny /= nLength; nz /= nLength;
        const keyDot = data.matcap?0:Math.max(0, nx * light.x + ny * light.y + nz * light.z);
        const fillDot = data.matcap?0:Math.max(0, nx * fill.x + ny * fill.y + nz * fill.z);
        const ambient = .27 + .32 * (ny * .5 + .5);
        const illumination=ambient+keyDot*.51+fillDot*.20;
        const rampT=clamp((illumination-.34)/.82,0,1)*(data.toonRamp?.length-1||1),rampA=Math.floor(rampT),rampB=Math.min((data.toonRamp?.length||2)-1,rampA+1);
        const cel=data.toonRamp?(data.toonRamp[rampA]*(1-(rampT-rampA))+data.toonRamp[rampB]*(rampT-rampA))*1.11:illumination;
        const diffuse=data.basic?1:data.toon?cel:illumination*diffuseAmount;
        const keyHighlight = reflective?Math.pow(Math.max(0, nx * halfKey[0] + ny * halfKey[1] + nz * halfKey[2]), exponent):0;
        const fillHighlight = reflective?Math.pow(Math.max(0, nx * halfFill[0] + ny * halfFill[1] + nz * halfFill[2]), exponent):0;
        const viewDot = reflective?Math.max(0, nx * view[0] + ny * view[1] + nz * view[2]):1;
        const reflectedY = 2 * viewDot * ny - view[1];
        const panel = reflective?Math.exp(-Math.pow((reflectedY - .35) * 3.5, 2)) * .34 + Math.exp(-Math.pow((reflectedY + .17) * 9, 2)) * .11:0;
        const fresnel = reflective?Math.pow(1 - viewDot, 5):0;
        let alpha = data.opacity;
        if (data.texture) {
          const u = f0 * v0.uv[0] + f1 * v1.uv[0] + f2 * v2.uv[0];
          const v = f0 * v0.uv[1] + f1 * v1.uv[1] + f2 * v2.uv[1];
          sampleTexture(data.texture,data.map,u,v,texel);alpha*=texel[3];
        }
        if (alpha < Math.max(.01,data.alphaTest)) continue;
        let coat=0;
        if(data.matcap){
          const m=cameraNormal,vx=f0*v0.viewPosition[0]+f1*v1.viewPosition[0]+f2*v2.viewPosition[0],
            vy=f0*v0.viewPosition[1]+f1*v1.viewPosition[1]+f2*v2.viewPosition[1],vz=f0*v0.viewPosition[2]+f1*v1.viewPosition[2]+f2*v2.viewPosition[2];
          matcapCoordinates(m[0]*nx+m[3]*ny+m[6]*nz,m[1]*nx+m[4]*ny+m[7]*nz,m[2]*nx+m[5]*ny+m[8]*nz,vx,vy,vz,finishUv);
          // Native matcap coordinates bypass the diffuse-map UV transform.
          if(data.matcapTexture)sampleTexture(data.matcapTexture,data.matcapMap,finishUv[0],finishUv[1],finishTexel,false);
          else finishTexel[0]=finishTexel[1]=finishTexel[2]=.2+.6*finishUv[1];
          if(data.finishCoat){
            const luma=finishTexel[0]*.2126+finishTexel[1]*.7152+finishTexel[2]*.0722;
            coat=clamp((luma-.58)/.42,0,1)**2*data.finishCoat;
            if(coat){
              let maxBase=0;for(let c=0;c<3;c++)maxBase=Math.max(maxBase,data.base[c]*texel[c]*(data.vertexColors?f0*v0.color[c]+f1*v1.color[c]+f2*v2.color[c]:1));
              const mask=clamp((maxBase-.04)/.24,0,1);coat*=mask*mask*(3-2*mask);
            }
          }
        }
        if (!data.transparent && data.depthWrite) depthBuffer[pixel] = depth;
        const oldAlpha = pixels[pixel * 4 + 3] / 255;
        const combinedAlpha = alpha + oldAlpha * (1 - alpha);
        for (let channel = 0; channel < 3; channel++) {
          const vertexColor = data.vertexColors ? f0 * v0.color[channel] + f1 * v1.color[channel] + f2 * v2.color[channel] : 1;
          const base = data.base[channel] * vertexColor * texel[channel];
          const f = .045 * (1 - data.metal) + base * data.metal;
          const specular = data.basic||data.toon||data.matcap ? 0 : (keyHighlight * 1.8 + fillHighlight * .72) * (f + .07) + panel * (f + fresnel * .16) + data.clearcoat * (panel * .18 + keyHighlight * .12 + fresnel * .08);
          const tint=workshopTint[channel]+fillDot*doorFillTint[channel];
          let matcapLight=base*(data.finishLift+data.finishGain*finishTexel[channel]);
          if(coat)matcapLight+=finishCoatTint[channel]*coat;
          outgoing[channel]=Math.max(0,data.matcap?matcapLight:base * diffuse * tint + specular + data.emission[channel]);
        }
        if(toneMapping==='neutral'&&data.toneMapped)neutralToneMapping(outgoing,exposure);
        for(let channel=0;channel<3;channel++){
          const color=clamp(srgb(Math.max(0,outgoing[channel])),0,255);
          pixels[pixel * 4 + channel] = (color * alpha + pixels[pixel * 4 + channel] * oldAlpha * (1 - alpha)) / combinedAlpha;
        }
        if (!oldAlpha) visiblePixels++;
        pixels[pixel * 4 + 3] = combinedAlpha * 255;
      }
    }
  }
  context.putImageData(image, 0, 0);
  return {canvas, visiblePixels};
}

function contactShadow(ctx, camera, bounds, model, W, H) {
  const vp = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  const point = (x, z) => {
    const p = new THREE.Vector3(x,.006,z).applyMatrix4(model.matrixWorld).applyMatrix4(vp);
    return [(p.x * .5 + .5) * W, (-p.y * .5 + .5) * H];
  };
  const ellipse=(x,z,rx,rz,opacity)=>{
    const center=point(x,z),axisX=point(x+rx,z),axisZ=point(x,z+rz);
    ctx.save();ctx.setTransform(axisX[0]-center[0],axisX[1]-center[1],axisZ[0]-center[0],axisZ[1]-center[1],center[0],center[1]);
    const gradient=ctx.createRadialGradient(0,0,.04,0,0,1);
    gradient.addColorStop(0,`rgba(15,20,27,${opacity})`);
    gradient.addColorStop(.5,`rgba(15,20,27,${opacity*.72})`);gradient.addColorStop(1,'rgba(15,20,27,0)');
    ctx.fillStyle=gradient;ctx.fillRect(-1,-1,2,2);ctx.restore();
  };
  const width=bounds.max.x-bounds.min.x,length=bounds.max.z-bounds.min.z;
  ellipse(.10,-.045,width*.53,length*.50,.15);
  ellipse(0,0,width*.40,length*.43,.22);
  for(const wheel of model.userData.wheels||[]){
    const p=model.worldToLocal(wheel.group.getWorldPosition(new THREE.Vector3()));
    // Small, dense tyre contacts sit on the same actual Y=0 plane as the body
    // shadow. They cannot detach when a sprite is rotated or resized.
    ellipse(p.x,p.z,.19,Math.max(.14,wheel.radius*.57),.48);
  }
}

export function visibleBounds(model) {
  const bounds = new THREE.Box3();
  model.updateMatrixWorld(true);
  const instance=new THREE.Matrix4(),world=new THREE.Matrix4();
  model.traverseVisible(mesh => {
    if (!mesh.isMesh || mesh.name === 'contact-shadow' || mesh.material?.wireframe || mesh.material?.opacity < .3) return;
    mesh.geometry.computeBoundingBox();
    if(mesh.isInstancedMesh){for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,instance);world.multiplyMatrices(mesh.matrixWorld,instance);bounds.union(mesh.geometry.boundingBox.clone().applyMatrix4(world));}}
    else bounds.union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld));
  });
  return bounds;
}

async function renderVehicles(){
const modelModule = await import(pathToFileURL(modelPath));
const makeModel = modelModule.createVehicleModel || modelModule.makeCar;
if (!makeModel) throw new Error('The model module must export createVehicleModel() or makeCar()');
const textures={};
if(modelModule.setVehicleFinishTextures){
  const installed={};
  for(const [name,filename] of [['matcap',args.finish||'assets/nextlevel/car-finish.webp'],['details',args.details||'assets/nextlevel/car-details.webp']]){
    if(filename==='fallback'){textures[name]=null;continue;}
    const source=path.resolve(root,filename),bytes=await fs.readFile(source);
    const texture=new THREE.CanvasTexture(await loadImage(bytes));texture.colorSpace=THREE.SRGBColorSpace;
    texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=false;texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping;
    installed[name]=texture;textures[name]={path:path.relative(root,source),sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length};
  }
  modelModule.setVehicleFinishTextures(installed);
}
await fs.mkdir(out, {recursive: true});
const ids = modelModule.VEHICLE_MODELS?.map(spec => spec.id) || ['kadett', 'e30', 'm1'];
const names = ['Opel Kadett C Coupé', 'AC Schnitzer BMW E30 M3', 'BMW M1 Procar', 'BMW M2 Competition', 'Porsche 911 GT3 RS'];
const selectedIds = args.cars ? args.cars.split(',') : ids;
if (selectedIds.some(id => !ids.includes(id))) throw new Error('Unknown car requested: ' + selectedIds.join(','));
const quality = args.quality === undefined ? 2 : clamp(Math.trunc(Number(args.quality)), 0, 2);
if (!Number.isFinite(quality)) throw new Error('Quality must be 0, 1 or 2');
const modelHash = createHash('sha256').update(await fs.readFile(modelPath)).digest('hex').slice(0, 16);
const artHash = createHash('sha256').update(await fs.readFile(modelPath)).update(await fs.readFile(fileURLToPath(import.meta.url))).update(JSON.stringify({width, height, frames, samples, quality, selectedIds,elevation,yawOffset,textures})).digest('hex').slice(0, 16);
const groundAnchor=[width/2,height/2+targetHeight*Math.cos(elevation*Math.PI/180)*width/orthographicWidth].map(value=>Number(value.toFixed(6)));
const manifest = {version: 5, modelVersion:'breuer-fleet-6', renderStyle:'sculpted-soft-matcap-arcade', geometryHash: modelHash, artHash,textures,colorManagement:{toneMapping:'NeutralToneMapping',exposure:1.05,output:'SRGBColorSpace'}, renderer: 'CPU triangle rasterizer with native camera-space matcaps, bilinear sRGB detail atlases, NeutralToneMapping, supersampling and projected tyre-contact shadows', width, height, frames, samples, quality,
 camera: {projection: 'orthographic',motion:'fixed-camera-rotating-model',front: '+Z',yawRadiansPerFrame:TAU/frames,yawOffsetDegrees:yawOffset,elevationDegrees:elevation,targetHeight,orthographicWidth,pixelsPerMetre:width/orthographicWidth,groundAnchor,frameZero:yawOffset===0?'front':`${yawOffset}-degrees`},
 framing:{mode:'fixed-scale-ground-pivot',fit:.88,anchor:[.5,.64]},cars: []};
const W = width * samples, H = height * samples;
const previewImages = [];
for (const id of selectedIds) {
  const index=ids.indexOf(id);
  const model = modelModule.createVehicleModel ? makeModel(index, {quality}) : makeModel(index, false);
  const bounds = visibleBounds(model);
  const camera = new THREE.OrthographicCamera(-orthographicWidth/2,orthographicWidth/2,orthographicWidth/3.2,-orthographicWidth/3.2,.01,50);
  const target = new THREE.Vector3(0,targetHeight,0);
  camera.position.set(0,targetHeight+Math.tan(elevation*Math.PI/180)*9,9);
  camera.lookAt(target);camera.updateMatrixWorld(true);
  const carDir = path.join(out, id);
  await fs.mkdir(carDir, {recursive: true});
  const stats = [];
  for (let frame = 0; frame < frames; frame++) {
    const yaw = frame * TAU / frames+yawOffset*Math.PI/180;
    // The garage eye and windows stay fixed. Rotate the model rather than
    // orbiting its camera, so the key/fill remain on the same workshop side.
    model.rotation.y=-yaw;model.updateMatrixWorld(true);
    const triangles = collectTriangles(model, camera, W, H);
    const {canvas, visiblePixels} = rasterize(triangles, W, H,{toneMapping:'neutral',exposure:1.05});
    const final = createCanvas(W, H), ctx = final.getContext('2d');
    contactShadow(ctx, camera, bounds, model, W, H);
    ctx.drawImage(canvas, 0, 0);
    const filename = `${String(frame).padStart(2, '0')}.webp`;
    const buffer = await sharp(final.toBuffer('image/png')).resize(width, height, {kernel: 'lanczos3'}).webp({quality: 82, alphaQuality: 100, effort: 5}).toBuffer();
    const staged=path.join(carDir,filename+'.tmp');await fs.writeFile(staged,buffer);await fs.rename(staged,path.join(carDir,filename));
    if ([Math.floor(frames / 8), Math.floor(frames * 3 / 8), Math.floor(frames * 5 / 8), Math.floor(frames * 7 / 8)].includes(frame)) previewImages.push({index, id, frame, image: await loadImage(buffer)});
    const raw = await sharp(buffer).ensureAlpha().raw().toBuffer();
    let minX=width,minY=height,maxX=-1,maxY=-1;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(raw[(y*width+x)*4+3]>=12){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
    const contentBounds=[Math.max(0,minX-3),Math.max(0,minY-3),Math.min(width,maxX+4)-Math.max(0,minX-3),Math.min(height,maxY+4)-Math.max(0,minY-3)];
    const wheelContacts=(model.userData.wheels||[]).map(wheel=>{
      const world=wheel.group.getWorldPosition(new THREE.Vector3());world.y=0;world.project(camera);
      return [(world.x*.5+.5)*width,(-world.y*.5+.5)*height].map(value=>Number(value.toFixed(6)));
    });
    stats.push({frame,contentBounds,groundAnchor,wheelContacts,triangles:triangles.length,visiblePixels:Math.round(visiblePixels/samples**2),bytes:buffer.length,sha256:createHash('sha256').update(buffer).digest('hex')});
    console.log(`${id}/${filename}: ${triangles.length} projected triangles, ${buffer.length} bytes`);
  }
  const minX=Math.min(...stats.map(file=>file.contentBounds[0])),minY=Math.min(...stats.map(file=>file.contentBounds[1]));
  const maxX=Math.max(...stats.map(file=>file.contentBounds[0]+file.contentBounds[2])),maxY=Math.max(...stats.map(file=>file.contentBounds[1]+file.contentBounds[3]));
  manifest.cars.push({id,name:names[index],dimensions:bounds.getSize(new THREE.Vector3()).toArray(),
    framing:{bounds:[minX,minY,maxX-minX,maxY-minY],groundAnchor},files:stats});
  const geometries = new Set(), materials = new Set();
  model.traverse(mesh => { if (mesh.isMesh) { geometries.add(mesh.geometry); (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(m => materials.add(m)); }});
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
}
const globalBounds=manifest.cars.map(car=>car.framing.bounds),globalMinX=Math.min(...globalBounds.map(b=>b[0])),globalMinY=Math.min(...globalBounds.map(b=>b[1]));
const globalMaxX=Math.max(...globalBounds.map(b=>b[0]+b[2])),globalMaxY=Math.max(...globalBounds.map(b=>b[1]+b[3]));
manifest.framing.bounds=[globalMinX,globalMinY,globalMaxX-globalMinX,globalMaxY-globalMinY];
manifest.framing.sharedWorldScale=true;
const manifestPath=path.join(out,'manifest.json'),stagedManifest=manifestPath+'.tmp';
await fs.writeFile(stagedManifest,JSON.stringify(manifest,null,2)+'\n');await fs.rename(stagedManifest,manifestPath);

const sheet = createCanvas(width * 4, (height + 62) * selectedIds.length), sheetCtx = sheet.getContext('2d');
sheetCtx.fillStyle = '#eeeae3'; sheetCtx.fillRect(0, 0, sheet.width, sheet.height);
for (const {index, frame, image} of previewImages) {
  const rowFrames = previewImages.filter(p => p.index === index);
  const column = rowFrames.findIndex(p => p.frame === frame);
  const x = column * width, y = selectedIds.indexOf(ids[index]) * (height + 62);
  sheetCtx.drawImage(image, x, y);
  sheetCtx.fillStyle = '#1f242a'; sheetCtx.font = 'bold 22px Arial';
  sheetCtx.fillText(names[index], x + 22, y + height + 22);
  sheetCtx.fillStyle = '#66686b'; sheetCtx.font = '16px Arial';
  sheetCtx.fillText(`${Math.round(frame * 360 / frames)}° · tatsächliches Spielmodell · Software-Render`, x + 22, y + height + 46);
}
const qaPath = path.resolve(root, args.qa || '../qa/vehicles-contact-sheet.png');
await fs.mkdir(path.dirname(qaPath), {recursive: true});
await fs.writeFile(qaPath, sheet.toBuffer('image/png'));
console.log(`Wrote ${frames * selectedIds.length} transparent views and ${qaPath}`);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await renderVehicles();
