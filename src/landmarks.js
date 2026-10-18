import * as THREE from 'three';
import {Batch, material, footprint, pitchedRoof, sign, logoBoard,villageDetailTexture,upgradePaintedTiles,windowReveal,atlasPane} from './scenery.js';
import {drapedPolygonGeometry} from './road-surface.js';

/** These IDs replace village shells; OSM areas around the buildings stay intact. */
const buildingIds={breuer:93722395,bakery:93699138,school:93722360,museum:93729467,chapelTower:466484934};
export const modelBuildingIds = Object.freeze(Object.values(buildingIds));
export const LANDMARK_BUILDING_IDS = modelBuildingIds;

const frames = {
  breuer: {x:3.68,z:4.08,a:.26812408748822364},
  bakery: {x:212.29173468808,z:-78.77149977387,a:3.71449108434},
  school: {x:13,z:-159,a:Math.PI-.528},
  museum: {x:-317.44,z:-273.25,a:1.950585},
  chapelTower: {x:-255.895,z:-132.49,a:-1.233411},
};
const seeded = n => {const v=Math.sin(n*78.233+2.41)*43758.5453;return v-Math.floor(v);};
const vertex = p => Array.isArray(p)?p:[p.x,p.y,p.z];
const center = points => points.reduce((p,q)=>p.map((v,i)=>v+q[i]/points.length),[0,0,0]);
function local(p,frame){const c=Math.cos(frame.a),s=Math.sin(frame.a),x=p[0]-frame.x,z=p[2]-frame.z;return [x*c-z*s,p[1],x*s+z*c];}
function point2(p,frame){const q=local([p[0],0,p[1]],frame);return [q[0],q[2]];}
function mesh(group,g,m,name=''){const o=new THREE.Mesh(g,m);o.castShadow=!m.isMeshBasicMaterial;o.receiveShadow=true;o.name=name;group.add(o);return o;}

