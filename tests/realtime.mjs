import {CARS} from '../src/car-catalog.js';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {PGlite} from '@electric-sql/pglite';
import {WebSocket} from 'ws';
import {postgresAdapter,SCHEMA} from '../server/database.js';
import {handleAPI} from '../server/rooms.js';
import {createRealtimeServer} from '../server/realtime.js';

const pg=new PGlite();await pg.waitReady;
await pg.transaction(async tx=>{for(const query of SCHEMA)await tx.query(query);});
const result=value=>({rows:value.rows,rowCount:value.affectedRows??value.rows.length});
const sql={
 query(text,params=[]){return {text,params,then(resolve,reject){return pg.query(text,params).then(result).then(resolve,reject);}};},
 transaction(queries){return pg.transaction(async tx=>{const results=[];for(const query of queries)results.push(result(await tx.query(query.text,query.params)));return results;});}
};
const DB=postgresAdapter(sql),DB2=postgresAdapter(sql);
const realNow=Date.now;let clock=realNow();Date.now=()=>clock;
const servers=new Set(),clients=new Set();
const credentials=driver=>({id:driver.id,token:driver.token});
const state=(progress,sequence,extra={})=>({x:0,z:0,angle:0,speed:30,progress,gate:0,shield:0,boost:0,spin:0,finish:null,drifting:false,oil:[],sequence,...extra});
async function api(path,body,options={}){
 const response=await handleAPI(new Request('http://game.test/api'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),{DB:options.database??DB});
 return {status:response.status,data:await response.json()};
}
const action=(name,driver,extra={},options={})=>api(`/rooms/${driver.code}/${name}`,{...credentials(driver),...extra},options);
const check=(response,status=200)=>{assert.equal(response.status,status,JSON.stringify(response.data));return response.data;};
async function room(count=6,config={}){
 const host=check(await api('/rooms',{name:'Socket host',car:0,config:{trackId:'lammersdorf',laps:1,rules:'action',...config}}),201),drivers=[host];
 for(let index=1;index<count;index++)drivers.push({...check(await api(`/rooms/${host.code}/join`,{name:`Socket ${index+1}`,car:index%CARS.length}),201),code:host.code});
 await Promise.all(drivers.map(driver=>action('ready',driver,{ready:true,configRevision:1}).then(check)));
 const started=check(await action('start',host));clock=started.startAt+1000;
 return {drivers,started};
}
async function server(options={}){
 const value=createRealtimeServer({getDatabase:async()=>DB,now:()=>clock,intervalMs:20,authTimeoutMs:500,lifetimeMs:30000,...options});
 servers.add(value);value.listen(0,'127.0.0.1');await once(value,'listening');
 value.base=`http://127.0.0.1:${value.address().port}`;return value;
}
async function stop(value){
 if(!servers.has(value))return;value.closeRealtime();await new Promise(resolve=>value.close(resolve));servers.delete(value);
}
async function connect(value,driver,{hello=true,...options}={}){
 const socket=new WebSocket(value.base.replace('http:','ws:')+'/api/realtime',{headers:{Origin:value.base,...options.headers}});
 clients.add(socket);const messages=[],waiters=new Set();let close=null;
 socket.on('error',()=>{});
 socket.on('message',raw=>{const message=JSON.parse(raw.toString());messages.push(message);for(const waiter of waiters)waiter();});
 socket.on('close',(code,reason)=>{close={code,reason:reason.toString()};for(const waiter of waiters)waiter();});
 await once(socket,'open');
 const wait=(predicate,timeout=1500)=>new Promise((resolve,reject)=>{
  const inspect=()=>{const found=messages.find(predicate);if(found){clearTimeout(timer);waiters.delete(inspect);resolve(found);}};
  const timer=setTimeout(()=>{waiters.delete(inspect);reject(Error('Timed out waiting for a socket message.'));},timeout);
  waiters.add(inspect);inspect();
 });
 const closed=(timeout=1500)=>new Promise((resolve,reject)=>{
  const inspect=()=>{if(close){clearTimeout(timer);waiters.delete(inspect);resolve(close);}};
  const timer=setTimeout(()=>{waiters.delete(inspect);reject(Error('Socket was not closed.'));},timeout);
  waiters.add(inspect);inspect();
 });
 const client={socket,messages,wait,closed};
 if(hello)socket.send(JSON.stringify({action:'hello',code:driver.code,...credentials(driver),trackVersion:driver.trackVersion}));
 return client;
}
async function refused(value,path='/api/realtime',origin='https://unrelated.test'){
 const socket=new WebSocket(value.base.replace('http:','ws:')+path,{headers:{Origin:origin}});clients.add(socket);
 return new Promise((resolve,reject)=>{
  socket.on('error',()=>{});socket.on('open',()=>{socket.terminate();reject(Error('Forbidden WebSocket upgrade was accepted.'));});
  socket.on('unexpected-response',(_,response)=>{assert.equal(response.statusCode,403);response.resume();socket.terminate();resolve();});
 });
}

