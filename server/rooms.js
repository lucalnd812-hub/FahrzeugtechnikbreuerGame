import {CARS} from '../src/car-catalog.js';
import {DEFAULT_RACE_CONFIG,normalizeRaceConfig,getTrackMeta} from '../src/race-config.js';

const TTL=2*60*60*1000,ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',CAR_COUNT=CARS.length,CONNECTED_FOR=12000,HOST_GRACE_FOR=45000,REMOVE_AFTER=45000;
const answer=(data,status=200,origin=null)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...(origin?{'Access-Control-Allow-Origin':origin,'Vary':'Origin'}:{})}});
const randomToken=()=>Array.from(crypto.getRandomValues(new Uint8Array(24)),n=>n.toString(16).padStart(2,'0')).join('');
const tokenHash=async token=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),n=>n.toString(16).padStart(2,'0')).join('');
const roomCode=()=>Array.from(crypto.getRandomValues(new Uint8Array(6)),n=>ALPHABET[n%ALPHABET.length]).join('');
const cleanName=value=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,20)||'Fahrer':'Fahrer';
const validCar=value=>Number.isInteger(value)&&value>=0&&value<CAR_COUNT;
const get=(db,sql,...params)=>db.prepare(sql).bind(...params).first();
const all=async(db,sql,...params)=>(await db.prepare(sql).bind(...params).all()).results;
const changeCount=result=>result?.meta?.changes??result?.rowCount??0;
const rows=result=>result?.rows||result?.results||[];
export const normalizeRoomConfig=input=>normalizeRaceConfig({...input,mode:'race',opponents:0});
export const storedConfig=room=>{try{return normalizeRoomConfig(JSON.parse(room.config));}catch{return normalizeRoomConfig(DEFAULT_RACE_CONFIG);}};
const statement=(db,sql,...params)=>db.prepare(sql).bind(...params);
const lockedBatch=(db,code,statements)=>db.roomTransaction?db.roomTransaction(code,statements):db.batch(statements);
const membersQuery='SELECT id, name, car, joined, seen, ready, state FROM players WHERE room = ? ORDER BY joined, id LIMIT 6';
export const isAllowedOrigin=(origin,base)=>!origin||origin===base||origin==='https://www.fahrzeugtechnikbreuer.de'||origin==='https://fahrzeugtechnikbreuer.de'||/^https:\/\/[a-z0-9.-]+\.filesusr\.com$/.test(origin);

const driverIdentity=result=>result?{room:result,player:{...result,id:result.player_id}}:null;
async function credentialHash(id,token){
 if(typeof id!=='string'||id.length>80||typeof token!=='string'||!/^[a-f0-9]{48}$/.test(token))return null;
 return tokenHash(token);
}
export async function authenticateDriver(db,code,id,token){
 const hash=await credentialHash(id,token);
 if(!hash)return null;
 return driverIdentity(await get(db,'SELECT r.*, p.id AS player_id, p.name, p.car, p.joined, p.seen, p.ready, p.state, p.token_hash FROM rooms r JOIN players p ON p.room = r.code WHERE r.code = ? AND p.id = ? AND p.token_hash = ?',code,id,hash));
}

async function heartbeatDriver(db,code,id,token,now){
 const hash=await credentialHash(id,token);
 if(!hash)return null;
 // Lobby polling needs no previous physics state: authenticate, refresh
 // presence and return the roster in one database HTTP transaction.
 const result=await db.batch([
  statement(db,'UPDATE players p SET seen = GREATEST(p.seen, ?) FROM rooms r WHERE p.room = r.code AND r.code = ? AND p.id = ? AND p.token_hash = ? RETURNING r.*, p.id AS player_id, p.name, p.car, p.joined, p.seen, p.ready, p.state, p.token_hash',now,code,id,hash),
  statement(db,membersQuery,code)
 ]);
 const identity=driverIdentity(rows(result[0])[0]);
 return identity?{...identity,members:rows(result[1])}:null;
}