/** Only procedural pixels are used. Reference photographs never become game textures. */
function texture(kind){
  const width=128,height=128,pixels=new Uint8Array(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    let col;
    if(kind==='window'){
      const frame=x<8||x>119||y<8||y>119||Math.abs(x-64)<3||Math.abs(y-65)<2;
      const reflection=Math.max(0,1-Math.abs(x+y*.42-82)/27),depth=y/127;
      col=frame?[238,231,213]:[79+depth*27+reflection*40,137+depth*26+reflection*37,166+depth*26+reflection*31];
      if(!frame&&(x<12||y>115))col=col.map(n=>n*.85);
    }else if(kind==='school-window'){
      const frame=x<6||x>121||y<6||y>121||Math.abs(x-64)<2;
      const reflection=Math.max(0,1-Math.abs(x+y*.38-88)/32),depth=y/127;
      col=frame?[133,116,153]:[83+depth*30+reflection*40,139+depth*31+reflection*35,166+depth*25+reflection*30];
    }else if(kind==='pv'){
      const frame=x%32<2||y%42<2;
      col=frame?[156,171,175]:[38+(y%42)/7,58+(x%32)/8,83];
    }else if(kind==='wood'){
      const v=seeded(Math.floor(x/8)*83+Math.floor(y/18))*22;
      col=x%8===0?[127,135,136]:[157+v*.8,166+v*.8,164+v*.65];
    }else if(kind==='cream-brick'){
      const row=Math.floor(y/8),mortar=y%8===0||(x+(row%2)*16)%32===0,v=seeded(row*39+Math.floor((x+(row%2)*16)/32))*12;
      col=mortar?[195,188,165]:[223+v*.7,213+v*.7,185+v*.7];
    }else {
      const row=Math.floor(y/14),offset=(row%2)*21,cell=Math.floor((x+offset)/34),v=seeded(row*51+cell*19)*38;
      col=y%14<2||(x+offset)%34<2?[125,137,139]:[150+v,156+v*.65,149+v*.52];
    }
    const i=(y*width+x)*4;pixels[i]=col[0];pixels[i+1]=col[1];pixels[i+2]=col[2];pixels[i+3]=255;
  }
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');if(ctx.createImageData&&ctx.putImageData){const image=ctx.createImageData(width,height);image.data.set(pixels);ctx.putImageData(image,0,0);}else{ctx.fillStyle='#8baabd';ctx.fillRect(0,0,width,height);}canvas.data=pixels;
  const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;t.needsUpdate=true;t.anisotropy=2;return t;
}
const paletteCache=new WeakMap();
function palette(helpers){
  const owner=helpers.materials||helpers.paletteOwner||helpers;
  if(paletteCache.has(owner))return paletteCache.get(owner);
  const commonMaterials={
      cream:material(0xffffff,{map:texture('cream-brick')}),stone:material(0xffffff,{map:texture('stone')}),woodFacade:material(0xffffff,{map:texture('wood')}),
      white:material(0xfff6df),plaster:material(0xe2d8bb),glass:material(0x67b4d1,{roughness:.58,metalness:.04}),dark:material(0x293c4e),trim:material(0xf0dfb7),
      roof:material(0x596b88,{side:THREE.DoubleSide}),metalRoof:material(0x779fba,{metalness:.12,roughness:.74,side:THREE.DoubleSide}),metal:material(0xb6c2c6,{metalness:.18,roughness:.66}),
      paving:material(0xbab6ac),red:material(0xd42937),wood:material(0x806653),hedge:material(0x548247),lawn:material(0x86ac64),flower:material(0xe98eaf),yellow:material(0xf2c346),
      window:material(0xffffff,{map:texture('window'),roughness:.6}),schoolWindow:material(0xffffff,{map:texture('school-window'),roughness:.55}),pv:material(0xffffff,{map:texture('pv'),roughness:.48,metalness:.2,side:THREE.DoubleSide}),
      decor:helpers.materials?.decor||material(0xffffff,{map:villageDetailTexture(),roughness:.9}),
    };
    for(const k of ['window','schoolWindow','pv','decor'])commonMaterials[k].userData.keepUV=true;
    commonMaterials.cream.userData.uvScale=.72;commonMaterials.stone.userData.uvScale=.42;commonMaterials.woodFacade.userData.uvScale=.9;
  // Keep the world paving and vegetation consistent without changing the sourced facade colours.
  const M={...commonMaterials};for(const k of ['paving','hedge','lawn','flower','metal','red','yellow','stone','roof','white','trim','dark','glass','wood'])if(helpers.materials?.[k])M[k]=helpers.materials[k];
  // School bodies share the same generated painted plaster as village houses.
  // Trim remains plain and sharp enough to read; no extra image is downloaded.
  M.roadside=helpers.materials?.roadside||M.decor;M.foliage=helpers.materials?.foliage||M.decor;M.leafPaint=helpers.materials?.leafPaint||M.hedge;
  if(helpers.materials?.paintedCream)M.cream=helpers.materials.paintedCream;
  if(helpers.materials?.paintedWood)M.woodFacade=helpers.materials.paintedWood;
  M.workshopPaving=M.paving.clone();M.workshopPaving.map=new THREE.CanvasTexture(M.paving.map.image);M.workshopPaving.map.colorSpace=THREE.SRGBColorSpace;M.workshopPaving.map.wrapS=M.workshopPaving.map.wrapT=THREE.RepeatWrapping;M.workshopPaving.color.setHex(0xffffff);M.workshopPaving.roughness=1;
  M.shopRed=material(0xffffff,{map:texture('wood'),roughness:.9});M.shopBlue=material(0xffffff,{map:texture('wood'),roughness:.9});M.shopMetal=material(0xffffff,{map:texture('wood'),roughness:.88});
  for(const k of ['shopRed','shopBlue','shopMetal'])M[k].userData.uvScale=.7;
  upgradePaintedTiles('artisan-workshop',4,[{texture:M.workshopPaving.map,slot:7},{texture:M.shopRed.map,slot:5,rect:[.37,.04,.26,.58]},{texture:M.shopBlue.map,slot:4},{texture:M.shopMetal.map,slot:6}]);
  const plaster=helpers.materials?.paintedPlaster;
  if(plaster){M.schoolPlaster=plaster.clone();M.schoolPlaster.name='landmark:painted-plaster';M.schoolPlaster.color.setHex(0xffffff);M.plaster=plaster.clone();M.plaster.color.setHex(0xf4eddf);}else M.schoolPlaster=M.white;
  if(helpers.materials?.metalRoof)M.metalRoof=helpers.materials.metalRoof;
  upgradePaintedTiles('artisan-windows',4,[{texture:M.window.map,slot:0},{texture:M.schoolWindow.map,slot:6},{texture:M.pv.map,slot:12}]);
  paletteCache.set(owner,M);return M;
}
function batch(helpers){return new (helpers.Batch||Batch)({vertexColors:true,bevelBoxes:true});}
function court(B,M,helpers,x,z,w,d,offset=.053,tile=null){
  if(!helpers.map||!helpers.surfaceFrame){B.box(w,.04,d,M.paving,x,offset-.02,z);return;}
  const frame=helpers.surfaceFrame,c=Math.cos(frame.a),s=Math.sin(frame.a),ground=helpers.surfaceGround||0,points=[[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]].map(([dx,dz])=>[frame.x+(x+dx)*c+(z+dz)*s,frame.z-(x+dx)*s+(z+dz)*c]);
  const g=drapedPolygonGeometry(helpers.map,points,offset,{excludeRoads:true,drivingSurface:true}),p=g.attributes.position,n=g.attributes.normal;
  for(let i=0;i<p.count;i++){const wx=p.getX(i)-frame.x,wz=p.getZ(i)-frame.z,nx=n.getX(i),nz=n.getZ(i);p.setXYZ(i,wx*c-wz*s,p.getY(i)-ground,wx*s+wz*c);n.setXYZ(i,nx*c-nz*s,n.getY(i),nx*s+nz*c);}
  if(tile!==null){const uv=g.attributes.uv;for(let i=0;i<p.count;i++){const u=(p.getX(i)-x)/w+.5,v=(p.getZ(i)-z)/d+.5;uv.setXY(i,(tile%4+.035+u*.93)/4,1-(Math.floor(tile/4)+.035+(1-v)*.93)/4);}}
  B.add(g,tile===null?M.paving:M.roadside);
}
function rectangleWindows(B,M,w,y,z,count,{x=0,a=0,school=false,height=1.5}={}){
  for(let i=0;i<count;i++){const px=x+(i-(count-1)/2)*w/count;B.add(new THREE.PlaneGeometry(Math.min(1.55,w/count*.62),height),school?M.schoolWindow:M.window,px,y,z,a);B.add(windowReveal(Math.min(1.55,w/count*.62),height),M.trim,px+Math.sin(a)*.02,y,z+Math.cos(a)*.02,a);}
}
function wallWindow(B,M,width,height,x,y,z,a=0,school=false){B.add(new THREE.PlaneGeometry(width,height),school?M.schoolWindow:M.window,x,y,z,a);B.add(windowReveal(width,height),M.trim,x+Math.sin(a)*.02,y,z+Math.cos(a)*.02,a);}
function detailPane(B,M,tile,width,height,x,y,z,a=0){
 const g=new THREE.PlaneGeometry(width,height),uv=g.attributes.uv,column=tile%4,row=Math.floor(tile/4);
 for(let i=0;i<uv.count;i++)uv.setXY(i,(column+.035+uv.getX(i)*.93)/4,1-(row+.035+(1-uv.getY(i))*.93)/4);
 B.add(g,M.decor,x,y,z,a);
}
function triangle(width,rise){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([-width/2,0,0,width/2,0,0,0,rise,0],3));g.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,.5,1],2));g.computeVertexNormals();return g;}
function beam(B,mat,p,q,width=.13,depth=.10){
  const a=new THREE.Vector3(...p),b=new THREE.Vector3(...q),direction=b.clone().sub(a),length=direction.length();if(length<.01)return;
  const geometry=new THREE.BoxGeometry(width,length,depth);geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize()));
  const middle=a.add(b).multiplyScalar(.5);B.add(geometry,mat,middle.x,middle.y,middle.z);
}
function roundArch(w,h){const shape=new THREE.Shape();shape.moveTo(-w/2,0);shape.lineTo(-w/2,h-w/2);shape.absarc(0,h-w/2,w/2,Math.PI,0,true);shape.lineTo(w/2,0);shape.closePath();return new THREE.ShapeGeometry(shape,10);}
function wing(B,M,w,d,h,rise,x,z,{wall=M.white,roof=M.roof,a=0,ridge='z',hip=false}={}){
  B.box(w,h,d,wall,x,h/2,z,a);
  const rw=ridge==='x'?d:w,rd=ridge==='x'?w:d,ra=a+(ridge==='x'?Math.PI/2:0);
  B.add(pitchedRoof(rw+.25,rd+.25,h,rise,hip),roof,x,0,z,ra);
  if(!hip){for(const side of [-1,1])B.add(triangle(rw,rise),wall,x+Math.sin(ra)*rd/2*side,h,z+Math.cos(ra)*rd/2*side,ra+(side<0?Math.PI:0));}
}

