import * as THREE from 'three';

/** Floating item boxes in the spirit of a kart racer: a glassy rainbow cube
 * with a "?" on every face, a glowing core inside and a soft shadow on the
 * road. All boxes share one texture, two geometries and four materials, so
 * twenty of them cost a handful of triangles and no extra textures. The
 * spinner (children[0]) is animated by the game loop: spin, tilt and bob. */

export const ITEM_BOX=Object.freeze({size:1.05,hover:1.38});

function boxFaceTexture(){
 const doc=globalThis.document;if(!doc?.createElement)return null;
 const size=256,c=doc.createElement('canvas');c.width=c.height=size;const g=c.getContext?.('2d');
 // Test doubles and very old browsers may hand back a partial context.
 if(!g||typeof g.clearRect!=='function'||typeof g.createLinearGradient!=='function'||typeof g.arcTo!=='function')return null;
 const r=34,inset=10,round=(x,y,w,h,rad)=>{g.beginPath();g.moveTo(x+rad,y);g.arcTo(x+w,y,x+w,y+h,rad);g.arcTo(x+w,y+h,x,y+h,rad);g.arcTo(x,y+h,x,y,rad);g.arcTo(x,y,x+w,y,rad);g.closePath();};
 g.clearRect(0,0,size,size);
 // Glass: a faint milky centre with a light diagonal sheen.
 const glass=g.createLinearGradient(0,0,size,size);glass.addColorStop(0,'rgba(255,255,255,.42)');glass.addColorStop(.45,'rgba(255,255,255,.14)');glass.addColorStop(1,'rgba(255,255,255,.3)');
 round(inset,inset,size-inset*2,size-inset*2,r);g.fillStyle=glass;g.fill();
 // Rainbow rim.
 const rim=g.createLinearGradient(0,0,size,size);['#ff3b5c','#ffb02e','#ffe93d','#3ddc84','#36b7ff','#8a5cff','#ff4fd8'].forEach((col,i,a)=>rim.addColorStop(i/(a.length-1),col));
 g.lineWidth=22;g.strokeStyle=rim;round(inset+11,inset+11,size-inset*2-22,size-inset*2-22,r-8);g.stroke();
 g.lineWidth=4;g.strokeStyle='rgba(255,255,255,.95)';round(inset+25,inset+25,size-inset*2-50,size-inset*2-50,r-16);g.stroke();
 g.lineWidth=5;g.strokeStyle='rgba(20,26,40,.85)';round(inset,inset,size-inset*2,size-inset*2,r);g.stroke();
 // The question mark: chunky white with a dark comic outline.
 g.font='900 172px "Arial Black",Barlow,Impact,Arial,sans-serif';g.textAlign='center';g.textBaseline='middle';
 g.lineJoin='round';g.lineWidth=16;g.strokeStyle='#1b2232';g.strokeText('?',size/2,size/2+10);
 g.fillStyle='#ffffff';g.fillText('?',size/2,size/2+10);
 g.fillStyle='rgba(255,226,92,.9)';g.fillText('?',size/2+3,size/2+16);g.fillStyle='#ffffff';g.fillText('?',size/2,size/2+10);
 const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;texture.name='item-box-face';
 return texture;
}

let shared=null;
function parts(){
 if(shared)return shared;
 const map=boxFaceTexture(),size=ITEM_BOX.size;
 const cube=new THREE.BoxGeometry(size,size,size);cube.name='item-box';
 const back=new THREE.MeshBasicMaterial({name:'item-box-inner',map,color:0xd8e8ff,transparent:true,depthWrite:false,side:THREE.BackSide,opacity:.75});
 const front=new THREE.MeshBasicMaterial({name:'item-box-glass',map,color:0xffffff,transparent:true,side:THREE.FrontSide,alphaTest:.02});
 const core=new THREE.MeshBasicMaterial({name:'item-box-core',color:0xfff1a0});
 const shadow=new THREE.MeshBasicMaterial({name:'item-box-shadow',color:0x14202a,transparent:true,opacity:.28,depthWrite:false});
 shared={cube,coreGeometry:new THREE.OctahedronGeometry(.2,0),shadowGeometry:new THREE.CircleGeometry(.62,20).rotateX(-Math.PI/2),back,front,core,shadow};
 return shared;
}

export function makeItemBox(){
 const p=parts(),group=new THREE.Group();group.name='item-box';
 const spinner=new THREE.Group();spinner.name='item-box:spinner';spinner.position.y=ITEM_BOX.hover;spinner.rotation.set(.38,0,.38);
 const inner=new THREE.Mesh(p.cube,p.back);inner.renderOrder=2;
 const glass=new THREE.Mesh(p.cube,p.front);glass.renderOrder=3;
 const core=new THREE.Mesh(p.coreGeometry,p.core);core.name='item-box:core';
 for(const m of [inner,glass,core]){m.castShadow=false;m.receiveShadow=false;spinner.add(m);}
 const shadow=new THREE.Mesh(p.shadowGeometry,p.shadow);shadow.position.y=.04;shadow.renderOrder=1;shadow.name='item-box:shadow';
 group.add(spinner,shadow);
 return group;
}

/** Per-frame motion for one box: spin around a tilted axis, bob, breathe. */
export function animateItemBox(group,time,phase=0,reduced=false){
 const spinner=group.children[0],shadow=group.children[1];if(!spinner)return;
 if(reduced){spinner.rotation.set(.38,0,.38);spinner.position.y=ITEM_BOX.hover;return;}
 spinner.rotation.y=time*1.7+phase;spinner.rotation.x=.38+Math.sin(time*1.25+phase)*.1;
 const bob=Math.sin(time*2.3+phase)*.13;spinner.position.y=ITEM_BOX.hover+bob;
 const core=spinner.children[2];if(core){core.rotation.y=-time*3.1;core.scale.setScalar(1+Math.sin(time*5+phase)*.12);}
 if(shadow)shadow.scale.setScalar(1-bob*.9);
}
