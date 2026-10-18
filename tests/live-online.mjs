import {CARS} from '../src/car-catalog.js';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {writeFile} from 'node:fs/promises';
import {Agent as HTTPSAgent} from 'node:https';
import {Agent as HTTPAgent} from 'node:http';
import {WebSocket} from 'ws';
import {Track} from '../src/race-core.js';
import {NetworkSampleClock} from '../src/network-clock.js';

// Explicit target only: this creates one short-lived room on an authorized
// public deployment. It never needs a database URL or a Vercel bypass token.
const supplied=process.argv[2];
if(!supplied||supplied.startsWith('--'))throw Error('Usage: node tests/live-online.mjs https://public-game.example [--race] [--require-ws] [--output report.json]');
const base=new URL(supplied);
assert.ok(['http:','https:'].includes(base.protocol)&&!base.username&&!base.password&&!base.search&&!base.hash,'Use a public game URL without credentials or query parameters.');
base.pathname='/';
// Follow the environment's configured network proxy, just as fetch does.
// No alternate DNS, bypass token or changed network restrictions are used.
const socketAgent=new (base.protocol==='https:'?HTTPSAgent:HTTPAgent)({proxyEnv:process.env});
const fullRace=process.argv.includes('--race'),requireWS=process.argv.includes('--require-ws');
const outputIndex=process.argv.indexOf('--output'),outputPath=outputIndex>=0?process.argv[outputIndex+1]:null;
if(outputIndex>=0&&!outputPath)throw Error('--output requires a file path.');
const drivers=[],socketClients=[],samples=[],statuses={},heartbeatPending=new Map(),fallbackPending=new Map();
const report={target:base.origin,testedAt:new Date().toISOString(),kind:fullRace?'six-protocol-client-race':'six-protocol-client-smoke',passed:false,checks:[],websocket:{connected:0,reconnections:0,receivedSnapshots:0},cleanup:false};
let failed,heartbeatTimer,stateTimer,heartbeatFailure,pumpFailure,liveClock,raceStartAt;
let clockOffset=-Infinity;
const auth=driver=>({id:driver.id,token:driver.token});
const diagnosticState=state=>state?Object.fromEntries(['sequence','progress','gate','x','z','updatedAt','raceTime','finishRaceTime','finish'].map(key=>[key,state[key]])):null;
function observeSnapshot(snapshot){
 if(!Number.isFinite(snapshot?.serverTime))return;
 // Receipt-based estimates never guess a future time from an asymmetric RTT.
 // A later, less delayed response can advance the sample clock, never rewind it.
 clockOffset=Math.max(clockOffset,snapshot.serverTime-Date.now());
 if(liveClock)liveClock.observe(Math.max(0,(snapshot.serverTime-raceStartAt)/1000));
}
async function request(path,body){
 const started=performance.now(),response=await fetch(new URL(path,base),{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json',Origin:base.origin},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(15000),redirect:'manual'});
 samples.push(performance.now()-started);statuses[response.status]=(statuses[response.status]||0)+1;
 let data;try{data=await response.json();}catch{throw Error(`Public JSON endpoint returned HTTP ${response.status}; a protected deployment is not supported by this test.`);}
 return {status:response.status,data};
}
const expect=(response,status=200)=>{assert.equal(response.status,status,`Expected HTTP ${status}, received ${response.status}: ${response.data?.error||'unexpected response'}`);return response.data;};
const action=(name,driver,extra={})=>request(`/api/rooms/${driver.code}/${name}`,{...auth(driver),...extra});
const wait=milliseconds=>new Promise(resolve=>setTimeout(resolve,Math.max(0,milliseconds)));
async function closeClient(client){
 if(!client||client.socket.readyState===WebSocket.CLOSED)return;
 client.socket.close();
 await Promise.race([new Promise(resolve=>client.socket.once('close',resolve)),wait(500)]);
 if(client.socket.readyState!==WebSocket.CLOSED)client.socket.terminate();
}
async function connect(driver){
 const wsURL=new URL('/api/realtime',base);wsURL.protocol=base.protocol==='https:'?'wss:':'ws:';
 const socket=new WebSocket(wsURL,{agent:socketAgent,headers:{Origin:base.origin}}),messages=[];
 const client={socket,messages,ready:false,closed:false,error:null,stateFrames:0};socketClients.push(client);
 socket.on('error',error=>{client.ready=false;client.error=`connection error (${error.code||'NETWORK'})`;});
 socket.on('close',()=>{client.ready=false;client.closed=true;});
 socket.on('message',raw=>{
  let message;try{message=JSON.parse(raw.toString());}catch{return;}
  if(message.type==='snapshot'){
   observeSnapshot(message);
   liveClock?.observe(message.players?.find(value=>value.id===driver.id)?.state?.raceTime);
   client.ready=true;messages.push(message);report.websocket.receivedSnapshots++;if(messages.length>8)messages.shift();
   client.lastSnapshot={serverTime:message.serverTime,receivedAt:Date.now(),state:diagnosticState(message.players?.find(value=>value.id===driver.id)?.state)};
  }
  if(message.type==='error'){
   client.ready=false;client.error=`server status ${message.status}`;
   (report.websocket.serverErrors??=[]).push({driver:drivers.findIndex(value=>value.id===driver.id)+1,status:message.status,error:message.error,previousSnapshot:client.lastSnapshot,lastSent:client.lastSent});
  }
 });
 try{
  await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('WebSocket connection timeout')),12000);
   const done=callback=>value=>{clearTimeout(timer);callback(value);};
   socket.once('open',done(resolve));socket.once('error',done(reject));
   socket.once('unexpected-response',(_,response)=>{response.resume();clearTimeout(timer);reject(Error(`WebSocket HTTP ${response.statusCode}`));});
  });
  socket.send(JSON.stringify({action:'hello',code:driver.code,...auth(driver),trackVersion:driver.trackVersion}));
  const until=performance.now()+12000;
  while(!client.ready&&!client.closed&&!client.error&&performance.now()<until)await wait(25);
  if(!client.ready)throw Error(client.error||'No WebSocket snapshot');
  return client;
 }catch(error){(report.websocket.connectionFailures??=[]).push(client.error||error.message);await closeClient(client);return null;}
}
function checkSnapshot(snapshot,count=6){
 assert.equal(snapshot.players.length,count);assert.ok(!JSON.stringify(snapshot).includes('token_hash'));
 for(const driver of drivers.slice(0,count))assert.ok(snapshot.players.some(player=>player.id===driver.id));
}
function raceState(track,progress,sequence,raceTime,finish,finishRaceTime){
 const point=track.at(progress);
 return {x:point.x,z:point.z,angle:point.angle,speed:32,progress,gate:Math.min(12,Math.floor(progress/(track.length/12)+1e-9)),shield:0,boost:0,spin:0,finish,finishRaceTime:finishRaceTime??undefined,drifting:false,oil:[],sequence,raceTime};
}
// Actual browser tabs poll independently. A slow request by one driver must
// never prevent the other five from refreshing presence or sending physics.
function refreshPresence(){
 for(const driver of drivers){
  if(heartbeatPending.has(driver.id))continue;
  const pending=action('tick',driver).then(response=>expect(response)).catch(error=>{heartbeatFailure??=error;}).finally(()=>heartbeatPending.delete(driver.id));
  heartbeatPending.set(driver.id,pending);
 }
}
async function stopPresence(){
 clearInterval(heartbeatTimer);heartbeatTimer=null;
 await Promise.all(heartbeatPending.values());
 if(heartbeatFailure)throw heartbeatFailure;
}