/** Triangulate a planar 3D ring in its dominant plane, including optional holes. */
export function landmarkSurfaceGeometry(surface,frame={x:0,z:0,a:0}){
  let rings=surface?.rings||surface;
  if(!Array.isArray(rings)||!rings.length)return null;
  if(typeof rings[0]?.[0]==='number')rings=[rings];
  rings=rings.map(r=>r.map(p=>local(vertex(p),frame))).map(r=>r.length>3&&Math.hypot(...r[0].map((v,i)=>v-r[r.length-1][i]))<.001?r.slice(0,-1):r).filter(r=>r.length>2);
  if(!rings.length)return null;
  const outer=rings[0],normal=new THREE.Vector3();
  for(let i=0;i<outer.length;i++){const a=outer[i],b=outer[(i+1)%outer.length];normal.x+=(a[1]-b[1])*(a[2]+b[2]);normal.y+=(a[2]-b[2])*(a[0]+b[0]);normal.z+=(a[0]-b[0])*(a[1]+b[1]);}
  if(normal.lengthSq()<1e-9)return null;
  const values=[Math.abs(normal.x),Math.abs(normal.y),Math.abs(normal.z)],drop=values.indexOf(Math.max(...values)),axes=[0,1,2].filter(i=>i!==drop);
  const projected=rings.map(r=>r.map(p=>new THREE.Vector2(p[axes[0]],p[axes[1]]))),indices=THREE.ShapeUtils.triangulateShape(projected[0],projected.slice(1)),points=rings.flat(),positions=[];
  for(const f of indices){const a=new THREE.Vector3(...points[f[0]]),b=new THREE.Vector3(...points[f[1]]),c=new THREE.Vector3(...points[f[2]]);if(b.sub(a).cross(c.sub(a)).dot(normal)<0)[f[1],f[2]]=[f[2],f[1]];for(const i of f)positions.push(...points[i]);}
  const uv=[];for(let i=0;i<positions.length;i+=3)uv.push(positions[i+axes[0]]*.5,positions[i+axes[1]]*.5);
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeVertexNormals();return g;
}
function ringsOf(surface){let p=surface?.rings||surface;if(!Array.isArray(p))return [];if(typeof p[0]?.[0]==='number')return [p];return p;}
function geoShell(B,M,data,frame,{wall=M.white,roof=M.roof,skipWall=null,wallAt=null,roofAt=null}={}){
  const geo=data.geodata;if(!geo?.roofSurfaces?.length||!geo.wallSurfaces?.length)return false;
  const wallMaterials=new Map();
  for(const surface of geo.wallSurfaces){const ring=ringsOf(surface)[0];if(!ring?.length)continue;const c=center(ring.map(p=>local(vertex(p),frame)));if(skipWall?.(c,surface))continue;const g=landmarkSurfaceGeometry(surface,frame);if(g){
    // A gentle painted base shadow anchors surveyed walls to their ground.
    // Only vertex colours change: source contour, height and roof stay exact,
    // with no extra geometry, realtime lights or screen-space effect.
    const source=wallAt?.(c,surface)||wall;if(!wallMaterials.has(source)){const m=source.clone();m.vertexColors=true;wallMaterials.set(source,m);}const m=wallMaterials.get(source),p=g.attributes.position;
    g.computeBoundingBox();const bottom=g.boundingBox.min.y,height=Math.max(.1,g.boundingBox.max.y-bottom),colors=new Float32Array(p.count*3);
    for(let i=0;i<p.count;i++){const shade=.89+.11*Math.max(0,Math.min(1,(p.getY(i)-bottom)/height));colors[i*3]=source.color.r*shade;colors[i*3+1]=source.color.g*shade;colors[i*3+2]=source.color.b*shade;}
    // Batch bakes material colour for plain faces. Mapped faces need white as
    // their material base to avoid multiplying the intended colour twice.
    if(m.map)m.color.setHex(0xffffff);g.setAttribute('color',new THREE.BufferAttribute(colors,3));B.add(g,m);
  }}
  for(const surface of geo.roofSurfaces){const ring=ringsOf(surface)[0];if(!ring?.length)continue;const c=center(ring.map(p=>local(vertex(p),frame)));const g=landmarkSurfaceGeometry(surface,frame);if(g)B.add(g,roofAt?.(c,surface)||roof);}
  return true;
}
function surfaceWindows(B,M,data,frame,{school=false,levels=2,groundY=1.85,width=1.4,height=1.5,spacing=3.15,predicate=null}={}){
  const surfaces=data.geodata?.wallSurfaces||[];
  for(const surface of surfaces){const points=ringsOf(surface)[0]?.map(p=>local(vertex(p),frame));if(!points?.length)continue;
    const bottom=Math.min(...points.map(p=>p[1])),top=Math.max(...points.map(p=>p[1]));if(bottom>.75||top<2.6)continue;
    const low=points.filter(p=>p[1]<bottom+.16);if(low.length<2)continue;
    let p=low[0],q=low[1],length=0;for(const a of low)for(const b of low){const l=Math.hypot(a[0]-b[0],a[2]-b[2]);if(l>length){p=a;q=b;length=l;}}
    if(length<3.5||predicate&&!predicate(center(points),surface))continue;
    const dx=(q[0]-p[0])/length,dz=(q[2]-p[2])/length;
    // Outward orientation from the complete mapped footprint, not its bounding box.
    const test=data.points?.map(p=>point2(p,frame)),inside=(x,z)=>{if(!test)return false;let v=false;for(let i=0,j=test.length-1;i<test.length;j=i++){const a=test[i],b=test[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])v=!v;}return v;};
    let nx=dz,nz=-dx;if(inside((p[0]+q[0])/2+nx*.2,(p[2]+q[2])/2+nz*.2)){nx=-nx;nz=-nz;}
    const count=Math.max(1,Math.floor(length/spacing)),a=Math.atan2(nx,nz);
    for(let level=0;level<levels;level++){const y=groundY+level*2.7;if(y+height/2>top-.22)continue;for(let k=0;k<count;k++){const t=(k+.5)/count;wallWindow(B,M,Math.min(width,length/count*.65),height,p[0]+(q[0]-p[0])*t+nx*.065,y,p[2]+(q[2]-p[2])*t+nz*.065,a,school);}}
  }
}
function board(group,helpers,text,width,x,y,z,a=0,color='#fff7ee',bg='#262a2d',ratio=.18){
  const o=(helpers.sign||sign)(text,width,color,bg,ratio);o.position.set(x,y,z);o.rotation.y=a;group.add(o);return o;
}

