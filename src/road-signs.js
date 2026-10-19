import * as THREE from 'three';

/** Yellow German advance direction sign (Vorwegweiser) as at the Kirchstraße
 * roundabout: a black ring with three exits and the real destinations seen in
 * the operator's Street View photo. Drawn once into a canvas texture. */
export const ROUNDABOUT_DESTINATIONS=Object.freeze({
 ahead:['Simmerath','Euskirchen'],left:['Düren','Hürtgenwald'],right:['Rursee']
});

export function drawRoundaboutSign(ctx,w,h,d=ROUNDABOUT_DESTINATIONS){
 ctx.fillStyle='#f5c400';ctx.fillRect(0,0,w,h);
 ctx.strokeStyle='#141414';ctx.lineWidth=w*.022;ctx.strokeRect(w*.03,h*.03,w*.94,h*.94);
 const cx=w*.5,cy=h*.6,r=h*.12;
 ctx.lineWidth=w*.03;ctx.lineCap='butt';
 ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.stroke();
 ctx.beginPath();ctx.moveTo(cx,h*.92);ctx.lineTo(cx,cy+r);ctx.stroke();                 // approach
 const arm=(x0,y0,x1,y1,ax,ay)=>{ctx.beginPath();ctx.moveTo(x0,y0);ctx.lineTo(x1,y1);ctx.stroke();
  ctx.beginPath();ctx.moveTo(x1+ax*w*.035,y1+ay*w*.035);ctx.lineTo(x1-ay*w*.03,y1+ax*w*.03);ctx.lineTo(x1+ay*w*.03,y1-ax*w*.03);ctx.closePath();ctx.fillStyle='#141414';ctx.fill();};
 arm(cx,cy-r,cx,h*.2,0,-1);arm(cx-r,cy,w*.37,cy,-1,0);arm(cx+r,cy,w*.63,cy,1,0);
 ctx.fillStyle='#141414';ctx.textBaseline='middle';const size=Math.round(h*.075);ctx.font=`700 ${size}px Arial`;
 ctx.textAlign='left';d.ahead.forEach((t,i)=>ctx.fillText(t,cx+w*.04,h*.12+i*size*1.1));
 ctx.textAlign='right';d.left.forEach((t,i)=>ctx.fillText(t,w*.33,cy-size*1.15+i*size*1.1,w*.28));
 ctx.textAlign='left';d.right.forEach((t,i)=>ctx.fillText(t,w*.67,cy-size*.6+i*size*1.1,w*.27));
}

export function roundaboutSignMaterial(){
 const c=globalThis.document?.createElement?.('canvas'),m=new THREE.MeshBasicMaterial({color:0xf5c400});
 const ctx=c?.getContext?.('2d');
 // Headless test canvases may lack parts of the 2D API: keep the plain yellow board then.
 if(ctx)try{c.width=512;c.height=410;drawRoundaboutSign(ctx,c.width,c.height);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;m.map=t;m.color.set(0xffffff);}catch{}
 m.name='roundabout-sign';m.userData.keepUV=true;return m;
}

/** One signpost per roundabout approach, on the verge, reserved via safe(). */
export function addRoundaboutSigns({batch,center,radius,arms,safe,metal,heightAt=()=>0}){
 const face=roundaboutSignMaterial(),placed=[];
 for(const a of arms){
  search:for(const back of [24,28,32])for(const lateral of [7.2,-7.2]){
   const ox=Math.sin(a),oz=Math.cos(a),lx=Math.cos(a),lz=-Math.sin(a);
   const x=center[0]+ox*(radius+back)+lx*lateral,z=center[1]+oz*(radius+back)+lz*lateral;
   if(!safe(x,z,2.4,.3,a,'roundabout-sign'))continue;
   for(const side of [-1,1])batch.box(.09,2.9,.09,metal,x+lx*.9*side,1.45,z+lz*.9*side);
   batch.add(new THREE.PlaneGeometry(2.2,1.76).translate(0,2.25,0),face,x,0,z,a);
   batch.add(new THREE.PlaneGeometry(2.24,1.8).rotateY(Math.PI).translate(0,2.25,-.025),metal,x,0,z,a);
   placed.push({x,z,a});break search;
  }
 }
 return placed;
}
