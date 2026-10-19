import * as THREE from 'three';

/** Comic finish for the race world: the scene renders once into an HDR target,
 * then one full-screen pass adds ink outlines from the depth buffer (object
 * silhouettes and creases between walls, roofs and ground), a warm/cool colour
 * grade and a light vignette, and finally the renderer's own tone mapping and
 * sRGB output. One extra pass, no normal buffer: cheap enough for phones.
 * The garage keeps rendering directly; only world frames go through here. */

export const COMIC_DEFAULTS=Object.freeze({
 ink:1,            // outline strength 0..1
 silhouette:.045,   // relative depth jump that counts as an object edge
 crease:.010,       // relative depth curvature that counts as a corner/fold
 saturation:1.3,
 contrast:1.1,
 warmth:.07,       // highlights toward warm sun, shadows toward cool sky
 vignette:.22,
});

const vertexShader=/* glsl */`
varying vec2 vUv;
void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}
`;

const fragmentShader=/* glsl */`
#include <packing>
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 texel;
uniform float cameraNear,cameraFar,inkFadeNear,inkFadeFar;
uniform float ink,silhouette,crease,saturation,contrast,warmth,vignette;
uniform float speedLines,time,aspect,tanHalfFov;
varying vec2 vUv;
float viewDepth(vec2 uv){
 float d=texture2D(tDepth,uv).x;
 return -perspectiveDepthToViewZ(d,cameraNear,cameraFar);
}
void main(){
 vec4 base=texture2D(tColor,vUv);
 vec3 color=base.rgb;
 float d0=viewDepth(vUv);
 float dl=viewDepth(vUv-vec2(texel.x,0.)),dr=viewDepth(vUv+vec2(texel.x,0.));
 float dd=viewDepth(vUv-vec2(0.,texel.y)),du=viewDepth(vUv+vec2(0.,texel.y));
 bool sky=d0>cameraFar*.985;
 // Silhouette: only on the nearer side of a jump, so lines stay one pixel.
 float far=max(max(dl,dr),max(dd,du));
 float jump=(far-d0)/max(d0,.001);
 float edge=smoothstep(silhouette,silhouette*2.2,jump);
 // Crease: rebuild view positions from depth and compare the surface normal on
 // either side of the pixel; a bend (house corner, window reveal, eave, kerb)
 // draws a line even where the depth itself is continuous.
 vec2 ndc=vUv*2.-1.;vec3 ray=vec3(ndc.x*tanHalfFov*aspect,ndc.y*tanHalfFov,-1.);
 vec2 tx=vec2(texel.x*2.*tanHalfFov*aspect,0.),ty=vec2(0.,texel.y*2.*tanHalfFov);
 vec3 pc=ray*d0,pr=(ray+vec3(tx,0.))*dr,pl=(ray-vec3(tx,0.))*dl,pu=(ray+vec3(ty,0.))*du,pd=(ray-vec3(ty,0.))*dd;
 vec3 n1=normalize(cross(pr-pc,pu-pc)),n2=normalize(cross(pc-pl,pc-pd));
 float bend=1.-dot(n1,n2);
 float curve=(abs(dl+dr-2.*d0)+abs(dd+du-2.*d0))/max(d0,.001);
 edge=max(edge,max(smoothstep(crease*9.,crease*22.,bend),smoothstep(crease,crease*2.6,curve))*.8);
 edge*=1.-smoothstep(inkFadeNear,inkFadeFar,d0);
 if(sky)edge=0.;
 // Grade in linear light before tone mapping.
 float luma=dot(color,vec3(.2126,.7152,.0722));
 color=mix(vec3(luma),color,saturation);
 color=(color-.18)*contrast+.18;
 float lit=smoothstep(.05,.6,luma);
 color*=mix(vec3(1.-warmth*.6,1.-warmth*.15,1.+warmth),vec3(1.+warmth,1.+warmth*.35,1.-warmth*.5),lit);
 color=max(color,0.);
 // Ink is a dark, slightly cool version of the surface colour, not flat black.
 vec3 inkColor=color*.16+vec3(.012,.014,.03);
 color=mix(color,inkColor,edge*ink);
 vec2 v=vUv-.5;
 color*=1.-vignette*smoothstep(.25,.85,dot(v,v)*2.);
 gl_FragColor=vec4(color,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 // Comic speed lines: thin radial streaks at the frame edge while boosting.
 if(speedLines>.001){
  vec2 c=vUv-.5;c.x*=aspect;float r=length(c),ang=atan(c.y,c.x)/6.28318;
  float slot=floor(ang*56.),h=fract(sin(slot*91.7)*4373.1);
  float on=step(.45,fract(h*7.3+time*1.7));
  float f=abs(fract(ang*56.)-.5);
  float streak=(1.-smoothstep(.04,.16,f))*smoothstep(.36+h*.12,.78,r)*on;
  gl_FragColor.rgb=mix(gl_FragColor.rgb,vec3(1.),streak*speedLines*.6);
 }
}
`;