function breuer(data,helpers,quality){
  const M=palette(helpers),g=new THREE.Group(),B=batch(helpers),frame=data.frame||frames.breuer;
  const points=data.points?.map(p=>point2(p,frame));
  if(points)B.add(footprint(points,.09),M.paving);
  const actual=geoShell(B,M,data,frame,{wall:M.cream,roof:M.roof,skipWall:c=>c[2]>-5.5&&c[0]>-8&&c[0]<10.1,roofAt:c=>c[1]<4.4?M.trim:M.roof});
  // The NRW main-house body does not cover the left street wing or the open hall.
  // Their footprint comes from OSM; the operator photos and the inspected panorama
  // supply the brick, glazing and lower hall roof rather than an invented house.
  const leftAngle=.175;
  wing(B,M,8.2,21,6.05,2.9,-14.6,-3.4,{wall:M.cream,a:leftAngle});
  for(const y of [1.8,4.55])for(const x of [-2.1,2.1]){
    const z=10.56,c=Math.cos(leftAngle),s=Math.sin(leftAngle);
    wallWindow(B,M,1.48,1.58,-14.6+x*c+z*s,y,-3.4-x*s+z*c,leftAngle);
  }
  for(const z of [-7.6,-2.6,2.4,7.4])for(const y of [1.75,4.55]){
    const x=4.15,c=Math.cos(leftAngle),s=Math.sin(leftAngle);
    wallWindow(B,M,1.44,1.56,-14.6+x*c+z*s,y,-3.4-x*s+z*c,leftAngle+Math.PI/2);
  }
  B.box(22,.19,12.0,M.trim,-.6,3.5,-10.3);
  if(!actual){
    // Mapped perimeter remains visible, with open front bays rather than a solid facade.
    if(points)for(let i=3;i<13;i++){const p=points[i],q=points[(i+1)%points.length],d=Math.hypot(q[0]-p[0],q[1]-p[1]);if(d>.4)B.box(.24,3.5,d,M.cream,(p[0]+q[0])/2,1.75,(p[1]+q[1])/2,Math.atan2(q[0]-p[0],q[1]-p[1]));}
    wing(B,M,11.8,8.1,6.05,2.85,4.2,-19.3,{wall:M.cream,ridge:'x'});
  }
  // Low, glazed corner showroom projecting forward beside the workshop court.
  const ra=.329,rx=15.5,rz=-7.5;
  B.box(16.0,.52,7.15,M.dark,rx,.26,rz,ra);B.box(16.1,.24,7.4,M.trim,rx,3.44,rz,ra);
  for(const side of [-1,1])for(let i=0;i<6;i++){
    const x=(i-2.5)*2.56,z=side*3.61,c=Math.cos(ra),s=Math.sin(ra),wx=rx+x*c+z*s,wz=rz-x*s+z*c;
    B.box(2.43,2.38,.07,M.glass,wx,1.82,wz,ra);B.box(.07,2.85,.1,M.dark,wx-1.24*c,.0+1.75,wz+1.24*s,ra);
  }
  for(const side of [-1,1])B.box(.12,2.82,7.22,M.dark,rx+Math.cos(ra)*8*side,1.76,rz-Math.sin(ra)*8*side,ra);
  const frontageZ=-4.3;
  B.box(18.7,.9,.22,M.dark,1.2,3.06,frontageZ+.04);B.box(18.8,.12,.35,M.trim,1.2,3.55,frontageZ-.02);
  for(const x of [-8.1,-2.6,2.9,10.4])B.box(.27,2.65,.3,M.cream,x,1.32,frontageZ);
  B.box(6.9,2.7,.12,M.dark,6.68,1.35,frontageZ-.02);
  for(let j=0;j<5;j++)B.box(1.28,2.22,.07,M.glass,3.91+j*1.35,1.44,frontageZ+.07);
  B.box(.06,.72,.06,M.metal,8.91,1.48,frontageZ+.16);
  // Two shop bays and lifts are event dressing; building shape/roof follows evidence.
  const hall=new THREE.Group();hall.name='breuer:open-workshop';hall.userData.detailDistance=125;g.add(hall);const HB=batch(helpers);
  court(HB,{...M,paving:M.workshopPaving},helpers,-2.6,-9.9,11.1,11.0);HB.box(11.1,.13,11,M.trim,-2.6,3.42,-9.9);
  HB.box(11.1,3.37,.13,M.shopBlue,-2.6,1.685,-15.35);
  for(const x of [-5.35,.2]){
    for(const side of [-1,1])HB.box(.07,2.8,.07,M.metal,x+side*2.54,1.4,frontageZ-.15);
    // Raised door with white frame and glazed horizontal striping.
    detailPane(HB,M,10,5.12,.60,x,2.95,frontageZ+.13);
    HB.box(4.3,.05,.12,M.white,x,3.24,-8.0);HB.box(4.3,.05,.12,M.white,x,3.24,-12.4);
  }
  const lowCar=(B,index,x,y,z)=>{const color=material(index===0?0xf6c724:0xe9e8dd),dark=M.dark;B.box(1.56,.35,3.45,color,x,y+.5,z);B.box(1.35,.48,1.5,M.glass,x,y+.95,z-.2);B.box(1.4,.07,1.35,color,x,y+1.22,z-.25);B.box(1.6,.10,.3,dark,x,y+.91,z-1.65);for(const side of [-1,1])for(const zz of [-1.12,1.12]){const tyre=new THREE.CylinderGeometry(.33,.33,.2,10);tyre.rotateZ(Math.PI/2);B.add(tyre,dark,x+side*.79,y+.33,z+zz);}};
  for(const [index,x,z,h] of [[2,-5.35,-10.2,1.05],[0,.2,-11.1,.7]]){
    const station=new THREE.Group();station.name='breuer:lift-'+index;station.position.set(x,0,z);const L=batch(helpers);
    for(const side of [-1,1]){L.box(.23,2.65,.33,M.shopRed,side*1.15,1.35,0);L.box(.44,.06,.6,M.dark,side*1.15,.07,0);L.box(.17,.18,.23,M.metal,side*1.15,h,0);for(const zz of [-.7,.7])L.box(.97,.10,.16,M.yellow,side*.8,h,zz);}
    L.box(2.5,.14,.24,M.shopRed,0,2.62,0);detailPane(L,M,14,2.43,.12,0,2.62,.125);lowCar(L,index,0,h+.1,0);L.flush(station);hall.add(station);
  }
  for(let i=0;i<3;i++){
    const x=-6.5+i*3.4;HB.box(2.7,.85,.58,M.dark,x,.46,-14.9);HB.box(2.79,.06,.65,M.wood,x,.92,-14.9);
    detailPane(HB,M,i===1?12:1,2.52,.72,x,.49,-14.54);detailPane(HB,M,i===1?9:0,2.55,1.24,x,1.97,-15.25);
  }
  for(const x of [-5.35,.2])for(const side of [-1,1])HB.box(.065,.009,4.7,M.yellow,x+side*1.82,.112,-9.4);
  // Readable service bays without adding realtime lights or extra shadow maps.
  const light=material(0xfff4db,{emissive:0xffdfad,emissiveIntensity:.55,roughness:.7});
  for(const x of [-5.35,.2])for(const z of [-7.3,-12.8])HB.box(3.9,.055,.20,light,x,3.26,z);
  const diagnostic=material(0x6dc5bd,{emissive:0x186256,emissiveIntensity:.22});
  HB.box(.62,.38,.10,M.shopMetal,6.0,1.15,-13.3);HB.box(.49,.28,.025,diagnostic,6.0,1.16,-13.235);HB.box(.08,.83,.09,M.metal,6.0,.56,-13.3);HB.box(.55,.06,.55,M.dark,6.0,.13,-13.3);
  for(const x of [-7.9,2.9])for(let i=0;i<3;i++){const tyre=new THREE.TorusGeometry(.34,.12,5,10);tyre.rotateX(Math.PI/2);HB.add(tyre,M.dark,x,.14+i*.23,-13.8);}
  detailPane(HB,M,8,1.1,1.35,2.82,1.65,-13.2,-Math.PI/2);
  HB.flush(hall);
  const mechanic=new THREE.Group();mechanic.name='breuer:mechanic-detail';mechanic.userData.detailDistance=75;mechanic.position.set(1.85,0,-7.1);const MB=batch(helpers),skin=material(0xe2b18c);
  MB.box(.41,.59,.27,M.red,0,1.03,0);for(const side of [-1,1]){MB.box(.13,.63,.17,M.dark,side*.12,.40,0);const arm=new THREE.CylinderGeometry(.062,.065,.49,5);arm.rotateZ(side*.65);MB.add(arm,M.red,side*.26,1.07,.02);MB.add(new THREE.SphereGeometry(.075,6,4),skin,side*.39,.91,.02);}
  MB.add(new THREE.SphereGeometry(.18,8,5),skin,0,1.50,0);MB.add(new THREE.SphereGeometry(.185,8,4,0,Math.PI*2,0,Math.PI/2),M.dark,0,1.54,0);MB.box(.04,.28,.05,M.metal,.39,1.06,.02);MB.flush(mechanic);hall.add(mechanic);
  // Bounded paved court, reddish roadside kerb and long drainage slot.
  court(B,M,helpers,1.1,.88,17.9,10.0);B.box(18.0,.07,.15,M.dark,1.1,.06,5.51);B.box(18.2,.1,.35,material(0x965e50),1.1,.075,6.0);
  // Upper terrace/parapet and glass conservatory visible in the operator's photograph.
  B.box(18.4,.62,.2,M.cream,1.1,3.87,-5.1);
  for(let i=0;i<13;i++)B.box(.04,.46,.04,M.metal,-7.45+i*1.42,4.44,-5.1);B.box(18.7,.05,.05,M.metal,1.1,4.69,-5.1);
  B.box(6.2,2.45,3.5,M.glass,-4.4,4.9,-9.0);B.box(6.4,.15,3.7,M.trim,-4.4,6.22,-9.0);for(let i=0;i<5;i++)B.box(.085,2.45,.09,M.white,-7.42+i*1.51,4.9,-7.19);
  B.box(1.80,.10,.54,M.wood,8.65,.50,3.8);B.box(1.80,.48,.12,M.wood,8.65,.91,3.58);for(const side of [-1,1])B.box(.11,.49,.47,M.metal,8.65+side*.66,.25,3.8);B.add(atlasPane(14,1.70,.42),M.roadside,8.65,.91,3.65);
  B.flush(g);
  board(g,helpers,'Fahrzeugtechnik',11.9,3.8,3.09,frontageZ+.18,0,'#fff8ef','#26272a',.07);
  const logo=(helpers.logoBoard||logoBoard)(5);logo.position.set(-5.45,3.07,frontageZ+.185);g.add(logo);
  const projecting=(helpers.logoBoard||logoBoard)(2.0);projecting.position.set(-9.4,4.28,6.54);projecting.rotation.y=Math.PI/2;g.add(projecting);
  board(g,helpers,'27',.67,-11.6,1.9,6.68,0,'#292b2e','#ddd0af',.7);
  g.userData.visualEvidence='Operator workshop photographs; mapped main shell with interpreted open-bay event interior';
  g.userData.illustrationDetails={toolPanels:3,cabinetFaces:3,mechanics:1,bayMarkings:4};
  return g;
}

