import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {CARS,HANDLING_VERSION} from '../src/car-catalog.js';
import {TRACKS} from '../src/tracks.js';
import {RACE_LAP_OPTIONS,RACE_DIFFICULTIES} from '../src/race-config.js';
import {recordCategory} from '../src/race-modes.js';
import {isAllowedOrigin} from './rooms.js';

// Full Unicode case folding needs a few expansions and Cherokee mappings in
// addition to JavaScript's Unicode lowercasing. NFKC also merges presentation
// forms, fullwidth text and compatibility ligatures before names are reserved.
const CASE_FOLD_SPECIALS={"\u00b5":"\u03bc","\u00df":"ss","\u0149":"\u02bcn","\u017f":"s","\u01f0":"j\u030c","\u0345":"\u03b9","\u0390":"\u03b9\u0308\u0301","\u03b0":"\u03c5\u0308\u0301","\u03c2":"\u03c3","\u03d0":"\u03b2","\u03d1":"\u03b8","\u03d5":"\u03c6","\u03d6":"\u03c0","\u03f0":"\u03ba","\u03f1":"\u03c1","\u03f5":"\u03b5","\u0587":"\u0565\u0582","\u13f8":"\u13f0","\u13f9":"\u13f1","\u13fa":"\u13f2","\u13fb":"\u13f3","\u13fc":"\u13f4","\u13fd":"\u13f5","\u1c80":"\u0432","\u1c81":"\u0434","\u1c82":"\u043e","\u1c83":"\u0441","\u1c84":"\u0442","\u1c85":"\u0442","\u1c86":"\u044a","\u1c87":"\u0463","\u1c88":"\ua64b","\u1e96":"h\u0331","\u1e97":"t\u0308","\u1e98":"w\u030a","\u1e99":"y\u030a","\u1e9a":"a\u02be","\u1e9b":"\u1e61","\u1f50":"\u03c5\u0313","\u1f52":"\u03c5\u0313\u0300","\u1f54":"\u03c5\u0313\u0301","\u1f56":"\u03c5\u0313\u0342","\u1f80":"\u1f00\u03b9","\u1f81":"\u1f01\u03b9","\u1f82":"\u1f02\u03b9","\u1f83":"\u1f03\u03b9","\u1f84":"\u1f04\u03b9","\u1f85":"\u1f05\u03b9","\u1f86":"\u1f06\u03b9","\u1f87":"\u1f07\u03b9","\u1f90":"\u1f20\u03b9","\u1f91":"\u1f21\u03b9","\u1f92":"\u1f22\u03b9","\u1f93":"\u1f23\u03b9","\u1f94":"\u1f24\u03b9","\u1f95":"\u1f25\u03b9","\u1f96":"\u1f26\u03b9","\u1f97":"\u1f27\u03b9","\u1fa0":"\u1f60\u03b9","\u1fa1":"\u1f61\u03b9","\u1fa2":"\u1f62\u03b9","\u1fa3":"\u1f63\u03b9","\u1fa4":"\u1f64\u03b9","\u1fa5":"\u1f65\u03b9","\u1fa6":"\u1f66\u03b9","\u1fa7":"\u1f67\u03b9","\u1fb2":"\u1f70\u03b9","\u1fb3":"\u03b1\u03b9","\u1fb4":"\u03ac\u03b9","\u1fb6":"\u03b1\u0342","\u1fb7":"\u03b1\u0342\u03b9","\u1fbe":"\u03b9","\u1fc2":"\u1f74\u03b9","\u1fc3":"\u03b7\u03b9","\u1fc4":"\u03ae\u03b9","\u1fc6":"\u03b7\u0342","\u1fc7":"\u03b7\u0342\u03b9","\u1fd2":"\u03b9\u0308\u0300","\u1fd3":"\u03b9\u0308\u0301","\u1fd6":"\u03b9\u0342","\u1fd7":"\u03b9\u0308\u0342","\u1fe2":"\u03c5\u0308\u0300","\u1fe3":"\u03c5\u0308\u0301","\u1fe4":"\u03c1\u0313","\u1fe6":"\u03c5\u0342","\u1fe7":"\u03c5\u0308\u0342","\u1ff2":"\u1f7c\u03b9","\u1ff3":"\u03c9\u03b9","\u1ff4":"\u03ce\u03b9","\u1ff6":"\u03c9\u0342","\u1ff7":"\u03c9\u0342\u03b9","\uab70":"\u13a0","\uab71":"\u13a1","\uab72":"\u13a2","\uab73":"\u13a3","\uab74":"\u13a4","\uab75":"\u13a5","\uab76":"\u13a6","\uab77":"\u13a7","\uab78":"\u13a8","\uab79":"\u13a9","\uab7a":"\u13aa","\uab7b":"\u13ab","\uab7c":"\u13ac","\uab7d":"\u13ad","\uab7e":"\u13ae","\uab7f":"\u13af","\uab80":"\u13b0","\uab81":"\u13b1","\uab82":"\u13b2","\uab83":"\u13b3","\uab84":"\u13b4","\uab85":"\u13b5","\uab86":"\u13b6","\uab87":"\u13b7","\uab88":"\u13b8","\uab89":"\u13b9","\uab8a":"\u13ba","\uab8b":"\u13bb","\uab8c":"\u13bc","\uab8d":"\u13bd","\uab8e":"\u13be","\uab8f":"\u13bf","\uab90":"\u13c0","\uab91":"\u13c1","\uab92":"\u13c2","\uab93":"\u13c3","\uab94":"\u13c4","\uab95":"\u13c5","\uab96":"\u13c6","\uab97":"\u13c7","\uab98":"\u13c8","\uab99":"\u13c9","\uab9a":"\u13ca","\uab9b":"\u13cb","\uab9c":"\u13cc","\uab9d":"\u13cd","\uab9e":"\u13ce","\uab9f":"\u13cf","\uaba0":"\u13d0","\uaba1":"\u13d1","\uaba2":"\u13d2","\uaba3":"\u13d3","\uaba4":"\u13d4","\uaba5":"\u13d5","\uaba6":"\u13d6","\uaba7":"\u13d7","\uaba8":"\u13d8","\uaba9":"\u13d9","\uabaa":"\u13da","\uabab":"\u13db","\uabac":"\u13dc","\uabad":"\u13dd","\uabae":"\u13de","\uabaf":"\u13df","\uabb0":"\u13e0","\uabb1":"\u13e1","\uabb2":"\u13e2","\uabb3":"\u13e3","\uabb4":"\u13e4","\uabb5":"\u13e5","\uabb6":"\u13e6","\uabb7":"\u13e7","\uabb8":"\u13e8","\uabb9":"\u13e9","\uabba":"\u13ea","\uabbb":"\u13eb","\uabbc":"\u13ec","\uabbd":"\u13ed","\uabbe":"\u13ee","\uabbf":"\u13ef","\ufb00":"ff","\ufb01":"fi","\ufb02":"fl","\ufb03":"ffi","\ufb04":"ffl","\ufb05":"st","\ufb06":"st","\ufb13":"\u0574\u0576","\ufb14":"\u0574\u0565","\ufb15":"\u0574\u056b","\ufb16":"\u057e\u0576","\ufb17":"\u0574\u056d"};
const RUN_TTL=4*60*60*1000;
const MAX_TIME=7200;
const PROFILE_PATTERN=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TOKEN_PATTERN=/^[0-9a-f]{64}$/;
const VERSION_PATTERN=/^[a-zA-Z0-9._-]{1,64}$/;
const ROUTES=new Set(['/api/profiles','/api/profiles/session','/api/leaderboards','/api/runs/start','/api/runs/finish']);
const CATEGORY_KEYS=['trackId','trackVersion','handlingVersion','car','laps','rules','mode','raceType','opponents','difficulty','assists'];
const MODES=['race','time-trial','cup','challenge'];
const table=name=>'breuer_gp.'+name;
const statement=(db,sql,...params)=>db.prepare(sql).bind(...params);
const get=(db,sql,...params)=>statement(db,sql,...params).first();
const resultRows=result=>result?.rows||result?.results||[];
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
const hash=value=>createHash('sha256').update(value).digest('hex');
const publicProfile=row=>({id:row.id,name:row.name,createdAt:Number(row.created_at)});
const answer=(data,status=200,origin=null)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...(origin?{'Access-Control-Allow-Origin':origin,'Vary':'Origin'}:{})}});
class RequestError extends Error{
 constructor(status,code,message){super(message);this.status=status;this.code=code;}
}
function fail(status,code,message){throw new RequestError(status,code,message);}
function keys(value,allowed,label='Anfrage'){
 if(!object(value)||Object.keys(value).some(key=>!allowed.includes(key)))fail(400,'INVALID_REQUEST',label+' enthält ungültige Felder.');
}

