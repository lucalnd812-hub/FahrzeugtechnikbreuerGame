import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Local vehicle coordinates: X across the axle, Y up, +Z forward. Dimensions
// are metres; the contact patch is at Y=0. No DOM, textures or network required.
export const VEHICLE_MODELS = Object.freeze([
  Object.freeze({id:'kadett',length:4.18,width:1.61,height:1.335,wheelbase:2.395,radius:.321,tyreWidth:.219,paint:0xffce18,
    axles:[-1.105,1.29],track:1.40,flare:.015,arch:.351,
    profile:[[-2.09,.735,.73],[-1.92,.80,.775],[-1.33,.865,.795],[-.65,.895,.805],[.60,.87,.805],[1.40,.81,.79],[1.90,.765,.785],[2.09,.72,.765]],
    cabin:{front:[.64,.875,.705],roofFront:[.235,1.305,.635],roofRear:[-.53,1.315,.645],rear:[-1.385,.86,.72],pillar:-.35}}),
  Object.freeze({id:'e30',length:4.345,width:1.76,height:1.37,wheelbase:2.562,radius:.329,tyreWidth:.249,paint:0xf0efe9,
    axles:[-1.255,1.307],track:1.50,flare:.055,arch:.363,
    profile:[[-2.1725,.77,.79],[-2.015,.82,.825],[-1.54,.865,.825],[-.91,.91,.825],[.70,.90,.825],[1.56,.85,.815],[2.03,.805,.805],[2.1725,.75,.78]],
    cabin:{front:[.755,.90,.725],roofFront:[.30,1.345,.655],roofRear:[-.665,1.35,.665],rear:[-1.24,.91,.735],pillar:-.41}}),
  Object.freeze({id:'m1',length:4.36,width:2.02,height:1.14,wheelbase:2.56,radius:.341,tyreWidth:.339,paint:0xf2f0e9,
    axles:[-1.245,1.315],track:1.69,flare:.095,arch:.372,
    profile:[[-2.18,.765,.87],[-2.00,.805,.92],[-1.43,.84,.94],[-.62,.83,.84],[.75,.69,.85],[1.40,.605,.94],[1.99,.545,.91],[2.18,.48,.835]],
    cabin:{front:[.74,.70,.695],roofFront:[.045,1.115,.625],roofRear:[-.68,1.135,.64],rear:[-1.085,.825,.72],pillar:-.51}}),
  // F87 Competition proportions from BMW's 09/2018 dimensional sheet.
  Object.freeze({id:'m2',length:4.461,width:1.854,height:1.410,wheelbase:2.693,radius:.349,tyreWidth:.279,paint:0x92989d,
    axles:[-1.350,1.343],track:1.590,flare:.020,arch:.380,modern:true,
    profile:[[-2.2305,.79,.80],[-2.13,.835,.855],[-1.77,.905,.88],[-1.35,.954,.907],[-.72,.945,.89],[.66,.94,.865],[1.27,.92,.89],[1.82,.873,.877],[2.09,.826,.84],[2.2305,.765,.803]],
    cabin:{front:[.77,.947,.740],roofFront:[.27,1.365,.642],roofRear:[-.67,1.377,.652],rear:[-1.48,.95,.747],pillar:-.47}}),
  // 992 GT3 RS: low 911 roof, wider rear shoulders, and a wing above the roof.
  Object.freeze({id:'gt3rs',length:4.572,width:1.90,height:1.322,wheelbase:2.457,radius:.367,tyreWidth:.324,paint:0x267ddb,
    axles:[-1.279,1.178],track:1.607,flare:.020,arch:.399,modern:true,
    profile:[[-2.286,.700,.800],[-2.09,.765,.898],[-1.67,.84,.929],[-1.24,.875,.930],[-.68,.845,.891],[.38,.752,.85],[.94,.722,.891],[1.30,.675,.918],[1.76,.610,.859],[2.10,.556,.748],[2.286,.470,.668]],
    cabin:{front:[.91,.775,.714],roofFront:[.15,1.242,.626],roofRear:[-.70,1.240,.632],rear:[-1.52,.864,.712],pillar:-.47}})
]);

const BLACK=0x111419, DARK=0x272c33, CHROME=0xc6cbd0, GLASS=0x143558;
const M_COLOURS=[0x43b7e9,0x142760,0xe82c39];
const COLOR_WHITE=new THREE.Color(0xffffff);
let vehicleFinishSources={matcap:null,details:null};
const liveVehicleMaterials=new Set();
const DETAIL_TILES=Object.freeze({paint:0,rubber:1,carbon:2,aluminium:3,glass:4,chrome:5,seat:6,grille:7,headlamp:8,taillamp:9,vent:10,brake:11,tread:12,wheel:13,plastic:14,fabric:15});

function fallbackMatcap() {
  // A tiny authored neutral reflection sphere keeps headless/offline cars
  // polished too. Production replaces it with the shared painted 1024px sphere.
  const size=64,pixels=new Uint8Array(size*size*4),key=new THREE.Vector3(-.52,.73,.45).normalize();
  const srgb=v=>v<=.0031308?12.92*v:1.055*v**(1/2.4)-.055;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const nx=x/(size-1)*2-1,ny=y/(size-1)*2-1,nz=Math.sqrt(Math.max(0,1-nx*nx-ny*ny));
    const diffuse=Math.max(0,nx*key.x+ny*key.y+nz*key.z);
    const reflection=.24*Math.exp(-(((nx+.48)/.17)**2)-(((ny-.22)/.68)**2))+.17*Math.exp(-(((ny-.63)/.15)**2));
    const base=Math.max(.20,Math.min(1,.31+.34*diffuse+.15*nz+.055*ny+reflection));
    const tint=[1.0+.025*diffuse,1.0,1.0+.055*Math.max(0,nx)];
    const offset=(y*size+x)*4;
    for(let c=0;c<3;c++)pixels[offset+c]=Math.round(255*Math.min(1,srgb(Math.min(1,base*tint[c]))));
    pixels[offset+3]=255;
  }
  const texture=new THREE.DataTexture(pixels,size,size,THREE.RGBAFormat);
  texture.name='vehicle-neutral-matcap-fallback';texture.colorSpace=THREE.SRGBColorSpace;
  texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=false;texture.needsUpdate=true;return texture;
}

function ownedFinishTexture(source,name) {
  if(!source)return null;
  const copy=source.clone();copy.name=name;copy.colorSpace=THREE.SRGBColorSpace;
  copy.wrapS=copy.wrapT=THREE.ClampToEdgeWrapping;copy.minFilter=copy.magFilter=THREE.LinearFilter;
  copy.generateMipmaps=false;copy.needsUpdate=true;return copy;
}

function applyFinishTextures(materials) {
  const old=new Set();
  for(const material of Object.values(materials))for(const key of ['matcap','map'])if(material[key]?.isTexture)old.add(material[key]);
  const values=Object.values(materials),needsMatcap=values.some(material=>material.isMeshMatcapMaterial);
  const matcap=needsMatcap?(ownedFinishTexture(vehicleFinishSources.matcap,'vehicle-painted-matcap')??fallbackMatcap()):null;
  const details=ownedFinishTexture(vehicleFinishSources.details,'vehicle-detail-atlas');
  for(const material of values){if(material.isMeshMatcapMaterial)material.matcap=matcap;material.map=details;material.needsUpdate=true;}
  for(const texture of old)texture.dispose();
}

// Call once when locally bundled images finish loading. Inputs remain owned by
// the caller; each fleet instance receives lightweight texture-object clones,
// sharing the decoded image, so disposing one car never destroys another.
export function setVehicleFinishTextures({matcap,details}={}) {
  if((matcap!==undefined&&matcap!==null&&!matcap.isTexture)||(details!==undefined&&details!==null&&!details.isTexture))return false;
  vehicleFinishSources={matcap:matcap===undefined?vehicleFinishSources.matcap:matcap,details:details===undefined?vehicleFinishSources.details:details};
  for(const materials of liveVehicleMaterials)applyFinishTextures(materials);return true;
}

function atlasTile(kind,colour) {
  if(kind==='paint'||kind==='livery')return DETAIL_TILES.paint;
  if(kind==='glass')return DETAIL_TILES.glass;
  if(kind==='lights'){const c=new THREE.Color(colour);return c.r>.28&&c.g<.12?DETAIL_TILES.taillamp:DETAIL_TILES.headlamp;}
  if(kind==='chrome'){
    if([0x929ea8,0x768795,0xa9b0b3,0xad9c6a].includes(colour))return DETAIL_TILES.aluminium;
    if([0x3c454d,0x626b72].includes(colour))return DETAIL_TILES.brake;
    return colour===CHROME?DETAIL_TILES.chrome:DETAIL_TILES.aluminium;
  }
  if([0x15191d,0x11161b].includes(colour))return DETAIL_TILES.rubber;
  if([0x1d2731,0x131a21,0x19222b,0x141e29,0x161d24].includes(colour))return DETAIL_TILES.carbon;
  if([0x3d4b54,0x465660,0x293640,0x65717a].includes(colour))return DETAIL_TILES.seat;
  if([0x465057,0x4b535b,0x39424a].includes(colour))return DETAIL_TILES.vent;
  return DETAIL_TILES.plastic;
}

function atlasUV(g,kind,colour) {
  const tile=atlasTile(kind,colour),row=Math.floor(tile/4),column=tile%4,p=g.attributes.position,n=g.attributes.normal,uv=new Float32Array(p.count*2);
  g.computeBoundingBox();const min=g.boundingBox.min,size=g.boundingBox.getSize(new THREE.Vector3());
  for(let i=0;i<p.count;i++){
    let u=.5,v=.5;
    if(tile!==DETAIL_TILES.paint){
      const normal=[Math.abs(n.getX(i)),Math.abs(n.getY(i)),Math.abs(n.getZ(i))];
      const axis=normal.indexOf(Math.max(...normal)),axes=axis===0?[2,1]:axis===1?[0,2]:[0,1];
      const point=[p.getX(i),p.getY(i),p.getZ(i)],start=[min.x,min.y,min.z],span=[size.x,size.y,size.z];
      u=(point[axes[0]]-start[axes[0]])/Math.max(.001,span[axes[0]]);v=(point[axes[1]]-start[axes[1]])/Math.max(.001,span[axes[1]]);
    }
    uv[i*2]=(column+.06+u*.88)/4;uv[i*2+1]=(3-row+.06+v*.88)/4;
  }
  g.setAttribute('uv',new THREE.BufferAttribute(uv,2));
}

const lerp=(a,b,t)=>a+(b-a)*t;
const smoothstep=t=>{const x=Math.max(0,Math.min(1,t));return x*x*(3-2*x);};
const COACHWORK=Object.freeze({
  kadett:{crown:.047,roll:.092,side:.059,sill:.078,end:.065,vertical:.034,roof:.055},
  e30:{crown:.036,roll:.074,side:.046,sill:.070,end:.047,vertical:.028,roof:.050},
  m1:{crown:.028,roll:.053,side:.037,sill:.054,end:.037,vertical:.023,roof:.040},
  m2:{side:.078,sill:.103,end:.088,vertical:.042},gt3rs:{side:.076,sill:.094,end:.112,vertical:.041}
});

function sampled(profile,z,column) {
  for(let i=1;i<profile.length;i++)if(z<=profile[i][0]){
    const a=profile[i-1],b=profile[i],t=(z-a[0])/(b[0]-a[0]);return lerp(a[column],b[column],Math.max(0,Math.min(1,t)));
  }
  return profile.at(-1)[column];
}

function smoothSampled(profile,z,column) {
  for(let i=1;i<profile.length;i++)if(z<=profile[i][0]){
    const a=profile[i-1],b=profile[i],span=b[0]-a[0],t=Math.max(0,Math.min(1,(z-a[0])/span));
    const before=profile[Math.max(0,i-2)],after=profile[Math.min(profile.length-1,i+1)];
    const da=(b[column]-before[column])/(b[0]-before[0]),db=(after[column]-a[column])/(after[0]-a[0]);
    const t2=t*t,t3=t2*t;
    return (2*t3-3*t2+1)*a[column]+(t3-2*t2+t)*span*da+(-2*t3+3*t2)*b[column]+(t3-t2)*span*db;
  }
  return profile.at(-1)[column];
}

function section(spec,z) {
  const d=Math.min(...spec.axles.map(a=>Math.abs(z-a)));
  // E30 box flares and the much wider Procar rear wings are actual shell shape.
  const flare=spec.flare*Math.max(0,Math.min(1,(.64-d)/.22));
  const read=smoothSampled;
  const width=read(spec.profile,z,2)+flare;
  const top=read(spec.profile,z,1);
  let bottom=.16;
  for(const axle of spec.axles){const dz=Math.abs(z-axle);if(dz<spec.arch)bottom=Math.max(bottom,spec.radius+Math.sqrt(spec.arch**2-dz**2));}
  return {width,top,bottom,edge:Math.max(top-.05,bottom+.036)};
}

function surfaceTop(spec,x,z) {
  const s=section(spec,z),shape=COACHWORK[spec.id],u=Math.min(1,Math.abs(x)/s.width);
  const roll=shape.roll*smoothstep((u-.72)/.28),crown=shape.crown*(1-u*u);
  // A continuous rolled shoulder replaces the old folded cardboard edge.
  // The centre of the M1 bonnet stays low while its arches rise at the sides.
  const rise=Math.max(0,s.bottom+.039-(s.top-shape.roll))*smoothstep((u-.64)/.36);
  return s.top+crown-roll+rise;
}