function bakery(data,helpers,quality){
  const M=palette(helpers),g=new THREE.Group(),B=batch(helpers),D=batch(helpers),F=batch(helpers),frame=data.frame||frames.bakery;
  const actual=geoShell(B,M,data,frame,{wall:M.stone,roof:M.roof});
  if(!actual){if(data.points)B.add(footprint(data.points.map(p=>point2(p,frame)),5.75),M.stone);else B.box(20,5.75,21,M.stone,0,2.875,0);B.add(pitchedRoof(20.5,21.3,5.7,2.55,true),M.roof,0,0,0);}
  if(actual)surfaceWindows(D,M,data,frame,{levels:2,groundY:1.75,width:1.22,height:1.78,spacing:3.15,predicate:c=>c[2]<9.7});
  else for(const y of [1.8,4.25])for(const side of [-1,1])for(const z of [-6,-2,2,6])wallWindow(D,M,1.18,1.75,side*10.04,y,z,side*Math.PI/2);
  // Six slender lower arches, five shuttered upper windows and round end windows.
  for(const [y,count,width,height] of [[.55,6,1.38,2.08],[3.17,5,1.34,1.90]])for(let i=0;i<count;i++){
    const x=(i-(count-1)/2)*(count===6?3.08:3.20);
    D.add(roundArch(width,height),M.white,x,y,10.57);D.add(roundArch(width-.18,height-.19),M.glass,x,y+.09,10.59);
    D.box(.045,height-.35,.03,M.white,x,y+height*.45,10.62);D.box(width-.17,.045,.035,M.white,x,y+height*.63,10.62);
    if(count===5)for(const side of [-1,1]){D.box(.47,height,.075,M.dark,x+side*(width*.5+.3),y+height*.5,10.54);}
  }
  for(const side of [-1,1]){D.add(new THREE.CircleGeometry(.44,20),M.white,side*8.78,4.56,10.57);D.add(new THREE.CircleGeometry(.34,20),M.glass,side*8.78,4.56,10.60);D.box(.035,.62,.03,M.white,side*8.78,4.56,10.62);D.box(.62,.035,.03,M.white,side*8.78,4.56,10.62);}
  for(const x of [-7.70,-1.54,4.62])detailPane(D,M,2,1.06,1.16,x,1.43,10.615);
  B.box(20.1,.18,.2,M.trim,0,5.24,10.56);
  // Historical photographs show a glazed windbreak with a small projecting gable roof.
  B.box(4.5,2.5,.14,M.dark,0,1.25,11.4);B.box(4.23,2.27,.08,M.glass,0,1.32,11.50);B.add(pitchedRoof(4.84,2.25,2.67,.60),M.roof,0,0,10.85);B.add(triangle(4.5,.60),M.trim,0,2.67,11.98);
  for(const x of [-2.05,0,2.05])B.box(.10,2.37,.10,M.white,x,1.34,11.56);
  // Small stone retaining wall, metal handrail and terrace furniture are batched.
  for(const side of [-1,1]){B.box(5.30,.58,.38,M.stone,side*4.15,.3,17.35);B.box(5.30,.12,.54,M.trim,side*4.15,.64,17.35);B.box(5.3,.055,.055,M.metal,side*4.15,1.23,17.35);}
  for(let i=0;i<10;i++){const x=-6.48+i*1.44;if(Math.abs(x)>1.45)B.box(.055,.66,.055,M.metal,x,.93,17.35);}
  for(let i=0;i<4;i++)B.box(2.35,.15,.46,M.paving,0,.075+i*.15,18.25-i*.42);
  B.box(13.5,.55,6.38,M.paving,0,.275,13.84);
  const details=new THREE.Group();details.name='bakery:terrace-detail';details.userData.detailDistance=150;g.add(details);
  const canopyMaterial=material(0xffffff,{vertexColors:true});
  for(const x of [-4.3,0,4.3]){
    F.box(1.35,.085,1.35,M.wood,x,.87,14.0);F.box(.13,.82,.13,M.metal,x,.42,14.0);
    for(const z of [12.7,15.35]){F.box(.72,.065,.67,M.wood,x,.45,z);F.box(.72,.67,.08,M.wood,x,.8,z+(z>14?.32:-.32));for(const side of [-1,1])F.box(.06,.46,.06,M.metal,x+side*.30,.23,z);}
    const positions=[],colors=[],tones=[0xf3e6ca,0xd9a58b,0xf9edcf,0xe5be9e];for(let i=0;i<8;i++){
      const a=i*Math.PI/4,b=(i+1)*Math.PI/4,p=[Math.cos(a)*1.6,-.275,Math.sin(a)*1.6],q=[Math.cos(b)*1.6,-.275,Math.sin(b)*1.6],tone=new THREE.Color(tones[(i+Math.round(x+4.3))%tones.length]);
      for(const vertex of [[0,.275,0],q,p,[0,-.275,0],p,q]){positions.push(...vertex);const shade=vertex[1]<0?.86:1;colors.push(tone.r*shade,tone.g*shade,tone.b*shade);}
    }const canopy=new THREE.BufferGeometry();canopy.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));canopy.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));canopy.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(positions.length/3*2),2));canopy.computeVertexNormals();F.add(canopy,canopyMaterial,x,2.4,14.0);F.box(.045,2.17,.045,M.metal,x,1.13,14.0);
  }
  for(const x of [-6.3,6.3]){F.add(new THREE.IcosahedronGeometry(.63,1),M.hedge,x,.63,13.35);F.box(.75,.35,.75,M.stone,x,.175,13.35);for(let i=0;i<6;i++)F.add(new THREE.IcosahedronGeometry(.15,0),i%2?M.white:M.flower,x+seeded(i)*.4-.2,.60,15.05+i*.2);}
  F.box(.80,1.12,.12,M.dark,-5.65,1.15,16.0);for(const side of [-1,1])F.box(.10,1.26,.12,M.wood,-5.65+side*.40,.80,16.02);F.add(atlasPane(8,.68,.98),M.roadside,-5.65,1.15,16.075);
  for(const x of [-6.3,6.3])for(const angle of [0,Math.PI/2])F.add(atlasPane(x<0?6:7,.80,.75),M.foliage,x,.88,13.35,angle);
  const furniture=new THREE.Group();furniture.position.y=.55;furniture.name='bakery:raised-terrace';details.add(furniture);
  B.flush(g);D.flush(details);F.flush(furniture);board(g,helpers,'LEO',3.5,0,3.55,10.63,0,'#f5f0e2','#324335',.27);board(g,helpers,'Café zur Pol-Ecke',6.4,0,2.66,12.02,0,'#f4ecdb','#252a25',.10);g.userData.illustrationDetails={breadDisplays:3,stripedParasols:3};return g;
}