export function sanitizeState(state,id,input=DEFAULT_RACE_CONFIG,trackLength){
 if(!state||typeof state!=='object'||Array.isArray(state))throw Error('Ungültiger Rennzustand.');
 const config=normalizeRaceConfig(input),length=trackLength||getTrackMeta(config.trackId).length,total=length*config.laps;
 const ranges={x:[-4000,4000],z:[-4000,4000],angle:[-10000,10000],speed:[0,60],progress:[-total,total+50],shield:[0,8],boost:[0,5],spin:[0,2]};
 const out={};
 for(const [key,[min,max]] of Object.entries(ranges)){
  if(typeof state[key]!=='number'||!Number.isFinite(state[key])||state[key]<min||state[key]>max)throw Error('Ungültiger Rennzustand.');
  out[key]=state[key];
 }
 const gate=state.gate===undefined?Math.max(0,Math.min(config.laps*12,Math.floor(state.progress/(length/12)))):state.gate;
 if(!Number.isInteger(gate)||gate<0||gate>config.laps*12||state.progress>(gate+1)*length/12+30)throw Error('Ungültiger Kontrollpunkt.');
 out.gate=gate;
 out.finish=typeof state.finish==='number'&&Number.isFinite(state.finish)&&state.finish>=Math.max(10,total/60-5)&&state.finish<7200?state.finish:null;
 out.drifting=!!state.drifting;
 if(Number.isInteger(state.sequence)&&state.sequence>=0&&state.sequence<2147483647)out.sequence=state.sequence;
 if(state.raceTime!==undefined){
  if(typeof state.raceTime!=='number'||!Number.isFinite(state.raceTime)||state.raceTime<0||state.raceTime>7200)throw Error('Ungültiger Rennzeitpunkt.');
  out.raceTime=state.raceTime;
 }
 if(state.finishRaceTime!==undefined){
  if(typeof state.finishRaceTime!=='number'||!Number.isFinite(state.finishRaceTime)||state.finishRaceTime<0||state.finishRaceTime>7200)throw Error('Ungültiger Zielzeitpunkt.');
  out.finishRaceTime=state.finishRaceTime;
 }
 out.oil=[];
 if(config.rules==='action'&&Array.isArray(state.oil))for(const oil of state.oil.slice(-8)){
  if(oil&&typeof oil.id==='string'&&/^[a-zA-Z0-9.\-]{1,80}$/.test(oil.id)&&Number.isFinite(oil.x)&&Math.abs(oil.x)<4000&&Number.isFinite(oil.z)&&Math.abs(oil.z)<4000&&Number.isFinite(oil.expires)&&oil.expires>=0&&oil.expires<7200)out.oil.push({id:oil.id,owner:id,x:oil.x,z:oil.z,expires:oil.expires});
 }
 return out;
}