function cornerTessellation(g,spec) {
  g.computeBoundingBox();
  const bounds=g.boundingBox;
  if(Math.max(Math.abs(bounds.min.z),Math.abs(bounds.max.z))<=spec.length/2-.55||bounds.max.x-bounds.min.x<=.44)return g;
  const positions=g.attributes.position,normals=g.attributes.normal,indices=g.index;
  const output=[],directions=[];let changed=false;
  const vertex=i=>({p:[positions.getX(i),positions.getY(i),positions.getZ(i)],n:[normals.getX(i),normals.getY(i),normals.getZ(i)]});
  const emit=(a,b,c,depth=0)=>{
    const nearEnd=[a,b,c].some(v=>Math.abs(v.p[2])>spec.length/2-.55);
    const edges=[[a,b,c],[b,c,a],[c,a,b]].sort((x,y)=>Math.abs(y[0].p[0]-y[1].p[0])-Math.abs(x[0].p[0]-x[1].p[0]));
    const [u,v,w]=edges[0];
    if(nearEnd&&depth<5&&Math.abs(u.p[0]-v.p[0])>.44){
      changed=true;const normal=u.n.map((n,k)=>(n+v.n[k])*.5),length=Math.hypot(...normal)||1;
      const mid={p:u.p.map((n,k)=>(n+v.p[k])*.5),n:normal.map(n=>n/length)};
      emit(u,mid,w,depth+1);emit(mid,v,w,depth+1);return;
    }
    for(const item of [a,b,c]){output.push(...item.p);directions.push(...item.n);}
  };
  const count=indices?.count??positions.count;
  for(let i=0;i<count;i+=3)emit(...[0,1,2].map(n=>vertex(indices?indices.getX(i+n):i+n)));
  if(!changed)return g;
  const next=new THREE.BufferGeometry();next.setAttribute('position',new THREE.Float32BufferAttribute(output,3));next.setAttribute('normal',new THREE.Float32BufferAttribute(directions,3));g.dispose();return next;
}

function rollBodyEnds(g,spec) {
  // All fitted body parts share this small plan-view sweep: lamps, bumpers
  // and trim follow the rounded corner, rather than floating ahead of it.
  const position=g.attributes.position,normal=g.attributes.normal,halfWidth=spec.width/2;
  const depth=.55,shape=COACHWORK[spec.id],round=shape.end,n=new THREE.Vector3();
  for(let i=0;i<position.count;i++){
    const x=position.getX(i),z=position.getZ(i),t=Math.max(0,Math.min(1,(Math.abs(z)-(spec.length/2-depth))/depth));
    if(t===0)continue;
    const u=Math.abs(x)/halfWidth,w=smoothstep(t),f=u**4,sign=Math.sign(z);
    const endTop=(sign>0?spec.profile.at(-1):spec.profile[0])[1],mid=(endTop+.16)/2,span=(endTop-.16)/2+.035;
    const v=Math.max(-1,Math.min(1,(position.getY(i)-mid)/span)),vf=v**4;
    const sweep=round*f+shape.vertical*vf;
    position.setZ(i,z-sign*sweep*w);
    if(normal){
      const zx=-sign*round*4*u**3*Math.sign(x)/halfWidth*w;
      const inRange=Math.abs((position.getY(i)-mid)/span)<1;
      const zy=inRange?-sign*shape.vertical*4*v**3/span*w:0;
      const zz=1-sweep*6*t*(1-t)/depth;
      const nz=normal.getZ(i)/Math.max(.5,zz);
      n.set(normal.getX(i)-zx*nz,normal.getY(i)-zy*nz,nz).normalize();
      normal.setXYZ(i,n.x,n.y,n.z);
    }
  }
}

function geometry(positions,indices) {
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  if(indices)g.setIndex(indices);g.computeVertexNormals();return g;
}

function polygon(points) {
  const pos=points.flat(),indices=[];
  for(let i=1;i<points.length-1;i++)indices.push(0,i,i+1);
  return geometry(pos,indices);
}

function quad(a,b,c,d){return polygon([a,b,c,d]);}

function beam(a,b,width,depth=width) {
  const va=new THREE.Vector3(...a),vb=new THREE.Vector3(...b),v=vb.clone().sub(va),length=v.length();
  let g;
  if(width<.026)g=new THREE.BoxGeometry(width,length,depth);
  else {
    const r=Math.min(width,depth)*.33,w=width/2,d=depth/2;
    const outline=[[-w+r,-d],[w-r,-d],[w,-d+r],[w,d-r],[w-r,d],[-w+r,d],[-w,d-r],[-w,-d+r]],p=[],idx=[];
    for(const y of [-length/2,length/2])for(const [x,z]of outline)p.push(x,y,z);
    for(let n=0;n<8;n++){const next=(n+1)%8;idx.push(n,next,n+8,next,next+8,n+8);}
    for(let n=1;n<7;n++)idx.push(0,n+1,n,8,8+n,8+n+1);
    g=geometry(p,idx);
  }
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize()));g.translate(...va.add(vb).multiplyScalar(.5).toArray());return g;
}

function box(w,h,d,x=0,y=0,z=0){return new THREE.BoxGeometry(w,h,d).translate(x,y,z);}
// A small rolled edge reads as a manufactured toy surface without inflating
// the silhouette. Forty-eight triangles, merged with the rest of the body.
function softBox(w,h,d,x=0,y=0,z=0,round=.024) {
  const g=new THREE.BoxGeometry(w,h,d,3,3,3),position=g.attributes.position,normal=g.attributes.normal;
  const r=Math.min(round,w*.32,h*.32,d*.32),core=[w/2-r,h/2-r,d/2-r];
  const v=new THREE.Vector3(),c=new THREE.Vector3(),offset=new THREE.Vector3();
  for(let n=0;n<position.count;n++){
    v.fromBufferAttribute(position,n);
    for(const [key,half]of [['x',w/2],['y',h/2],['z',d/2]])if(Math.abs(v[key])<half*.99)v[key]=Math.sign(v[key])*(half-r);
    c.set(Math.max(-core[0],Math.min(core[0],v.x)),Math.max(-core[1],Math.min(core[1],v.y)),Math.max(-core[2],Math.min(core[2],v.z)));
    offset.copy(v).sub(c).normalize();v.copy(c).addScaledVector(offset,r);
    position.setXYZ(n,v.x,v.y,v.z);normal.setXYZ(n,offset.x,offset.y,offset.z);
  }
  return g.translate(x,y,z);
}
function cyl(radius,depth,x,y,z,axis='z',segments=16){const g=new THREE.CylinderGeometry(radius,radius,depth,segments,1);if(axis==='x')g.rotateZ(Math.PI/2);else if(axis==='z')g.rotateX(Math.PI/2);return g.translate(x,y,z);}

// These primitives are authored geometry, not baked vehicle photographs.
// The modern cars use section lofts and restrained bevels rather than cuboids.
function roundedOutline(width,height,radius,steps=3) {
  const points=[];
  for(const [cx,cy,start] of [[width/2-radius,height/2-radius,0],[-width/2+radius,height/2-radius,Math.PI/2],[-width/2+radius,-height/2+radius,Math.PI],[width/2-radius,-height/2+radius,Math.PI*1.5]])
    for(let i=0;i<=steps;i++){const a=start+i*Math.PI/2/steps;points.push([cx+Math.cos(a)*radius,cy+Math.sin(a)*radius]);}
  return points;
}

function roundedFace(width,height,radius,x,y,z,steps=3) {
  return polygon(roundedOutline(width,height,radius,steps).map(([px,py])=>[x+px,y+py,z]));
}

function bevelledFrame(width,height,radius,thickness,depth,x,y,z,high) {
  const steps=high?4:2,p=[],idx=[];
  const rings=[
    [width,height,radius,-depth/2],
    [width-.010,height-.010,Math.max(.005,radius-.005),depth/2-.010],
    [width-thickness*2,height-thickness*2,Math.max(.005,radius-thickness*.65),depth/2-.010],
    [width-thickness*2-.010,height-thickness*2-.010,Math.max(.005,radius-thickness*.65-.005),-depth/2]
  ];
  const count=roundedOutline(width,height,radius,steps).length;
  for(const [w,h,r,d]of rings)for(const [px,py]of roundedOutline(w,h,r,steps))p.push(x+px,y+py,z+d);
  for(let ring=0;ring<4;ring++)for(let n=0;n<count;n++){const next=(n+1)%count,a=ring*count+n,b=((ring+1)%4)*count+n,an=ring*count+next,bn=((ring+1)%4)*count+next;idx.push(a,b,an,an,b,bn);}
  return geometry(p,idx);
}

function ellipseFace(rx,ry,center,normal=[0,0,1],segments=16) {
  const g=new THREE.CircleGeometry(1,segments);g.scale(rx,ry,1);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),new THREE.Vector3(...normal).normalize()));
  return g.translate(...center);
}

function polyline(parts,points,width,kind='trim',colour=BLACK) {
  for(let i=1;i<points.length;i++)parts.add(beam(points[i-1],points[i],width),kind,colour);
}

function modernSurfaceTop(spec,x,z) {
  const s=section(spec,z),u=Math.min(1,Math.abs(x)/s.width);
  const porsche=spec.id==='gt3rs';
  const fender=porsche?.237*Math.exp(-(((z-1.470)/.60)**2))+.070*Math.exp(-(((z-spec.axles[0])/.64)**2)):.052;
  const shoulder=Math.exp(-(((u-.80)/.24)**2))*fender;
  const crown=(porsche?.041:.048)*(1-u*u);
  const lip=.090*Math.max(0,(u-.91)/.09);
  return Math.max(s.top+crown+shoulder-lip,s.bottom+.022*Math.max(0,(u-.66)/.34));
}

function flankPoint(spec,z,side,t,top) {
  const s=section(spec,z),shape=COACHWORK[spec.id],height=Math.max(0,top-s.bottom),full=Math.min(1,height/.34);
  // A barrelled door skin rolls through a wide shoulder into an inset sill.
  // Its width changes by centimetres, so a reflection can actually bend on it.
  const inset=shape.sill*(1-t)**2,belly=shape.side*Math.sin(t*Math.PI)*full;
  return [side*(s.width-inset+belly),lerp(s.bottom,top,t),z];
}

function endCap(parts,spec,high,modern) {
  const top=modern?modernSurfaceTop:surfaceTop,columns=high?16:10,rows=high?7:4;
  for(const end of [-1,1]){
    const z=end*spec.length/2,s=section(spec,z),p=[],idx=[];
    for(let row=0;row<=rows;row++)for(let col=0;col<=columns;col++){
      const u=col/columns*2-1,x=u*(s.width-.002),t=row/rows;
      p.push(x,lerp(.16,top(spec,x,z),t),z);
    }
    for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
      const a=row*(columns+1)+col,b=a+columns+1;idx.push(a,b,a+1,a+1,b,b+1);
    }
    parts.add(geometry(p,idx));
  }
}

function rolledWheelArch(parts,spec,high,side,axle) {
  const arcSteps=high?18:9,cross=high?6:4,r=spec.arch+.029,p=[],idx=[];
  for(let n=0;n<=arcSteps;n++){
    const a=n*Math.PI/arcSteps,z=axle+Math.cos(a)*r,width=section(spec,z).width+.004;
    for(let c=0;c<=cross;c++){
      const theta=c/cross*Math.PI*2,round=.027,radial=r+Math.sin(theta)*round;
      p.push(side*(width+Math.cos(theta)*round),spec.radius+Math.sin(a)*radial,axle+Math.cos(a)*radial);
    }
  }
  for(let n=0;n<arcSteps;n++)for(let c=0;c<cross;c++){const a=n*(cross+1)+c,b=a+cross+1;idx.push(a,b,a+1,a+1,b,b+1);}
  parts.add(geometry(p,idx));
}

function modernShell(parts,spec,high) {
  const zSet=new Set(spec.profile.map(p=>p[0])),arcSteps=high?12:7;
  for(let z=-spec.length/2;z<spec.length/2;z+=high?.16:.32)zSet.add(z);
  for(const axle of spec.axles)for(let n=0;n<=arcSteps;n++)zSet.add(axle+spec.arch*Math.cos(n*Math.PI/arcSteps));
  const zs=[...new Set([...zSet].map(z=>Math.round(z*1e6)/1e6))].filter(z=>z>=-spec.length/2&&z<=spec.length/2).sort((a,b)=>a-b);
  const us=high?[-1,-.975,-.94,-.88,-.78,-.62,-.42,-.20,0,.20,.42,.62,.78,.88,.94,.975,1]:[-1,-.95,-.84,-.64,-.34,0,.34,.64,.84,.95,1];
  // Bonnet, rolled shoulders and doors share vertices and normals. Separate
  // surfaces used to leave a hard cardboard crease all along both sides.
  const p=[],idx=[],sideRows=high?7:4,rowSize=us.length+(sideRows-1)*2;
  for(const z of zs){
    const s=section(spec,z),edge=modernSurfaceTop(spec,s.width,z);
    const sidePoint=(side,n)=>{
      return flankPoint(spec,z,side,n/(sideRows-1),edge);
    };
    for(let n=0;n<sideRows-1;n++)p.push(...sidePoint(-1,n));
    for(const u of us){const x=u*s.width;p.push(x,modernSurfaceTop(spec,x,z),z);}
    for(let n=sideRows-2;n>=0;n--)p.push(...sidePoint(1,n));
  }
  for(let row=0;row<zs.length-1;row++)for(let col=0;col<rowSize-1;col++){const a=row*rowSize+col,b=a+rowSize;idx.push(a,b,a+1,a+1,b,b+1);}
  parts.add(geometry(p,idx));
  for(const side of [-1,1]){
    for(let n=0;n<zs.length-1;n++){
      const a=section(spec,zs[n]),b=section(spec,zs[n+1]);
      parts.add(quad([side*(a.width-.039),a.bottom,zs[n]],[side*.55,a.bottom,zs[n]],[side*.55,b.bottom,zs[n+1]],[side*(b.width-.039),b.bottom,zs[n+1]]),'trim',DARK);
    }
    for(const axle of spec.axles)rolledWheelArch(parts,spec,high,side,axle);
    const midA=spec.axles[0]+spec.arch,midB=spec.axles[1]-spec.arch;
    parts.add(quad([side*.91,.165,midA],[side*.946,.205,midA],[side*.900,.215,midB],[side*.865,.165,midB]),'trim',0x20252b);
  }
  endCap(parts,spec,high,true);
  parts.add(box(1.08,.07,spec.length*.84,0,.15,0),'trim',BLACK);
}