export class ComicPost{
 constructor(renderer,options={}){
  this.renderer=renderer;this.enabled=true;this.samples=options.samples??4;
  const settings={...COMIC_DEFAULTS,...options};
  this.target=null;this.width=0;this.height=0;
  this.material=new THREE.ShaderMaterial({
   name:'comic:post',vertexShader,fragmentShader,depthTest:false,depthWrite:false,
   uniforms:{
    tColor:{value:null},tDepth:{value:null},texel:{value:new THREE.Vector2(1,1)},
    cameraNear:{value:.2},cameraFar:{value:260},inkFadeNear:{value:60},inkFadeFar:{value:200},
    ink:{value:settings.ink},silhouette:{value:settings.silhouette},crease:{value:settings.crease},
    saturation:{value:settings.saturation},speedLines:{value:0},time:{value:0},aspect:{value:1},tanHalfFov:{value:.6},contrast:{value:settings.contrast},warmth:{value:settings.warmth},vignette:{value:settings.vignette},
   },
  });
  this.quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.material);this.quad.frustumCulled=false;
  this.scene=new THREE.Scene();this.scene.add(this.quad);this.camera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
 }
 /** 0..1 strength of the boost speed lines for the next frames. */
 setSpeedLines(value){this.material.uniforms.speedLines.value=Math.max(0,Math.min(1,value||0));}
 setSamples(samples){if(samples===this.samples)return;this.samples=samples;this._release();}
 _release(){if(this.target){this.target.depthTexture?.dispose();this.target.dispose();this.target=null;}}
 _ensure(){
  const size=this.renderer.getDrawingBufferSize(new THREE.Vector2()),w=Math.max(1,Math.floor(size.x)),h=Math.max(1,Math.floor(size.y));
  if(this.target&&w===this.width&&h===this.height)return this.target;
  this._release();this.width=w;this.height=h;
  const depthTexture=new THREE.DepthTexture(w,h);depthTexture.type=THREE.UnsignedIntType;
  this.target=new THREE.WebGLRenderTarget(w,h,{type:THREE.HalfFloatType,samples:this.samples,depthTexture,depthBuffer:true});
  this.target.texture.name='comic:color';this.target.texture.generateMipmaps=false;
  this.material.uniforms.texel.value.set(1/w,1/h);
  return this.target;
 }
 /** Render a world frame. Falls back to a plain render when disabled. */
 render(scene,camera){
  const renderer=this.renderer;
  if(!this.enabled){renderer.setRenderTarget(null);renderer.render(scene,camera);return;}
  const target=this._ensure(),u=this.material.uniforms;
  u.tColor.value=target.texture;u.tDepth.value=target.depthTexture;
  u.cameraNear.value=camera.near;u.tanHalfFov.value=Math.tan((camera.fov||60)*Math.PI/360);u.aspect.value=this.width/Math.max(1,this.height);u.time.value=performance.now()/1000;u.cameraFar.value=camera.far;
  const fogFar=scene.fog?.far??camera.far;u.inkFadeNear.value=fogFar*.32;u.inkFadeFar.value=fogFar*.82;
  const previous=renderer.getRenderTarget();
  renderer.setRenderTarget(target);renderer.clear();renderer.render(scene,camera);
  renderer.setRenderTarget(previous);renderer.render(this.scene,this.camera);
 }
 dispose(){this._release();this.material.dispose();this.quad.geometry.dispose();}
}