export function normalizeProfileName(value){
 if(typeof value!=='string')fail(400,'INVALID_NAME','Bitte wähle einen Fahrernamen mit 2 bis 20 Zeichen.');
 const name=value.normalize('NFKC').replace(/[\s\p{White_Space}]+/gu,' ').trim();
 if([...name].length<2||[...name].length>20||!/[\p{L}\p{N}]/u.test(name)||!/^[-\p{L}\p{N}\p{M} _.'’]+$/u.test(name))fail(400,'INVALID_NAME','Dein Fahrername braucht 2 bis 20 Zeichen: Buchstaben, Zahlen, Leerzeichen oder . _ -');
 const nameKey=[...name.toLowerCase()].map(character=>CASE_FOLD_SPECIALS[character]??character).join('').normalize('NFKC');
 return {name,nameKey};
}

/** Validate the exact existing recordCategory, rather than accepting arbitrary JSON. */
export function validateRecordCategory(value,{current=false}={}){
 keys(value,CATEGORY_KEYS,'Die Rekordkategorie');
 const track=TRACKS.find(item=>item.id===value.trackId);
 const car=typeof value.car==='string'?(CARS.find(item=>item.id===value.car)??(/^(0|[1-9]\d*)$/.test(value.car)?CARS[Number(value.car)]:null)):null;
 if(!track||!car||typeof value.trackVersion!=='string'||!VERSION_PATTERN.test(value.trackVersion)
  ||value.handlingVersion!==undefined&&(typeof value.handlingVersion!=='string'||!VERSION_PATTERN.test(value.handlingVersion))
  ||!RACE_LAP_OPTIONS.includes(value.laps)||!MODES.includes(value.mode)||!['action','classic'].includes(value.rules)
  ||!['solo','online'].includes(value.raceType)||!Number.isInteger(value.opponents)||value.opponents<0||value.opponents>5
  ||!RACE_DIFFICULTIES.includes(value.difficulty))fail(400,'INVALID_CATEGORY','Die Renneinstellungen für diese Bestenliste sind ungültig.');
 keys(value.assists,['autoGas','autoDrift'],'Die Fahrhilfen');
 if(typeof value.assists.autoGas!=='boolean'||typeof value.assists.autoDrift!=='boolean')fail(400,'INVALID_CATEGORY','Die Fahrhilfen für diese Bestenliste sind ungültig.');
 if(['time-trial','challenge'].includes(value.mode)&&(value.opponents!==0||value.rules!=='classic'))fail(400,'INVALID_CATEGORY','Zeitfahren und Challenges brauchen freie Strecke ohne Gegner.');
 if(current&&(value.trackVersion!==track.version||value.handlingVersion!==HANDLING_VERSION))fail(409,'CATEGORY_VERSION','Die Spielversion hat sich geändert. Bitte lade das Spiel neu und starte das Rennen erneut.');
 const category=recordCategory(value),json=JSON.stringify(category);
 return {category,json,key:hash(json),track,car};
}

function credentials(body){
 if(typeof body.profileId!=='string'||!PROFILE_PATTERN.test(body.profileId)||typeof body.token!=='string'||!TOKEN_PATTERN.test(body.token))fail(403,'PROFILE_AUTH','Dein Fahrerzugang ist ungültig. Bitte öffne dein gespeichertes Fahrerprofil.');
 return {profileId:body.profileId,tokenHash:hash(body.token)};
}
async function authenticate(db,identity){
 const profile=await get(db,`SELECT id, name, created_at FROM ${table('driver_profiles')} WHERE id = ? AND token_hash = ?`,identity.profileId,identity.tokenHash);
 if(!profile)fail(403,'PROFILE_AUTH','Dein Fahrerzugang ist ungültig. Bitte öffne dein gespeichertes Fahrerprofil.');
 return profile;
}
function validateResult(body,category){
 if(!finite(body.time)||body.time<=0||body.time>MAX_TIME||!Array.isArray(body.sectors)||body.sectors.length!==category.laps*3
  ||body.sectors.some(value=>!finite(value)||value<=0||value>MAX_TIME))fail(400,'INVALID_RESULT','Die Rennzeit oder die Sektorzeiten sind ungültig.');
 const total=body.sectors.reduce((sum,value)=>sum+value,0);
 if(Math.abs(total-body.time)>.25)fail(400,'INVALID_RESULT','Die Sektorzeiten passen nicht zur gesamten Rennzeit.');
 const track=TRACKS.find(item=>item.id===category.trackId);
 // The actual simulation caps normal/boosted vehicles below 60 m/s. A small
 // allowance covers corner projection and sector interpolation, not instant wins.
 if(body.time<Math.max(8,track.length*category.laps/60-1)
  ||body.sectors.some(value=>value<Math.max(.5,track.length/3/60*.5)))fail(400,'IMPLAUSIBLE_RESULT','Diese Rennzeit ist für die gewählte Strecke nicht plausibel.');
 const sectors=body.sectors.map(value=>value===0?0:value);
 return {time:body.time,sectors,json:JSON.stringify(sectors),resultHash:hash(JSON.stringify({time:body.time,sectors}))};
}

async function leaderboard(db,category,profileId=null,limit=10){
 const row=await get(db,`WITH ranked AS (
  SELECT (ROW_NUMBER() OVER (ORDER BY r.time, r.updated_at, r.profile_id))::INTEGER AS rank,
   r.profile_id AS "profileId", p.name, r.time, r.sectors::JSONB AS sectors, r.updated_at AS "updatedAt"
  FROM ${table('leaderboard_records')} r JOIN ${table('driver_profiles')} p ON p.id = r.profile_id
  WHERE r.category_key = ?
 ) SELECT
  COALESCE(JSONB_AGG(TO_JSONB(ranked) ORDER BY rank) FILTER (WHERE rank <= ?), '[]'::JSONB) AS top,
  (JSONB_AGG(TO_JSONB(ranked)) FILTER (WHERE "profileId" = ?))->0 AS own,
  COUNT(*)::INTEGER AS "totalPlayers" FROM ranked`,category.key,limit,profileId);
 return {category:category.category,top:row.top??[],own:row.own??null,totalPlayers:row.totalPlayers,serverTime:Date.now()};
}

export const isLeaderboardPath=path=>ROUTES.has(path);

export async function handleLeaderboardsAPI(request,env={}){
 const url=new URL(request.url),origin=request.headers.get('Origin');
 if(!isAllowedOrigin(origin,url.origin))return answer({error:'Diese Herkunft ist nicht freigegeben.'},403);
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':origin||url.origin,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'3600','Vary':'Origin'}});
 if(request.method!=='POST')return answer({error:'Bitte POST verwenden.'},405,origin);
 if(!ROUTES.has(url.pathname))return answer({error:'Diese Rennfunktion gibt es nicht.'},404,origin);
 if(!(request.headers.get('Content-Type')||'').includes('application/json'))return answer({error:'JSON erwartet.'},415,origin);
 let body;
 try{
  const raw=await request.text();
  if(raw.length>12000)return answer({error:'Anfrage zu groß.'},413,origin);
  body=JSON.parse(raw);
  if(!object(body))throw Error();
 }catch{return answer({error:'Ungültige Anfrage.'},400,origin);}
 try{
  const path=url.pathname;
  let identity,category,profileName;
  if(path==='/api/profiles'){
   keys(body,['name']);profileName=normalizeProfileName(body.name);
  }else if(path==='/api/profiles/session'){
   keys(body,['profileId','token']);identity=credentials(body);
  }else if(path==='/api/leaderboards'){
   keys(body,['category','profileId','limit']);category=validateRecordCategory(body.category);
   if(body.profileId!=null&&(typeof body.profileId!=='string'||!PROFILE_PATTERN.test(body.profileId)))fail(400,'INVALID_PROFILE','Der Fahrer für diesen Rang ist ungültig.');
   if(body.limit!==undefined&&(!Number.isInteger(body.limit)||body.limit<1||body.limit>25))fail(400,'INVALID_LIMIT','Die Bestenliste kann 1 bis 25 Fahrer anzeigen.');
  }else if(path==='/api/runs/start'){
   keys(body,['profileId','token','category']);
   if(body.profileId!=null||body.token!=null)identity=credentials(body);
   category=validateRecordCategory(body.category,{current:true});
  }else{
   keys(body,['profileId','token','runId','runToken','time','sectors']);identity=credentials(body);
   if(body.runToken!=null&&(typeof body.runToken!=='string'||!TOKEN_PATTERN.test(body.runToken)))fail(403,'RUN_AUTH','Dein privates Rennticket ist ungültig. Starte ein neues Rennen.');
   if(typeof body.runId!=='string'||!PROFILE_PATTERN.test(body.runId))fail(400,'INVALID_RUN','Dieses Rennticket ist ungültig.');
   if(!finite(body.time)||body.time<=0||body.time>MAX_TIME||!Array.isArray(body.sectors)||body.sectors.length>30)fail(400,'INVALID_RESULT','Die Rennzeit oder die Sektorzeiten sind ungültig.');
  }
  const db=env.DB||await env.getDatabase?.();
  if(!db)return answer({error:'Fahrerprofile und Online-Bestenlisten sind gerade nicht verfügbar.'},503,origin);
  const now=Date.now();
  if(path==='/api/profiles'){
   const id=randomUUID(),token=randomBytes(32).toString('hex');
   try{
    const profile=await get(db,`INSERT INTO ${table('driver_profiles')} (id, name, name_key, token_hash, created_at) VALUES (?, ?, ?, ?, ?) RETURNING id, name, created_at`,id,profileName.name,profileName.nameKey,hash(token),now);
    return answer({profile:publicProfile(profile),token},201,origin);
   }catch(error){
    if(error.code==='23505')fail(409,'NAME_TAKEN','Dieser Fahrername ist bereits vergeben. Bitte wähle einen anderen Namen.');
    throw error;
   }
  }
  if(path==='/api/leaderboards')return answer(await leaderboard(db,category,body.profileId??null,body.limit??10),200,origin);
  const profile=identity?await authenticate(db,identity):null;
  if(path==='/api/profiles/session')return answer({profile:publicProfile(profile)},200,origin);
  if(path==='/api/runs/start'){
   const id=randomUUID(),expiresAt=now+RUN_TTL,runToken=profile?null:randomBytes(32).toString('hex');
   const results=await db.batch([
    statement(db,`DELETE FROM ${table('leaderboard_runs')} WHERE finished_at IS NULL AND expires_at < ?`,now),
    statement(db,`INSERT INTO ${table('leaderboard_runs')} (id, profile_id, run_token_hash, category_key, category, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,id,profile?.id??null,runToken?hash(runToken):null,category.key,category.json,now,expiresAt)
   ]);
   if(!resultRows(results[1])[0])throw Error('Run ticket was not created');
   return answer({runId:id,...(runToken?{runToken}:{}),createdAt:now,expiresAt,category:category.category},201,origin);
  }
  const runTokenHash=body.runToken?hash(body.runToken):null;
  const run=await get(db,`SELECT id, profile_id, category_key, category, created_at, expires_at, finished_at, time, sectors, result_hash FROM ${table('leaderboard_runs')} WHERE id = ? AND (profile_id = ? OR (profile_id IS NULL AND run_token_hash = ?))`,body.runId,profile.id,runTokenHash);
  if(!run)fail(404,'RUN_NOT_FOUND','Dieses Rennticket gehört nicht zu deinem Profil oder ist nicht mehr verfügbar.');
  category=validateRecordCategory(JSON.parse(run.category));
  const result=validateResult(body,category.category);
  let duplicate=false,improved=false;
  if(run.finished_at!==null){
   if(run.result_hash!==result.resultHash)fail(409,'RUN_ALREADY_FINISHED','Dieses Rennen wurde bereits mit einem anderen Ergebnis gespeichert. Starte ein neues Rennen.');
   duplicate=true;
  }else{
   if(run.expires_at<now)fail(410,'RUN_EXPIRED','Dein Rennticket ist abgelaufen. Starte ein neues Rennen für die Bestenliste.');
   if(result.time>(now-run.created_at)/1000+1.5)fail(400,'RUN_TOO_EARLY','Das Rennen kann noch nicht so lange gelaufen sein. Bitte fahre erst bis ins Ziel.');
   // One SQL statement consumes a ticket and updates its best result atomically.
   // PostgreSQL serializes both a duplicate ticket and concurrent category UPSERTs.
   const accepted=await get(db,`WITH completed AS (
    UPDATE ${table('leaderboard_runs')} SET profile_id = COALESCE(profile_id, ?), finished_at = ?, time = ?, sectors = ?, result_hash = ?
    WHERE id = ? AND (profile_id = ? OR (profile_id IS NULL AND run_token_hash = ?)) AND finished_at IS NULL AND expires_at >= ?
    RETURNING id, profile_id, category_key, category, time, sectors, finished_at
   ), improved AS (
    INSERT INTO ${table('leaderboard_records')} AS existing (category_key, profile_id, category, time, sectors, run_id, updated_at)
    SELECT category_key, profile_id, category, time, sectors, id, finished_at FROM completed
    ON CONFLICT (category_key, profile_id) DO UPDATE SET
     category = EXCLUDED.category, time = EXCLUDED.time, sectors = EXCLUDED.sectors, run_id = EXCLUDED.run_id, updated_at = EXCLUDED.updated_at
    WHERE EXCLUDED.time < existing.time - 0.000001
    RETURNING profile_id
   ) SELECT id, EXISTS (SELECT 1 FROM improved) AS improved FROM completed`,profile.id,now,result.time,result.json,result.resultHash,run.id,profile.id,runTokenHash,now);
   if(accepted)improved=!!accepted.improved;
   else{
    const stored=await get(db,`SELECT finished_at, result_hash FROM ${table('leaderboard_runs')} WHERE id = ? AND profile_id = ?`,run.id,profile.id);
    if(!stored?.finished_at||stored.result_hash!==result.resultHash)fail(409,'RUN_ALREADY_FINISHED','Dieses Rennen wurde bereits mit einem anderen Ergebnis gespeichert. Starte ein neues Rennen.');
    duplicate=true;
   }
  }
  const board=await leaderboard(db,category,profile.id,10);
  return answer({accepted:true,improved,duplicate,record:board.own,rank:board.own?.rank??null},200,origin);
 }catch(error){
  if(error instanceof RequestError)return answer({error:error.message,code:error.code},error.status,origin);
  console.error('Breuer leaderboard API:',error.name);
  return answer({error:'Die Online-Bestenliste antwortet gerade nicht. Dein Rennen und lokale Rekorde bleiben verfügbar.'},503,origin);
 }
}
