import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';

// Transport-only packaging: the source ZIP contains the real assets already.
// A preview can send smaller bounded archive parts and restore the SAME bytes
// before the normal build. Nothing runs in the game or in a request handler.
export async function restoreDeploymentAssets(root=new URL('../',import.meta.url)){
 let manifest;
 try{manifest=JSON.parse(await readFile(new URL('deployment/assets-manifest.json',root),'utf8'));}
 catch(error){if(error.code==='ENOENT')return {restored:0,verified:0};throw error;}
 const safe=name=>typeof name==='string'&&!name.includes('\\')&&!name.split('/').includes('..')&&!name.startsWith('/')&&name.startsWith('assets/');
 const digest=bytes=>createHash('sha1').update(bytes).digest('hex');
 const expected=new Map(manifest.assets.map(file=>[file.file,file]));
 if(expected.size!==manifest.assets.length||!expected.size||[...expected.keys()].some(name=>!safe(name)))throw new Error('Invalid deployment asset manifest.');
 const matches=(bytes,file)=>bytes.length===file.size&&digest(bytes)===file.sha;
 async function verifyExisting(){
  for(const file of expected.values()){
   try{if(!matches(await readFile(new URL(file.file,root)),file))return false;}
   catch(error){if(error.code==='ENOENT')return false;throw error;}
  }
  return true;
 }
 if(await verifyExisting())return {restored:0,verified:expected.size};
 const buffers=[];
 for(const part of manifest.parts){
  if(!/^deployment\/asset-pack-\d{2}\.bin$/.test(part.file))throw new Error('Invalid deployment archive part.');
  const bytes=await readFile(new URL(part.file,root));
  if(!matches(bytes,part))throw new Error('Deployment archive checksum mismatch: '+part.file);
  buffers.push(bytes);
 }
 const packed=JSON.parse(gunzipSync(Buffer.concat(buffers)).toString('utf8'));
 if(packed.length!==expected.size)throw new Error('Deployment archive file count mismatch.');
 const seen=new Set(),decoded=[];
 for(const file of packed){
  const target=expected.get(file.file),bytes=Buffer.from(file.data,'base64');
  if(!target||seen.has(file.file)||!matches(bytes,target))throw new Error('Deployment asset checksum mismatch: '+file.file);
  seen.add(file.file);decoded.push([target,bytes]);
 }
 // Validate the entire archive before making any writes.
 for(const [file,bytes] of decoded){
  const target=new URL(file.file,root);await mkdir(new URL('./',target),{recursive:true});await writeFile(target,bytes);
 }
 if(!await verifyExisting())throw new Error('Deployment asset verification failed after restoration.');
 console.log('Restored '+expected.size+' byte-verified deployment assets.');
 return {restored:expected.size,verified:expected.size};
}

await restoreDeploymentAssets();