// Both transports use exactly the same plausibility and finish validation.
export function validateStateUpdate(input,player,room,now=Date.now()){
 if(!room.start_at)throw Error('Das Rennen wurde noch nicht gestartet.');
 const config=storedConfig(room),length=room.track_length,total=length*config.laps;
 let state=sanitizeState(input,player.id,config,length);
 const previous=player.state?(typeof player.state==='string'?JSON.parse(player.state):player.state):null;
 // Transport retries may arrive after a much newer HTTP/WS position. They
 // cannot change physics or finish state and must not be judged as movement.
 if(previous&&state.sequence!==undefined&&previous.sequence!==undefined&&state.sequence<=previous.sequence)return JSON.stringify(previous);
 const elapsed=Math.max(0,(now-room.start_at)/1000);
 if(state.raceTime!==undefined&&state.raceTime>elapsed+1)throw Error('Unplausibler Rennzeitpunkt.');
 if(state.finishRaceTime!==undefined&&(state.finishRaceTime>elapsed+1||state.finishRaceTime>(state.raceTime??elapsed)+1))throw Error('Unplausibler Zielzeitpunkt.');
 if(state.raceTime!==undefined){
  if(state.raceTime<elapsed-10){
   if(previous)return JSON.stringify(previous);
   throw Error('Der Rennzustand ist zu alt.');
  }
  if(Number.isFinite(previous?.raceTime)&&state.raceTime<previous.raceTime)throw Error('Der Rennzeitpunkt darf nicht zurücklaufen.');
 }
 state.updatedAt=now;
 if(state.progress>elapsed*60+25)throw Error('Unplausibler Streckensprung.');
 let finishedPreviously=false;
 if(previous){
  const stateAt=Number.isFinite(previous.updatedAt)?previous.updatedAt:player.seen;
  // Bounded capture times preserve real movement duration across delivery
  // channels. Receipt time remains the fallback for existing clients/states.
  const movementTime=state.raceTime!==undefined&&Number.isFinite(previous.raceTime)?state.raceTime-previous.raceTime:(now-stateAt)/1000;
  const maxAdvance=Math.max(20,Math.max(0,movementTime)*60+12);
  const movement=Math.hypot(state.x-previous.x,state.z-previous.z);
  // An 8 m inner line around the sharpest village bend changes its nearest
  // centreline projection by up to 27 m without teleporting the actual car.
  // Only normally moving world coordinates receive this bounded tolerance.
  const maxProjection=maxAdvance+(movement<=Math.max(3,Math.max(0,movementTime)*60+3)?32:0);
  if(Math.abs(state.progress-previous.progress)>maxProjection||movement>maxAdvance+20||state.gate<(previous.gate||0)||state.gate-(previous.gate||0)>Math.ceil(maxProjection/(length/12))+1)throw Error('Unplausibler Streckensprung.');
  if(previous.finish!==null){state=previous;finishedPreviously=true;}
 }
 if(!finishedPreviously&&state.finish!==null){
  const beforeGoal=previous&&(previous.progress<total-3||(previous.gate||0)<config.laps*12);
  const event=state.finishRaceTime;
  const capturedFinish=event!==undefined&&event>=elapsed-10&&Math.abs(state.finish-event)<=3&&!(beforeGoal&&Number.isFinite(previous.raceTime)&&event<previous.raceTime);
  if(state.progress<total-3||state.gate<config.laps*12||!(Math.abs(state.finish-elapsed)<=3||capturedFinish))state.finish=null;
 }
 return JSON.stringify(state);
}

async function transferHost(db,room,members,now){
 const host=members.find(player=>player.id===room.host_id);
 // A brief offline indicator or a slow HTTP response must not steal the host
 // role. Only an active replacement can take over after the full grace period.
 if(host&&host.seen>now-HOST_GRACE_FOR)return room.host_id;
 const replacement=members.find(player=>player.seen>now-CONNECTED_FOR);
 if(!replacement||replacement.id===room.host_id)return room.host_id;
 // Recheck durable presence atomically: a heartbeat can arrive after this
 // snapshot was read. RETURNING also avoids a second read on contention.
 const result=await get(db,'WITH changed AS (UPDATE rooms r SET host_id = ? WHERE code = ? AND host_id = ? AND NOT EXISTS (SELECT 1 FROM players WHERE room = r.code AND id = r.host_id AND seen > ?) AND EXISTS (SELECT 1 FROM players WHERE room = r.code AND id = ? AND seen > ?) RETURNING host_id) SELECT host_id FROM changed UNION ALL SELECT host_id FROM rooms WHERE code = ? AND NOT EXISTS (SELECT 1 FROM changed) LIMIT 1',replacement.id,room.code,room.host_id,now-HOST_GRACE_FOR,replacement.id,now-CONNECTED_FOR,room.code);
 return result?.host_id||room.host_id;
}

export async function roomSnapshot(db,room,id,now,members){
 members??=await all(db,membersQuery,room.code);
 const hostId=await transferHost(db,room,members,now),config=storedConfig(room);
 return {
  code:room.code,hostId,host:hostId===id,config,configRevision:room.config_revision,trackVersion:room.track_version,trackLength:room.track_length,startAt:room.start_at,serverTime:now,pollAfter:room.start_at?180:750,
  players:members.map(player=>({id:player.id,name:player.name,car:player.car,ready:!!player.ready,connected:player.seen>now-CONNECTED_FOR,state:player.state?JSON.parse(player.state):null}))
 };
}

