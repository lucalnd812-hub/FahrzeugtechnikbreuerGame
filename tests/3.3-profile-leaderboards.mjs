import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import {initializeDatabase,postgresAdapter} from '../server/database.js';
import {handleLeaderboardsAPI} from '../server/leaderboards.js';
import {recordCategory} from '../src/race-modes.js';
import {HANDLING_VERSION} from '../src/car-catalog.js';
import {TRACKS} from '../src/tracks.js';

// The production HTTP handler and SQL execute against an isolated PostgreSQL
// engine. Time is advanced explicitly; no production users/results are created.
const directory=await mkdtemp(join(tmpdir(),'breuer-33-profiles-')),realNow=Date.now;
let clock=realNow(),pg,DB;Date.now=()=>clock;
const identity=driver=>({profileId:driver.profile.id,token:driver.token});
const category=recordCategory({trackId:TRACKS[0].id,trackVersion:TRACKS[0].version,handlingVersion:HANDLING_VERSION,car:0,laps:1,rules:'classic',mode:'time-trial',raceType:'solo',opponents:0,difficulty:.91,assist:true,autoDrift:true});
const toResult=value=>({rows:value.rows,rowCount:value.affectedRows??value.rows.length});
async function open(){
 pg=new PGlite(directory);await pg.waitReady;
 const sql={query(text,params=[]){return {text,params,then(resolve,reject){return pg.query(text,params).then(toResult).then(resolve,reject);}};},transaction(queries){return pg.transaction(async tx=>{const result=[];for(const query of queries)result.push(toResult(await tx.query(query.text,query.params)));return result;});}};
 await initializeDatabase(sql);DB=postgresAdapter(sql);
}
async function request(path,body={},options={}){
 const method=options.method??'POST',response=await handleLeaderboardsAPI(new Request('https://game.test/api'+path,{method,headers:{'Content-Type':'application/json',...options.headers},...(!['GET','HEAD','OPTIONS'].includes(method)?{body:options.raw??JSON.stringify(body)}:{})}),options.env??{DB});
 return {status:response.status,data:response.status===204?null:await response.json(),headers:response.headers};
}
function expect(response,status=200,code){assert.equal(response.status,status,'HTTP status '+response.status+' ('+(response.data?.code??response.data?.error??'no error code')+')');if(code)assert.equal(response.data?.code,code);return response.data;}
async function ticket(driver,selected=category){return expect(await request('/runs/start',{...identity(driver),category:selected}),201);}
const finish=(driver,run,time,sectors=Array(category.laps*3).fill(time/(category.laps*3)))=>request('/runs/finish',{...identity(driver),runId:run.runId,time,sectors});

