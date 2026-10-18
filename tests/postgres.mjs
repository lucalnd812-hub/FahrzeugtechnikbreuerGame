import {CARS} from '../src/car-catalog.js';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import {postgresAdapter,initializeDatabase} from '../server/database.js';
import {handleAPI,roomSnapshot} from '../server/rooms.js';
import {getTrackMeta} from '../src/race-config.js';

// An actual PostgreSQL engine executes the production SQL. No credentials or
// production data are needed. Advancing the test clock avoids a slow race wait.
const directory=await mkdtemp(join(tmpdir(),'breuer-postgres-'));
const realNow=Date.now;
let clock=realNow(),pg,DB,databaseCalls;
Date.now=()=>clock;
const result=value=>({rows:value.rows,rowCount:value.affectedRows??value.rows.length});
async function openDatabase(){
 pg=new PGlite(directory);await pg.waitReady;
 databaseCalls={queries:0,transactions:0};
 const sql={
  query(text,params=[]){return {text,params,then(resolve,reject){databaseCalls.queries++;return pg.query(text,params).then(result).then(resolve,reject);}};},
  transaction(queries){databaseCalls.transactions++;return pg.transaction(async tx=>{const values=[];for(const query of queries)values.push(result(await tx.query(query.text,query.params)));return values;});}
 };
 await initializeDatabase(sql);
 const initialTransactions=databaseCalls.transactions;
 await initializeDatabase(sql);
 assert.equal(databaseCalls.transactions,initialTransactions,'An initialized schema must not execute DDL on another cold-process check');
 DB=postgresAdapter(sql);
 return sql;
}
async function request(path,body={},options={}){
 const response=await handleAPI(new Request('https://game.test/api'+path,{
  method:options.method||'POST',headers:{'Content-Type':'application/json',...options.headers},
  ...(!['GET','HEAD','OPTIONS'].includes(options.method)?{body:options.raw??JSON.stringify(body)}:{})
 }),{DB:options.noDB?null:options.database??DB});
 return {status:response.status,data:response.status===204?null:await response.json(),headers:response.headers};
}
const credentials=driver=>({id:driver.id,token:driver.token});
const action=(name,driver,extra={})=>request(`/rooms/${driver.code}/${name}`,{...credentials(driver),...extra});
const check=(value,status=200)=>{assert.equal(value.status,status,JSON.stringify(value.data));return value.data;};
const state=(progress=0,sequence=1,extra={})=>({x:0,z:0,angle:0,speed:32,progress,gate:0,shield:0,boost:0,spin:0,finish:null,drifting:false,oil:[],sequence,...extra});
async function createSix(config){
 const host=check(await request('/rooms',{name:'Max',car:0,config}),201);
 const peers=await Promise.all(Array.from({length:5},(_,index)=>request(`/rooms/${host.code}/join`,{name:`Fahrer ${index+2}`,car:(index+1)%CARS.length})));
 return [host,...peers.map(value=>({...check(value,201),code:host.code}))];
}

