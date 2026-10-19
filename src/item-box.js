import * as THREE from 'three';

/** Floating item crates in the spirit of a kart racer, painted in the game's
 * comic style: a yellow "?" crate with a red rim and ink border on every face
 * (assets/nextlevel/item-box.webp), an ink outline and a soft shadow on
 * the road. All boxes share one texture, geometries and materials. The
 * spinner (children[0]) is animated by the game loop: spin, tilt and bob. */

export const ITEM_BOX=Object.freeze({size:1.05,hover:1.38});

function boxFaceTexture(){
 const doc=globalThis.document;if(!doc?.createElement)return null;
 const size=512,c=doc.createElement('canvas');c.width=c.height=size;const g=c.getContext?.('2d');
 // Test doubles and very old browsers may hand back a partial context.
 if(!g||typeof g.fillRect!=='function'||typeof g.strokeRect!=='function'||typeof g.fillText!=='function')return null;
 // First frame: the same comic crate drawn in code (yellow panel, red rim,
 // ink border, white "?"), replaced by the painted face once it has loaded.
 g.fillStyle='#ff3b4f';g.fillRect(0,0,size,size);g.fillStyle='#ffd23f';g.fillRect(28,28,size-56,size-56);
 g.lineWidth=14;g.strokeStyle='#14161c';g.strokeRect(7,7,size-14,size-14);g.lineWidth=10;g.strokeRect(28,28,size-56,size-56);
 g.font='900 330px "Arial Black",Barlow,Impact,Arial,sans-serif';g.textAlign='center';g.textBaseline='middle';
 if(typeof g.strokeText==='function'){g.lineJoin='round';g.lineWidth=26;g.strokeText('?',size/2,size/2+18);}
 g.fillStyle='#ffffff';g.fillText('?',size/2,size/2+18);
 const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;texture.name='item-box-face';
 const ImageType=globalThis.Image;
 if(typeof ImageType==='function'&&typeof g.drawImage==='function'){
  const img=new ImageType();img.decoding='async';
  img.onload=()=>{try{g.drawImage(img,0,0,size,size);texture.needsUpdate=true;}catch{}};
  img.src='./nextlevel/item-box.webp';
 }
 return texture;
}

let shared=null;
function parts(){
 if(shared)return shared;
 const map=boxFaceTexture(),size=ITEM_BOX.size;
 const cube=new THREE.BoxGeometry(size,size,size);cube.name='item-box';
 // Unlit: the painted face carries its own comic shading and stays readable.
 // Inverted hull: a slightly larger black back face draws the comic ink outline.
 const back=new THREE.MeshBasicMaterial({name:'item-box-ink',color:0x14161c,side:THREE.BackSide});
 const front=new THREE.MeshBasicMaterial({name:'item-box-face',map,color:0xffffff});
 const core=new THREE.MeshBasicMaterial({name:'item-box-core',color:0xffffff,transparent:true,opacity:.0});
 const shadow=new THREE.MeshBasicMaterial({name:'item-box-shadow',color:0x14202a,transparent:true,opacity:.28,depthWrite:false});
 shared={cube,coreGeometry:new THREE.OctahedronGeometry(.2,0),shadowGeometry:new THREE.CircleGeometry(.62,20).rotateX(-Math.PI/2),back,front,core,shadow};
 return shared;
}

export function makeItemBox(){
 const p=parts(),group=new THREE.Group();group.name='item-box';
 const spinner=new THREE.Group();spinner.name='item-box:spinner';spinner.position.y=ITEM_BOX.hover;spinner.rotation.set(.38,0,.38);
 const inner=new THREE.Mesh(p.cube,p.back);inner.scale.setScalar(1.08);inner.renderOrder=2;
 const glass=new THREE.Mesh(p.cube,p.front);glass.renderOrder=3;
 const core=new THREE.Mesh(p.coreGeometry,p.core);core.name='item-box:core';core.visible=false;
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
