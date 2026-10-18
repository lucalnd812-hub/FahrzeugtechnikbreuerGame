import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import {SCHEMA,initializeDatabase,postgresAdapter} from '../server/database.js';
import {handleLeaderboardsAPI,normalizeProfileName,validateRecordCategory} from '../server/leaderboards.js';
import {handleAPI as roomsAPI} from '../server/rooms.js';
import {CARS,HANDLING_VERSION} from '../src/car-catalog.js';
import {TRACKS} from '../src/tracks.js';
import {recordCategory} from '../src/race-modes.js';

// Real PostgreSQL constraints/CTEs execute locally. No production credentials,
// online service or browser renderer is involved in these regression checks.
const directory=await mkdtemp(join(tmpdir(),'breuer-leaderboards-'));
const realNow=Date.now;
let clock=realNow(),pg,DB,sql,calls;
Date.now=()=>clock;
const result=value=>({rows:value.rows,rowCount:value.affectedRows??value.rows.length});
async function open({legacy=false}={}){
 pg=new PGlite(directory);await pg.waitReady;
 calls={queries:0,transactions:0,texts:[]};
 sql={
  query(text,params=[]){return {text,params,then(resolve,reject){calls.queries++;calls.texts.push(text);return pg.query(text,params).then(result).then(resolve,reject);}};},
  transaction(queries){calls.transactions++;return pg.transaction(async tx=>{const values=[];for(const query of queries){calls.texts.push(query.text);values.push(result(await tx.query(query.text,query.params)));}return values;});}
 };
 if(legacy){
  const firstNewTable=SCHEMA.findIndex(query=>query.includes('CREATE TABLE IF NOT EXISTS breuer_gp.driver_profiles'));
  assert(firstNewTable>0);
  for(const query of SCHEMA.slice(0,firstNewTable))await pg.query(query);
 }else await initializeDatabase(sql);
 DB=postgresAdapter(sql);
}
async function request(path,body={},options={}){
 const response=await handleLeaderboardsAPI(new Request('https://game.test/api'+path,{
  method:options.method??'POST',headers:{'Content-Type':'application/json',...options.headers},
  ...(!['GET','HEAD','OPTIONS'].includes(options.method)?{body:options.raw??JSON.stringify(body)}:{})
 }),options.env??{DB});
 return {status:response.status,data:response.status===204?null:await response.json(),headers:response.headers};
}
const check=(response,status=200)=>{assert.equal(response.status,status,JSON.stringify(response.data));return response.data;};
const credentials=owner=>({profileId:owner.profile.id,token:owner.token});
const profile=async name=>check(await request('/profiles',{name}),201);
const baseCategory=recordCategory({trackId:'lammersdorf',trackVersion:TRACKS[0].version,handlingVersion:HANDLING_VERSION,car:0,laps:1,rules:'action',mode:'race',raceType:'solo',opponents:5,difficulty:.91,assists:{autoGas:true,autoDrift:true}});
const sectors=(time,laps=1)=>Array.from({length:laps*3},()=>time/(laps*3));
const start=async(owner,category=baseCategory)=>check(await request('/runs/start',{...credentials(owner),category}),201);
const finish=(owner,run,time,values=sectors(time,run.category.laps))=>request('/runs/finish',{...credentials(owner),runId:run.runId,...(run.runToken?{runToken:run.runToken}:{}),time,sectors:values});
async function completed(owner,time,category=baseCategory){const run=await start(owner,category);clock+=Math.ceil((time+2)*1000);return check(await finish(owner,run,time));}
const board=(owner=null,category=baseCategory,limit=10)=>request('/leaderboards',{category,limit,...(owner?{profileId:owner.profile.id}:{})}).then(check);