export async function handleAPI(request,env){
 // Position time belongs to receipt, not completion of a potentially slow
 // database authentication. Presence may still use the fresher processing time.
 const receivedAt=Date.now();
 const url=new URL(request.url),origin=request.headers.get('Origin');
 const allowed=isAllowedOrigin(origin,url.origin);
 if(!allowed)return answer({error:'Diese Herkunft ist nicht freigegeben.'},403);
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':origin||url.origin,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'3600','Vary':'Origin'}});
 if(request.method!=='POST')return answer({error:'Bitte POST verwenden.'},405,origin);
 if(!env.DB&&!env.getDatabase)return answer({error:'Der Online-Rennserver ist noch nicht verfügbar.'},503,origin);
 if(!(request.headers.get('Content-Type')||'').includes('application/json'))return answer({error:'JSON erwartet.'},415,origin);
 let body;
 try{const raw=await request.text();if(raw.length>12000)return answer({error:'Anfrage zu groß.'},413,origin);body=JSON.parse(raw);if(!body||typeof body!=='object'||Array.isArray(body))throw Error();}catch{return answer({error:'Ungültige Anfrage.'},400,origin);}
 const path=url.pathname;
 try{
  const db=env.DB||await env.getDatabase();
  if(!db)return answer({error:'Der Online-Rennserver ist noch nicht verfügbar.'},503,origin);
  let now=Date.now();
  if(path==='/api/rooms'){
   if(!validCar(body.car))return answer({error:'Wähle ein gültiges Auto.'},400,origin);
   const config=normalizeRoomConfig(body.config),track=getTrackMeta(config.trackId),id=crypto.randomUUID(),token=randomToken(),hash=await tokenHash(token);let code;
   for(let i=0;i<5;i++){
    const candidate=roomCode();
    const results=await db.batch([
     statement(db,'INSERT INTO rooms (code, host_id, created, expires, start_at, config, track_length, track_version) VALUES (?, ?, ?, ?, 0, ?, ?, ?) ON CONFLICT (code) DO NOTHING',candidate,id,now,now+TTL,JSON.stringify(config),track.length,track.version),
     statement(db,'INSERT INTO players (id, room, name, car, token_hash, joined, seen, ready) SELECT ?, ?, ?, ?, ?, ?, ?, FALSE WHERE EXISTS (SELECT 1 FROM rooms WHERE code = ? AND host_id = ?)',id,candidate,cleanName(body.name),body.car,hash,now,now,candidate,id),
     // The foreign key cascades player cleanup; no pre-read or individual
     // delete transactions are needed for expired rooms.
     statement(db,'DELETE FROM rooms WHERE code IN (SELECT code FROM rooms WHERE expires < ? ORDER BY expires LIMIT 20)',now)
    ]);
    if(changeCount(results[0])){code=candidate;break;}
   }
   if(!code)return answer({error:'Raum konnte nicht angelegt werden. Bitte erneut versuchen.'},503,origin);
   return answer({code,id,token,host:true,hostId:id,config,configRevision:1,trackVersion:track.version,trackLength:track.length,ready:false,startAt:0,serverTime:now},201,origin);
  }
  const match=path.match(/^\/api\/rooms\/([A-Z2-9]{6})\/(join|tick|start|ready|config|leave)$/);
  if(!match)return answer({error:'Unbekannte Rennraum-Anfrage.'},404,origin);
  const [,code,action]=match;
  let room,player,heartbeatMembers;
  if(action==='join'){
   room=await get(db,'SELECT * FROM rooms WHERE code = ?',code);
  }else{
   const heartbeat=action==='tick'&&!body.state&&body.car===undefined&&body.name===undefined&&body.ready===undefined;
   const authenticated=await (heartbeat?heartbeatDriver(db,code,body.id,body.token,now):authenticateDriver(db,code,body.id,body.token));
   if(!authenticated)return answer({error:'Der Fahrerzugang ist abgelaufen oder ungültig. Tritt dem Raum erneut bei.'},403,origin);
   ({room,player}=authenticated);
   heartbeatMembers=authenticated.members;
  }
  // Authentication/database transport time is not driver inactivity.
  now=Date.now();
  if(!room||room.expires<now)return answer({error:'Dieser Raum existiert nicht mehr. Erstelle einen neuen.'},404,origin);
  const config=storedConfig(room);
  if(body.trackVersion&&body.trackVersion!==room.track_version)return answer({error:'Die Strecke wurde aktualisiert. Lade das Spiel neu, damit alle dieselbe Strecke fahren.'},409,origin);
  if(heartbeatMembers)return answer(await roomSnapshot(db,room,player.id,now,heartbeatMembers),200,origin);

  if(action==='join'){
   if(room.start_at)return answer({error:'Das Rennen hat schon begonnen. Stelle eine bestehende Verbindung wieder her oder nutze einen neuen Raum.'},409,origin);
   if(!validCar(body.car))return answer({error:'Wähle ein gültiges Auto.'},400,origin);
   const id=crypto.randomUUID(),token=randomToken(),hash=await tokenHash(token);
   const results=await lockedBatch(db,code,[
    statement(db,'DELETE FROM players WHERE room = ? AND seen < ? AND EXISTS (SELECT 1 FROM rooms WHERE code = ? AND start_at = 0)',code,now-REMOVE_AFTER,code),
    statement(db,'INSERT INTO players (id, room, name, car, token_hash, joined, seen, ready) SELECT ?, ?, ?, ?, ?, ?, ?, FALSE WHERE (SELECT COUNT(*) FROM players WHERE room = ?) < 6 AND (SELECT start_at FROM rooms WHERE code = ?) = 0',id,code,cleanName(body.name),body.car,hash,now,now,code,code),
    statement(db,'SELECT * FROM rooms WHERE code = ?',code),
    statement(db,membersQuery,code)
   ]);
   if(!changeCount(results[1]))return answer({error:'Dieser Raum ist voll oder bereits gestartet.'},409,origin);
   const snapshot=await roomSnapshot(db,rows(results[2])[0],id,Date.now(),rows(results[3]));
   return answer({...snapshot,id,token,ready:false},201,origin);
  }

  if(action==='leave'){
   const results=await lockedBatch(db,code,[
    statement(db,'DELETE FROM players WHERE id = ? AND room = ?',player.id,code),
    statement(db,'UPDATE rooms SET host_id = COALESCE((SELECT id FROM players WHERE room = ? ORDER BY CASE WHEN seen > ? THEN 0 ELSE 1 END, joined, id LIMIT 1), host_id) WHERE code = ? AND host_id = ?',code,now-CONNECTED_FOR,code,player.id),
    statement(db,'DELETE FROM rooms WHERE code = ? AND NOT EXISTS (SELECT 1 FROM players WHERE room = ?)',code,code),
    statement(db,'SELECT host_id FROM rooms WHERE code = ?',code)
   ]);
   const remaining=rows(results[3])[0];
   return answer({left:true,hostId:remaining?.host_id||null,serverTime:now},200,origin);
  }

  if(action==='config'){
   if(room.host_id!==player.id)return answer({error:'Nur der Gastgeber kann die Renneinstellungen ändern.'},403,origin);
   if(room.start_at)return answer({error:'Die Renneinstellungen stehen seit dem Start fest.'},409,origin);
   const updated=normalizeRoomConfig(body.config),track=getTrackMeta(updated.trackId);
   const results=await lockedBatch(db,code,[
    statement(db,'UPDATE rooms SET config = ?, track_length = ?, track_version = ?, config_revision = config_revision + 1 WHERE code = ? AND host_id = ? AND start_at = 0',JSON.stringify(updated),track.length,track.version,code,player.id),
    statement(db,'UPDATE players SET ready = FALSE, seen = CASE WHEN id = ? THEN GREATEST(seen, ?) ELSE seen END WHERE room = ? AND EXISTS (SELECT 1 FROM rooms WHERE code = ? AND host_id = ? AND start_at = 0)',player.id,now,code,code,player.id),
    statement(db,'SELECT * FROM rooms WHERE code = ?',code),
    statement(db,membersQuery,code)
   ]);
   if(!changeCount(results[0]))return answer({error:'Die Renneinstellungen können gerade nicht geändert werden.'},409,origin);
   room=rows(results[2])[0];
   return answer(await roomSnapshot(db,room,player.id,Date.now(),rows(results[3])),200,origin);
  }

  if(action==='start'){
   if(room.host_id!==player.id)return answer({error:'Nur der Gastgeber kann starten.'},403,origin);
   if(room.start_at)return answer({startAt:room.start_at,config,hostId:room.host_id,serverTime:now},200,origin);
   const results=await lockedBatch(db,code,[
    statement(db,'UPDATE players SET seen = GREATEST(seen, ?) WHERE id = ?',now,player.id),
    statement(db,'UPDATE rooms SET start_at = ? WHERE code = ? AND host_id = ? AND start_at = 0 AND (SELECT COUNT(*) FROM players WHERE room = ? AND seen > ?) >= 2 AND NOT EXISTS (SELECT 1 FROM players WHERE room = ? AND seen > ? AND ready = FALSE)',now+4500,code,player.id,code,now-CONNECTED_FOR,code,now-CONNECTED_FOR),
    statement(db,'SELECT * FROM rooms WHERE code = ?',code),
    statement(db,membersQuery,code)
   ]);
   if(!changeCount(results[1]))return answer({error:'Mindestens zwei verbundene Fahrer müssen bereit sein. Bitte alle „Bereit“ drücken.'},409,origin);
   room=rows(results[2])[0];
   return answer(await roomSnapshot(db,room,player.id,Date.now(),rows(results[3])),200,origin);
  }

  if(action==='ready'&&room.start_at)return answer({error:'Das Rennen ist schon gestartet.'},409,origin);
  if(action==='ready'&&typeof body.ready!=='boolean')return answer({error:'Bitte deinen Bereitstatus angeben.'},400,origin);
  if(typeof body.ready==='boolean'&&body.configRevision!==undefined&&body.configRevision!==room.config_revision)return answer({error:'Die Renneinstellungen haben sich geändert. Prüfe sie und drücke erneut „Bereit“.'},409,origin);
  if(body.car!==undefined&&!validCar(body.car))return answer({error:'Wähle ein gültiges Auto.'},400,origin);
  if(room.start_at&&(body.car!==undefined&&body.car!==player.car||body.name!==undefined&&cleanName(body.name)!==player.name))return answer({error:'Auto und Fahrername stehen seit dem Start fest.'},409,origin);

  let stateJSON=player.state;
  if(body.state){
   if(!room.start_at)return answer({error:'Das Rennen wurde noch nicht gestartet.'},409,origin);
   try{stateJSON=validateStateUpdate(body.state,player,room,receivedAt);}catch(error){return answer({error:error.message},400,origin);}
  }
  const changingCar=body.car!==undefined&&body.car!==player.car;
  const changesReady=changingCar||typeof body.ready==='boolean',ready=changingCar?false:body.ready===true;
  const car=body.car??player.car,name=body.name===undefined?player.name:cleanName(body.name);
  const stateObject=stateJSON?JSON.parse(stateJSON):null,hasSequence=Number.isInteger(stateObject?.sequence);
  const statements=[
   statement(db,'UPDATE players SET seen = GREATEST(seen, ?), state = CASE WHEN state IS NOT NULL AND (state::JSONB ->> \'finish\') IS NOT NULL THEN state WHEN ? = FALSE THEN state WHEN ? = TRUE AND COALESCE((state::JSONB ->> \'sequence\')::BIGINT, -1) >= ? THEN state ELSE ? END, ready = CASE WHEN ? = TRUE AND EXISTS (SELECT 1 FROM rooms WHERE code = ? AND start_at = 0 AND config_revision = ?) THEN ? ELSE ready END, car = CASE WHEN ? = TRUE AND EXISTS (SELECT 1 FROM rooms WHERE code = ? AND start_at = 0) THEN ? ELSE car END, name = CASE WHEN ? = TRUE AND EXISTS (SELECT 1 FROM rooms WHERE code = ? AND start_at = 0) THEN ? ELSE name END WHERE id = ?',now,!!body.state,hasSequence,stateObject?.sequence??-1,stateJSON,changesReady,code,body.configRevision??room.config_revision,ready,body.car!==undefined,code,car,body.name!==undefined,code,name,player.id),
   statement(db,'SELECT * FROM rooms WHERE code = ?',code),
   statement(db,membersQuery,code)
  ];
  // One transaction returns the post-update roster. This avoids one network
  // round trip per driver tick, without locking every driver's physics state.
  const results=await (changesReady||body.car!==undefined||body.name!==undefined?lockedBatch(db,code,statements):db.batch(statements)),members=rows(results[2]);
  return answer(await roomSnapshot(db,rows(results[1])[0],player.id,Date.now(),members),200,origin);
 }catch(error){
  console.error('Breuer room API error',error.name);
  return answer({error:'Der Rennserver antwortet gerade nicht. Bitte erneut versuchen.'},503,origin);
 }
}
