const decodedImages=new Map();
function imageFor(url,ImageType){
 if(decodedImages.has(url))return decodedImages.get(url);
 const pending=new Promise(resolve=>{
  const image=new ImageType();image.crossOrigin='anonymous';
  image.onload=()=>{image.onload=image.onerror=null;resolve(image);};
  image.onerror=()=>{image.onload=image.onerror=null;resolve(null);};image.src=url;
 });decodedImages.set(url,pending);return pending;
}

/** Upgrade existing owned textures after their procedural first frame is ready.
 * Keeping texture identity makes every low/high quality material and bump cache
 * see the same pixels. Scene teardown still owns each texture exactly once.
 * Decoded image pixels are cached; THREE.Texture instances never cross worlds.
 */
export function upgradeVillageTextures(textures,{root='./nextlevel/',ImageType=globalThis.Image}={}){
 if(typeof ImageType!=='function')return Promise.resolve([]);
 return Promise.all(Object.entries(textures).map(async([kind,texture])=>{
  if(!texture?.isTexture)return {kind,loaded:false};
  let live=true;const disposed=()=>{live=false;};texture.addEventListener('dispose',disposed);
  const image=await imageFor(root+kind+'.webp',ImageType);
  texture.removeEventListener('dispose',disposed);
  if(!live||!image)return {kind,loaded:false,disposed:!live};
  texture.image=image;texture.needsUpdate=true;texture.userData.generatedDiffuse=kind;
  return {kind,loaded:true};
 }));
}