try{
 const health=expect(await request('/api/health'));assert.equal(health.ok,true);assert.equal(health.multiplayer,true);
 report.checks.push('database health');
 const route=expect(await request('/tracks/lammersdorf.json')),track=new Track(route.route,{trackId:'lammersdorf',laps:1,rules:'classic'});
 const host=expect(await request('/api/rooms',{name:'QA Max',car:0,config:{trackId:'lammersdorf',laps:1,rules:'classic',opponents:0}}),201);
 drivers.push(host);
 assert.equal(host.config.laps,1);assert.equal(host.trackVersion,route.trackVersion);
 assert.ok(Math.abs(host.trackLength-track.length)<.001);assert.equal(host.ready,false);
 observeSnapshot(host);
 heartbeatTimer=setInterval(refreshPresence,1000);refreshPresence();
 const joins=await Promise.allSettled(Array.from({length:5},(_,index)=>request(`/api/rooms/${host.code}/join`,{name:`QA Fahrer ${index+2}`,car:(index+1)%CARS.length})));
 for(const joined of joins)if(joined.status==='fulfilled'&&joined.value.status===201)drivers.push({...joined.value.data,code:host.code});
 for(const joined of joins){if(joined.status==='rejected')throw joined.reason;expect(joined.value,201);}
 checkSnapshot(expect(await action('tick',host)));report.checks.push('six independent driver identities');
 expect(await request(`/api/rooms/${host.code}/join`,{name:'QA Sieben',car:0}),409);
 expect(await action('start',host),409);expect(await action('start',drivers[1]),403);
 expect(await request(`/api/rooms/${host.code}/tick`,{id:host.id,token:'0'.repeat(48)}),403);
 report.checks.push('capacity, ready and authentication boundaries');
 const configured=expect(await action('config',host,{config:{trackId:'lammersdorf',laps:1,rules:'classic',opponents:0}}));
 assert.equal(configured.configRevision,2);assert.ok(configured.players.every(player=>!player.ready));
 expect(await action('ready',drivers[1],{ready:true,configRevision:1}),409);
 await Promise.all(drivers.map(driver=>action('ready',driver,{ready:true,configRevision:2}).then(response=>expect(response))));
 const started=expect(await action('start',host));checkSnapshot(started);
 observeSnapshot(started);raceStartAt=started.startAt;
 liveClock=new NetworkSampleClock({startAt:raceStartAt,offset:clockOffset});
 assert.ok(started.players.every(player=>player.ready));assert.ok(started.startAt>started.serverTime);
 report.checks.push('shared configuration revision and countdown');
 await wait(started.startAt-(Date.now()+clockOffset)+150);
 const active=await Promise.all(drivers.map(connect));
 report.websocket.connected=active.filter(Boolean).length;
 if(requireWS)assert.equal(report.websocket.connected,6,'The target must accept all six WebSocket clients.');
 // Keep one driver on the exact HTTP path used when a socket is unavailable.
 await closeClient(active[5]);active[5]=null;
 await stopPresence();
 const began=performance.now(),deadline=fullRace?Math.ceil(track.length/32)+40:15;
 let sequence=0,reconnected=false,finishedSnapshot=null,latestSnapshot=null,pumpsStopped=false,raceFinishTime=null,finishSampleTime=null;
 const updateState=()=>{
  const elapsed=Math.max(0,(Date.now()+clockOffset-started.startAt)/1000),travelled=(performance.now()-began)/1000;
  const progress=fullRace?Math.min(track.length,travelled*32):Math.min(100,travelled*10);
  const sampleTime=liveClock.read();
  if(fullRace&&progress>=track.length&&raceFinishTime===null){raceFinishTime=elapsed;finishSampleTime=sampleTime;}
  return raceState(track,progress,++sequence,sampleTime,raceFinishTime,finishSampleTime);
 };
 const pump=()=>{
  if(pumpsStopped||pumpFailure)return;
  const update=updateState();
  drivers.forEach((driver,index)=>{
   const client=active[index];
   if(client?.ready&&client.socket.readyState===WebSocket.OPEN){
    client.lastSent={sentAt:Date.now(),state:diagnosticState(update)};
    client.socket.send(JSON.stringify({action:'state',state:update}));client.stateFrames++;
   }else if(!fallbackPending.has(driver.id)){
    const pending=action('tick',driver,{state:update}).then(response=>{latestSnapshot=expect(response);checkSnapshot(latestSnapshot);observeSnapshot(latestSnapshot);}).catch(error=>{
     pumpFailure??=error;
     report.failureContext??={driver:index+1,transport:'http',state:diagnosticState(update),previousSnapshot:{serverTime:latestSnapshot?.serverTime,state:diagnosticState(latestSnapshot?.players?.find(value=>value.id===driver.id)?.state)}};
    }).finally(()=>fallbackPending.delete(driver.id));
    fallbackPending.set(driver.id,pending);
   }
  });
 };
 stateTimer=setInterval(pump,100);pump();
 while((performance.now()-began)/1000<deadline){
  if(pumpFailure)throw pumpFailure;
  const snapshot=expect(await action('tick',host));checkSnapshot(snapshot);
  observeSnapshot(snapshot);
  latestSnapshot=snapshot;
  if(!reconnected&&(performance.now()-began)/1000>(fullRace?10:2)){
   reconnected=true;await closeClient(active[1]);
   const resumed=expect(await action('tick',drivers[1]));checkSnapshot(resumed);
   observeSnapshot(resumed);
   assert.ok(resumed.players.find(player=>player.id===drivers[1].id).state);
   active[1]=await connect(drivers[1]);if(active[1])report.websocket.reconnections++;
   report.checks.push('same driver reconnects through HTTP and optional WebSocket');
  }
  if(fullRace&&latestSnapshot.players.every(player=>player.state?.finish!==null&&player.state?.finish!==undefined)){
   finishedSnapshot=latestSnapshot;break;
  }
  await wait(700);
 }
 pumpsStopped=true;clearInterval(stateTimer);stateTimer=null;
 await Promise.all(fallbackPending.values());
 if(pumpFailure)throw pumpFailure;
 const last=finishedSnapshot||expect(await action('tick',host));checkSnapshot(last);
 assert.ok(last.players.every(player=>player.state&&player.state.sequence>0));
 report.checks.push('concurrent shared state and HTTP fallback');
 if(fullRace){
  assert.ok(finishedSnapshot,'All six drivers must complete the full plausible checkpoint traversal.');
  assert.ok(last.players.every(player=>player.state.gate===12));
  assert.ok(last.players.every(player=>player.state.finish===raceFinishTime),'A delayed finish must preserve the originally captured race result.');
  assert.ok(last.players.every(player=>player.state.finishRaceTime===finishSampleTime),'A delayed finish must preserve its original sample time.');
  report.raceSeconds=Math.max(...last.players.map(player=>player.state.finish));
  report.checks.push('six validated immutable finishes across twelve checkpoints');
 }
 for(const client of active)await closeClient(client);
 const transferred=expect(await action('leave',host));
 const successor=drivers.find(driver=>driver.id===transferred.hostId);
 assert.ok(successor&&successor.id!==host.id);assert.equal(expect(await action('tick',successor)).host,true);
 report.checks.push('host leaves and connected driver takes over');
 report.passed=true;
}catch(error){failed=error;report.failure=error.message;}
finally{
 clearInterval(heartbeatTimer);clearInterval(stateTimer);
 await Promise.all(heartbeatPending.values());
 await Promise.all(fallbackPending.values());
 for(const client of socketClients)await closeClient(client);
 socketAgent.destroy();
 report.websocket.sentStateFrames=socketClients.reduce((total,client)=>total+client.stateFrames,0);
 const cleanup=await Promise.allSettled(drivers.map(driver=>action('leave',driver)));
 report.cleanup=cleanup.every(result=>result.status==='fulfilled'&&[200,403,404].includes(result.value.status));
 const ordered=samples.toSorted((a,b)=>a-b);
 report.http={requests:samples.length,statuses,medianMs:Math.round(ordered[Math.floor(ordered.length*.5)]||0),p95Ms:Math.round(ordered[Math.min(ordered.length-1,Math.floor(ordered.length*.95))]||0)};
 if(outputPath)await writeFile(outputPath,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));
}
if(failed)throw Error(`Live online verification failed: ${failed.message}`);
assert.equal(report.cleanup,true,'Every owned test room must be left.');