function school(data,helpers,quality){
  const M=palette(helpers),g=new THREE.Group(),B=batch(helpers),D=batch(helpers),frame=data.frame||frames.school;
  let timberPanels=0;
  const actual=geoShell(B,M,data,frame,{wall:M.schoolPlaster,roof:M.roof,wallAt:c=>c[0]>30?M.woodFacade:M.schoolPlaster,roofAt:c=>c[0]>30?M.metalRoof:M.roof});
  if(actual&&data.points?.length>24){
    // The distinctive low blue-roof addition is outside the matched NRW main body.
    // Keep its stepped OSM outline instead of replacing the whole complex with a box.
    const addition=data.points.slice(0,25).map(p=>point2(p,frame)),heightAt=x=>3.55+(x-5)*.042;
    const area=addition.reduce((s,p,i)=>{const q=addition[(i+1)%addition.length];return s+p[0]*q[1]-q[0]*p[1];},0);
    if(area>0)addition.reverse(); // Wall fronts face the exterior; roof normals point up.
    const roof=[];
    for(let i=0;i<addition.length;i++){
      const p=addition[i],q=addition[(i+1)%addition.length],h=heightAt(p[0]),j=heightAt(q[0]);
      const wall=landmarkSurfaceGeometry([[p[0],0,p[1]],[q[0],0,q[1]],[q[0],j,q[1]],[p[0],h,p[1]]]);
      if(wall)B.add(wall,Math.abs(q[1]-p[1])<.7?M.plaster:M.woodFacade);
      const dx=q[0]-p[0],dz=q[1]-p[1],length=Math.hypot(dx,dz);
      if(Math.abs(dz)>=.7&&length>1){
        const nx=-dz/length,nz=dx/length,count=Math.ceil(length/3.4),angle=Math.atan2(nx,nz);
        for(let n=0;n<count;n++){const t=(n+.5)/count;D.add(new THREE.PlaneGeometry(length/count-.025,2.7),M.woodFacade,p[0]+dx*t+nx*.045,1.6,p[1]+dz*t+nz*.045,angle);timberPanels++;}
      }
      roof.push([p[0],h+.08,p[1]]);
    }
    const top=landmarkSurfaceGeometry(roof);if(top)B.add(top,M.metalRoof);
    B.box(12.0,2.66,3.75,M.glass,27.9,1.33,-12.75);B.box(12.2,.14,3.9,M.metalRoof,27.9,2.73,-12.75);
    for(let i=0;i<7;i++)wallWindow(D,M,2.15,1.55,30.2,1.70,-23.1+i*3.95,-Math.PI/2,true);
    for(let i=0;i<6;i++)wallWindow(D,M,1.80,.76,30.16,3.22,-22.5+i*4.02,-Math.PI/2,true);
    for(const x of [33.5,39.0,44.5])wallWindow(D,M,2.25,1.62,x,1.75,2.65,0,true);
  }
  if(!actual){
    // Rectangles follow the OSM wings, with the operator's aerial photograph defining roofs.
    wing(B,M,68,11.5,3.55,3.2,-10.3,4.25,{ridge:'x',wall:M.plaster});
    wing(B,M,10.6,31.4,5.9,3.4,19.2,14.35,{wall:M.white});
    wing(B,M,11.1,17,4.0,2.9,10.7,-20.6,{wall:M.white});
    wing(B,M,11.0,18.1,3.6,2.7,-16.2,-10.45,{wall:M.white});
    wing(B,M,11.2,26.9,6.1,3.35,-24.0,2.05,{wall:M.white});
    wing(B,M,10.4,31.0,4.3,3.05,-49.1,3.1,{wall:M.white});
    B.box(19.8,3.35,29.0,M.woodFacade,40.3,1.675,-12.1);
    const metal=new THREE.BufferGeometry();metal.setAttribute('position',new THREE.Float32BufferAttribute([30.2,3.6,2.6,50.4,5.65,2.6,50.4,5.65,-26.8,30.2,3.6,2.6,50.4,5.65,-26.8,30.2,3.6,-26.8],3));metal.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,1,1,0,0,1,1,0,1],2));metal.computeVertexNormals();B.add(metal,M.metalRoof);
    B.box(16.0,2.7,3.7,M.glass,28.5,1.35,-15.4);B.box(16.3,.14,4.0,M.metalRoof,28.5,2.76,-15.4);
  }
  if(actual)surfaceWindows(D,M,data,frame,{school:true,levels:2,groundY:1.75,height:1.45,width:1.6,spacing:3.2});
  else{
    for(const x of [-24,19.2])for(const y of [1.7,4.4])rectangleWindows(D,M,10,y,30.13,3,{x,school:true});
    for(const y of [1.75])rectangleWindows(D,M,60,y,10.14,15,{x:-10,school:true});
    for(let i=0;i<7;i++)wallWindow(D,M,2.6,1.8,30.18,1.5,-23+i*4.05,-Math.PI/2,true);
  }
  // Solar arrays seen in the operator aerial photo follow the actual inclined roof planes.
  if(actual){for(const surface of data.geodata.roofSurfaces){const ring=ringsOf(surface)[0]?.map(p=>local(vertex(p),frame));if(!ring?.length)continue;const c=center(ring);if(c[0]>-15||c[1]<5.0)continue;const mapped=ring.map(p=>[c[0]+(p[0]-c[0])*.78,p[1]+.055,c[2]+(p[2]-c[2])*.78]);const pv=landmarkSurfaceGeometry(mapped);if(pv)D.add(pv,M.pv);}}
  else for(const x of [-24,-49.1]){const panel=new THREE.PlaneGeometry(7.3,21);panel.rotateX(-Math.PI/2);panel.rotateZ(-.52);D.add(panel,M.pv,x-2.9,7.45,-2);}
  // School ground is separate from the racing surface; its western/new wing is low, not a cube.
  court(B,M,helpers,-2.0,23.6,40.0,17.5);
  B.box(8.2,1.3,.42,M.stone,-2.0,.65,32.5);for(const x of [-18.2,18.2])for(let i=0;i<10;i++){const crown=new THREE.SphereGeometry(1,8,6);crown.scale(.325,.34,.93);B.add(crown,M.leafPaint,x,.37,23.6+(i-4.5)*1.6);}
  court(B,{...M,paving:material(0xbb856c)},helpers,-7.5,23.9,8.0,7.0,.070);
  const details=new THREE.Group();details.name='school:yard-detail';details.userData.detailDistance=185;g.add(details);
  D.box(.065,3.3,.065,M.red,-7.5,1.67,23.9);for(let i=0;i<8;i++){const a=i*Math.PI/4,base=new THREE.Vector3(Math.cos(a)*3.4,-2.8,Math.sin(a)*2.7),wire=new THREE.CylinderGeometry(.014,.014,base.length(),3);const rotation=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),base.clone().normalize());wire.applyQuaternion(rotation);D.add(wire,M.trim,-7.5+base.x/2,3.2+base.y/2,23.9+base.z/2);}
  for(const x of [-15.5,12.0]){D.box(3.0,.10,.55,M.wood,x,.57,21.0);D.box(3.0,.47,.10,M.wood,x,.83,21.25);for(const side of [-1,1])D.box(.11,.51,.45,M.metal,x+side*1.10,.27,21.0);}
  for(let i=0;i<6;i++)D.box(.38,.02,.4,i%2?M.red:M.white,-13.8+i*.43,.085,27.0);
  court(D,M,helpers,3.8,26.7,1.65,4.5,.076,11);
  // The municipality's entrance photograph shows a purple frame around the
  // projecting glass door, grey timber cladding and the pale sign wall.
  const purple=material(0x7d688b);
  for(const x of [33.5,39.0,44.5]){D.box(2.40,.075,.12,purple,x,.95,2.77);D.box(2.40,.075,.12,purple,x,2.60,2.77);}
  for(const x of [22.0,25.9,29.8,33.7])D.box(.09,2.72,.14,purple,x,1.37,-10.80);
  D.box(11.8,.10,.15,purple,27.9,1.04,-10.80);
  B.flush(g);D.flush(details);board(g,helpers,'KALLTALSCHULE',8.0,40.1,2.28,2.81,0,'#285c69','#ecebe5',.20);g.userData.visualEvidence='Municipality entrance photograph; surveyed roof and mapped low extension';g.userData.illustrationDetails={timberPanels,hopscotchTiles:8};return g;
}