try{
 await open({legacy:true});
 const legacyResponse=await roomsAPI(new Request('https://game.test/api/rooms',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Bestandsfahrer',car:0})}),{DB});
 assert.equal(legacyResponse.status,201);
 const oldDriver=await legacyResponse.json();
 const oldRoom=(await pg.query('SELECT * FROM breuer_gp.rooms WHERE code=$1',[oldDriver.code])).rows;
 const oldPlayers=(await pg.query('SELECT * FROM breuer_gp.players WHERE room=$1',[oldDriver.code])).rows;
 await initializeDatabase(sql);
 assert(calls.texts.some(text=>text.includes('pg_advisory_xact_lock(178514, 1)')),'New tables are migrated under the existing advisory lock');
 assert.deepEqual((await pg.query('SELECT * FROM breuer_gp.rooms WHERE code=$1',[oldDriver.code])).rows,oldRoom);
 assert.deepEqual((await pg.query('SELECT * FROM breuer_gp.players WHERE room=$1',[oldDriver.code])).rows,oldPlayers,'Profile migration must preserve all legacy room credentials and state');
 const migratedTransactions=calls.transactions;
 await initializeDatabase(sql);
 assert.equal(calls.transactions,migratedTransactions,'A warm schema check must not execute more DDL');
 assert.equal((await pg.query("SELECT i.indisunique FROM pg_index i WHERE i.indexrelid='breuer_gp.breuer_profile_name_key'::regclass")).rows[0].indisunique,true);
 console.log('PASS profile migration: additive locked PostgreSQL tables, real unique index and preserved old room rows.');

 const first=await profile('  Max\t  Breuer  ');
 assert.equal(first.profile.name,'Max Breuer');
 assert.equal(first.profile.createdAt,clock);
 assert.match(first.token,/^[a-f0-9]{64}$/);
 const stored=(await pg.query('SELECT * FROM breuer_gp.driver_profiles WHERE id=$1',[first.profile.id])).rows[0];
 assert.equal(stored.token_hash,createHash('sha256').update(first.token).digest('hex'));
 assert.notEqual(stored.token_hash,first.token);
 for(const alias of ['max breuer','MAX BREUER','ＭＡＸ　ＢＲＥＵＥＲ','  Max\nBreuer ','Max\u0085Breuer']){
  const collision=check(await request('/profiles',{name:alias}),409);
  assert.equal(collision.code,'NAME_TAKEN');assert.match(collision.error,/bereits vergeben/);
 }
 for(const [name,alias] of [['Straße','STRASSE'],['ΟΣ','οσ'],['ᎠᎡ','ꭰꭱ'],['Karl','KARL'],['José','Jose\u0301']]){
  await profile(name);assert.equal(normalizeProfileName(name).nameKey,normalizeProfileName(alias).nameKey);
  check(await request('/profiles',{name:alias}),409);
 }
 const concurrent=await Promise.all(['Rennfahrer','ＲＥＮＮＦＡＨＲＥＲ'].map(name=>request('/profiles',{name})));
 assert.deepEqual(concurrent.map(value=>value.status).sort(),[201,409],'Concurrent equivalent names must be rejected by the real unique index');
 for(const name of ['',null,1,{},'A','X'.repeat(21),'  _ -  ','<Max>','Max\u0000','Max\u200b','🚗🚗'])check(await request('/profiles',{name}),400);
 const second=await profile('Eifel Express');
 check(await request('/profiles/session',credentials(first)));
 check(await request('/profiles/session',{...credentials(first),token:'0'.repeat(64)}),403);
 check(await request('/profiles/session',{...credentials(first),profileId:second.profile.id}),403);
 check(await request('/profiles/session',{profileId:first.profile.id}),403);
 console.log('PASS durable identities: 256-bit owner tokens, hash-only storage, Unicode/NFKC/whitespace uniqueness, concurrent collisions and owner authentication.');

 let lazyCalls=0;
 const lazy={getDatabase:async()=>{lazyCalls++;return DB;}};
 check(await request('/profiles',{name:'Valid Name'},{env:lazy,headers:{Origin:'https://unrelated.test'}}),403);
 const preflight=await request('/profiles',{}, {method:'OPTIONS',env:lazy,headers:{Origin:'https://www.fahrzeugtechnikbreuer.de'}});
 check(preflight,204);assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),'https://www.fahrzeugtechnikbreuer.de');
 check(await request('/profiles',{}, {method:'GET',env:lazy}),405);
 check(await request('/profiles',{}, {raw:'[',env:lazy}),400);
 check(await request('/profiles',{}, {raw:'[]',env:lazy}),400);
 check(await request('/profiles',{}, {raw:' '.repeat(12001),env:lazy}),413);
 check(await request('/profiles',{}, {headers:{'Content-Type':'text/plain'},env:lazy}),415);
 check(await request('/profiles',{name:'Valid Name',extra:{arbitrary:'JSON'}},{env:lazy}),400);
 check(await request('/profiles',{name:'Valid Name'},{env:{DB:null}}),503);
 assert.equal(lazyCalls,0,'Rejected origins/methods/JSON/fields cannot wake the database');
 const empty=await board(first);assert.deepEqual(empty.top,[]);assert.equal(empty.own,null);assert.equal(empty.totalPlayers,0);assert.deepEqual(empty.category,baseCategory);
 assert.equal((await request('/leaderboards',{category:baseCategory})).headers.get('Cache-Control'),'no-store');
 for(const category of [
  {...baseCategory,arbitrary:{}},{...baseCategory,rules:{items:true}},
  {...baseCategory,assists:{...baseCategory.assists,unknown:0}},
  {...baseCategory,assists:{autoGas:'true',autoDrift:true}},
  {...baseCategory,car:String(CARS.length)},{...baseCategory,car:0},
  {...baseCategory,difficulty:99},{...baseCategory,laps:4},
  {...baseCategory,trackId:'made-up'},
  {...baseCategory,mode:'time-trial',rules:'action',opponents:0}
 ])check(await request('/leaderboards',{category}),400);
 for(const limit of [0,26,'3',null])check(await request('/leaderboards',{category:baseCategory,limit}),400);
 check(await request('/runs/start',{...credentials(first),category:{...baseCategory,trackVersion:'1-old'}}),409);
 check(await request('/runs/start',{...credentials(first),category:{...baseCategory,handlingVersion:'arcade-handling-legacy'}}),409);
 console.log('PASS API boundaries: origin/method/JSON limits, no database wake on invalid input and strict exact record categories.');

 // Upgrade the immediately preceding profile-bound-ticket schema as well as
 // the old rooms-only database. All current identities must remain intact.
 await pg.query('ALTER TABLE breuer_gp.leaderboard_runs DROP CONSTRAINT breuer_run_owner');
 await pg.query('ALTER TABLE breuer_gp.leaderboard_runs DROP CONSTRAINT breuer_run_token_format');
 await pg.query('ALTER TABLE breuer_gp.leaderboard_runs DROP COLUMN run_token_hash');
 await pg.query('ALTER TABLE breuer_gp.leaderboard_runs ALTER COLUMN profile_id SET NOT NULL');
 const oldTicketSchemaCalls=calls.transactions;
 await initializeDatabase(sql);
 assert.equal(calls.transactions,oldTicketSchemaCalls+1);
 check(await request('/profiles/session',credentials(first)));
 const guestCategory={...baseCategory,opponents:3};
 const guest=check(await request('/runs/start',{category:guestCategory}),201);
 assert.match(guest.runToken,/^[a-f0-9]{64}$/);
 const guestStored=(await pg.query('SELECT profile_id, run_token_hash FROM breuer_gp.leaderboard_runs WHERE id=$1',[guest.runId])).rows[0];
 assert.equal(guestStored.profile_id,null);
 assert.equal(guestStored.run_token_hash,createHash('sha256').update(guest.runToken).digest('hex'));
 assert.notEqual(guestStored.run_token_hash,guest.runToken);
 clock+=62000;
 const afterFinishName=await profile('Erste Zielfahrt');
 check(await finish(afterFinishName,{...guest,runToken:undefined},60),404);
 check(await finish(afterFinishName,{...guest,runToken:'0'.repeat(64)},60),404);
 check(await request('/runs/finish',{runId:guest.runId,runToken:guest.runToken,time:60,sectors:[20,20,20]}),403);
 const claimed=check(await finish(afterFinishName,guest,60));
 assert.equal(claimed.record.name,'Erste Zielfahrt');assert.equal(claimed.improved,true);
 assert.equal((await pg.query('SELECT profile_id FROM breuer_gp.leaderboard_runs WHERE id=$1',[guest.runId])).rows[0].profile_id,afterFinishName.profile.id);
 check(await finish(second,guest,60),404);
 const guestRetry=check(await finish(afterFinishName,{...guest,runToken:undefined},60));
 assert.equal(guestRetry.duplicate,true,'Once bound, only the owning profile credentials are needed for an idempotent retry');
 const contested=check(await request('/runs/start',{category:guestCategory}),201);
 clock+=62000;
 const contest=await Promise.all([finish(afterFinishName,contested,61),finish(second,contested,61)]);
 assert.equal(contest.filter(value=>value.status===200).length,1);
 assert(contest.every(value=>[200,404,409].includes(value.status)));
 const claimant=contest[0].status===200?afterFinishName:second;
 assert.equal((await pg.query('SELECT profile_id FROM breuer_gp.leaderboard_runs WHERE id=$1',[contested.runId])).rows[0].profile_id,claimant.profile.id);
 const publicGuest=await board(afterFinishName,guestCategory);
 assert(!/token|hash|runId/.test(JSON.stringify(publicGuest)));
 console.log('PASS guest finish: private hashed ticket before driving, name reservation after the finish, one atomic owner claim and safe retries without replay into another profile.');

 const run=await start(first);
 assert.equal(run.createdAt,clock);assert(run.expiresAt>clock);assert.deepEqual(run.category,baseCategory);
 check(await finish(first,run,60),400);
 clock+=62000;
 for(const time of [0,-1,7201,'60',null])check(await finish(first,run,time),400);
 for(const values of [[20,40],[20,20,'20'],[20,20,21],[20,-1,41],[.1,30,29.9]])check(await finish(first,run,60,values),400);
 check(await finish(first,run,1,[1/3,1/3,1/3]),400);
 check(await finish(second,run,60),404);
 check(await request('/runs/finish',{...credentials(first),runId:randomUUID(),time:60,sectors:[20,20,20]}),404);
 const accepted=check(await finish(first,run,60));
 assert.equal(accepted.accepted,true);assert.equal(accepted.improved,true);assert.equal(accepted.duplicate,false);
 assert.equal(accepted.record.time,60);assert.equal(accepted.rank,1);
 const completedRow=(await pg.query('SELECT * FROM breuer_gp.leaderboard_runs WHERE id=$1',[run.runId])).rows[0];
 assert.equal(Number(completedRow.finished_at),clock);assert.match(completedRow.result_hash,/^[a-f0-9]{64}$/);
 const repeated=check(await finish(first,run,60));
 assert.equal(repeated.accepted,true);assert.equal(repeated.duplicate,true);assert.equal(repeated.improved,false);
 assert.deepEqual(repeated.record,accepted.record);
 check(await finish(first,run,61),409);
 const slower=await completed(first,70);assert.equal(slower.improved,false);assert.equal(slower.record.time,60);assert.equal(slower.record.updatedAt,accepted.record.updatedAt);
 const faster=await completed(first,55);assert.equal(faster.improved,true);assert.equal(faster.record.time,55);
 const concurrentRuns=await Promise.all([start(first),start(first)]);
 clock+=62000;
 await Promise.all(concurrentRuns.map((ticket,index)=>finish(first,ticket,index===0?50:54).then(check)));
 assert.equal((await board(first)).own.time,50,'Concurrent category UPSERTs must retain the best time');
 const duplicateRun=await start(first);clock+=62000;
 const double=await Promise.all([finish(first,duplicateRun,49),finish(first,duplicateRun,49)]);
 assert(double.every(value=>value.status===200));
 assert.equal(double.filter(value=>value.data.duplicate).length,1,'Exactly one concurrent identical submission consumes the ticket');
 assert.equal((await board(first)).own.time,49);
 const contradictory=await start(first);clock+=62000;
 const different=await Promise.all([finish(first,contradictory,52),finish(first,contradictory,53)]);
 assert.deepEqual(different.map(value=>value.status).sort(),[200,409]);
 const negligible=await completed(first,49-.0000005);assert.equal(negligible.improved,false);assert.equal(negligible.record.time,49);
 const best=await completed(first,48.9);assert.equal(best.improved,true);assert.equal(best.record.time,48.9);
 assert.equal((await pg.query('SELECT COUNT(*)::INTEGER AS count FROM breuer_gp.leaderboard_records WHERE profile_id=$1',[first.profile.id])).rows[0].count,1);
 console.log('PASS run validation: bound tickets, wall-clock/minimum/sector checks, atomic better-only UPSERTs and concurrent duplicate/contradictory submissions.');

 for(let index=0;index<12;index++)await completed(await profile(`Fahrer ${index+1}`),51+index);
 const outside=await profile('Outside Top');await completed(outside,100);
 const ranked=await board(outside,baseCategory,3);
 assert.equal(ranked.top.length,3);assert.equal(ranked.totalPlayers,14);assert.equal(ranked.own.rank,14);
 assert.deepEqual(ranked.top.map(value=>value.rank),[1,2,3]);
 assert.equal(ranked.top[0].profileId,first.profile.id);assert.equal(ranked.top[0].name,'Max Breuer');
 assert(!/token|hash|runId|expiresAt/.test(JSON.stringify(ranked)),'A public ranking must never expose owner secrets or ticket metadata');
 assert.equal((await board(first,baseCategory,25)).top.length,14);
 const tieCategory={...baseCategory,opponents:4};
 const tieA=await profile('Gleiche Zeit A'),tieB=await profile('Gleiche Zeit B');
 const tieRuns=await Promise.all([start(tieA,tieCategory),start(tieB,tieCategory)]);clock+=62000;
 await Promise.all([finish(tieA,tieRuns[0],60).then(check),finish(tieB,tieRuns[1],60).then(check)]);
 const tied=await board(tieA,tieCategory);
 assert.deepEqual(tied.top.map(value=>value.profileId),[tieA.profile.id,tieB.profile.id].sort(),'Equal finish times use stable timestamp/profile ordering');

 const variants=[
  {...baseCategory,car:'1'},
  {...baseCategory,laps:2},
  {...baseCategory,rules:'classic'},
  {...baseCategory,mode:'time-trial',opponents:0,rules:'classic'},
  {...baseCategory,mode:'cup'},
  {...baseCategory,mode:'challenge',opponents:0,rules:'classic'},
  {...baseCategory,raceType:'online'},
  {...baseCategory,difficulty:1.06},
  {...baseCategory,assists:{autoGas:false,autoDrift:true}},
  {...baseCategory,assists:{autoGas:true,autoDrift:false}},
  {...baseCategory,trackId:'bahnhof',trackVersion:TRACKS.find(track=>track.id==='bahnhof').version}
 ];
 const initialBase=(await board(first)).own;
 for(const category of variants){
  assert.equal((await board(first,category)).totalPlayers,0);
  const saved=await completed(first,category.laps*60,category);
  assert.equal(saved.rank,1);assert.equal((await board(first,category)).totalPlayers,1);
 }
 assert.deepEqual((await board(first)).own,initialBase,'Every exact category dimension remains isolated from the base record');
 const olderTrack={...baseCategory,trackVersion:'1-older-track'};
 const olderHandling={...baseCategory,handlingVersion:'arcade-handling-old'};
 for(const category of [olderTrack,olderHandling])assert.equal((await board(first,category)).totalPlayers,0);
 assert.equal(validateRecordCategory({...baseCategory,assists:{autoGas:true,autoDrift:true}}).key,validateRecordCategory({...baseCategory,assists:{autoDrift:true,autoGas:true}}).key,'Object key order is not a different category');
 console.log('PASS public rankings: top list plus a rank outside the top, stable ties, no credentials and exact track/car/lap/rule/mode/opponent/difficulty/assist/version separation.');

 const expired=await start(first);clock=expired.expiresAt+1;
 check(await finish(first,expired,60),410);
 await start(second);
 assert.equal((await pg.query('SELECT COUNT(*)::INTEGER AS count FROM breuer_gp.leaderboard_runs WHERE id=$1',[expired.runId])).rows[0].count,0,'Creating another run removes expired unfinished tickets');
 const oldRetry=check(await finish(first,run,60));assert.equal(oldRetry.duplicate,true,'A confirmed historical submission remains safely idempotent after its ticket expiry');
 await pg.query('DROP INDEX breuer_gp.breuer_leaderboard_order');
 const beforeRepair=calls.transactions;
 await initializeDatabase(sql);
 assert.equal(calls.transactions,beforeRepair+1,'A missing leaderboard index is repaired by the locked additive migration');
 const beforeReopen=await board(outside,baseCategory,3);
 await pg.close();pg=null;await open();
 check(await request('/profiles/session',credentials(first)));
 const reopened=await board(outside,baseCategory,3);
 assert.deepEqual(reopened.top,beforeReopen.top);assert.deepEqual(reopened.own,beforeReopen.own);assert.equal(reopened.totalPlayers,beforeReopen.totalPlayers);
 const roomRequest=await roomsAPI(new Request(`https://game.test/api/rooms/${oldDriver.code}/tick`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:oldDriver.id,token:oldDriver.token})}),{DB});
 // Four-hour advancement expires this original room, but it still has the
 // original 48-character credentials and compatible 404 expiry semantics.
 assert.equal(roomRequest.status,404);
 assert.equal(oldDriver.token.length,48);
 console.log('PASS persistence and recovery: reopened PostgreSQL keeps profiles/owner tokens/ranks; expired pending tickets are cleaned and completed submissions remain idempotent.');
}finally{
 Date.now=realNow;
 if(pg)await pg.close();
 await rm(directory,{recursive:true,force:true});
}