function roofCrown(u,height) {
  const shoulder=Math.max(0,(Math.abs(u)-.62)/.38);
  return height*Math.sqrt(Math.max(0,1-shoulder*shoulder))+.008*(1-u*u);
}
function roofBow(spec,v) {
  const amplitude=spec.modern?(spec.id==='gt3rs'?.047:.045):(spec.id==='m1'?.018:.025);
  return amplitude*Math.max(0,Math.sin(v*Math.PI))**.55;
}
function roofPoint(spec,u,v) {
  const c=spec.cabin,width=lerp(c.roofRear[2],c.roofFront[2],v),height=spec.modern?(spec.id==='gt3rs'?.092:.085):COACHWORK[spec.id].roof;
  return [u*width,lerp(c.roofRear[1],c.roofFront[1],v)+roofCrown(u,height)+roofBow(spec,v),lerp(c.roofRear[0],c.roofFront[0],v)];
}

function curvedPatch(parts,rows,kind,colour=0xffffff,across=8,crown=.023) {
  const p=[],idx=[];
  for(const [z,y,w]of rows)for(let n=0;n<=across;n++){const u=n/across*2-1;p.push(u*w,y+roofCrown(u,crown),z);}
  for(let row=0;row<rows.length-1;row++)for(let n=0;n<across;n++){const a=row*(across+1)+n,b=a+across+1;idx.push(a,b,a+1,a+1,b,b+1);}
  const g=parts.add(geometry(p,idx),kind,colour);
  if(kind==='glass')paintGlass(g,colour);
}

function paintGlass(g,colour) {
  // A wide, softly edged reflection of the warm workshop windows. Subdivided
  // glazing gives this band its own curved surface instead of a diagonal fan.
  const p=g.attributes.position,c=g.attributes.color,base=new THREE.Color(colour),sky=new THREE.Color(0xb7d0d8);
  g.computeBoundingBox();const bounds=g.boundingBox,range=Math.max(.02,bounds.max.y-bounds.min.y),length=Math.max(.10,bounds.max.z-bounds.min.z);
  for(let n=0;n<p.count;n++){
    const t=Math.max(0,Math.min(1,(p.getY(n)-bounds.min.y)/range)),z=(p.getZ(n)-bounds.min.z)/length;
    const band=Math.exp(-(((t-.64-.10*(z-.5))/.235)**2));
    const wash=.095+.18*t+.48*band,shade=base.clone().lerp(sky,wash);
    c.setXYZ(n,shade.r,shade.g,shade.b);
  }
}

function glazingSurface(parts,point,high,colour=GLASS,{columns=high?12:6,rows=high?7:3}={}) {
  const p=[],idx=[];
  for(let v=0;v<=rows;v++)for(let u=0;u<=columns;u++)p.push(...point(u/columns,v/rows));
  for(let v=0;v<rows;v++)for(let u=0;u<columns;u++){
    const a=v*(columns+1)+u,b=a+columns+1;idx.push(a,b,a+1,a+1,b,b+1);
  }
  const g=parts.add(geometry(p,idx),'glass',colour);paintGlass(g,colour);return g;
}

function sideGlazing(parts,points,side,high,colour=GLASS) {
  // Front lower corner, front upper, optional upper contour, rear upper/lower.
  // A grid between the upper contour and sill gives real convex normals and
  // makes the reflection sweep across the glass rather than a flat triangle.
  const bottomA=points[0],bottomB=points.at(-1),top=points.slice(1,-1);
  const curve=new THREE.CatmullRomCurve3(top.map(p=>new THREE.Vector3(...p)),false,'centripetal');
  glazingSurface(parts,(u,v)=>{
    const upper=curve.getPoint(u),lower=new THREE.Vector3(...bottomA).lerp(new THREE.Vector3(...bottomB),u);
    const point=lower.lerp(upper,v);point.x+=side*.041*Math.sin(u*Math.PI)*Math.sin(v*Math.PI);
    return point.toArray();
  },high,colour,{columns:high?9:4,rows:high?6:2});
}

function roofHeader(parts,row,crown,high) {
  // The windshield tucks under a continuous painted header. The old roof and
  // glass ended independently, leaving tiny black triangular holes on the BMW.
  const [z,y,w]=row,p=[],idx=[],cols=high?14:8;
  for(let n=0;n<=cols;n++)for(const edge of [0,1]){
    const u=n/cols*2-1;p.push(u*(w-.012),y+roofCrown(u,crown)+(edge?.009:-.035),z+(edge?-.006:.014));
  }
  for(let n=0;n<cols;n++){const a=n*2;idx.push(a,a+1,a+2,a+1,a+3,a+2);}
  parts.add(geometry(p,idx));
}

function cabinInterior(parts,spec,high) {
  const c=spec.cabin,low=spec.id==='m1'||spec.id==='gt3rs',seatY=low?.70:.88;
  const upholstery=high?softBox:box;
  parts.add(box(1.12,.075,c.front[0]-c.rear[0]-.13,0,c.front[1]-.10,(c.front[0]+c.rear[0])*.5),'trim',0x19232b);
  parts.add(upholstery(1.18,.13,.26,0,c.front[1]-.026,c.front[0]-.17,.022),'trim',0x35434d);
  for(const x of [-.31,.31]){
    const seat=upholstery(.32,.35,.14,0,0,0,.036);seat.rotateX(-.14);seat.translate(x,seatY,-.43);parts.add(seat,'trim',0x3d4b54);
    parts.add(upholstery(.30,.08,.36,x,seatY-.19,-.29,.018),'trim',0x293640);
    parts.add(upholstery(.16,.115,.105,x,seatY+.225,-.47,.018),'trim',0x465660);
    if(high)for(const dx of [-.102,.102])parts.add(beam([x+dx,seatY-.09,-.34],[x+dx,seatY+.12,-.41],.016),'trim',0x65717a);
  }
  if(high){
    const wheel=new THREE.TorusGeometry(.102,.009,4,12);wheel.rotateX(.55);wheel.translate(-.30,c.front[1]+.005,c.front[0]-.27);parts.add(wheel,'trim',0x6a757b);
    parts.add(box(.15,.11,.53,0,c.front[1]-.08,-.10),'trim',0x303d46);
  }
}

function modernCabin(parts,spec,high) {
  const porsche=spec.id==='gt3rs',c=spec.cabin,front=c.front,rf=c.roofFront,rr=c.roofRear,back=c.rear;
  const frontRows=[],roofRows=[],backRows=[],steps=high?6:3;
  for(let n=0;n<=steps;n++){
    const t=n/steps;
    frontRows.push([lerp(front[0],rf[0],t),lerp(front[1]+.025,rf[1]-.025,t)+.015*Math.sin(t*Math.PI),lerp(front[2]-.032,rf[2]-.029,t)]);
    roofRows.push([lerp(rr[0],rf[0],t),lerp(rr[1],rf[1],t)+roofBow(spec,t),lerp(rr[2],rf[2],t)]);
    backRows.push([lerp(rr[0],back[0],t),lerp(rr[1]-.025,back[1]+.024,t)+.030*Math.sin(t*Math.PI),lerp(rr[2]-.028,back[2]-.035,t)]);
  }
  glazingSurface(parts,(u,v)=>{
    const x=u*2-1,w=lerp(front[2]-.027,rf[2]-.026,v),crown=lerp(.020,porsche?.092:.085,v);
    return [x*w,lerp(front[1]+.023,rf[1]-.018,v)+roofCrown(x,crown)+.015*Math.sin(v*Math.PI),lerp(front[0]-.004,rf[0]+.011,v)+.045*(1-x*x)*Math.sin(v*Math.PI)];
  },high,0x163c58);
  roofHeader(parts,rf,porsche?.092:.085,high);
  curvedPatch(parts,roofRows,'paint',0xffffff,high?20:10,porsche?.092:.085);
  glazingSurface(parts,(u,v)=>{
    const x=u*2-1,w=lerp(rr[2]-.026,back[2]-.030,v),crown=lerp(porsche?.092:.085,.017,v);
    return [x*w,lerp(rr[1]-.018,back[1]+.023,v)+roofCrown(x,crown)+.025*Math.sin(v*Math.PI),lerp(rr[0]-.010,back[0]+.004,v)-.025*(1-x*x)*Math.sin(v*Math.PI)];
  },high,0x183c55);
  roofHeader(parts,[rr[0]-.016,rr[1],rr[2]],porsche?.092:.085,high);
  for(const side of [-1,1]){
    const map=([z,y,x])=>[side*x,y,z];
    polyline(parts,[front,rf].map(map),porsche?.059:.069,'paint',0xffffff);
    polyline(parts,roofRows.map(map),.051,'paint',0xffffff);
    for(let n=1;n<roofRows.length;n++){
      const a=map(roofRows[n-1]),b=map(roofRows[n]);
      parts.add(quad(a,b,[b[0]+side*.004,b[1]-.049,b[2]],[a[0]+side*.004,a[1]-.049,a[2]]));
    }
    const backMiddle=[lerp(rr[0],back[0],.52),lerp(rr[1],back[1],.52)+.055,lerp(rr[2],back[2],.52)];
    const quarter=[rr,backMiddle,back].map(map);
    const quarterCurve=new THREE.CatmullRomCurve3(quarter.map(p=>new THREE.Vector3(...p)),false,'centripetal');
    polyline(parts,high?quarterCurve.getPoints(6).map(p=>p.toArray()):quarter,porsche?.080:.091,'paint',0xffffff);
    const sideBottom=[[side*(front[2]+.008),front[1]+.040,front[0]-.055],[side*(back[2]+.005),back[1]+.037,back[0]+.07]];
    polyline(parts,sideBottom,.027,'trim',BLACK);
    const pillar=c.pillar,roofT=(pillar-rr[0])/(rf[0]-rr[0]);
    const roofY=lerp(rr[1],rf[1],roofT)+roofBow(spec,roofT)-.038,roofX=lerp(rr[2],rf[2],roofT)-.007;
    const baseT=(pillar-back[0])/(front[0]-back[0]),baseY=lerp(back[1],front[1],baseT)+.045,baseX=lerp(back[2],front[2],baseT)+.004;
    const frontGlass=[[side*(front[2]+.001),front[1]+.051,front[0]-.063],[side*(rf[2]-.004),rf[1]-.038,rf[0]-.027]];
    for(let n=1;n<(high?4:2);n++){
      const z=lerp(rf[0],pillar,n/(high?4:2)),t=(z-rr[0])/(rf[0]-rr[0]);
      frontGlass.push([side*(lerp(rr[2],rf[2],t)-.006),lerp(rr[1],rf[1],t)+roofBow(spec,t)-.038,z]);
    }
    frontGlass.push([side*roofX,roofY,pillar+.018],[side*baseX,baseY,pillar+.018]);
    sideGlazing(parts,frontGlass,side,high,0x183b56);
    const rearGlass=[[side*baseX,baseY,pillar-.027],[side*roofX,roofY,pillar-.027],[side*(rr[2]-.008),rr[1]-.059,rr[0]-.033],[side*(backMiddle[2]-.02),backMiddle[1]-.055,backMiddle[0]+.052],[side*(back[2]-.025),back[1]+.062,back[0]+.149]];
    sideGlazing(parts,[rearGlass[0],rearGlass[1],rearGlass[2],rearGlass[3],rearGlass[4]],side,high,0x1c4058);
    polyline(parts,[[side*baseX,baseY,pillar],[side*roofX,roofY+.022,pillar]],porsche?.023:.043,'trim',BLACK);
    if(!porsche){
      // The characteristic BMW Hofmeister return turns towards the front.
      polyline(parts,[rearGlass[2],rearGlass[3],rearGlass[4],[side*(back[2]-.025),back[1]+.046,back[0]+.27]],.017,'trim',BLACK);
      const fin=polygon([[0,1.45,-.71],[0,1.495,-.81],[0,1.442,-.90]]);parts.add(fin,'trim',0x282c31);
    }
    const mz=front[0]-.14,my=front[1]+.125,mx=front[2]+.15;
    polyline(parts,[[side*front[2],my-.063,mz],[side*mx,my,mz]],.028,'trim',BLACK);
    const mirror=new THREE.SphereGeometry(1,high?12:8,high?6:4);mirror.scale(.115,.050,.093);mirror.translate(side*mx,my,mz);parts.add(mirror);
    parts.add(ellipseFace(.080,.032,[side*(mx+.097),my,mz],[side,0,0],high?12:8),'glass',0x8599a2);
    if(high){
      polyline(parts,[frontRows[0],frontRows[2],frontRows[4],frontRows.at(-1)].map(([z,y,w])=>[side*w,y-.001,z]),.013,'trim',BLACK);
      const x=side*(spec.id==='m2'?.891:.873),ya=spec.id==='m2'?.905:.811;
      parts.add(box(.020,.026,.143,x,ya,-.62),'chrome',spec.id==='m2'?0x91999f:0x516675);
      // Door perimeter is a fine seam, not an oversized black outline.
      const za=-.82,zb=.62;
      polyline(parts,[[side*(section(spec,za).width-.008),ya-.021,za],[side*(section(spec,za).width-.018),.244,za],[side*(section(spec,zb).width-.018),.244,zb],[side*(section(spec,zb).width-.008),ya-.02,zb]],.006,'trim',0x414c55);
    }
  }
  cabinInterior(parts,spec,high);
  if(high){
    for(const x of [-.36,.36])polyline(parts,[[x,front[1]+.040,front[0]-.013],[x+.20,front[1]+.048,front[0]-.08]],.009,'trim',BLACK);
    if(porsche){
      polyline(parts,[[-.45,.69,-.85],[-.43,1.20,-.88],[.43,1.20,-.88],[.45,.69,-.85]],.024,'trim',0x2c3037);
      polyline(parts,[[-.43,1.18,-.88],[.43,.72,-.91]],.020,'trim',0x2c3037);
    }
  }
}