function roundabout(data,helpers){
  const M=palette(helpers),g=new THREE.Group(),B=batch(helpers),r=Math.max(2,(data.radius||17)-5.8);
  B.add(new THREE.CylinderGeometry(r+.55,r+.55,.16,32),M.paving,0,.09,0);B.add(new THREE.CylinderGeometry(r,r,.20,32),material(0x996e59),0,.23,0);
  for(let i=0;i<70;i++){const a=seeded(i+50)*Math.PI*2,d=Math.sqrt(seeded(i+19))*r*.89;B.add(new THREE.IcosahedronGeometry(.16,0),i%3?M.flower:M.white,Math.cos(a)*d,.40,Math.sin(a)*d);}
  B.flush(g);return g;
}

function museum(data,helpers){
  const M=palette(helpers),g=new THREE.Group(),B=batch(helpers),frame=data.frame||frames.museum,geo=data.geodata;
  const outline=(geo?.groundRings?.[0]||data.points)?.map(p=>point2(p,frame))||[[-9.7,-3.95],[9.7,-3.95],[9.7,3.95],[-9.7,3.95]];
  const minX=Math.min(...outline.map(p=>p[0])),maxX=Math.max(...outline.map(p=>p[0])),minZ=Math.min(...outline.map(p=>p[1])),maxZ=Math.max(...outline.map(p=>p[1]));
  const w=maxX-minX,d=maxZ-minZ,cx=(minX+maxX)/2,cz=(minZ+maxZ)/2,eaves=geo?.wallHeight||5.485,rise=(geo?.height||8.493)-eaves;
  B.add(footprint(outline,eaves),M.white);
  if(geo?.roofSurfaces?.length){for(const s of geo.roofSurfaces){const roof=landmarkSurfaceGeometry(s,frame);if(roof)B.add(roof,M.roof);}}
  else B.add(pitchedRoof(d+.2,w+.25,eaves,rise),M.roof,cx,0,cz,Math.PI/2);
  for(const side of [-1,1]){
    const z=cz+side*(d/2+.06),angle=side<0?Math.PI:0;
    for(const y of [.17,2.81,eaves-.05])B.box(w+.10,.15,.13,M.dark,cx,y,z);
    for(let i=0;i<7;i++){const x=minX+i*w/6;B.box(.15,eaves,.13,M.dark,x,eaves/2,z);}
    for(let i=0;i<6;i++){
      const x=minX+(i+.5)*w/6;
      for(const y of [1.64,4.03])wallWindow(B,M,1.00,1.30,x,y,z+side*.07,angle);
      if(i===0||i===5||i===2)beam(B,M.dark,[x-w/12+.11,.35,z],[x+w/12-.11,2.65,z],.13,.12);
    }
  }
  for(const side of [-1,1]){
    const x=cx+side*w/2;
    B.add(triangle(d,rise),M.white,x+side*.035,eaves,cz,side*Math.PI/2);
    for(const z of [minZ,maxZ])B.box(.13,eaves,.15,M.dark,x,eaves/2,z);
    B.box(.13,.15,d+.12,M.dark,x,eaves-.02,cz);
    beam(B,M.dark,[x,eaves,cz-d/2],[x,eaves+rise,cz],.13,.14);
    beam(B,M.dark,[x,eaves+rise,cz],[x,eaves,cz+d/2],.13,.14);
    B.box(.15,rise,.15,M.dark,x,eaves+rise/2,cz);
    wallWindow(B,M,1.04,1.06,x+side*.07,eaves+1.01,cz,side*Math.PI/2);
  }
  B.box(.54,1.50,.64,material(0x895746),cx+3.2,eaves+rise-.10,cz-.9);
  // The roadside hedge and low timber fence were visible in the inspected panorama.
  B.box(w+1.7,.90,.9,M.hedge,cx,.49,maxZ+2.8);
  for(let i=0;i<20;i++)B.box(.08,.9,.07,M.wood,minX-.7+i*(w+1.4)/19,.45,maxZ+3.35);
  for(const y of [.26,.67])B.box(w+1.6,.075,.065,M.wood,cx,y,maxZ+3.36);
  B.flush(g);board(g,helpers,'BAUERNMUSEUM',6.9,cx,2.92,maxZ+.15,0,'#403b32','#ece9dc',.16);return g;
}