try{
 const one=await server(),two=await server({getDatabase:async()=>DB2});
 assert.equal((await fetch(one.base+'/api/realtime')).status,426);
 await refused(one);await refused(one,'/api/realtime?token=not-used',one.base);
 const {drivers,started}=await room();
 const sockets=await Promise.all(drivers.map((driver,index)=>connect(index<3?one:two,driver)));
 for(const socket of sockets){const snapshot=await socket.wait(message=>message.type==='snapshot');assert.equal(snapshot.players.length,6);assert.equal(snapshot.transport,'websocket');assert.equal(snapshot.startAt,started.startAt);assert.ok(!JSON.stringify(snapshot).includes('token_hash'));}
 clock+=1000;
 sockets.forEach((client,index)=>client.socket.send(JSON.stringify({action:'state',state:state(20,1,{drifting:true,oil:[{id:`oil-${index}`,x:0,z:0,expires:5}]})})));
 await Promise.all(sockets.map(client=>client.wait(message=>message.type==='snapshot'&&message.players.every(player=>player.state?.sequence===1))));
 const HTTP=check(await action('tick',drivers[0]));
 assert.ok(HTTP.players.every(player=>player.state.sequence===1&&player.state.oil.length===1));
 assert.ok(one.realtimeStats().acceptedStates>=3&&two.realtimeStats().acceptedStates>=3);
 clock+=1000;
 await Promise.all(drivers.map(driver=>action('tick',driver,{state:state(30,3)}).then(check)));
 await Promise.all(sockets.map(client=>client.wait(message=>message.type==='snapshot'&&message.players.every(player=>player.state?.sequence===3))));
 clock+=50;const staleSocketAt=clock;
 sockets[0].socket.send(JSON.stringify({action:'state',state:state(0,2,{x:-1800,z:700})}));
 await sockets[0].wait(message=>message.type==='snapshot'&&message.serverTime>=staleSocketAt&&message.players.find(player=>player.id===drivers[0].id)?.state?.sequence===3);
 assert.equal(sockets[0].socket.readyState,WebSocket.OPEN,'An old position with a large delta must not revoke the socket');
 assert.equal(check(await action('tick',drivers[0])).players.find(player=>player.id===drivers[0].id).state.sequence,3);
 console.log('PASS WebSocket synchronization: six drivers on two independent instances, shared PostgreSQL snapshots, HTTP fallback and monotone sequences.');

 // Reconnecting to another process retains the durable driver identity/state.
 sockets[0].socket.close();await sockets[0].closed();
 const moved=await connect(two,drivers[0]);
 assert.equal((await moved.wait(message=>message.type==='snapshot')).players.find(player=>player.id===drivers[0].id).state.sequence,3);
 const duplicate=await connect(two,drivers[0]);
 const afterReconnect=(await duplicate.wait(message=>message.type==='snapshot')).players.find(player=>player.id===drivers[0].id).state;
 await moved.wait(message=>message.type==='error'&&message.status===409);assert.equal((await moved.closed()).code,1008);
 for(const sequence of [1,3]){
  const delayed=check(await action('tick',drivers[0],{state:state(0,sequence,{x:-2200,z:700})}));
  assert.deepEqual(delayed.players.find(player=>player.id===drivers[0].id).state,afterReconnect,'Delayed HTTP packets after WS reconnect must retain the newer state');
 }
 check(await action('tick',drivers[0],{state:state(30,4,{x:2200})}),400);
 await stop(one);
 const fresh=await server({getDatabase:async()=>postgresAdapter(sql)});
 const resumed=await Promise.all(drivers.slice(1,3).map(driver=>connect(fresh,driver)));
 for(const client of resumed)assert.equal((await client.wait(message=>message.type==='snapshot')).players.length,6);
 assert.equal(check(await action('tick',drivers[1])).players.find(player=>player.id===drivers[1].id).state.sequence,3);
 console.log('PASS WebSocket reconnect: same identity across instances, duplicate socket replacement and fresh-process durable state.');

 const bad=await connect(fresh,{...drivers[1],token:'0'.repeat(48)});
 await bad.wait(message=>message.type==='error'&&message.status===403);assert.equal((await bad.closed()).code,1008);
 const mismatch=await connect(fresh,{...drivers[1],trackVersion:'old-map'});
 await mismatch.wait(message=>message.type==='error'&&message.status===409);await mismatch.closed();
 const missing=await connect(fresh,drivers[1],{hello:false});
 await missing.wait(message=>message.type==='error'&&message.status===403);await missing.closed();
 const invalid=await connect(fresh,drivers[1]);await invalid.wait(message=>message.type==='snapshot');
 invalid.socket.send(JSON.stringify({action:'state',state:state(700,4,{gate:7})}));
 await invalid.wait(message=>message.type==='error'&&message.status===400);await invalid.closed();
 const binary=await connect(fresh,drivers[1]);await binary.wait(message=>message.type==='snapshot');binary.socket.send(Buffer.from('{}'));
 await binary.wait(message=>message.type==='error'&&message.status===400);await binary.closed();
 const malformed=await connect(fresh,drivers[1]);await malformed.wait(message=>message.type==='snapshot');malformed.socket.send('[');
 await malformed.wait(message=>message.type==='error'&&message.status===400);await malformed.closed();
 const large=await connect(fresh,drivers[1]);await large.wait(message=>message.type==='snapshot');large.socket.send('x'.repeat(12001));
 assert.equal((await large.closed()).code,1009);
 const fast=await connect(fresh,drivers[1]);await fast.wait(message=>message.type==='snapshot');
 for(let index=0;index<25;index++)fast.socket.send(JSON.stringify({action:'state',state:state(30,4+index)}));
 await fast.wait(message=>message.type==='error'&&message.status===429);assert.equal((await fast.closed()).code,1008);
 console.log('PASS WebSocket boundaries: denied origins/query credentials, invalid auth/version/state, auth timeout, binary/JSON/12 KB limits and frame rate.');

 const rotating=await server({lifetimeMs:150});
 const rotation=await connect(rotating,drivers[2]);await rotation.wait(message=>message.type==='snapshot');
 await rotation.wait(message=>message.type==='reconnect'&&message.reason==='rotation');assert.equal((await rotation.closed()).code,1012);
 const rotated=await connect(rotating,drivers[2]);assert.equal((await rotated.wait(message=>message.type==='snapshot')).players.length,6);await stop(rotating);
 let failDatabase=false;
 const faultDB={...postgresAdapter(sql),batch(statements){if(failDatabase)return Promise.reject(Error('test database unavailable'));return DB.batch(statements);}};
 const failing=await server({getDatabase:async()=>faultDB});const fallback=await connect(failing,drivers[2]);await fallback.wait(message=>message.type==='snapshot');
 failDatabase=true;await fallback.wait(message=>message.type==='error'&&message.status===503);await fallback.closed();
 assert.equal(check(await action('tick',drivers[2])).players.length,6);
 console.log('PASS WebSocket resilience: bounded lifetime, reconnect and database failure close the socket while durable HTTP remains available.');

 const finishSockets=await Promise.all(drivers.slice(0,3).map((driver,index)=>connect(index%2?two:fresh,driver)));
 for(const client of finishSockets)await client.wait(message=>message.type==='snapshot');
 for(let second=1;second<=Math.ceil(started.trackLength/35);second++){
  clock+=1000;
  const progress=Math.min(started.trackLength,second*35),gate=Math.min(12,Math.floor(progress/(started.trackLength/12)+1e-9)),sequence=100+second;
  await pg.query('UPDATE breuer_gp.players SET seen=$1 WHERE room=$2',[clock,drivers[0].code]);
  const elapsed=(clock-started.startAt)/1000;
  const update=state(progress,sequence,{gate,finish:progress===started.trackLength?elapsed:null,raceTime:elapsed,finishRaceTime:progress===started.trackLength?elapsed:undefined});
  finishSockets.forEach(client=>client.socket.send(JSON.stringify({action:'state',state:update})));
  await Promise.all(drivers.slice(3).map(driver=>action('tick',driver,{state:update}).then(check)));
  await Promise.all(finishSockets.map(client=>client.wait(message=>message.type==='snapshot'&&message.players.every(player=>player.state?.sequence===sequence))));
 }
 const mixedFinish=check(await action('tick',drivers[0]));
 assert.ok(mixedFinish.players.every(player=>player.state.finish!==null&&player.state.gate===12));
 const confirmedFinish=mixedFinish.players.find(player=>player.id===drivers[0].id).state.finish;
 clock+=1000;finishSockets[0].socket.send(JSON.stringify({action:'state',state:state(started.trackLength,999,{gate:12})}));
 await finishSockets[0].wait(message=>message.type==='snapshot'&&message.players.find(player=>player.id===drivers[0].id)?.state?.finish===confirmedFinish);
 assert.equal(check(await action('tick',drivers[0])).players.find(player=>player.id===drivers[0].id).state.finish,confirmedFinish);
 console.log('PASS mixed transport race: six plausible checkpoint traversals, socket/HTTP finishing and immutable confirmed finishes.');

 // A driver leaving the authoritative room immediately revokes an open socket.
 const revoked=await connect(fresh,drivers[3]);await revoked.wait(message=>message.type==='snapshot');
 check(await action('leave',drivers[3]));await revoked.wait(message=>message.type==='error'&&message.status===403);await revoked.closed();
 for(const driver of drivers.filter(driver=>driver.id!==drivers[3].id))check(await action('leave',driver));
 assert.equal((await pg.query('SELECT COUNT(*)::INT AS count FROM breuer_gp.rooms')).rows[0].count,0);
 console.log('PASS WebSocket revocation and cleanup: leave removes access and every test room is deleted.');

 // A slow HTTP fallback between socket updates must not move the previous
 // position's timestamp forward and turn the next real socket movement into
 // a jump. The database executes the actual production queries throughout.
 const {drivers:slowDrivers}=await room(2),slow=slowDrivers[0],timed=await connect(fresh,slow);
 await timed.wait(message=>message.type==='snapshot');
 timed.socket.send(JSON.stringify({action:'state',state:state(35,1,{x:35})}));
 await timed.wait(message=>message.type==='snapshot'&&message.players.find(player=>player.id===slow.id)?.state?.sequence===1);
 clock+=1000;const receivedAt=clock;
 const slowAuthDB={...DB,prepare(query){
  const prepared=DB.prepare(query);
  if(query.startsWith('SELECT r.*, p.id AS player_id')){
   const first=prepared.first.bind(prepared);
   prepared.first=async()=>{const value=await first();clock+=5000;return value;};
  }
  return prepared;
 }};
 const fallbackPosition=check(await action('tick',slow,{state:state(70,2,{x:70,updatedAt:receivedAt+999999})},{database:slowAuthDB}));
 assert.equal(fallbackPosition.players.find(player=>player.id===slow.id).state.updatedAt,receivedAt);
 await timed.wait(message=>message.type==='snapshot'&&message.players.find(player=>player.id===slow.id)?.state?.sequence===2);
 clock=receivedAt+5500;
 timed.socket.send(JSON.stringify({action:'state',state:state(240,3,{x:240,gate:2})}));
 const continued=await timed.wait(message=>message.type==='snapshot'&&message.players.find(player=>player.id===slow.id)?.state?.sequence===3);
 const retainedState=continued.players.find(player=>player.id===slow.id).state;
 assert.equal(retainedState.progress,240);assert.equal(timed.socket.readyState,WebSocket.OPEN);
 clock+=50;const oldAt=clock;
 timed.socket.send(JSON.stringify({action:'state',state:state(0,1,{x:-1800,z:700})}));
 const ignored=await timed.wait(message=>message.type==='snapshot'&&message.serverTime>=oldAt&&message.players.find(player=>player.id===slow.id)?.state?.sequence===3);
 assert.deepEqual(ignored.players.find(player=>player.id===slow.id).state,retainedState);
 timed.socket.send(JSON.stringify({action:'state',state:state(240,4,{x:1800,gate:2})}));
 await timed.wait(message=>message.type==='error'&&message.status===400);await timed.closed();
 for(const driver of slowDrivers)check(await action('leave',driver));
 assert.equal((await pg.query('SELECT COUNT(*)::INT AS count FROM breuer_gp.rooms')).rows[0].count,0);
 console.log('PASS WebSocket transport timing: large old HTTP/WS deltas survive reconnect, slow HTTP auth preserves subsequent real WS movement and new jumps still close the socket.');

 // The HTTP fallback can advance between hello's authentication and roster
 // reads. A socket must validate from its confirmed roster, not the old auth
 // row: these compressed deliveries pass individually but skip too far when
 // the intermediate confirmed position is accidentally omitted.
 const {drivers:helloDrivers,started:helloStarted}=await room(2),helloDriver=helloDrivers[0];
 clock=helloStarted.startAt+10000;
 check(await action('tick',helloDriver,{state:state(35,11,{x:35})}));
 let advanceDuringHello=true;
 const helloDB={...DB,prepare(query){
  const prepared=DB.prepare(query);
  if(query.startsWith('SELECT r.*, p.id AS player_id')){
   const first=prepared.first.bind(prepared);
   prepared.first=async()=>{
    const value=await first();
    if(advanceDuringHello){
     advanceDuringHello=false;clock=helloStarted.startAt+10100;
     check(await action('tick',helloDriver,{state:state(55,17,{x:55})}));
     clock=helloStarted.startAt+10200;
    }
    return value;
   };
  }
  return prepared;
 }};
 const helloServer=await server({getDatabase:async()=>helloDB}),helloClient=await connect(helloServer,helloDriver);
 const confirmed=(await helloClient.wait(message=>message.type==='snapshot')).players.find(player=>player.id===helloDriver.id).state;
 assert.equal(confirmed.sequence,17);assert.equal(confirmed.progress,55);
 helloClient.socket.send(JSON.stringify({action:'state',state:state(75,23,{x:75})}));
 const continuedHello=await helloClient.wait(message=>message.type==='error'||message.type==='snapshot'&&message.players.find(player=>player.id===helloDriver.id)?.state?.sequence===23);
 assert.equal(continuedHello.type,'snapshot',JSON.stringify(continuedHello));
 assert.equal(continuedHello.players.find(player=>player.id===helloDriver.id).state.progress,75);
 assert.equal(helloClient.socket.readyState,WebSocket.OPEN,'Hello must validate from the exact state its snapshot already confirmed');
 helloClient.socket.send(JSON.stringify({action:'state',state:state(75,24,{x:1800})}));
 await helloClient.wait(message=>message.type==='error'&&message.status===400);await helloClient.closed();
 for(const driver of helloDrivers)check(await action('leave',driver));
 await stop(helloServer);
 assert.equal((await pg.query('SELECT COUNT(*)::INT AS count FROM breuer_gp.rooms')).rows[0].count,0);
 console.log('PASS WebSocket hello convergence: HTTP advances during hello, the confirmed roster becomes the validation baseline and new jumps remain rejected.');

 const {drivers:capturedDrivers,started:capturedStart}=await room(2,{laps:2}),captured=capturedDrivers[0],total=capturedStart.trackLength*2;
 const captureState=(progress,sequence,raceTime,extra={})=>state(progress,sequence,{x:progress,gate:Math.floor(progress/(capturedStart.trackLength/12)),raceTime,...extra});
 clock=capturedStart.startAt+21000;
 const captureClient=await connect(fresh,captured);await captureClient.wait(message=>message.type==='snapshot');
 captureClient.socket.send(JSON.stringify({action:'state',state:captureState(512,160,16)}));
 await captureClient.wait(message=>message.type==='snapshot'&&message.players.find(player=>player.id===captured.id)?.state?.sequence===160);
 clock=capturedStart.startAt+22150;
 captureClient.socket.send(JSON.stringify({action:'state',state:captureState(708.8,222,22.15)}));
 const captureSnapshot=await captureClient.wait(message=>message.type==='error'||message.type==='snapshot'&&message.players.find(player=>player.id===captured.id)?.state?.sequence===222);
 assert.equal(captureSnapshot.type,'snapshot',JSON.stringify(captureSnapshot));
 const capturedPosition=captureSnapshot.players.find(player=>player.id===captured.id).state;
 assert.equal(capturedPosition.updatedAt,clock);assert.equal(capturedPosition.raceTime,22.15);
 captureClient.socket.close();await captureClient.closed();
 for(const [at,progress,raceTime] of [[22250,750,22.15],[22250,750,22.25],[22250,709,52.25],[22250,709,22.05],[32000,1800,32]]){
  clock=capturedStart.startAt+at;
  const invalid=await connect(fresh,captured);await invalid.wait(message=>message.type==='snapshot');
  invalid.socket.send(JSON.stringify({action:'state',state:captureState(progress,223,raceTime)}));
  await invalid.wait(message=>message.type==='error'&&message.status===400);await invalid.closed();
 }
 clock=capturedStart.startAt+33000;
 const oldCapture=await connect(fresh,captured);await oldCapture.wait(message=>message.type==='snapshot');
 clock+=50;const oldCaptureAt=clock;
 oldCapture.socket.send(JSON.stringify({action:'state',state:captureState(300,300,16)}));
 const oldIgnored=await oldCapture.wait(message=>message.type==='snapshot'&&message.serverTime>=oldCaptureAt);
 assert.deepEqual(oldIgnored.players.find(player=>player.id===captured.id).state,capturedPosition);
 assert.equal((await pg.query('SELECT seen FROM breuer_gp.players WHERE id=$1',[captured.id])).rows[0].seen,clock);
 oldCapture.socket.close();await oldCapture.closed();

 clock=capturedStart.startAt+75000;
 check(await action('tick',captured,{state:captureState(total-100,500,74)}));
 const finishClient=await connect(fresh,captured);await finishClient.wait(message=>message.type==='snapshot');
 clock=capturedStart.startAt+84000;
 finishClient.socket.send(JSON.stringify({action:'state',state:captureState(total,501,78,{finish:78,finishRaceTime:78})}));
 const lateFinish=await finishClient.wait(message=>message.type==='error'||message.type==='snapshot'&&message.players.find(player=>player.id===captured.id)?.state?.finish===78);
 assert.equal(lateFinish.type,'snapshot',JSON.stringify(lateFinish));
 const finishedState=lateFinish.players.find(player=>player.id===captured.id).state;
 assert.equal(finishedState.updatedAt,clock);assert.equal(finishedState.finishRaceTime,78);
 clock=capturedStart.startAt+90000;
 finishClient.socket.send(JSON.stringify({action:'state',state:captureState(total,502,90,{finish:null,finishRaceTime:78})}));
 const immutable=await finishClient.wait(message=>message.type==='snapshot'&&message.serverTime>=clock);
 assert.deepEqual(immutable.players.find(player=>player.id===captured.id).state,finishedState);
 finishClient.socket.close();await finishClient.closed();

 const endpoint=await connect(fresh,capturedDrivers[1]);await endpoint.wait(message=>message.type==='snapshot');
 endpoint.socket.send(JSON.stringify({action:'state',state:captureState(total,1,90)}));
 await endpoint.wait(message=>message.type==='snapshot'&&message.players.find(player=>player.id===capturedDrivers[1].id)?.state?.sequence===1);
 endpoint.socket.send(JSON.stringify({action:'state',state:captureState(total,2,90,{finish:84,finishRaceTime:84})}));
 const recovered=await endpoint.wait(message=>message.type==='snapshot'&&message.players.find(player=>player.id===capturedDrivers[1].id)?.state?.finish===84);
 assert.equal(recovered.players.find(player=>player.id===capturedDrivers[1].id).state.finishRaceTime,84);
 endpoint.socket.send(JSON.stringify({action:'state',state:captureState(total,3,90,{finish:120,finishRaceTime:120})}));
 await endpoint.wait(message=>message.type==='error'&&message.status===400);await endpoint.closed();
 for(const driver of capturedDrivers)check(await action('leave',driver));
 assert.equal((await pg.query('SELECT COUNT(*)::INT AS count FROM breuer_gp.rooms')).rows[0].count,0);
 console.log('PASS WebSocket capture timing: delayed 32 m/s positions/finish and endpoint retry converge; bounded/monotone time, large jumps, future events and immutable finish remain protected.');
 const bendRoom=await room(2,{trackId:'kraemer',laps:2,rules:'classic'}),bend=bendRoom.drivers[0];
 clock=bendRoom.started.startAt+20000;
 const bendClient=await connect(fresh,bend);await bendClient.wait(message=>message.type==='snapshot');
 bendClient.socket.send(JSON.stringify({action:'state',state:state(254.15,1,{x:10,z:10,gate:1,raceTime:20})}));
 await bendClient.wait(message=>message.type==='snapshot'&&message.players.find(player=>player.id===bend.id)?.state?.sequence===1);
 clock+=100;
 bendClient.socket.send(JSON.stringify({action:'state',state:state(280.68,2,{x:10.8,z:10,gate:2,raceTime:20.1})}));
 const bendUpdate=await bendClient.wait(message=>message.type==='error'||message.type==='snapshot'&&message.players.find(player=>player.id===bend.id)?.state?.sequence===2);
 assert.equal(bendUpdate.type,'snapshot',JSON.stringify(bendUpdate));
 assert.equal(bendUpdate.players.find(player=>player.id===bend.id).state.progress,280.68);
 clock+=100;
 bendClient.socket.send(JSON.stringify({action:'state',state:state(350,3,{x:11.6,z:10,gate:2,raceTime:20.2})}));
 await bendClient.wait(message=>message.type==='error'&&message.status===400);await bendClient.closed();
 for(const driver of bendRoom.drivers)check(await action('leave',driver));
 console.log('PASS WebSocket sharp-bend projection survives normal motion; excessive progress remains rejected.');
}finally{
 Date.now=realNow;
 for(const socket of clients)if(socket.readyState!==WebSocket.CLOSED)socket.terminate();
 for(const value of servers)await stop(value);
 await pg.close();
}