class Parts {
  constructor(spec=null){this.parts=[];this.spec=spec;}
  add(g,kind='paint',colour=0xffffff){
    if(this.spec){g=cornerTessellation(g,this.spec);rollBodyEnds(g,this.spec);}
    let geo=g;
    if(g.index){geo=g.toNonIndexed();g.dispose();}
    geo.deleteAttribute('uv');geo.deleteAttribute('uv1');
    if(!geo.getAttribute('normal'))geo.computeVertexNormals();
    const c=new THREE.Color(colour),position=geo.getAttribute('position'),normals=geo.getAttribute('normal'),count=position.count,colours=new Float32Array(count*3);
    for(let i=0;i<count;i++){
      // Gentle pigment gradients distinguish a softly lit shoulder from the
      // lower rocker. Main graphics/lamps retain their exact authored colour.
      const y=position.getY(i),ny=normals.getY(i),nx=normals.getX(i);
      const pigment=kind==='paint'?Math.max(.79,Math.min(1,.846+y*.092+Math.max(0,ny)*.045-.018*Math.abs(nx))):1;
      colours.set([c.r*pigment,c.g*pigment,c.b*(kind==='paint'?Math.min(1,pigment+.018):1)],i*3);
    }
    geo.setAttribute('color',new THREE.BufferAttribute(colours,3));
    atlasUV(geo,kind,colour);
    this.parts.push({geo,kind});return geo;
  }
  finish(materials,{low=false,paint=0xffffff,name='body'}={}){
    const byMaterial=new Map();
    for(const {geo,kind} of this.parts){
      if(low&&kind==='paint'){
        const c=new THREE.Color(paint),colors=geo.getAttribute('color');
        for(let i=0;i<colors.count;i++){colors.setXYZ(i,colors.getX(i)*c.r,colors.getY(i)*c.g,colors.getZ(i)*c.b);}
      }
      const mat=low?materials.low:materials[kind];if(!byMaterial.has(mat))byMaterial.set(mat,[]);byMaterial.get(mat).push(geo);
    }
    const group=new THREE.Group();group.name=name;
    for(const [material,geos] of byMaterial){
      const g=mergeGeometries(geos,false);g.computeBoundingBox();g.computeBoundingSphere();const mesh=new THREE.Mesh(g,material);mesh.castShadow=true;mesh.receiveShadow=true;mesh.name=name+':'+material.name;
      if(low){
        const lamps=[];let offset=0;
        for(const geo of geos){
          if(this.parts.some(part=>part.geo===geo&&part.kind==='lights')){
            const colours=geo.attributes.color;
            for(let n=0;n<colours.count;n++)lamps.push(offset+n,colours.getX(n),colours.getY(n),colours.getZ(n));
          }
          offset+=geo.attributes.position.count;
        }
        if(lamps.length)mesh.userData.lampVertices=new Float32Array(lamps);
      }
      group.add(mesh);
    }
    for(const {geo}of this.parts)geo.dispose();this.parts.length=0;return group;
  }
}