try{
 const bootstrap=await openDatabase();
 // Upgrade the real legacy three-car constraint without touching player rows,
 // tokens, room ownership or readiness. The new catalogue stays DB-enforced.
 const legacyHost=check(await request('/rooms',{name:'Bestandsfahrer',car:1}),201);
 const priorRows=(await pg.query('SELECT * FROM breuer_gp.players WHERE room=$1',[legacyHost.code])).rows;
 await pg.query('ALTER TABLE breuer_gp.players DROP CONSTRAINT breuer_car_catalog_v3');
 await pg.query('ALTER TABLE breuer_gp.players ADD CONSTRAINT players_car_check CHECK (car BETWEEN 0 AND 2)');
 const priorUpgradeCalls=databaseCalls.transactions;
 await initializeDatabase(bootstrap);
 assert.equal(databaseCalls.transactions,priorUpgradeCalls+1,'The legacy fleet upgrade runs once in a transaction');
 assert.deepEqual((await pg.query('SELECT * FROM breuer_gp.players WHERE room=$1',[legacyHost.code])).rows,priorRows,'Catalogue migration must preserve every existing player field');
 await assert.rejects(pg.query('UPDATE breuer_gp.players SET car=$1 WHERE id=$2',[CARS.length,legacyHost.id]),error=>error.code==='23514','Out-of-catalogue cars remain rejected by PostgreSQL');
 for(const car of [3,4]){const changed=check(await action('tick',legacyHost,{car}));assert.equal(changed.players.find(p=>p.id===legacyHost.id).car,car,'New cars can be selected in a real PostgreSQL room');}
 await action('leave',legacyHost);

 await pg.query('ALTER TABLE breuer_gp.players DROP COLUMN ready');
 await pg.query('DROP INDEX breuer_gp.breuer_rooms_expires');
 const migrationCalls={...databaseCalls};
 await initializeDatabase(bootstrap);
 assert.equal(databaseCalls.transactions,migrationCalls.transactions+1,'A partial schema must still run the required migrations');
 const migratedTransactions=databaseCalls.transactions;
 await initializeDatabase(bootstrap);
 assert.equal(databaseCalls.transactions,migratedTransactions,'The migrated schema returns to the DDL-free cold-start path');
 check(await request('/rooms',{car:0},{headers:{Origin:'https://unrelated.test'}}),403);
 const options=await request('/rooms',{}, {method:'OPTIONS',noDB:true,headers:{Origin:'https://www.fahrzeugtechnikbreuer.de'}});
 check(options,204);assert.equal(options.headers.get('Access-Control-Allow-Origin'),'https://www.fahrzeugtechnikbreuer.de');
 check(await request('/rooms',{}, {method:'GET'}),405);
 check(await request('/rooms',{}, {noDB:true}),503);
 check(await request('/rooms',{}, {headers:{'Content-Type':'text/plain'}}),415);
 check(await request('/rooms',{}, {raw:'['}),400);
 check(await request('/rooms',{}, {raw:'[]'}),400);
 check(await request('/rooms',{}, {raw:' '.repeat(12001)}),413);
 for(const car of [-1,CARS.length,99,1.5,'3'])check(await request('/rooms',{car}),400);

 let lazyDatabaseCalls=0;
 for(const [method,origin,raw,status] of [['OPTIONS','https://game.test',null,204],['GET',null,null,405],['POST','https://unrelated.test','{}',403],['POST',null,'[',400]]){
  const response=await handleAPI(new Request('https://game.test/api/rooms',{method,headers:{'Content-Type':'application/json',...(origin?{Origin:origin}:{})},...(['POST'].includes(method)?{body:raw}:{})}),{getDatabase:async()=>{lazyDatabaseCalls++;return DB;}});
  assert.equal(response.status,status);
 }
 assert.equal(lazyDatabaseCalls,0,'Rejected requests and OPTIONS must not initialize/wake PostgreSQL');

 const createCalls={...databaseCalls};
 const host=check(await request('/rooms',{name:'  Max\u0000 Breuer ',car:0,config:{trackId:'bahnhof',laps:5,rules:'classic',mode:'cup',opponents:5}}),201);
 assert.equal(databaseCalls.queries,createCalls.queries,'Room creation must not pre-read codes or expired rooms');
 assert.equal(databaseCalls.transactions,createCalls.transactions+1,'Room creation and expiry cleanup share one HTTP database request');
 assert.equal(host.config.mode,'race');assert.equal(host.config.opponents,0,'Online rooms contain humans and cannot start an uninitialized solo Cup');
 assert.match(host.code,/^[A-Z2-9]{6}$/);assert.match(host.token,/^[a-f0-9]{48}$/);
 assert.equal(host.config.laps,5);assert.equal(host.trackLength,getTrackMeta('bahnhof').length);
 assert.equal(host.trackVersion,getTrackMeta('bahnhof').version);
 const joinCalls={...databaseCalls},competing=await Promise.all(Array.from({length:8},(_,index)=>request(`/rooms/${host.code}/join`,{name:`Fahrer ${index+1}`,car:index%CARS.length})));
 assert.equal(databaseCalls.queries,joinCalls.queries+8,'Each join only pre-reads the room once');
 assert.equal(databaseCalls.transactions,joinCalls.transactions+8,'Capacity, insertion and join snapshots share one transaction');
 assert.equal(competing.filter(value=>value.status===201).length,5);
 assert.equal(competing.filter(value=>value.status===409).length,3);
 const peers=competing.filter(value=>value.status===201).map(value=>({...value.data,code:host.code}));
 const drivers=[host,...peers],peer=peers[0];
 const heartbeatCalls={...databaseCalls},lobby=check(await action('tick',host));
 assert.equal(databaseCalls.queries,heartbeatCalls.queries,'A presence-only tick must authenticate without an extra database request');
 assert.equal(databaseCalls.transactions,heartbeatCalls.transactions+1);
 assert.equal(lobby.players.length,6);assert.equal(lobby.players.find(player=>player.id===host.id).name,'Max Breuer');
 assert.equal(lobby.startAt,0);assert.equal(lobby.configRevision,1);
 assert.ok(lobby.players.every(player=>player.connected&&!player.ready));
 assert.ok(!JSON.stringify(lobby).includes('token_hash'));assert.ok(!JSON.stringify(lobby).includes(host.token));
 check(await request(`/rooms/${host.code}/tick`,{id:host.id,token:'0'.repeat(48)}),403);
 check(await request(`/rooms/${host.code}/tick`,{id:peer.id,token:host.token}),403);
 check(await action('start',peer),403);check(await action('start',host),409);
 check(await action('ready',host,{ready:true,configRevision:1}));
 check(await action('config',peer,{config:{laps:3}}),403);
 const configCalls={...databaseCalls},changed=check(await action('config',host,{config:{trackId:'kraemer',laps:3,rules:'action',mode:'challenge'}}));
 assert.equal(databaseCalls.queries,configCalls.queries+1,'Configuration only authenticates once before the mutation');
 assert.equal(databaseCalls.transactions,configCalls.transactions+1,'Configuration changes and their snapshots share one transaction');
 assert.equal(changed.config.mode,'race');assert.equal(changed.config.rules,'action','Online normalization keeps the requested rules');
 assert.equal(changed.configRevision,2);assert.equal(changed.config.trackId,'kraemer');
 assert.equal(changed.trackLength,getTrackMeta('kraemer').length);
 assert.ok(changed.players.every(player=>!player.ready));
 check(await action('ready',host,{ready:true,configRevision:1}),409);
 check(await action('tick',peer,{trackVersion:'outdated-version'}),409);
 check(await action('ready',peer,{ready:true,configRevision:2}));
 const changedCar=check(await action('tick',peer,{car:(lobby.players.find(player=>player.id===peer.id).car+1)%CARS.length}));
 assert.equal(changedCar.players.find(player=>player.id===peer.id).ready,false);

 // The visible offline indicator remains 12 s, but host authority survives a
 // brief missing heartbeat. Configuration changes count as presence too.
 await pg.query('UPDATE breuer_gp.players SET seen = $1 WHERE id = $2',[clock-13000,host.id]);
 const grace=check(await action('tick',peer));
 assert.equal(grace.hostId,host.id);assert.equal(grace.players.find(driver=>driver.id===host.id).connected,false);
 const hostConfig=check(await action('config',host,{config:changed.config}));
 assert.equal(hostConfig.hostId,host.id);assert.equal(hostConfig.players.find(driver=>driver.id===host.id).connected,true);
 assert.equal((await pg.query('SELECT seen FROM breuer_gp.players WHERE id=$1',[host.id])).rows[0].seen,clock);

 // A host heartbeat arriving after a stale roster read prevents the pending
 // host transfer. This tests the SQL condition, not just the snapshot check.
 await pg.query('UPDATE breuer_gp.players SET seen = $1 WHERE id = $2',[clock-46000,host.id]);
 const staleMembers=(await pg.query('SELECT id, name, car, joined, seen, ready, state FROM breuer_gp.players WHERE room=$1 ORDER BY joined, id',[host.code])).rows;
 const snapshotRoom=await DB.prepare('SELECT * FROM rooms WHERE code = ?').bind(host.code).first();
 await pg.query('UPDATE breuer_gp.players SET seen = $1 WHERE id = $2',[clock,host.id]);
 assert.equal((await roomSnapshot(DB,snapshotRoom,peer.id,clock,staleMembers)).hostId,host.id);

 // An older HTTP request cannot roll a more recent transport heartbeat back.
 await pg.query('UPDATE breuer_gp.players SET seen = $1 WHERE id = $2',[clock+1000,peer.id]);
 check(await action('tick',peer));
 assert.equal((await pg.query('SELECT seen FROM breuer_gp.players WHERE id=$1',[peer.id])).rows[0].seen,clock+1000);

 // A genuinely stale host is replaced by a connected driver; its token still
 // reconnects the same identity without stealing the new host's role.
 await pg.query('UPDATE breuer_gp.players SET seen = $1 WHERE id = $2',[clock-46000,host.id]);
 const transferred=check(await action('tick',peer));
 assert.notEqual(transferred.hostId,host.id);assert.ok(peers.some(driver=>driver.id===transferred.hostId));
 assert.equal(transferred.host,transferred.hostId===peer.id);
 const replacement=drivers.find(driver=>driver.id===transferred.hostId);
 const rejoined=check(await action('tick',host));
 assert.equal(rejoined.players.length,6);assert.equal(rejoined.hostId,replacement.id);assert.equal(rejoined.host,false);
 check(await action('start',host),403);
 const left=check(await action('leave',replacement));assert.notEqual(left.hostId,replacement.id);
 assert.equal(check(await action('tick',host)).players.length,5);
 check(await action('tick',replacement),403);
 for(const driver of drivers.filter(driver=>driver.id!==replacement.id))check(await action('leave',driver));
 assert.equal((await pg.query('SELECT COUNT(*)::INT AS count FROM breuer_gp.rooms WHERE code=$1',[host.code])).rows[0].count,0);
 console.log('PASS PostgreSQL lobby: bounded database requests, lazy schema init, six-player capacity, ready revisions, host grace/heartbeat race and reconnect.');

 const racers=await createSix({trackId:'lammersdorf',laps:1,rules:'classic'}),leader=racers[0];
 await Promise.all(racers.map(driver=>action('ready',driver,{ready:true,configRevision:1}).then(value=>check(value))));
 const startCalls={...databaseCalls},started=check(await action('start',leader)),startAt=started.startAt;
 assert.equal(databaseCalls.queries,startCalls.queries+1);
 assert.equal(databaseCalls.transactions,startCalls.transactions+1,'Start confirmation must not read a separate roster');
 assert.equal(startAt,clock+4500);assert.equal(typeof startAt,'number');
 assert.equal(check(await action('start',leader)).startAt,startAt);
 check(await action('ready',racers[1],{ready:false}),409);
 check(await action('config',leader,{config:{laps:10}}),409);
 check(await request(`/rooms/${leader.code}/join`,{name:'Später',car:1}),409);
 check(await action('tick',leader,{car:1}),409);
 check(await action('tick',leader,{name:'Anderer Name'}),409);
 clock=startAt+1000;
 const ticks=await Promise.all(racers.map(driver=>action('tick',driver,{state:state(10,1,{drifting:true,oil:[{id:'local-oil',x:0,z:0,expires:10}]})})));
 for(const tick of ticks)check(tick);
 const snapshot=check(await action('tick',leader));
 assert.ok(snapshot.players.every(player=>player.state.sequence===1&&player.state.drifting));
 assert.ok(snapshot.players.every(player=>player.state.oil.length===0),'Classic mode must remove oil');
 check(await action('tick',leader,{state:state(200,2,{gate:2})}),400);
 check(await action('tick',leader,{state:state(10,2,{x:500})}),400);
 check(await action('tick',leader,{state:state(10,2,{speed:61})}),400);
 check(await action('tick',leader,{state:state(10,2,{gate:13})}),400);
 check(await action('tick',leader,{state:state(10,2,{angle:null})}),400);
 const premature=check(await action('tick',leader,{state:state(15,2,{finish:20})}));
 assert.equal(premature.players.find(player=>player.id===leader.id).state.finish,null);
 await Promise.all([5,6].map(sequence=>action('tick',leader,{state:state(16,sequence)}).then(value=>check(value))));
 const monotone=check(await action('tick',leader,{state:state(15,4)}));
 assert.equal(monotone.players.find(player=>player.id===leader.id).state.sequence,6);
 assert.equal(monotone.players.find(player=>player.id===leader.id).state.progress,16);

 // A delivery-channel heartbeat may refresh connectedness without replacing
 // the car's last position. Its timestamp must not erase real driving time.
 clock=startAt+2000;
 await pg.query('UPDATE breuer_gp.players SET seen=$1 WHERE id=$2',[clock,leader.id]);
 const afterHeartbeat=check(await action('tick',leader,{state:state(51,7,{updatedAt:clock+999999})}));
 assert.equal(afterHeartbeat.players.find(player=>player.id===leader.id).state.progress,51);
 assert.equal(afterHeartbeat.players.find(player=>player.id===leader.id).state.updatedAt,clock,'The server, never the client, chooses the state timestamp');

 // Traverse all twelve checkpoints at a plausible 35 m/s. This tests the
 // protocol's timing and gate validation, rather than faking an instant win.
 const length=started.trackLength;
 for(let second=2;second<=Math.ceil(length/35);second++){
  clock=startAt+second*1000;
  const progress=Math.min(length,second*35),gate=Math.min(12,Math.floor(progress/(length/12)+1e-9));
  await Promise.all(racers.map(driver=>action('tick',driver,{state:state(progress,second+10,{gate,finish:progress===length?second:null,raceTime:second,finishRaceTime:progress===length?second:undefined})}).then(value=>check(value))));
 }
 const finished=check(await action('tick',leader));
 assert.ok(finished.players.every(player=>player.state.finish!==null&&player.state.gate===12));
 const finish=finished.players.find(player=>player.id===leader.id).state.finish;
 clock+=1000;
 const retained=check(await action('tick',leader,{state:state(length,900,{gate:12,finish:null})}));
 assert.equal(retained.players.find(player=>player.id===leader.id).state.finish,finish);
 assert.equal(retained.players.find(player=>player.id===leader.id).state.sequence,finished.players.find(player=>player.id===leader.id).state.sequence);
 check(await action('tick',racers[1],{state:state(length,901,{gate:11})}),400);
 console.log('PASS PostgreSQL race: shared configuration, parallel ticks, monotone sequence, checkpoint and immutable finish validation.');

 await pg.close();pg=null;await openDatabase();
 const restarted=check(await action('tick',leader));
 assert.equal(restarted.players.length,6);assert.equal(restarted.startAt,startAt);
 assert.equal(restarted.players.find(player=>player.id===leader.id).state.finish,finish);
 for(const driver of racers)check(await action('leave',driver));
 assert.equal((await pg.query('SELECT COUNT(*)::INT AS count FROM breuer_gp.rooms WHERE code=$1',[leader.code])).rows[0].count,0);
 const expiring=check(await request('/rooms',{name:'Zeitlimit',car:0}),201);
 await pg.query('UPDATE breuer_gp.rooms SET expires=$1 WHERE code=$2',[clock-1,expiring.code]);
 check(await action('tick',expiring),404);
 const cleanup=check(await request('/rooms',{name:'Aufräumen',car:0}),201);
 assert.equal((await pg.query('SELECT COUNT(*)::INT AS count FROM breuer_gp.rooms WHERE code=$1',[expiring.code])).rows[0].count,0);
 check(await action('leave',cleanup));
 console.log('PASS PostgreSQL persistence: reopen database, preserved race/finish, room expiry and complete leave cleanup.');

 // An HTTP packet can spend seconds authenticating. Recording its position at
 // auth completion steals that driving time from the next legitimate update.
 const delayedDrivers=await createSix({trackId:'lammersdorf',laps:1,rules:'classic'}),delayed=delayedDrivers[0];
 await Promise.all(delayedDrivers.map(driver=>action('ready',driver,{ready:true,configRevision:1}).then(value=>check(value))));
 const delayedStart=check(await action('start',delayed));clock=delayedStart.startAt+1000;
 const receivedAt=clock;
 const slowAuthDB={...DB,prepare(query){
  const prepared=DB.prepare(query);
  if(query.startsWith('SELECT r.*, p.id AS player_id')){
   const first=prepared.first.bind(prepared);
   prepared.first=async()=>{const value=await first();clock+=5000;return value;};
  }
  return prepared;
 }};
 const delayedFirst=check(await request(`/rooms/${delayed.code}/tick`,{...credentials(delayed),state:state(35,1,{x:35,updatedAt:receivedAt+999999})},{database:slowAuthDB}));
 const delayedPosition=delayedFirst.players.find(driver=>driver.id===delayed.id).state;
 assert.equal(delayedPosition.updatedAt,receivedAt,'Position time must be server receipt, not authentication completion or client input');
 assert.equal((await pg.query('SELECT seen FROM breuer_gp.players WHERE id=$1',[delayed.id])).rows[0].seen,receivedAt+5000,'Presence stays fresh after slow authentication');
 clock=receivedAt+5500;
 const delayedNext=check(await action('tick',delayed,{state:state(195,2,{x:195,gate:1})}));
 assert.equal(delayedNext.players.find(driver=>driver.id===delayed.id).state.progress,195,'Legitimate movement after slow auth retains all elapsed driving time');

 // Two transports can validate the same new sequence before either commits.
 // The first durable sequence wins, including when the duplicate is equal.
 const duplicates=await Promise.all([195,196].map(progress=>action('tick',delayed,{state:state(progress,3,{x:progress,gate:1})}).then(value=>check(value))));
 const retainedPosition=duplicates[0].players.find(driver=>driver.id===delayed.id).state;
 assert.deepEqual(duplicates[1].players.find(driver=>driver.id===delayed.id).state,retainedPosition,'Equal concurrent sequences must not replace an already accepted position');
 for(const sequence of [1,3]){
  const old=check(await action('tick',delayed,{state:state(0,sequence,{x:-1800,z:700,gate:0})}));
  assert.deepEqual(old.players.find(driver=>driver.id===delayed.id).state,retainedPosition,'An old or duplicate packet with a large position/gate delta is ignored');
 }
 check(await action('tick',delayed,{state:state(700,4,{x:700,gate:7})}),400);
 check(await action('tick',delayed,{state:state(195,4,{x:1800,gate:1})}),400);
 check(await action('tick',delayed,{state:state(195,4,{x:195,gate:0})}),400);
 check(await action('tick',delayed,{state:state(0,1,{speed:61})}),400);
 for(const driver of delayedDrivers)check(await action('leave',driver));
 assert.equal((await pg.query('SELECT COUNT(*)::INT AS count FROM breuer_gp.rooms')).rows[0].count,0);
 console.log('PASS PostgreSQL transport timing: slow auth preserves receipt time, old/duplicate large deltas are ignored, equal concurrent sequences stay immutable and new jumps/checkpoints remain rejected.');

 // Delivery before server receipt can compress several seconds of real
 // driving into one second of arrival time. Bounded capture time supplies the
 // movement duration while updatedAt and global race limits stay server-owned.
 const capturedDrivers=await createSix({trackId:'lammersdorf',laps:2,rules:'classic'}),captured=capturedDrivers[0];
 await Promise.all(capturedDrivers.map(driver=>action('ready',driver,{ready:true,configRevision:1}).then(value=>check(value))));
 const capturedStart=check(await action('start',captured)),captureGate=progress=>Math.floor(progress/(capturedStart.trackLength/12));
 const captureState=(progress,sequence,raceTime)=>state(progress,sequence,{x:progress,gate:captureGate(progress),...(raceTime===undefined?{}:{raceTime})});
 clock=capturedStart.startAt+21000;
 const capturedFirst=check(await action('tick',captured,{state:captureState(512,160,16)}));
 assert.equal(capturedFirst.players.find(driver=>driver.id===captured.id).state.updatedAt,clock);
 check(await action('tick',capturedDrivers[1],{state:captureState(512,160)}));
 check(await action('tick',capturedDrivers[2],{state:captureState(512,160,16)}));
 check(await action('tick',capturedDrivers[3],{state:captureState(1350,1,21)}),400);
 clock=capturedStart.startAt+22150;
 const capturedNext=check(await action('tick',captured,{state:captureState(708.8,222,22.15)})),capturedPosition=capturedNext.players.find(driver=>driver.id===captured.id).state;
 assert.equal(capturedPosition.progress,708.8);assert.equal(capturedPosition.raceTime,22.15);
 assert.equal(capturedPosition.updatedAt,clock,'Capture time must never replace the trusted server timestamp');
 check(await action('tick',capturedDrivers[1],{state:captureState(708.8,222,22.15)}),400);
 check(await action('tick',capturedDrivers[2],{state:captureState(708.8,222)}),400);
 assert.equal(check(await action('tick',capturedDrivers[1],{state:captureState(530,222,22.15)})).players.find(driver=>driver.id===capturedDrivers[1].id).state.raceTime,22.15);
 assert.equal(check(await action('tick',capturedDrivers[2],{state:captureState(530,222)})).players.find(driver=>driver.id===capturedDrivers[2].id).state.raceTime,undefined);
 clock=capturedStart.startAt+22250;
 check(await action('tick',captured,{state:captureState(750,223,22.15)}),400);
 check(await action('tick',captured,{state:captureState(750,223,22.25)}),400);
 check(await action('tick',captured,{state:captureState(709,223,22.05)}),400);
 check(await action('tick',captured,{state:captureState(709,223,52.25)}),400);
 for(const raceTime of [-1,7201,null,'22.25'])check(await action('tick',captured,{state:captureState(709,223,raceTime)}),400);
 clock=capturedStart.startAt+32000;
 check(await action('tick',captured,{state:captureState(1800,223,32)}),400);
 clock=capturedStart.startAt+33000;
 const lateCapture=check(await action('tick',captured,{state:captureState(300,300,16)}));
 assert.deepEqual(lateCapture.players.find(driver=>driver.id===captured.id).state,capturedPosition,'A packet older than the capture window preserves the prior state despite a newer sequence');
 assert.equal((await pg.query('SELECT seen FROM breuer_gp.players WHERE id=$1',[captured.id])).rows[0].seen,clock,'Ignored late packets still refresh presence');
 check(await action('tick',capturedDrivers[3],{state:captureState(0,1,0)}),400);

 const total=capturedStart.trackLength*2;
 const finishState=(sequence,raceTime,finish,event,progress=total,gate=24)=>state(progress,sequence,{x:progress,gate,raceTime,finish,finishRaceTime:event});
 clock=capturedStart.startAt+75000;
 check(await action('tick',captured,{state:finishState(500,74,null,undefined,total-100,23)}));
 check(await action('tick',capturedDrivers[4],{state:finishState(1,74,null,undefined,total-100,23)}));
 check(await action('tick',capturedDrivers[5],{state:finishState(1,75,null,undefined)}));
 clock=capturedStart.startAt+80000;
 const backdated=check(await action('tick',captured,{state:finishState(501,80,73,73)}));
 assert.equal(backdated.players.find(driver=>driver.id===captured.id).state.finish,null,'An event cannot predate a confirmed unfinished capture');
 clock=capturedStart.startAt+84000;
 assert.equal(check(await action('tick',captured,{state:finishState(502,84,58,58)})).players.find(driver=>driver.id===captured.id).state.finish,null,'An event older than ten seconds cannot grant a finish');
 check(await action('tick',captured,{state:finishState(503,84,114,114)}),400);
 check(await action('tick',captured,{state:finishState(503,80,82,82)}),400);
 for(const event of [-1,7201,null,'78'])check(await action('tick',captured,{state:finishState(503,84,78,event)}),400);
 assert.equal(check(await action('tick',captured,{state:finishState(503,84,74,78)})).players.find(driver=>driver.id===captured.id).state.finish,null,'Finish and event capture must agree within three seconds');
 const incompleteProgress=check(await action('tick',capturedDrivers[2],{state:finishState(300,84,78,78,total-20)}));
 assert.equal(incompleteProgress.players.find(driver=>driver.id===capturedDrivers[2].id).state.finish,null);
 const incompleteGate=check(await action('tick',capturedDrivers[3],{state:finishState(1,84,78,78,total,23)}));
 assert.equal(incompleteGate.players.find(driver=>driver.id===capturedDrivers[3].id).state.finish,null);
 const lateFinish=check(await action('tick',capturedDrivers[4],{state:finishState(2,78,78,78)})).players.find(driver=>driver.id===capturedDrivers[4].id).state;
 assert.equal(lateFinish.finish,78,'A complete valid finish received six seconds late retains its event time');
 assert.equal(lateFinish.updatedAt,clock);assert.equal(lateFinish.raceTime,78);
 const recoveredFinish=check(await action('tick',capturedDrivers[5],{state:finishState(2,84,74,74)})).players.find(driver=>driver.id===capturedDrivers[5].id).state;
 assert.equal(recoveredFinish.finish,74,'An already confirmed complete endpoint may recover its earlier missing finish event');
 clock=capturedStart.startAt+90000;
 assert.deepEqual(check(await action('tick',capturedDrivers[4],{state:finishState(3,90,null,78)})).players.find(driver=>driver.id===capturedDrivers[4].id).state,lateFinish);
 assert.deepEqual(check(await action('tick',capturedDrivers[5],{state:finishState(3,90,null,74)})).players.find(driver=>driver.id===capturedDrivers[5].id).state,recoveredFinish,'A confirmed finish stays immutable after the event window expires');
 assert.equal(check(await action('tick',captured,{state:finishState(504,90,30,30)})).players.find(driver=>driver.id===captured.id).state.finish,null,'Capture time cannot bypass minimum race duration');
 for(const driver of capturedDrivers)check(await action('leave',driver));
 assert.equal((await pg.query('SELECT COUNT(*)::INT AS count FROM breuer_gp.rooms')).rows[0].count,0);
 console.log('PASS PostgreSQL capture time: real 32 m/s latency compression, receipt timestamps, legacy fallback, old-frame presence and bounded/monotone time, jump and global-progress protections.');
 console.log('PASS PostgreSQL finish capture: six-second delay, completed-endpoint retry, immutable finish and future/backdated/min-duration/progress/gate/event-consistency boundaries.');
 const bendDrivers=await createSix({trackId:'kraemer',laps:2,rules:'classic'}),bend=bendDrivers[0];
 for(const driver of bendDrivers)check(await action('ready',driver,{ready:true,configRevision:1}));
 const bendStart=check(await action('start',bend));clock=bendStart.startAt+20000;
 check(await action('tick',bend,{state:state(254.15,1,{x:10,z:10,gate:1,raceTime:20})}));
 clock+=100;
 const projected=check(await action('tick',bend,{state:state(280.68,2,{x:10.8,z:10,gate:2,raceTime:20.1})}));
 assert.equal(projected.players.find(driver=>driver.id===bend.id).state.progress,280.68,'Normal inner-bend projection must survive HTTP validation');
 clock+=100;
 check(await action('tick',bend,{state:state(350,3,{x:11.6,z:10,gate:2,raceTime:20.2})}),400);
 check(await action('tick',bend,{state:state(280.68,3,{x:500,z:10,gate:2,raceTime:20.2})}),400);
 for(const driver of bendDrivers)check(await action('leave',driver));
 console.log('PASS PostgreSQL sharp-bend projection tolerance with ordinary world motion; large progress/world teleports still rejected.');
}finally{
 Date.now=realNow;
 if(pg)await pg.close();
 await rm(directory,{recursive:true,force:true});
}