try{
 await open();
 let databaseCalls=0;const cold={getDatabase(){databaseCalls++;return DB;}};
 expect(await request('/profiles',{name:''},{env:cold}),400,'INVALID_NAME');expect(await request('/profiles',{name:'A'.repeat(21)},{env:cold}),400,'INVALID_NAME');expect(await request('/profiles',{name:'<script>'},{env:cold}),400,'INVALID_NAME');expect(await request('/profiles',{name:'valid',unexpected:true},{env:cold}),400,'INVALID_REQUEST');assert.equal(databaseCalls,0,'Invalid public requests must not wake the database');
 expect(await request('/profiles',{}, {method:'GET'}),405);expect(await request('/profiles',{}, {method:'OPTIONS'}),204);expect(await request('/profiles',{name:'Qa blocked'},{headers:{Origin:'https://unrelated.example'}}),403);expect(await request('/profiles',{name:'Qa type'},{headers:{'Content-Type':'text/plain'}}),415);expect(await request('/profiles',{}, {raw:'{'}),400);expect(await request('/profiles',{}, {raw:'[1]'}),400);expect(await request('/profiles',{}, {raw:JSON.stringify({name:'x'.repeat(12001)})}),413);
 const racers=[];for(let index=1;index<=12;index++)racers.push(expect(await request('/profiles',{name:'QA '+String(index).padStart(2,'0')}),201));
 const first=racers[0];assert.equal(first.profile.name,'QA 01');assert.match(first.token,/^[a-f0-9]{64}$/);assert.match(first.profile.id,/^[a-f0-9-]{36}$/);
 for(const name of ['qa 01','  QA   01  ','ＱＡ ０１'])expect(await request('/profiles',{name}),409,'NAME_TAKEN');
 expect(await request('/profiles',{name:'Straße'}),201);expect(await request('/profiles',{name:'STRASSE'}),409,'NAME_TAKEN');
 expect(await request('/profiles',{name:'Café'}),201);expect(await request('/profiles',{name:'Cafe\u0301'}),409,'NAME_TAKEN');
 const reservations=await Promise.all(Array.from({length:6},()=>request('/profiles',{name:'Concurrent QA'})));assert.equal(reservations.filter(value=>value.status===201).length,1);assert.equal(reservations.filter(value=>value.status===409&&value.data.code==='NAME_TAKEN').length,5,'Concurrent name claims must reserve one profile only');
 const stored=(await pg.query('SELECT name,token_hash FROM breuer_gp.driver_profiles WHERE id=$1',[first.profile.id])).rows[0];assert.notEqual(stored.token_hash,first.token);assert.match(stored.token_hash,/^[a-f0-9]{64}$/);
 const session=expect(await request('/profiles/session',identity(first)));assert.deepEqual(session.profile,first.profile);assert(!('token' in session)&&!('tokenHash' in session.profile)&&!('token_hash' in session.profile));
 expect(await request('/profiles/session',{...identity(first),token:'f'.repeat(64)}),403,'PROFILE_AUTH');expect(await request('/profiles/session',{profileId:first.profile.id,token:racers[1].token}),403,'PROFILE_AUTH');
 const empty=expect(await request('/leaderboards',{category,profileId:first.profile.id}));assert.deepEqual(empty.top,[]);assert.equal(empty.own,null);assert.equal(empty.totalPlayers,0);
 for(const malformed of [{...category,laps:4},{...category,car:'500'},{...category,rules:'invented'},{...category,opponents:2},{...category,assists:{autoGas:'yes',autoDrift:true}},{...category,unknown:true}])expect(await request('/leaderboards',{category:malformed}),400);
 expect(await request('/leaderboards',{category,limit:0}),400,'INVALID_LIMIT');expect(await request('/leaderboards',{category,limit:26}),400,'INVALID_LIMIT');expect(await request('/runs/start',{...identity(first),category:{...category,trackVersion:'stale-version'}}),409,'CATEGORY_VERSION');expect(await request('/runs/start',{...identity(first),category:{...category,handlingVersion:'old-physics'}}),409,'CATEGORY_VERSION');
 const pending=[];for(const racer of racers)pending.push(await ticket(racer));
 expect(await finish(first,pending[0],60),400,'RUN_TOO_EARLY');expect(await finish(first,pending[0],1,[.3,.3,.4]),400,'IMPLAUSIBLE_RESULT');expect(await finish(first,pending[0],60,[20,20]),400,'INVALID_RESULT');expect(await finish(first,pending[0],60,[10,20,20]),400,'INVALID_RESULT');expect(await finish(racers[1],pending[0],60),404,'RUN_NOT_FOUND');
 clock+=200_000;
 for(let index=0;index<racers.length;index++){const time=60+index*5;const accepted=expect(await finish(racers[index],pending[index],time));assert(accepted.accepted&&accepted.improved&&!accepted.duplicate);assert.equal(accepted.record.time,time);assert.equal(accepted.rank,index+1);}
 const board=expect(await request('/leaderboards',{category,profileId:racers[11].profile.id,limit:3}));assert.equal(board.totalPlayers,12);assert.deepEqual(board.top.map(value=>value.rank),[1,2,3]);assert.equal(board.own.rank,12);assert.equal(board.own.name,'QA 12');assert.equal(board.own.time,115);assert(board.top.every(value=>!('token' in value)&&!('token_hash' in value)));
 const duplicate=expect(await finish(first,pending[0],60));assert(duplicate.duplicate&&!duplicate.improved);expect(await finish(first,pending[0],59,[20,20,19]),409,'RUN_ALREADY_FINISHED');
 const slower=await ticket(first);clock+=70_000;const slowerResult=expect(await finish(first,slower,65));assert(!slowerResult.improved);assert.equal(slowerResult.record.time,60);
 const parallel=await Promise.all([ticket(first),ticket(first)]);clock+=70_000;const improvements=await Promise.all([finish(first,parallel[0],59),finish(first,parallel[1],58)]);improvements.forEach(value=>expect(value));assert.equal(expect(await request('/leaderboards',{category,profileId:first.profile.id})).own.time,58,'Concurrent faster finishes must retain the best result');
 const consumed=(await pg.query('SELECT time FROM breuer_gp.leaderboard_runs WHERE id=$1',[pending[0].runId])).rows[0];assert.equal(consumed.time,60,'A later record must not rewrite an earlier completed run');
 for(const change of [{car:'1'},{trackId:TRACKS[1].id,trackVersion:TRACKS[1].version},{laps:5},{handlingVersion:'older-physics'},{raceType:'online'},{assists:{autoGas:false,autoDrift:true}}]){const separate=expect(await request('/leaderboards',{category:{...category,...change},profileId:first.profile.id}));assert.equal(separate.totalPlayers,0);assert.equal(separate.own,null);}
 const expires=await ticket(first);clock+=4*60*60*1000+1;expect(await finish(first,expires,60),410,'RUN_EXPIRED');
 await pg.close();pg=null;await open();assert.equal(expect(await request('/profiles/session',identity(first))).profile.name,'QA 01');const restored=expect(await request('/leaderboards',{category,profileId:first.profile.id}));assert.equal(restored.totalPlayers,12);assert.equal(restored.own.time,58);
 console.log('PASS Production profile/leaderboard API with real PostgreSQL: unique normalized names, concurrent reservations, hashed credentials, auth, exact categories, plausible timed tickets, sector validation, top/own ranks, idempotency, atomic best results, expiry and restart persistence');
 console.log('Isolated local database and controlled server clock; no live deployment, permanent public profiles or physical browser/GPU performance are claimed.');
}finally{Date.now=realNow;await pg?.close();await rm(directory,{recursive:true,force:true});}