function sculptedFinish(material,role) {
  const coat={paint:.34,chrome:.45,glass:.12,livery:.26,low:.25,trim:.05}[role]??0;
  material.userData.finishLift=.38;material.userData.finishGain=.82;material.userData.finishCoat=coat;
  material.onBeforeCompile=shader=>{
    shader.uniforms.breuerFinishLift={value:material.userData.finishLift};
    shader.uniforms.breuerFinishGain={value:material.userData.finishGain};
    shader.uniforms.breuerFinishCoat={value:material.userData.finishCoat};
    shader.fragmentShader='uniform float breuerFinishLift;\nuniform float breuerFinishGain;\nuniform float breuerFinishCoat;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('vec3 outgoingLight = diffuseColor.rgb * matcapColor.rgb;',`
      float breuerLuma = dot(matcapColor.rgb, vec3(0.2126, 0.7152, 0.0722));
      float breuerHighlight = pow(clamp((breuerLuma - 0.58) / 0.42, 0.0, 1.0), 2.0);
      float breuerCoatMask = smoothstep(0.04, 0.28, max(max(diffuseColor.r, diffuseColor.g), diffuseColor.b));
      vec3 outgoingLight = diffuseColor.rgb * (vec3(breuerFinishLift) + breuerFinishGain * matcapColor.rgb)
        + vec3(0.96, 0.985, 1.0) * breuerHighlight * breuerFinishCoat * breuerCoatMask;
    `);
  };
  // Uniform role strengths share one program: no extra sampler, pass or render
  // target. The offline renderer reads the same three documented scalars.
  material.customProgramCacheKey=()=> 'breuer-sculpted-finish-v1';
}

function makeMaterials(spec,style='arcade') {
  const options={vertexColors:true,side:THREE.DoubleSide};
  let result;
  if(style==='physical')result={
    paint:new THREE.MeshPhysicalMaterial({...options,color:spec.paint,roughness:.27,metalness:.22,clearcoat:.9,clearcoatRoughness:.19}),
    trim:new THREE.MeshStandardMaterial({...options,roughness:.62,metalness:.10}),
    chrome:new THREE.MeshStandardMaterial({...options,roughness:.22,metalness:.85}),
    glass:new THREE.MeshPhysicalMaterial({...options,roughness:.095,metalness:.32,clearcoat:1,clearcoatRoughness:.08}),
    lights:new THREE.MeshStandardMaterial({...options,roughness:.25,metalness:.2,emissive:0x8b8580,emissiveIntensity:.14}),
    livery:new THREE.MeshStandardMaterial({...options,roughness:.35,metalness:.15}),
    low:new THREE.MeshStandardMaterial({...options,roughness:.72,metalness:.055})
  };
  else {
    // One inexpensive view-normal lookup supplies broad painted reflections;
    // actual sculpted normals, not extra geometry overlays, carry the volume.
    const sculpted=(colour=0xffffff)=>new THREE.MeshMatcapMaterial({...options,color:colour});
    result={paint:sculpted(spec.paint),trim:sculpted(),chrome:sculpted(),glass:sculpted(),
      lights:new THREE.MeshBasicMaterial({...options}),livery:sculpted(),low:sculpted()};
  }
  result.glass.transparent=true;result.glass.opacity=.72;result.glass.depthWrite=false;result.glass.forceSinglePass=true;
  for(const [key,material]of Object.entries(result)){
    material.name='vehicle-'+key;
    if(material.isMeshMatcapMaterial)sculptedFinish(material,key);
    // Scene teardown also disposes materials directly through world.js.
    material.addEventListener('dispose',()=>liveVehicleMaterials.delete(result));
  }
  applyFinishTextures(result);liveVehicleMaterials.add(result);return result;
}

function shell(parts,spec,high) {
  const zPoints=new Set(spec.profile.map(s=>s[0]));
  const arcSteps=high?14:8;
  for(let z=-spec.length/2;z<spec.length/2;z+=high?.19:.38)zPoints.add(z);
  for(const axle of spec.axles){
    for(let i=0;i<=arcSteps;i++)zPoints.add(axle+spec.arch*Math.cos(Math.PI*i/arcSteps));
    for(const d of [-.66,-.44,.44,.66])zPoints.add(axle+d);
  }
  const zs=[...new Set([...zPoints].map(z=>Math.round(z*1e6)/1e6))].filter(z=>z>=-spec.length/2&&z<=spec.length/2).sort((a,b)=>a-b);
  const xs=high?[-1,-.975,-.925,-.84,-.68,-.38,0,.38,.68,.84,.925,.975,1]:[-1,-.94,-.79,-.48,0,.48,.79,.94,1];
  const sideRows=high?7:4,p=[],indices=[],rowSize=xs.length+(sideRows-1)*2;
  for(const z of zs){const s=section(spec,z),edge=surfaceTop(spec,s.width,z),shape=COACHWORK[spec.id];
    const sidePoint=(side,n)=>{
      return flankPoint(spec,z,side,n/(sideRows-1),edge);
    };
    for(let n=0;n<sideRows-1;n++)p.push(...sidePoint(-1,n));
    for(const x of xs)p.push(x*s.width,surfaceTop(spec,x*s.width,z),z);
    for(let n=sideRows-2;n>=0;n--)p.push(...sidePoint(1,n));
  }
  for(let i=0;i<zs.length-1;i++)for(let j=0;j<rowSize-1;j++){const a=i*rowSize+j,b=a+rowSize;indices.push(a,b,a+1,a+1,b,b+1);}
  parts.add(geometry(p,indices));
  for(const side of [-1,1]){
    // A narrow inner return is above the tyre, rather than a solid body block
    // crossing the wheel opening. The bottom contour cuts all the way through.
    for(let i=0;i<zs.length-1;i++){
      const a=section(spec,zs[i]),b=section(spec,zs[i+1]);
      parts.add(quad([side*(a.width-.035),a.bottom,zs[i]],[side*.52,a.bottom,zs[i]],[side*.52,b.bottom,zs[i+1]],[side*(b.width-.035),b.bottom,zs[i+1]]),'trim',DARK);
    }
    // Side sills stop before the open arches.
    for(const [za,zb]of [[-spec.length/2,spec.axles[0]-spec.arch],[spec.axles[0]+spec.arch,spec.axles[1]-spec.arch],[spec.axles[1]+spec.arch,spec.length/2]]){
      const wa=section(spec,za).width,wb=section(spec,zb).width;
      parts.add(quad([side*(wa-.035),.165,za],[side*wa,.225,za],[side*wb,.225,zb],[side*(wb-.035),.165,zb]),spec.id==='kadett'?'trim':'paint',spec.id==='kadett'?DARK:0xffffff);
    }
    for(const axle of spec.axles)rolledWheelArch(parts,spec,high,side,axle);
  }
  endCap(parts,spec,high,false);
  parts.add(box(1.08,.09,spec.length*.86,0,.16,0),'trim',BLACK);
}

function cabin(parts,spec,high) {
  const c=spec.cabin,[zf,yf,xf]=c.front,[zt,yt,xt]=c.roofFront,[zr,yr,xr]=c.roofRear,[zb,yb,xb]=c.rear;
  const glassInset=.029;
  // The paint roof has a small crown and four softened shoulders.
  const rp=[],ri=[],rows=high?7:4,cols=high?17:9;
  for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){
    const v=j/(rows-1),u=i/(cols-1)*2-1,w=lerp(xr,xt,v);
    rp.push(...roofPoint(spec,u,v));
  }
  for(let j=0;j<rows-1;j++)for(let i=0;i<cols-1;i++){const a=j*cols+i,b=a+cols;ri.push(a,b,a+1,a+1,b,b+1);}
  parts.add(geometry(rp,ri));
  const frontGlassRows=[],backGlassRows=[],glassRows=high?4:2;
  for(let n=0;n<glassRows;n++){
    const t=n/(glassRows-1);
    frontGlassRows.push([lerp(zf-.004,zt+.016,t),lerp(yf+.015,yt-.024,t),lerp(xf-glassInset,xt-glassInset,t)]);
    backGlassRows.push([lerp(zr-.016,zb+.009,t),lerp(yr-.028,yb+.017,t),lerp(xr-.036,xb-.036,t)]);
  }
  glazingSurface(parts,(u,v)=>{
    const x=u*2-1,w=lerp(xf-glassInset,xt-glassInset,v),crown=lerp(.012,COACHWORK[spec.id].roof,v);
    return [x*w,lerp(yf+.018,yt-.018,v)+roofCrown(x,crown)+.011*Math.sin(v*Math.PI),lerp(zf-.004,zt+.011,v)+.043*(1-x*x)*Math.sin(v*Math.PI)];
  },high,GLASS);
  roofHeader(parts,c.roofFront,COACHWORK[spec.id].roof,high);
  glazingSurface(parts,(u,v)=>{
    const x=u*2-1,w=lerp(xr-.034,xb-.034,v);
    return [x*w,lerp(yr-.018,yb+.017,v)+roofCrown(x,lerp(COACHWORK[spec.id].roof,.012,v))+.011*Math.sin(v*Math.PI),lerp(zr-.011,zb+.009,v)-.021*(1-x*x)*Math.sin(v*Math.PI)];
  },high,GLASS);
  roofHeader(parts,[zr-.014,yr,xr],COACHWORK[spec.id].roof,high);
  for(const side of [-1,1]){
    // Painted A and C pillars follow the glass plane; no oversized solid cabin.
    parts.add(beam([side*xf,yf,zf],[side*xt,yt,zt],.064,.048));
    parts.add(beam([side*xr,yr,zr],[side*xb,yb,zb],spec.id==='kadett'?.107:.093,.048));
    const railSteps=high?6:2,rail=[];
    for(let n=0;n<=railSteps;n++){const v=n/railSteps;rail.push([side*lerp(xr,xt,v),lerp(yr,yt,v)+roofBow(spec,v),lerp(zr,zt,v)]);}
    polyline(parts,rail,.047,'paint',0xffffff);
    for(let n=1;n<rail.length;n++){const a=rail[n-1],b=rail[n];parts.add(quad(a,b,[b[0]+side*.004,b[1]-.062,b[2]],[a[0]+side*.004,a[1]-.062,a[2]]));}
    parts.add(beam([side*xf,yf,zf],[side*xb,yb,zb],.033,.045),'trim',spec.id==='kadett'?CHROME:BLACK);
    const bp=c.pillar,t=(bp-zr)/(zt-zr),roofY=lerp(yr,yt,t)-.023,roofX=lerp(xr,xt,t),bottomY=lerp(yb,yf,(bp-zb)/(zf-zb))+.02,bottomX=lerp(xb,xf,(bp-zb)/(zf-zb));
    sideGlazing(parts,[[side*(xf-.002),yf+.045,zf-.055],[side*(xt-.008),yt-.046,zt-.01],[side*(roofX-.005),roofY,bp+.022],[side*(bottomX-.003),bottomY+.015,bp+.022]],side,high,GLASS);
    sideGlazing(parts,[[side*(bottomX-.003),bottomY+.015,bp-.038],[side*(roofX-.005),roofY,bp-.038],[side*(xr-.020),yr-.047,zr-.026],[side*(xb-.015),yb+.044,zb+.105]],side,high,GLASS);
    parts.add(beam([side*bottomX,bottomY,bp],[side*roofX,roofY+.025,bp],.048,.04),'trim',BLACK);
    // Window gasket outlines sit outside the glazing, in particular the E30
    // triangular rear quarter and its characteristic lower Hofmeister kink.
    if(high){
      for(const [a,b]of [
        [[side*(xf+.008),yf+.045,zf-.042],[side*(xt+.010),yt-.047,zt-.008]],
        [[side*(xt+.008),yt-.040,zt-.018],[side*(xr+.008),yr-.040,zr-.025]],
        [[side*(xr+.008),yr-.050,zr-.025],[side*(xb+.006),yb+.05,zb+.09]]
      ])parts.add(beam(a,b,.016,.012),'trim',spec.id==='kadett'?CHROME:BLACK);
      parts.add(beam([side*xb,yb+.047,zb+.08],[side*bottomX,bottomY+.015,bp-.035],.013),'trim',BLACK);
    }
    const mirrorZ=zf-.09,mirrorY=yf+.10,mirrorX=xf+.115;
    parts.add(beam([side*xf,mirrorY-.05,mirrorZ],[side*mirrorX,mirrorY,mirrorZ],.023),'trim',BLACK);
    const mirror=new THREE.SphereGeometry(1,high?10:6,high?6:3);mirror.scale(.105,.047,.08);mirror.translate(side*mirrorX,mirrorY,mirrorZ);
    parts.add(mirror,spec.id==='kadett'?'chrome':'trim',spec.id==='kadett'?CHROME:BLACK);
    if(high)parts.add(box(.008,.056,.10,side*(mirrorX+.089),mirrorY,mirrorZ),'glass',0x87a0a7);
  }
  cabinInterior(parts,spec,high);
  if(high)for(const x of [-.34,.34])parts.add(beam([x,yf+.018,zf-.015],[x+.23,yf+.028,zf-.11],.012),'trim',BLACK);
}

function registration(parts,spec,high) {
  const z=-spec.length/2-.023,y=spec.id==='kadett'?.41:.40;
  parts.add(box(.50,.113,.012,0,y,z),'livery',0xf0f0e8);
  if(high){parts.add(box(.04,.11,.014,-.221,y,z-.009),'livery',0x245293);for(let n=0;n<6;n++)parts.add(box(.019,.059,.004,-.15+n*.057,y,z-.010),'trim',0x202a30);}
}

function roundLamp(parts,x,y,z,radius,high) {
  const segments=high?24:12;
  parts.add(new THREE.CircleGeometry(radius+.014,segments).translate(x,y,z+.014),'chrome',0xa9b6bc);
  const p=[x,y,z+.037],idx=[];
  for(let n=0;n<=segments;n++){
    const a=n*Math.PI*2/segments;p.push(x+Math.cos(a)*radius,y+Math.sin(a)*radius,z+.017);
  }
  for(let n=0;n<segments;n++)idx.push(0,n+1,n+2);
  const lens=parts.add(geometry(p,idx),'lights',0xd1ded9),position=lens.attributes.position,colours=lens.attributes.color;
  const edge=new THREE.Color(0x8aa8ae),clear=new THREE.Color(0xd1ded9);
  for(let n=0;n<position.count;n++){
    const radial=Math.min(1,Math.hypot(position.getX(n)-x,position.getY(n)-y)/radius);
    const top=(position.getY(n)-y)/radius;
    const colour=clear.clone().lerp(edge,radial*(.54-.12*top));
    colours.setXYZ(n,colour.r,colour.g,colour.b);
  }
  if(high){
    const ring=new THREE.TorusGeometry(radius+.007,.007,3,24);ring.translate(x,y,z+.021);parts.add(ring,'chrome',CHROME);
    for(const o of [-.04,0,.04])if(Math.abs(o)<radius){
      const h=Math.sqrt(radius**2-o**2)*1.7;
      parts.add(beam([x+o,y-h/2,z+.034],[x+o,y+h/2,z+.034],.004),'lights',0xb0c3c2);
    }
  }
}

function kidney(parts,z,y,size,high) {
  for(const side of [-1,1]){
    parts.add(box(size*.80,size*1.19,.027,side*size*.52,y,z),'chrome',CHROME);
    parts.add(box(size*.62,size*.98,.030,side*size*.52,y,z+.012),'trim',BLACK);
    if(high)for(let n=0;n<4;n++)parts.add(box(.008,size*.92,.006,side*size*.52+(n-1.5)*size*.13,y,z+.031),'chrome',0x666b70);
  }
}

function badge(parts,x,y,z,axis='z',radius=.038,high=true) {
  const g=cyl(radius,.007,x,y,z,axis,high?12:8);parts.add(g,'chrome',CHROME);
  parts.add(cyl(radius*.80,.010,x,y,z+(axis==='z'?.005:0),axis,high?12:8),'livery',0x1b2d3c);
  if(high){
    const ring=axis==='y'?new THREE.CircleGeometry(radius*.59,8).rotateX(-Math.PI/2):new THREE.CircleGeometry(radius*.59,8);
    ring.translate(x,y+(axis==='y'?.006:0),z+(axis==='z'?.009:0));parts.add(ring,'livery',0xe3e8ec);
    // Geometric blue quarters remain bitmap-free at both scales.
    const disk=axis==='y'?new THREE.CircleGeometry(radius*.58,4,0,Math.PI/2).rotateX(-Math.PI/2):new THREE.CircleGeometry(radius*.58,4,0,Math.PI/2);disk.translate(x,y+(axis==='y'?.008:0),z+(axis==='z'?.011:0));parts.add(disk,'livery',0x338dc1);
  }
}

function kadettDetails(parts,spec,high) {
  const front=spec.length/2;
  parts.add(box(1.43,.265,.045,0,.574,front+.018),'trim',BLACK);
  parts.add(bevelledFrame(1.49,.304,.039,.021,.055,0,.574,front+.024,high),'chrome',CHROME);
  for(const side of [-1,1])roundLamp(parts,side*.557,.594,front+.05,.112,high);
  if(high)for(let i=0;i<7;i++)parts.add(box(.62,.012,.010,0,.50+i*.031,front+.045),'trim',0x4b5053);
  parts.add(cyl(.049,.015,0,.593,front+.058,'z',12),'chrome',CHROME);
  parts.add(quad([-.065,.610,front+.073],[.060,.610,front+.073],[.025,.581,front+.073],[-.086,.581,front+.073]),'chrome',CHROME);
  // Period chrome bumper wraps around its corners, with black rubber overriders.
  for(const z of [front+.075,-front-.069]){
    parts.add(softBox(1.44,.067,.055,0,.361,z,.018),'chrome',CHROME);
    for(const side of [-1,1]){
      parts.add(box(.078,.114,.095,side*.49,.370,z+.007),'trim',BLACK);
      parts.add(box(.065,.066,.19,side*.735,.361,z>0?z-.078:z+.078),'chrome',CHROME);
    }
  }
  for(const side of [-1,1]){
    parts.add(box(.132,.062,.024,side*.622,.403,front+.048),'lights',0xe99a21);
    parts.add(box(.315,.127,.027,side*.515,.623,-front-.023),'chrome',CHROME);
    parts.add(box(.290,.107,.034,side*.515,.623,-front-.042),'lights',0xa91f25);
    parts.add(box(.072,.099,.007,side*.615,.623,-front-.064),'lights',0xf59b2a);
    parts.add(box(.058,.087,.007,side*.420,.623,-front-.064),'lights',0xc6d1cc);
    parts.add(beam([side*.808,.69,-.62],[side*.813,.69,.72],.014),'chrome',CHROME);
    parts.add(box(.026,.032,.15,side*.809,.824,-.25),'chrome',CHROME);
  }
  if(high){
    for(const side of [-1,1])parts.add(beam([side*.73,.845,.59],[side*.72,.780,1.76],.007),'trim',0xa48219);
    parts.add(beam([-.69,.804,1.77],[.69,.804,1.77],.005),'trim',0xc69d18);
  }
  parts.add(softBox(1.24,.055,.16,0,.835,-1.995,.017),'trim',BLACK);
  parts.add(cyl(.036,.145,-.49,.24,-front-.049,'z',high?12:6),'chrome',0x989fa5);
  registration(parts,spec,high);
}

function e30Details(parts,spec,high) {
  const f=spec.length/2;
  parts.add(box(1.57,.263,.035,0,.635,f+.016),'trim',BLACK);
  parts.add(bevelledFrame(1.63,.302,.045,.023,.055,0,.635,f+.021,high),'trim',0x343d45);
  for(const side of [-1,1])for(const x of [.425,.655])roundLamp(parts,side*x,.656,f+.042,.096,high);
  kidney(parts,f+.052,.655,.148,high);
  parts.add(softBox(1.60,.133,.09,0,.438,f+.022,.024));
  parts.add(box(1.61,.038,.03,0,.450,f+.074),'trim',BLACK);
  parts.add(box(.65,.115,.016,0,.282,f+.046),'trim',BLACK);
  parts.add(box(1.66,.041,.135,0,.174,f+.066),'trim',0x19212c);
  for(const side of [-1,1]){
    parts.add(box(.180,.056,.015,side*.598,.427,f+.079),'lights',0xed9c23);
    parts.add(box(.211,.090,.010,side*.617,.284,f+.058),'lights',0xd5dacf);
    parts.add(box(.064,.130,.14,side*.70,.929,-1.91));
    parts.add(box(.47,.173,.030,side*.548,.703,-f-.023),'trim',BLACK);
    parts.add(box(.24,.145,.012,side*.480,.705,-f-.047),'lights',0xa31423);
    parts.add(box(.101,.145,.012,side*.683,.705,-f-.047),'lights',0xe8971c);
    parts.add(box(.084,.145,.012,side*.355,.705,-f-.047),'lights',0xcbd6d5);
    parts.add(beam([side*.835,.545,-.65],[side*.835,.545,.82],.027),'trim',BLACK);
    parts.add(box(.02,.03,.155,side*.843,.823,-.25),'trim',BLACK);
    if(high){
      const a=[side*.831,.810,-.62],b=[side*.831,.765,.82],c=[side*.807,.249,.70],d=[side*.828,.249,-.62];
      for(const [p,q]of [[a,b],[b,c],[d,a]])parts.add(beam(p,q,.005),'trim',0x686969);
    }
  }
  parts.add(softBox(1.53,.054,.227,0,1.013,-1.96,.016));
  parts.add(box(1.53,.012,.145,0,1.046,-1.96),'trim',0x1c2633);
  parts.add(softBox(1.61,.11,.064,0,.435,-f-.024,.018));
  parts.add(box(1.64,.037,.024,0,.463,-f-.063),'trim',BLACK);
  parts.add(box(1.34,.084,.023,0,.269,-f-.025),'trim',BLACK);
  for(const x of [-.56,-.455]){parts.add(cyl(.041,.18,x,.237,-f-.015,'z',high?12:6),'chrome',CHROME);parts.add(cyl(.033,.006,x,.237,-f-.108,'z',high?12:6),'trim',BLACK);}
  badge(parts,0,.839,1.915,'y',.038,high);badge(parts,0,.758,-f-.028,'z',.038,high);
  registration(parts,spec,high);
  raceLivery(parts,spec,high);
}

function m1Details(parts,spec,high) {
  const f=spec.length/2;
  parts.add(box(1.63,.158,.020,0,.396,f+.028),'trim',BLACK);
  kidney(parts,f+.050,.391,.088,high);
  for(const side of [-1,1]){
    parts.add(box(.110,.058,.012,side*.714,.406,f+.045),'lights',0xea9a21);
    parts.add(box(.105,.058,.012,side*.602,.406,f+.045),'lights',0xe6ece6);
    // Retracted headlamp lids follow the wedge bonnet, with a fine black seam.
    const lid=[[side*.47,1.83],[side*.79,1.83],[side*.77,1.40],[side*.47,1.40]].map(([x,z])=>[x,surfaceTop(spec,x,z)+.005,z]);
    const face=[[side*.481,1.817],[side*.777,1.817],[side*.759,1.414],[side*.481,1.414]].map(([x,z])=>[x,surfaceTop(spec,x,z)+.009,z]);
    parts.add(polygon(lid),'trim',0x3e4447);parts.add(polygon(face));
    parts.add(cyl(.066,.007,side*.63,.225,f+.042,'z',high?14:8),'trim',BLACK);
    const x=side*.82;
    parts.add(box(.024,.058,.181,x,.674,-.01),'trim',BLACK);
    // Long black air intakes behind the triangular side glass.
    parts.add(quad([side*.76,.88,-.84],[side*.905,.858,-1.59],[side*.916,.744,-1.77],[side*.758,.793,-1.055]),'trim',BLACK);
    if(high)for(let k=0;k<5;k++)parts.add(beam([side*(.79+k*.022),.84,-1.01-k*.12],[side*(.80+k*.022),.774,-1.04-k*.12],.018),'trim',0x363c40);
    parts.add(box(.439,.166,.027,side*.62,.645,-f-.020),'trim',BLACK);
    parts.add(box(.285,.139,.014,side*.593,.648,-f-.041),'lights',0xa11124);
    parts.add(box(.085,.139,.014,side*.780,.648,-f-.041),'lights',0xeb931b);
    parts.add(box(.081,.054,.010,side*.495,.612,-f-.050),'lights',0xd2d7d7);
    // Rear wing end plates slope forward like the original Procar supports.
    parts.add(quad([side*.88,.821,-1.945],[side*.88,.891,-1.705],[side*.88,1.155,-1.922],[side*.88,1.115,-2.145]));
    if(high)badge(parts,side*.79,.799,-1.956,'y',.042,true);
  }
  parts.add(box(.79,.104,.019,0,.22,f+.043),'trim',BLACK);
  if(high)for(let i=0;i<4;i++)parts.add(box(.756,.006,.007,0,.183+i*.025,f+.057),'trim',0x575e65);
  parts.add(box(1.73,.03,.169,0,.127,f+.055),'trim',0x202733);
  parts.add(box(1.57,.081,.03,0,.387,-f-.020),'trim',BLACK);
  parts.add(softBox(1.81,.091,.315,0,1.167,-2.025,.025),'trim',0x171e26);
  parts.add(box(1.88,.015,.033,0,1.223,-2.15),'chrome',0x7d8b96);
  // Engine-cover transverse louvres are shallow slats above a recessed opening.
  parts.add(quad([-.67,.851,-.92],[.67,.851,-.92],[.70,.811,-1.84],[-.70,.811,-1.84]),'trim',BLACK);
  for(let i=0;i<(high?8:5);i++){
    const z=-1.00-i*(high?.108:.181),y=.849+(z+.92)*.044;
    parts.add(box(1.33,.015,.047,0,y,z),'trim',0x313840);
  }
  if(high){
    parts.add(box(.056,.061,.16,-.3,.255,-f-.007),'chrome',0x92999f);
    for(const side of [-1,1])for(let i=0;i<3;i++){
      const z=1.115+i*.077,y=sampled(spec.profile,z,1)+.016;
      parts.add(box(.49,.01,.035,side*.246,y,z),'trim',0x444a4c);
    }
    for(const side of [-1,1])parts.add(beam([side*.70,.644,.66],[side*.834,.548,1.90],.006),'trim',0x899093);
  }
  badge(parts,0,.552,1.978,'y',.032,high);
  raceLivery(parts,spec,high);
}

function raceLivery(parts,spec,high) {
  // Motorsport stripes are surface polygons following the body contours.
  // They stay recognisable in the inexpensive vertex-colour racing mesh too.
  const isM1=spec.id==='m1',width=isM1?.185:.085;
  for(let stripe=0;stripe<3;stripe++){
    const base=isM1?-.37+stripe*width:-.35+stripe*width;
    const zFront=isM1?1.87:1.94,zBack=isM1?.78:.83;
    const zs=high?[zFront,1.54,1.20,zBack]:[zFront,zBack];
    for(let i=0;i<zs.length-1;i++){
      const z1=zs[i],z2=zs[i+1],x1=base+(isM1?.30*(zFront-z1):.13*(zFront-z1)),x2=base+(isM1?.30*(zFront-z2):.13*(zFront-z2));
      parts.add(quad([x1,surfaceTop(spec,x1,z1)+.005,z1],[x1+width,surfaceTop(spec,x1+width,z1)+.005,z1],[x2+width,surfaceTop(spec,x2+width,z2)+.005,z2],[x2,surfaceTop(spec,x2,z2)+.005,z2]),'livery',M_COLOURS[stripe]);
    }
    const c=spec.cabin,roofOffset=isM1?-.17+stripe*.24:-.25+stripe*.085,roofWidth=isM1?.24:.085;
    const roofRows=high?8:4,roofColumns=isM1?4:1;
    for(let row=0;row<roofRows;row++){
      const point=(u,t)=>{
        const v=lerp(.025,.975,t),w=lerp(c.roofRear[2],c.roofFront[2],v);
        const left=roofOffset+.15*(1-v),right=isM1?Math.min(left+roofWidth,w-.002):left+roofWidth,x=lerp(left,right,u);
        const point=roofPoint(spec,x/w,v);point[1]+=.007;return point;
      };
      // The Procar's broad bands cross the rounded shoulder. Subdivision
      // keeps their interior above the roof, not merely their corner points.
      for(let column=0;column<roofColumns;column++){
        const a=column/roofColumns,b=(column+1)/roofColumns;
        parts.add(quad(point(a,row/roofRows),point(b,row/roofRows),point(b,(row+1)/roofRows),point(a,(row+1)/roofRows)),'livery',M_COLOURS[stripe]);
      }
    }
  }
  for(const side of [-1,1]){
    const x=side*(isM1?.851:.829),z0=isM1?.15:.66,h=isM1?.30:.20,w=isM1?.195:.075;
    for(let stripe=0;stripe<3;stripe++){
      const za=z0-stripe*w,zb=za-w;
      parts.add(quad([x,.248,za],[x,.248,zb],[x,.248+h,zb-.20],[x,.248+h,za-.20]),'livery',M_COLOURS[stripe]);
    }
    if(high){
      // Small authored sponsor bars, rather than copied manufacturer imagery.
      for(let i=0;i<3;i++)parts.add(box(.008,.022,.17,side*(isM1?.86:.838),.305,-.45-i*.22),'trim',0x2b2c2d);
    }
  }
}

function m2Details(parts,spec,high) {
  const f=spec.length/2,frontZ=f+.016;
  // Connected, high-gloss F87 Competition kidneys. The shape is deliberately
  // much wider than the classic BMW grille; its top meets the lamp corners.
  parts.add(roundedFace(.866,.236,.064,0,.684,frontZ+.011,high?5:3),'trim',0x080b0e);
  parts.add(bevelledFrame(.936,.272,.074,.025,.072,0,.684,frontZ+.014,high),'chrome',0x687780);
  for(const side of [-1,1]){
    const kidneyPoints=[[side*.027,.783],[side*.123,.796],[side*.377,.766],[side*.416,.722],[side*.359,.589],[side*.087,.586],[side*.040,.626]].map(([x,y])=>[x,y,frontZ+.020]);
    parts.add(polygon(kidneyPoints),'trim',0x171c22);
    for(let n=0;n<(high?7:4);n++){
      const x=side*(.090+n*(high?.044:.080));
      polyline(parts,[[x,.617,frontZ+.023],[x+side*.020,.752,frontZ+.024]],high?.009:.012,'chrome',0x4e5861);
    }
    const lens=[[side*.431,.590],[side*.821,.623],[side*.844,.723],[side*.771,.780],[side*.510,.755]].map(([x,y])=>[x,y,frontZ+.021]);
    parts.add(polygon(lens),'trim',0x0d1823);
    for(const x of [.545,.731]){
      const led=[[side*(x-.069),.641,frontZ+.031],[side*(x-.074),.712,frontZ+.031],[side*x,.730,frontZ+.031],[side*(x+.063),.705,frontZ+.031],[side*(x+.060),.641,frontZ+.031],[side*(x-.008),.624,frontZ+.031],[side*(x-.069),.641,frontZ+.031]];
      polyline(parts,led,high?.011:.014,'lights',0xd2eeff);
      if(high)parts.add(ellipseFace(.039,.043,[side*x,.677,frontZ+.027],[0,0,1],12),'glass',0x314b5a);
    }
    polyline(parts,[[side*.449,.750,frontZ+.034],[side*.768,.779,frontZ+.034],[side*.831,.727,frontZ+.034]],.011,'lights',0xe6f4ff);
    const intake=[[side*.578,.491],[side*.850,.481],[side*.834,.272],[side*.610,.257],[side*.536,.323]].map(([x,y])=>[x,y,frontZ+.024]);
    parts.add(polygon(intake),'trim',BLACK);
    parts.add(bevelledFrame(.34,.26,.050,.024,.072,side*.70,.375,frontZ+.005,high));
    if(high){
      for(let n=0;n<4;n++)polyline(parts,[[side*(.59+n*.049),.302,frontZ+.027],[side*(.618+n*.049),.446,frontZ+.027]],.006,'trim',0x465057);
      parts.add(roundedFace(.291,.034,.012,side*.660,.454,frontZ+.034,2),'trim',0x252c31);
    }
    // The lower bumper blades wrap up into the side intakes.
    parts.add(polygon([[side*.868,.197,frontZ+.02],[side*.91,.258,f-.13],[side*.87,.480,f-.13],[side*.836,.262,frontZ+.047],[side*.629,.225,frontZ+.036]]));
    parts.add(quad([side*.886,.941,.98],[side*.902,.927,.76],[side*.916,.845,.84],[side*.902,.856,1.00]),'trim',BLACK);
    if(high){
      parts.add(beam([side*.906,.888,.790],[side*.916,.880,.945],.018),'chrome',0x687780);
      for(let stripe=0;stripe<3;stripe++)parts.add(box(.007,.026,.014,side*.918,.872,.86+stripe*.017),'livery',M_COLOURS[stripe]);
      const xa=side*.488,xb=side*.441;
      polyline(parts,[[xa,modernSurfaceTop(spec,xa,1.86)+.005,1.86],[xb,modernSurfaceTop(spec,xb,.89)+.005,.89]],.008,'trim',0x515b64);
    }
    // The F87's tail lamps are a red L, with a darker stepped upper corner.
    const rearZ=-f-.018,tail=[[side*.41,.789,rearZ],[side*.456,.862,rearZ],[side*.753,.853,rearZ],[side*.847,.799,rearZ],[side*.839,.669,rearZ],[side*.477,.660,rearZ],[side*.461,.734,rearZ]];
    parts.add(polygon(tail),'trim',0x320d16);
    polyline(parts,[[side*.809,.807,rearZ-.007],[side*.514,.819,rearZ-.007],[side*.519,.733,rearZ-.007],[side*.819,.712,rearZ-.007]],high?.028:.037,'lights',0xb72934);
    parts.add(box(.048,.159,.014,side*.811,.407,rearZ-.002),'lights',0x8e1925);
    for(const x of [.449,.579]){
      parts.add(cyl(.050,.145,side*x,.249,rearZ-.025,'z',high?16:8),'chrome',0x7a8790);
      parts.add(ellipseFace(.038,.038,[side*x,.249,rearZ-.102],[0,0,-1],high?12:8),'trim',BLACK);
    }
  }
  const centerIntake=[[-.53,.297,frontZ+.026],[-.438,.507,frontZ+.026],[.438,.507,frontZ+.026],[.53,.297,frontZ+.026]];
  parts.add(polygon(centerIntake),'trim',BLACK);
  if(high){
    for(let n=0;n<3;n++)polyline(parts,[[-.435,.334+n*.050,frontZ+.03],[.435,.334+n*.050,frontZ+.03]],.005,'trim',0x3b454c);
    for(let n=0;n<10;n++)polyline(parts,[[ -.40+n*.084,.316,frontZ+.031],[-.40+n*.084,.454,frontZ+.031]],.005,'trim',0x3b454c);
  }
  parts.add(quad([-.865,.171,f+.057],[.865,.171,f+.057],[.91,.185,f-.31],[-.91,.185,f-.31]),'trim',0x151c23);
  const rearZ=-f-.025;
  parts.add(roundedFace(1.38,.19,.070,0,.263,rearZ,high?4:2),'trim',0x171e24);
  if(high)for(const x of [-.30,-.15,0,.15,.30])parts.add(beam([x,.185,rearZ-.008],[x,.274,rearZ+.127],.015),'trim',0x303941);
  parts.add(beam([-.752,.879,-2.03],[.752,.879,-2.03],.040,.083),'trim',0x252c33);
  badge(parts,0,.837,2.012,'y',.035,high);badge(parts,0,.814,rearZ-.002,'z',.035,high);
  registration(parts,spec,high);
}

function gt3rsDetails(parts,spec,high) {
  const f=spec.length/2,frontZ=f+.011;
  const bonnetHeight=(x,z)=>modernSurfaceTop(spec,x,z)+.008;
  for(const side of [-1,1]){
    // The oval 911 lights are sloped into raised front fenders, not mounted on
    // a vertical rectangular nose. Four LED dots remain visible from afar.
    const cx=side*.700,cz=1.633;
    const lamp=(rx,rz,offset,segments)=>{
      const p=[[cx,modernSurfaceTop(spec,cx,cz)+offset,cz]];
      for(let n=0;n<=segments;n++){const a=n*Math.PI*2/segments,x=cx+Math.cos(a)*rx,z=cz+Math.sin(a)*rz;p.push([x,modernSurfaceTop(spec,x,z)+offset,z]);}
      return polygon(p);
    };
    parts.add(lamp(.154,.233,.008,high?24:12),'trim',0x0a111c);
    parts.add(lamp(.136,.206,.012,high?24:12),'glass',0x24517b);
    for(const [lx,lz]of [[-.052,.074],[.052,.074],[-.052,-.074],[.052,-.074]]){
      const x=cx+lx,z=cz+lz,dot=[x,modernSurfaceTop(spec,x,z)+.020,z];
      parts.add(ellipseFace(.019,.018,dot,[side*.12,1,.32],high?10:6),'lights',0xe6f3ff);
    }
    const vent=[[side*.114,1.02],[side*.419,1.04],[side*.454,1.525],[side*.192,1.546]],vp=[],vi=[],vc=high?5:3,vr=high?6:3;
    for(let row=0;row<=vr;row++)for(let col=0;col<=vc;col++){
      const u=col/vc,v=row/vr,ax=lerp(vent[0][0],vent[1][0],u),az=lerp(vent[0][1],vent[1][1],u),bx=lerp(vent[3][0],vent[2][0],u),bz=lerp(vent[3][1],vent[2][1],u),x=lerp(ax,bx,v),z=lerp(az,bz,v);
      vp.push(x,bonnetHeight(x,z)+.004,z);
    }
    for(let row=0;row<vr;row++)for(let col=0;col<vc;col++){const a=row*(vc+1)+col,b=a+vc+1;vi.push(a,b,a+1,a+1,b,b+1);}
    parts.add(geometry(vp,vi),'trim',BLACK);
    // Bonnet radiator outlets have a raised forward-facing exit lip.
    const lipZ=1.05;
    parts.add(quad([side*.120,bonnetHeight(side*.120,lipZ)+.011,lipZ],[side*.432,bonnetHeight(side*.432,lipZ)+.011,lipZ],[side*.423,bonnetHeight(side*.423,lipZ)+.101,lipZ-.09],[side*.123,bonnetHeight(side*.123,lipZ)+.092,lipZ-.09]),'trim',0x161d24);
    parts.add(polygon([[side*.662,bonnetHeight(side*.662,1.091),1.091],[side*.866,bonnetHeight(side*.866,1.101),1.101],[side*.845,bonnetHeight(side*.845,.750),.750],[side*.640,bonnetHeight(side*.640,.745),.745]]),'trim',0x111920);
    for(let n=0;n<(high?5:3);n++){
      const z=.78+n*(high?.059:.110);
      polyline(parts,[[side*.665,bonnetHeight(side*.665,z)+.015,z],[side*.839,bonnetHeight(side*.839,z)+.015,z]],high?.010:.014,'trim',0x414b54);
    }
    // Carbon sideblades behind front and rear arches are essential RS cues.
    for(const [z1,z2,y]of [[.635,.752,.61],[-1.77,-1.68,.54]]){
      const x=side*(section(spec,z1).width+.012);
      parts.add(polygon([[x,.17,z1],[x+.009*side,.18,z2],[x+.013*side,y,z2],[x,y-.034,z1]]),'trim',0x111a22);
    }
    const rearIntake=[[side*.873,.830,-.83],[side*.924,.811,-1.045],[side*.932,.533,-.98],[side*.874,.549,-.828]];
    parts.add(polygon(rearIntake),'trim',BLACK);
    if(high)polyline(parts,[[side*.879,.807,-.838],[side*.91,.785,-1.019],[side*.916,.557,-.979]],.016,'trim',0x39424a);
    const spoilerBaseY=bonnetHeight(side*.47,-1.69);
    // Swan neck: attachment comes OVER the aerofoil, with no lower pedestals
    // blocking its underside. Both support profiles have a visible hook.
    const neck=[[side*.49,spoilerBaseY,-1.68],[side*.49,1.359,-1.514],[side*.49,1.425,-1.612],[side*.49,1.414,-1.925]];
    polyline(parts,neck,.041,'trim',0x131a21);
    const plate=[[side*.943,1.291,-1.718],[side*.943,1.437,-1.779],[side*.943,1.437,-2.166],[side*.943,1.316,-2.155]];
    parts.add(polygon(plate),'trim',0x19222b);
    parts.add(polygon([[side*.59,.196,frontZ+.010],[side*.825,.215,2.036],[side*.899,.380,1.957],[side*.858,.580,2.020],[side*.754,.489,2.107],[side*.638,.450,frontZ+.009]]),'trim',0x0f1720);
    const drlZ=2.175;
    parts.add(roundedFace(.208,.039,.015,side*.565,.455,drlZ,high?3:2),'trim',BLACK);
    parts.add(roundedFace(.179,.014,.005,side*.565,.457,drlZ+.003,high?3:2),'lights',0xedf3f5);
  }
  // Full-width 992 rear light blade, low diffuser and centre-exit twin pipes.
  const rearZ=-f-.016;
  parts.add(beam([-.810,.708,rearZ],[.810,.708,rearZ],.040,.027),'trim',BLACK);
  parts.add(beam([-.786,.714,rearZ-.017],[.786,.714,rearZ-.017],.016,.012),'lights',0xdb2a3b);
  parts.add(roundedFace(1.50,.215,.062,0,.267,rearZ-.004,high?4:2),'trim',0x111a23);
  for(const x of [-.086,.086]){
    parts.add(cyl(.058,.145,x,.237,rearZ-.016,'z',high?16:8),'chrome',0x88969f);
    parts.add(ellipseFace(.044,.044,[x,.237,rearZ-.09],[0,0,-1],high?12:8),'trim',BLACK);
  }
  for(const x of high?[-.59,-.39,-.22,.22,.39,.59]:[-.49,-.22,.22,.49])parts.add(polygon([[x,.168,rearZ-.015],[x,.324,rearZ+.091],[x,.221,rearZ+.335]]),'trim',0x252f38);
  parts.add(quad([-.695,.157,frontZ+.011],[.695,.157,frontZ+.011],[.909,.162,1.995],[-.909,.162,1.995]),'trim',0x141e29);
  parts.add(roundedFace(.984,.182,.052,0,.291,frontZ+.016,high?4:2),'trim',BLACK);
  if(high)for(let n=0;n<5;n++)polyline(parts,[[-.45,.231+n*.029,frontZ+.02],[.45,.231+n*.029,frontZ+.02]],.004,'trim',0x4b535b);
  // Two-part rear aerofoil with a cambered section, swept forward tips and
  // separate trailing element. Geometry remains merged into the body mesh.
  const spanRows=high?8:4,p=[],idx=[];
  const airfoil=[[-.206,-.019],[-.14,.013],[0,.028],[.153,.016],[.226,-.026],[.148,-.037],[-.04,-.035]];
  for(let n=0;n<=spanRows;n++){
    const u=n/spanRows*2-1,sweep=.059*u*u;
    for(const [z,y]of airfoil)p.push(u*.918,1.366+y,-1.919+z+sweep);
  }
  for(let n=0;n<spanRows;n++)for(let a=0;a<airfoil.length;a++){
    const next=(a+1)%airfoil.length,A=n*airfoil.length+a,B=(n+1)*airfoil.length+a,An=n*airfoil.length+next,Bn=(n+1)*airfoil.length+next;
    idx.push(A,B,An,An,B,Bn);
  }
  parts.add(geometry(p,idx),'trim',0x1d2731);
  parts.add(beam([-.903,1.373,-2.113],[.903,1.373,-2.113],.023,.079),'trim',0x3f4e5c);
  if(high){
    // Roof vanes, not generic wings. They are tiny but visible in the garage.
    for(const x of [-.44,.44])parts.add(polygon([[x,1.385,-.57],[x,1.401,-.78],[x,1.444,-.71]]),'trim',0x1d252d);
    for(let n=0;n<8;n++){
      const x=(n-3.5)*.083,z=-1.55;
      polyline(parts,[[x,bonnetHeight(x,z)+.003,z],[x,bonnetHeight(x,z-.34)+.003,z-.34]],.013,'trim',0x202c36);
    }
    for(const side of [-1,1])polyline(parts,[[side*.475,bonnetHeight(side*.475,.89),.89],[side*.524,bonnetHeight(side*.524,1.51),1.51],[side*.442,bonnetHeight(side*.442,1.93),1.93]],.005,'trim',0x17548a);
    // A small shield-shaped crest, made locally from coloured geometry.
    parts.add(polygon([[-.027,bonnetHeight(-.027,1.845),1.845],[.027,bonnetHeight(.027,1.845),1.845],[.022,bonnetHeight(.022,1.786),1.786],[0,bonnetHeight(0,1.770),1.770],[-.022,bonnetHeight(-.022,1.786),1.786]]),'livery',0xc5a566);
  }
  registration(parts,spec,high);
}

function modernWheelParts(spec,high,materials) {
  const p=new Parts(),r=spec.radius,w=spec.tyreWidth;
  const profile=(high?[[.75,-.50],[.88,-.51],[.982,-.37],[1,-.14],[1,.14],[.982,.37],[.88,.51],[.75,.50]]:[[.78,-.50],[.970,-.38],[1,-.10],[1,.10],[.970,.38],[.78,.50]]).map(([rr,ww])=>new THREE.Vector2(rr*r,ww*w));
  const tyre=new THREE.LatheGeometry(profile,high?28:20);tyre.rotateZ(Math.PI/2);p.add(tyre,'trim',0x15191d);
  const rimR=r*.765,rimColour=spec.id==='m2'?0x929ea8:0x768795;
  for(const side of high?[-1,1]:[1]){
    const x=side*(w*.491+.001);
    p.add(ellipseFace(rimR,rimR,[x,0,0],[side,0,0],high?24:12),'trim',0x101820);
    if(high){
      p.add(ellipseFace(rimR*.86,rimR*.86,[x+side*.003,0,0],[side,0,0],24),'chrome',0x3c454d);
      for(let n=0;n<12;n++){const a=n*Math.PI/6;p.add(ellipseFace(.009,.009,[x+side*.006,Math.cos(a)*rimR*.73,Math.sin(a)*rimR*.73],[side,0,0],5),'trim',0x20272e);}
      const lip=new THREE.TorusGeometry(rimR,.009,3,28);lip.rotateY(Math.PI/2);lip.translate(x+side*.009,0,0);p.add(lip,'chrome',rimColour);
    }
    const spokes=spec.id==='m2'?10:spec.id==='gt3rs'?7:5;
    for(let n=0;n<spokes;n++){
      const a=n*Math.PI*2/spokes,inner=.055,outer=rimR*.955;
      for(const branch of high?[-1,1]:[0]){
        const split=branch*.042,innerA=a+split*.25,outerA=a+split;
        p.add(quad([x+side*.015,Math.cos(innerA-.07)*inner,Math.sin(innerA-.07)*inner],[x+side*.015,Math.cos(innerA+.07)*inner,Math.sin(innerA+.07)*inner],[x+side*.018,Math.cos(outerA+.047)*outer,Math.sin(outerA+.047)*outer],[x+side*.018,Math.cos(outerA-.047)*outer,Math.sin(outerA-.047)*outer]),'chrome',rimColour);
      }
    }
    p.add(ellipseFace(.053,.053,[x+side*.02,0,0],[side,0,0],high?16:8),'chrome',spec.id==='gt3rs'?0x8c969e:rimColour);
    p.add(ellipseFace(.025,.025,[x+side*.023,0,0],[side,0,0],high?12:6),'chrome',spec.id==='m2'?0x4384be:0x151c23);
  }
  return p.finish(materials,{low:!high,paint:spec.paint,name:high?'wheel-high':'wheel-low'});
}

function wheelParts(spec,high,materials) {
  if(spec.modern)return modernWheelParts(spec,high,materials);
  const parts=new Parts(),r=spec.radius,w=spec.tyreWidth;
  const profile=(high?[[.73,-.49],[.84,-.515],[.955,-.43],[.996,-.21],[1,0],[.996,.21],[.955,.43],[.84,.515],[.73,.49]]:[[.75,-.49],[.91,-.48],[.990,-.27],[1,0],[.990,.27],[.91,.48],[.75,.49]]).map(([rr,ww])=>new THREE.Vector2(r*rr,w*ww));
  const tyre=new THREE.LatheGeometry(profile,high?24:16);tyre.rotateZ(Math.PI/2);parts.add(tyre,'trim',0x171b20);
  const rimColor=spec.id==='m1'?0xb99045:spec.id==='e30'?0xa5b1ba:0xa9b0b3;
  // One shared wheel contains both visible faces; left/right instances need no
  // extra reflected geometries and can be disposed only once.
  for(const side of high?[-1,1]:[1]){
    const x=side*(w*.49+.001),rimR=r*(spec.id==='kadett'?.625:.685);
    parts.add(new THREE.CircleGeometry(rimR,high?24:16).rotateY(Math.PI/2).translate(x-side*.05,0,0),'trim',0x252d34);
    if(high){const lip=new THREE.TorusGeometry(rimR,.009,3,24);lip.rotateY(Math.PI/2);lip.translate(x+side*.009,0,0);parts.add(lip,'chrome',rimColor);}
    // Pressed steel: an actual shallow dish with six ventilation slots. The
    // old eight white blades read as a toy gear instead of a period wheel.
    if(spec.id==='kadett'){
      const rows=high?[[.18,-.014],[.46,-.027],[.79,-.018],[.94,.007],[1,.010]]:[[.18,-.014],[.79,-.018],[1,.010]],p=[],idx=[],segments=high?24:16;
      for(const [radius,depth]of rows)for(let n=0;n<=segments;n++){
        const a=n*Math.PI*2/segments;p.push(x+side*depth,Math.cos(a)*rimR*radius,Math.sin(a)*rimR*radius);
      }
      for(let row=0;row<rows.length-1;row++)for(let n=0;n<segments;n++){
        const a=row*(segments+1)+n,b=a+segments+1;idx.push(a,b,a+1,a+1,b,b+1);
      }
      parts.add(geometry(p,idx),'chrome',rimColor);
      for(let n=0;n<6;n++){
        const a=n*Math.PI/3,points=[];
        for(let k=0;k<(high?10:6);k++){
          const t=k*Math.PI*2/(high?10:6),radial=rimR*.71+Math.cos(t)*.027,tangent=Math.sin(t)*.014;
          points.push([x+side*.003,Math.cos(a)*radial-Math.sin(a)*tangent,Math.sin(a)*radial+Math.cos(a)*tangent]);
        }
        parts.add(polygon(points),'trim',0x242b30);
      }
      parts.add(ellipseFace(.063,.063,[x-side*.004,0,0],[side,0,0],high?18:10),'chrome',0xb9c0c0);
      parts.add(ellipseFace(.027,.027,[x+side*.007,0,0],[side,0,0],high?12:8),'trim',0x4b5359);
      if(high)for(let n=0;n<4;n++){
        const a=n*Math.PI/2;parts.add(ellipseFace(.010,.010,[x+side*.005,Math.cos(a)*.044,Math.sin(a)*.044],[side,0,0],6),'chrome',0x77818a);
      }
      continue;
    }
    const spokes=spec.id==='e30'?5:high?12:6;
    for(let k=0;k<spokes;k++){
      const a=k*Math.PI*2/spokes,inner=.045,outer=rimR*.94,spread=spec.id==='m1'?.10:.13,innerSpread=spec.id==='e30'?.36:.18;
      const innerX=x-side*.014,outerX=x+side*.012;
      parts.add(quad([innerX,Math.cos(a-innerSpread)*inner,Math.sin(a-innerSpread)*inner],[innerX,Math.cos(a+innerSpread)*inner,Math.sin(a+innerSpread)*inner],[outerX,Math.cos(a+spread)*outer,Math.sin(a+spread)*outer],[outerX,Math.cos(a-spread)*outer,Math.sin(a-spread)*outer]),'chrome',rimColor);
      if(high&&spec.id==='m1'){
        const a2=a+.26;
        parts.add(beam([x+side*.014,Math.cos(a)*inner,Math.sin(a)*inner],[x+side*.014,Math.cos(a2)*outer,Math.sin(a2)*outer],.008),'chrome',rimColor);
      }
    }
    parts.add(high?cyl(.051,.012,x+side*.018,0,0,'x',12):new THREE.CircleGeometry(.051,6).rotateY(Math.PI/2).translate(x+side*.018,0,0),'chrome',rimColor);
    parts.add(high?cyl(.024,.016,x+side*.022,0,0,'x',10):new THREE.CircleGeometry(.024,6).rotateY(Math.PI/2).translate(x+side*.022,0,0),'trim',BLACK);
  }
  return parts.finish(materials,{low:!high,paint:spec.paint,name:high?'wheel-high':'wheel-low'});
}

function paintedAccents(parts,spec,high) {
  // Broad pigment washes follow the manufactured surfaces. They have softly
  // coloured edges instead of white racing stripes or plastic specular dots.
  const top=spec.modern?modernSurfaceTop:surfaceTop,c=spec.cabin;
  const paint=new THREE.Color(spec.paint),sky=new THREE.Color(0xe4ebec);
  const wash=(point,widthRows,strength)=>{
    const p=[],idx=[],cols=high?6:4,rows=high?7:4;
    for(let row=0;row<rows;row++)for(let col=0;col<cols;col++)p.push(...point(col/(cols-1),row/(rows-1)));
    for(let row=0;row<rows-1;row++)for(let col=0;col<cols-1;col++){
      const a=row*cols+col,b=a+cols;idx.push(a,b,a+1,a+1,b,b+1);
    }
    const g=parts.add(geometry(p,idx),'livery',spec.paint),positions=g.attributes.position,normals=g.attributes.normal,colours=g.attributes.color;
    for(let n=0;n<positions.count;n++){
      const pos=new THREE.Vector3().fromBufferAttribute(positions,n),normal=new THREE.Vector3().fromBufferAttribute(normals,n);
      const pigment=Math.max(.79,Math.min(1,.846+pos.y*.092+Math.max(0,normal.y)*.045-.018*Math.abs(normal.x)));
      const v=Math.max(0,Math.min(1,widthRows(pos))),t=Math.max(0,Math.min(1,(pos.z-widthRows.start)/(widthRows.end-widthRows.start)));
      const blend=strength*Math.sin(v*Math.PI)**2*Math.sin(t*Math.PI)**.55;
      const colour=paint.clone().multiplyScalar(pigment).lerp(sky,Math.max(0,blend));
      colours.setXYZ(n,colour.r,colour.g,colour.b);
    }
  };
  const za=spec.cabin.front[0]+.12,zb=spec.length/2-.25;
  for(const side of [-1,1]){
    const center=side*spec.width*.215,band=spec.modern?.105:.083;
    const across=pos=>(pos.x-center+band)/(2*band);across.start=za;across.end=zb;
    wash((u,v)=>{const z=lerp(za,zb,v),x=center+(u*2-1)*band;return [x,top(spec,x,z)+.006,z];},across,spec.id==='kadett'?.115:.085);
  }
  const crown=spec.modern?(spec.id==='gt3rs'?.077:.061):COACHWORK[spec.id].roof;
  const bow=spec.modern?(spec.id==='gt3rs'?.038:.034):.007;
  const roof=(u,v)=>{
    const width=lerp(c.roofRear[2],c.roofFront[2],v),x=u*width,z=lerp(c.roofRear[0],c.roofFront[0],v);
    return [x,lerp(c.roofRear[1],c.roofFront[1],v)+crown*(1-u*u)+bow*Math.sin(v*Math.PI)+.006,z];
  };
  const roofStart=lerp(c.roofRear[0],c.roofFront[0],.12),roofEnd=lerp(c.roofRear[0],c.roofFront[0],.87);
  const across=pos=>{const v=(pos.z-c.roofRear[0])/(c.roofFront[0]-c.roofRear[0]),w=lerp(c.roofRear[2],c.roofFront[2],v);return (pos.x/w+.78)/.56;};across.start=roofStart;across.end=roofEnd;
  wash((u,v)=>roof(lerp(-.78,-.22,u),lerp(.12,.87,v)),across,.085);
}

function bodyParts(spec,high,materials) {
  const p=new Parts(spec);
  if(spec.modern){modernShell(p,spec,high);modernCabin(p,spec,high);if(spec.id==='m2')m2Details(p,spec,high);else gt3rsDetails(p,spec,high);}
  else{shell(p,spec,high);cabin(p,spec,high);if(spec.id==='kadett')kadettDetails(p,spec,high);else if(spec.id==='e30')e30Details(p,spec,high);else m1Details(p,spec,high);}
  if(materials.paint.isMeshToonMaterial)paintedAccents(p,spec,high);
  return p.finish(materials,{low:!high,paint:spec.paint,name:high?'body-high':'body-low'});
}

function installEffects(car,spec) {
  const shield=new THREE.Mesh(new THREE.SphereGeometry(2.55,12,8),new THREE.MeshBasicMaterial({color:0xffd359,transparent:true,opacity:.13,wireframe:true}));shield.position.y=.76;shield.visible=false;shield.name='power-up-shield';car.add(shield);car.userData.shield=shield;
  const flames=new THREE.Group(),flameMat=new THREE.MeshBasicMaterial({color:0xffb21b});
  for(const side of [-1,1]){const f=new THREE.Mesh(new THREE.ConeGeometry(.105,.95,5),flameMat);f.rotation.x=-Math.PI/2;f.position.set(side*.45,.25,-spec.length/2-.44);flames.add(f);}
  flames.visible=false;flames.name='boost-flames';car.add(flames);car.userData.flames=flames;
  const pieces=[];for(const side of [-1,1])for(let i=0;i<4;i++){const g=box(.021,.018,.17+i*.052,side*(spec.track/2+i*.046),.032+i*.012,-1.4-i*.17);g.rotateY(side*.26);pieces.push(g);}
  const sg=mergeGeometries(pieces);pieces.forEach(g=>g.dispose());const sparks=new THREE.Mesh(sg,new THREE.MeshBasicMaterial({color:0x57d6fa}));sparks.visible=false;sparks.name='drift-sparks';car.add(sparks);car.userData.sparks=sparks;
}

function shadow(car,spec) {
  // Radial opacity falloff made from concentric vertex-coloured rings. One
  // cheap draw; no canvas texture, realtime shadows or dark hard-edged disc.
  const pos=[0,.011,0],colors=[0,0,0,0.20],idx=[],segs=12,rings=[.48,.75,1];
  for(const [ring,r]of rings.entries())for(let i=0;i<=segs;i++){
    const a=i*Math.PI*2/segs;pos.push(Math.cos(a)*(spec.width*.67)*r,.011,Math.sin(a)*(spec.length*.59)*r);
    colors.push(0,0,0,ring===2?0:ring===1?.045:.14);
  }
  for(let i=0;i<segs;i++)idx.push(0,1+i,2+i);
  for(let ring=0;ring<2;ring++)for(let i=0;i<segs;i++){const a=1+ring*(segs+1)+i,b=a+segs+1;idx.push(a,b,a+1,a+1,b,b+1);}
  const g=geometry(pos,idx);g.setAttribute('color',new THREE.Float32BufferAttribute(colors,4));
  const m=new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,opacity:.9,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true});m.name='vehicle-shadow';const mesh=new THREE.Mesh(g,m);mesh.name='contact-shadow';mesh.castShadow=false;car.add(mesh);return mesh;
}

export function createVehicleModel(index=0,{quality=2,parked=false,style='arcade'}={}) {
  const selected=Math.max(0,Math.min(VEHICLE_MODELS.length-1,Number.isFinite(index)?Math.trunc(index):0)),spec=VEHICLE_MODELS[selected],car=new THREE.Group();car.name='car:'+spec.id;
  const renderStyle=style==='physical'?'physical':'arcade',materials=makeMaterials(spec,renderStyle),high=bodyParts(spec,true,materials),low=bodyParts(spec,false,materials),wheelHigh=wheelParts(spec,true,materials),wheelLow=wheelParts(spec,false,materials);
  // Compensated translations preserve every original base-pose world matrix.
  // Only the sprung body leans: tyres, contact shadow and gameplay effects
  // retain their original, independent root-space transforms.
  const bodyPivot=new THREE.Group();bodyPivot.name='sprung-body-pivot';bodyPivot.position.y=.65;
  high.position.y=low.position.y=-.65;bodyPivot.add(high,low);car.add(bodyPivot);
  car.userData.bodyPivot=bodyPivot;car.userData.wheels=[];
  for(const z of spec.axles)for(const side of [-1,1]){
    const group=new THREE.Group(),spinning=new THREE.Group();group.position.set(side*spec.track/2,spec.radius,z);group.add(spinning);car.add(group);
    const h=wheelHigh.clone(),l=wheelLow.clone();l.scale.x=side;spinning.add(h,l);group.name=(z>0?'front':'rear')+'-wheel-'+(side<0?'left':'right');
    car.userData.wheels.push({group,spinning,front:z>0,high:h,low:l,radius:spec.radius});
  }
  // The template groups only own shared geometries/materials, not transforms.
  wheelHigh.clear();wheelLow.clear();
  car.userData.renderStyle=renderStyle;car.userData.carModel=true;car.userData.modelId=spec.id;car.userData.parked=parked;car.userData.dimensions={length:spec.length,width:spec.width,height:spec.height,wheelbase:spec.wheelbase};car.userData.wheelRadius=spec.radius;
  car.userData.highModel=high;car.userData.lowModel=low;car.userData.qualityMaterials=Object.values(materials);car.userData.finishMaterials=materials;car.userData.lightMaterial=materials.lights;car.userData.lightsOn=false;car.userData.contactShadow=shadow(car,spec);
  installEffects(car,spec);car.userData.modelVersion='breuer-fleet-6';setVehicleQuality(car,quality);
  car.updateMatrixWorld(true);return car;
}

// Native garage light preview. All state is local to this model instance;
// quality changes retain the switch without adding any dynamic light, bloom
// target or extra draw. The low mesh has lamp colours baked into one draw.
export function setVehicleLights(car,enabled=false) {
  if(!car?.userData?.carModel||car.userData.disposed)return false;
  const on=!!enabled,d=car.userData;if(d.lightsOn===on)return true;d.lightsOn=on;
  const tint=new THREE.Color(on?0xfff1c9:0xffffff);if(on)tint.multiplyScalar(2);
  d.lightMaterial.color.copy(tint);
  if(d.lightMaterial.isMeshBasicMaterial)d.lightMaterial.toneMapped=!on;
  if(d.lightMaterial.emissive)d.lightMaterial.emissiveIntensity=on?.6:.14;
  d.lowModel.traverse(mesh=>{
    const lamps=mesh.userData.lampVertices;if(!lamps)return;
    const colours=mesh.geometry.attributes.color;
    for(let n=0;n<lamps.length;n+=4)colours.setXYZ(lamps[n],lamps[n+1]*tint.r,lamps[n+2]*tint.g,lamps[n+3]*tint.b);
    colours.needsUpdate=true;
  });
  return true;
}

export function setVehicleQuality(car,level=2) {
  if(!car?.userData?.carModel)return false;
  const q=Math.max(0,Math.min(2,Number.isFinite(level)?Math.trunc(level):0)),d=car.userData,useHigh=q>0;
  d.highModel.visible=useHigh;d.lowModel.visible=!useHigh;
  for(const w of d.wheels){w.high.visible=useHigh;w.low.visible=!useHigh;}
  d.quality=q;car.traverse(o=>{if(o.isMesh&&o!==d.contactShadow)o.castShadow=useHigh&&o!==d.shield&&o!==d.sparks;});return true;
}

export function disposeVehicleModel(car) {
  if(!car?.userData?.carModel||car.userData.disposed)return;
  const geometries=new Set(),materials=new Set(car.userData.qualityMaterials||[]),textures=new Set();
  car.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[])materials.add(m);});
  for(const m of materials)for(const value of Object.values(m))if(value?.isTexture)textures.add(value);
  liveVehicleMaterials.delete(car.userData.finishMaterials);
  for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const t of textures)t.dispose();car.userData.disposed=true;car.removeFromParent();
}