function chapelTower(data,helpers){
  const M=palette(helpers),g=new THREE.Group(),B=batch(helpers),frame=data.frame||frames.chapelTower;
  const points=data.points?.map(p=>point2(p,frame));if(points)B.add(footprint(points,.09),M.paving);
  // Observed open A-supports and louvred band. The unmeasured steep roof is a
  // conservative interpretation, not a surveyed LoD2 building or a solid house.
  for(const side of [-1,1])beam(B,M.dark,[side*1.98,.09,1.58],[side*.61,5.25,1.58],.43,.49);
  B.box(1.75,.24,.51,M.dark,0,5.08,1.58);
  for(let row=0;row<7;row++){
    const y=4.50+row*.16;
    for(const side of [-1,1]){B.box(4.25,.074,.11,M.dark,0,y,side*2.07);B.box(.11,.074,4.25,M.dark,side*2.07,y,0);}
  }
  const base=[[-2.21,5.64,-2.21],[2.21,5.64,-2.21],[2.21,5.64,2.21],[-2.21,5.64,2.21]],tip=[0,12.80,0];
  for(let i=0;i<4;i++){const roof=landmarkSurfaceGeometry([base[i],base[(i+1)%4],tip]);if(roof)B.add(roof,M.roof);}
  B.box(.095,1.34,.095,M.dark,0,13.36,0);B.box(.80,.095,.095,M.dark,0,13.68,0);
  B.flush(g);g.userData.interpretedRoof=true;return g;
}

/** Standalone model: local +Z is the public/road-facing side. */
export function createLandmark(id,data={},helpers={}){
  const key=typeof id==='number'?Object.entries(buildingIds).find(([,n])=>n===id)?.[0]:id,quality=helpers.quality??2;
  const factory={breuer,bakery,school,roundabout,museum,chapelTower}[key];if(!factory)throw new Error('Unknown landmark: '+id);
  const g=factory(data,helpers,quality);g.name='landmark:'+key;g.userData.landmarkId=key;g.userData.buildingId=data.id||buildingIds[key];g.userData.sourceGeometry=!!data.geodata?.roofSurfaces?.length;
  return g;
}

/** Adds replacements only. The existing church/ATM/roundabout dressing is left to world.js. */
export function installLandmarks(parent,map,track,quality=2,helpers={}){
  const byId={},groups=[];for(const id of Object.keys(buildingIds)){
    const buildingId=buildingIds[id],building=map.buildings?.find(b=>b.id===buildingId);if(!building)continue;
    const frame={...frames[id]};
    if(id==='breuer'&&building.points.length>14){const p=building.points[0],q=building.points[14];frame.x=(p[0]+q[0])/2;frame.z=(p[1]+q[1])/2;frame.a=Math.atan2(-(q[1]-p[1]),q[0]-p[0]);}
    if(id==='bakery'&&building.points.length===12){const p=building.points[0],q=building.points[11];frame.a=Math.atan2(-(q[1]-p[1]),q[0]-p[0])+Math.PI;frame.x=(p[0]+q[0])/2-Math.sin(frame.a)*10.5;frame.z=(p[1]+q[1])/2-Math.cos(frame.a)*10.5;}
    if(id==='museum'){const ring=building.geodata?.groundRings?.[0]||building.points;let edge=0,length=0;for(let i=0;i<ring.length-1;i++){const d=Math.hypot(ring[i+1][0]-ring[i][0],ring[i+1][1]-ring[i][1]);if(d>length){edge=i;length=d;}}const p=ring[edge],q=ring[(edge+1)%ring.length],r=ring[(edge+2)%ring.length];frame.x=(p[0]+r[0])/2;frame.z=(p[1]+r[1])/2;frame.a=Math.atan2(-(q[1]-p[1]),q[0]-p[0])+Math.PI;}
    if(id==='chapelTower'){const [p,q,r]=building.points;frame.x=(p[0]+r[0])/2;frame.z=(p[1]+r[1])/2;frame.a=Math.atan2(-(q[1]-p[1]),q[0]-p[0]);}
    const ground=helpers.sampleGround?building.points.reduce((s,p)=>s+helpers.sampleGround(map,p[0],p[1]),0)/building.points.length:0;
    const g=createLandmark(id,{...building,frame},{...helpers,quality,paletteOwner:helpers,map,surfaceFrame:frame,surfaceGround:ground});
    g.position.set(frame.x,ground,frame.z);g.rotation.y=frame.a;parent.add(g);byId[id]=g;groups.push(g);
  }
  let meshes=0,triangles=0;for(const group of groups)group.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;}});
  return {groups,byId,stats:{landmarkModelCount:groups.length,landmarkMeshCount:meshes,landmarkTriangleCount:triangles,landmarkSourcedRoofs:groups.filter(g=>g.userData.sourceGeometry).length,landmarkIllustrationDetails:Object.fromEntries(groups.filter(g=>g.userData.illustrationDetails).map(g=>[g.userData.landmarkId,g.userData.illustrationDetails]))}};
}
