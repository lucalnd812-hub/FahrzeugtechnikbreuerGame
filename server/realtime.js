import http from 'node:http';
import {WebSocketServer,WebSocket} from 'ws';
import {getDatabase as productionDatabase} from './database.js';
import {authenticateDriver,roomSnapshot,validateStateUpdate,isAllowedOrigin} from './rooms.js';

const privateMembersSQL='SELECT id, name, car, joined, seen, ready, state, token_hash FROM players WHERE room = ? ORDER BY joined, id LIMIT 6';
const statement=(db,query,...params)=>db.prepare(query).bind(...params);
const rows=result=>result?.rows||result?.results||[];
const send=(socket,data)=>{if(socket.readyState===WebSocket.OPEN&&socket.bufferedAmount<262144)socket.send(JSON.stringify(data));};

// A socket is an optional delivery channel. PostgreSQL remains the source of
// truth across independently scaled Vercel instances and reconnects.
export function createRealtimeServer({getDatabase=productionDatabase,now=()=>Date.now(),intervalMs=200,authTimeoutMs=8000,lifetimeMs=285000,maxConnections=96}={}){
 const groups=new Map(),connections=new Set();
 const metrics={connections:0,acceptedStates:0,flushes:0,databaseBatches:0,updatedPlayers:0};
 const server=http.createServer((request,response)=>{
  response.setHeader('Cache-Control','no-store');response.setHeader('Content-Type','application/json; charset=utf-8');
  response.statusCode=request.method==='GET'?426:405;
  response.end(JSON.stringify({error:'Dieser Endpunkt erwartet eine WebSocket-Verbindung. Für HTTP nutze den Rennraum-Endpunkt.'}));
 });
 const wss=new WebSocketServer({noServer:true,maxPayload:12000,perMessageDeflate:false});
 const fail=(session,error,status=400,retry=false)=>{
  send(session.socket,{type:'error',error,status,retry});
  if(session.socket.readyState===WebSocket.OPEN)session.socket.close(status>=500?1013:1008,'Verbindung beendet');
 };
 const remove=session=>{
  clearTimeout(session.authTimer);clearTimeout(session.rotateTimer);connections.delete(session);
  const group=session.group;
  if(group?.sessions.get(session.id)===session){
   group.sessions.delete(session.id);
   if(!group.sessions.size){clearInterval(group.timer);groups.delete(group.code);}
  }
 };
 const closeGroup=(group,error,status)=>{
  clearInterval(group.timer);groups.delete(group.code);
  for(const session of group.sessions.values())fail(session,error,status,false);
 };

 async function flush(group){
  if(group.flushing||!group.sessions.size)return;
  group.flushing=true;
  try{
   const time=now(),writes=[];
   for(const session of group.sessions.values()){
    if(time-session.lastAlive>15000){session.socket.terminate();continue;}
    if(time-session.lastPing>=3000){session.lastPing=time;if(session.socket.readyState===WebSocket.OPEN)session.socket.ping();}
    const pending=session.pending;
    if(pending||time-session.lastPersisted>=1000){
     const value=pending?JSON.parse(pending):null,hasSequence=Number.isInteger(value?.sequence);
     writes.push(statement(group.db,'UPDATE players SET seen = GREATEST(seen, ?), state = CASE WHEN state IS NOT NULL AND (state::JSONB ->> \'finish\') IS NOT NULL THEN state WHEN ? = FALSE THEN state WHEN ? = TRUE AND COALESCE((state::JSONB ->> \'sequence\')::BIGINT, -1) >= ? THEN state ELSE ? END WHERE id = ? AND room = ? AND token_hash = ? AND EXISTS (SELECT 1 FROM rooms WHERE code = ? AND expires > ? AND start_at > 0)',time,!!pending,hasSequence,value?.sequence??-1,pending,session.id,group.code,session.hash,group.code,time));
     session.pending=null;session.lastPersisted=time;
    }
   }
   const responses=await group.db.batch([...writes,statement(group.db,'SELECT * FROM rooms WHERE code = ?',group.code),statement(group.db,privateMembersSQL,group.code)]);
   metrics.databaseBatches++;metrics.flushes++;metrics.updatedPlayers+=writes.length;
   const room=rows(responses[writes.length])[0],members=rows(responses[writes.length+1]);
   if(!room||room.expires<=time){closeGroup(group,'Dieser Rennraum ist abgelaufen.',404);return;}
   if(!room.start_at){closeGroup(group,'Das Rennen wurde noch nicht gestartet.',409);return;}
   group.room=room;
   for(const session of group.sessions.values()){
    const member=members.find(player=>player.id===session.id);
    if(!member||member.token_hash!==session.hash){fail(session,'Der Fahrerzugang ist nicht mehr gültig.',403,false);continue;}
    // Locally validated messages may be newer than this durable checkpoint.
    // Other instances see them on their next shared PostgreSQL roster read.
    if(member.state){
     const durable=JSON.parse(member.state),local=session.player.state?JSON.parse(session.player.state):null;
     // Equal transport duplicates converge on the first durable sequence;
     // unsequenced legacy states retain the existing local-update behavior.
     const sameSequence=Number.isInteger(durable.sequence)&&durable.sequence===local?.sequence;
     if(durable.finish!==null||sameSequence||(durable.sequence??-1)>(local?.sequence??-1))session.player.state=member.state;
    }
    if(session.player.state)member.state=session.player.state;
    member.seen=Math.max(member.seen,session.lastAlive);
   }
   const snapshot=await roomSnapshot(group.db,room,null,time,members);
   for(const session of group.sessions.values())if(members.some(member=>member.id===session.id&&member.token_hash===session.hash))send(session.socket,{type:'snapshot',...snapshot,host:snapshot.hostId===session.id,transport:'websocket'});
   group.failures=0;
  }catch(error){
   console.error('Breuer realtime checkpoint:',error.name);
   // Close and let the browser use the independently working HTTP fallback.
   // Never keep broadcasting an isolated in-memory room after a DB failure.
   closeGroup(group,'Die Direktverbindung ist gerade nicht verfügbar. HTTP übernimmt.',503);
  }finally{group.flushing=false;}
 }

 server.on('upgrade',(request,socket,head)=>{
  let url;
  try{const proto=request.headers['x-forwarded-proto']?.split(',')[0]|| (request.socket.encrypted?'https':'http');url=new URL(request.url,`${proto}://${request.headers.host}`);}catch{socket.destroy();return;}
  if(url.pathname!=='/api/realtime'||url.search||!isAllowedOrigin(request.headers.origin,url.origin)||connections.size>=maxConnections){socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');socket.destroy();return;}
  wss.handleUpgrade(request,socket,head,client=>wss.emit('connection',client,request));
 });

 wss.on('connection',socket=>{
  metrics.connections++;
  const session={socket,id:null,group:null,helloPending:false,pending:null,lastAlive:now(),lastPing:now(),lastPersisted:now(),windowAt:now(),frames:0};
  connections.add(session);
  session.authTimer=setTimeout(()=>fail(session,'Bitte zuerst den Fahrerzugang senden.',403),authTimeoutMs);session.authTimer.unref?.();
  session.rotateTimer=setTimeout(()=>{send(socket,{type:'reconnect',reason:'rotation',retryAfter:250});socket.close(1012,'Verbindung erneuern');},lifetimeMs);session.rotateTimer.unref?.();
  socket.on('close',()=>remove(session));socket.on('error',()=>remove(session));
  socket.on('pong',()=>session.lastAlive=now());
  socket.on('message',async(raw,isBinary)=>{
   const time=now();
   if(time-session.windowAt>=1000){session.windowAt=time;session.frames=0;}
   if(++session.frames>24){fail(session,'Zu viele Zustandsnachrichten.',429);return;}
   if(isBinary){fail(session,'JSON-Nachricht erwartet.');return;}
   let message;
   try{message=JSON.parse(raw.toString());if(!message||typeof message!=='object'||Array.isArray(message))throw Error();}catch{fail(session,'Ungültige Zustandsnachricht.');return;}
   if(!session.id){
    if(session.helloPending)return;
    if(message.action!=='hello'||typeof message.code!=='string'||! /^[A-Z2-9]{6}$/.test(message.code)){fail(session,'Bitte zuerst den Fahrerzugang senden.',403);return;}
    session.helloPending=true;
    try{
     const db=await getDatabase();
     if(!db){fail(session,'Der Online-Rennserver ist noch nicht verfügbar.',503,true);return;}
     const authenticated=await authenticateDriver(db,message.code,message.id,message.token);
     if(!authenticated){fail(session,'Ungültiger Fahrerzugang.',403);return;}
     const {room,player}=authenticated,current=now();
     if(room.expires<=current){fail(session,'Dieser Rennraum ist abgelaufen.',404);return;}
     if(!room.start_at){fail(session,'Das Rennen wurde noch nicht gestartet.',409);return;}
     if(message.trackVersion&&message.trackVersion!==room.track_version){fail(session,'Die Strecke wurde aktualisiert. Bitte das Spiel neu laden.',409);return;}
     const result=await db.batch([
      statement(db,'UPDATE players SET seen = GREATEST(seen, ?) WHERE id = ? AND room = ? AND token_hash = ?',current,player.id,room.code,player.token_hash),
      statement(db,privateMembersSQL,room.code)
     ]);
     const members=rows(result[1]),confirmedPlayer=members.find(member=>member.id===player.id&&member.token_hash===player.token_hash);
     if(!confirmedPlayer){fail(session,'Der Fahrerzugang ist nicht mehr gültig.',403);return;}
     if(socket.readyState!==WebSocket.OPEN)return;
     clearTimeout(session.authTimer);
     let group=groups.get(room.code);
     if(!group){
      group={code:room.code,db,room,sessions:new Map(),flushing:false};groups.set(room.code,group);
      group.timer=setInterval(()=>void flush(group),intervalMs);group.timer.unref?.();
     }
     const previous=group.sessions.get(player.id);
     if(previous&&previous!==session){send(previous.socket,{type:'error',error:'Der Fahrer ist jetzt über eine neue Verbindung verbunden.',status:409,retry:false});previous.socket.close(1008,'Verbindung ersetzt');}
     // HTTP fallback can advance this driver while hello is authenticating.
     // Validate from exactly the same durable state that this hello confirms.
     Object.assign(session,{id:player.id,hash:player.token_hash,group,player:{...confirmedPlayer,seen:Math.max(confirmedPlayer.seen,current)},lastAlive:current,lastPersisted:current});
     group.sessions.set(player.id,session);
     const snapshot=await roomSnapshot(db,room,player.id,current,members);
     send(socket,{type:'snapshot',...snapshot,transport:'websocket'});
    }catch(error){console.error('Breuer realtime auth:',error.name);fail(session,'Die Direktverbindung ist gerade nicht verfügbar.',503,true);}
    finally{session.helloPending=false;}
    return;
   }
   if(message.action!=='state'){fail(session,'Diese Nachricht gehört nicht zum Rennzustand.');return;}
   if(session.group.room.expires<=time){fail(session,'Dieser Rennraum ist abgelaufen.',404);return;}
   try{
    const state=validateStateUpdate(message.state,session.player,session.group.room,time);
    session.player.state=state;session.player.seen=time;session.pending=state;session.lastAlive=time;metrics.acceptedStates++;
   }catch(error){fail(session,error.message,400,false);}
  });
 });

 server.realtimeStats=()=>({...metrics,rooms:groups.size,openConnections:connections.size});
 server.closeRealtime=()=>{for(const session of connections)session.socket.terminate();for(const group of groups.values())clearInterval(group.timer);groups.clear();wss.close();};
 return server;
}
