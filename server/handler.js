import {handleAPI} from './rooms.js';
import {getDatabase} from './database.js';
import {handleLeaderboardsAPI,isLeaderboardPath} from './leaderboards.js';

export default async function handler(req,res){
 try{
  const headers=new Headers();
  for(const [name,value] of Object.entries(req.headers))if(value!==undefined)headers.set(name,Array.isArray(value)?value.join(','):value);
  const host=req.headers.host;
  const request=new Request(`https://${host}${req.url}`,{
   method:req.method,headers,
   ...(!['GET','HEAD','OPTIONS'].includes(req.method)?{body:typeof req.body==='string'?req.body:Buffer.isBuffer(req.body)?req.body:JSON.stringify(req.body??{})}:{})
  });
  // Validate origins, methods and request JSON before waking the database.
  const handle=isLeaderboardPath(new URL(request.url).pathname)?handleLeaderboardsAPI:handleAPI;
  const response=await handle(request,{getDatabase});
  res.statusCode=response.status;
  response.headers.forEach((value,name)=>res.setHeader(name,value));
  res.end(await response.text());
 }catch(error){
  console.error('Breuer Vercel API:',error.name);
  res.status(503).json({error:'Der Online-Rennserver ist gerade nicht verfügbar. Das Rennen gegen KI kannst du jederzeit starten.'});
 }
}
