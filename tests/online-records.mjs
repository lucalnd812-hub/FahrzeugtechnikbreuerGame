import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import {OnlineRecords} from '../src/online-records.js';
import {createDriverProfileUI} from '../src/driver-profile-ui.js';
import {initializeDatabase,postgresAdapter} from '../server/database.js';
import {handleLeaderboardsAPI} from '../server/leaderboards.js';
import {recordCategory} from '../src/race-modes.js';
import {HANDLING_VERSION} from '../src/car-catalog.js';
import {TRACKS} from '../src/tracks.js';
import {Target,mobileDOM} from './mobile-dom.mjs';

const config={trackId:TRACKS[0].id,trackVersion:TRACKS[0].version,handlingVersion:HANDLING_VERSION,car:0,laps:1,rules:'classic',mode:'time-trial',raceType:'solo',opponents:0,difficulty:.91,assist:true,autoDrift:true};
const result={time:60,sectors:[20,20,20]};
const memory=()=>{const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value))};};
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const fakeIdentity=(name='QA Driver',id='00000000-0000-4000-8000-000000000001')=>({profile:{id,name,createdAt:1},token:'a'.repeat(64)});
const ready=async()=>{for(let turn=0;turn<4;turn++)await Promise.resolve();};

// Transport scheduling: deferred replies exercise real client ownership and
// concurrency. PostgreSQL-backed round trips are exercised separately below.
{
 const calls=[],started=deferred(),finished=deferred(),identity=fakeIdentity();
 const client=new OnlineRecords({storage:memory(),request:(path,body)=>{calls.push({path,body:structuredClone(body)});if(path==='/runs/start')return started.promise;if(path==='/profiles')return Promise.resolve(identity);if(path==='/runs/finish')return finished.promise;throw Error('Unexpected endpoint');}});
 const original=structuredClone(config),session=client.start(original);assert.equal(client.active,session);assert(!session.then,'Starting a run returns immediately, without awaiting the network');assert.equal(calls.length,0);await ready();assert.equal(calls.length,1);assert.deepEqual(Object.keys(calls[0].body),['category'],'A new driver starts an anonymous ticket');
 original.car=4;original.laps=5;assert.deepEqual(session.category,recordCategory(config),'The race owns a category snapshot');
 await assert.rejects(client.submit(session,result),/Fahrernamen/);assert.equal(calls.filter(call=>call.path==='/runs/finish').length,0);
 await client.create('QA Driver');const one=client.submit(session,result),two=client.submit(session,result);await ready();assert.equal(calls.filter(call=>call.path==='/runs/finish').length,0,'Finish waits for its own delayed ticket, not a race-start wait');
 started.resolve({runId:'old-race',runToken:'b'.repeat(64)});await ready();assert.equal(calls.filter(call=>call.path==='/runs/finish').length,1,'Repeated submit clicks share one network write');const body=calls.at(-1).body;assert.equal(body.runId,'old-race');assert(body.runToken==='b'.repeat(64));assert.deepEqual(body.sectors,[20,20,20]);
 const answer={accepted:true,rank:1,record:{time:60}};finished.resolve(answer);assert.equal(await one,answer);assert.equal(await two,answer);assert.equal(await client.submit(session,{time:70,sectors:[20,20,30]}),answer);assert.equal(calls.filter(call=>call.path==='/runs/finish').length,1,'A confirmed result is not written again');
 assert(calls.every(call=>!call.path.includes('?')&&!call.path.includes(identity.token)&&!call.path.includes('b'.repeat(64))),'Credentials stay in request bodies, never URLs');
}
{
 const tickets=[deferred(),deferred()],calls=[];let next=0;
 const client=new OnlineRecords({storage:memory(),request:(path,body)=>{calls.push({path,body});return tickets[next++].promise;}});
 const older=client.start(config),newer=client.start({...config,car:4});await ready();tickets[1].resolve({runId:'new-race'});await newer.promise;assert.equal(client.active,newer);tickets[0].resolve({runId:'old-race'});await older.promise;assert.equal(older.ticket.runId,'old-race');assert.equal(newer.ticket.runId,'new-race');assert.equal(client.active,newer,'An old ticket reply must not replace the newer active race');client.clear();assert.equal(client.active,null);
 const before=calls.length,excluded=client.start(config,{eligible:false});await ready();assert(excluded.ineligible);assert.equal(calls.length,before,'Demo/benchmark starts do not reserve ranking tickets');client.remember(fakeIdentity());await assert.rejects(client.submit(excluded,result),/Vorführ-/);
}
{
 let writes=0;const bodies=[],client=new OnlineRecords({storage:memory(),request:async(path,body)=>{bodies.push({path,body:structuredClone(body)});if(path==='/runs/start')return {runId:'retry-race'};if(++writes===1)throw Error('Reply lost');return {accepted:true,duplicate:true};}});client.remember(fakeIdentity());const session=client.start(config);await session.promise;await assert.rejects(client.submit(session,result),/Reply lost/);const accepted=await client.submit(session,result);assert(accepted.accepted);assert.deepEqual(bodies.filter(value=>value.path==='/runs/finish').map(value=>value.body.runId),['retry-race','retry-race']);
 const offline=new OnlineRecords({storage:memory(),request:async()=>{throw Error('Temporarily offline');}});offline.remember(fakeIdentity());const missing=offline.start(config);assert.equal(await missing.promise,null);await assert.rejects(offline.submit(missing,result),/Temporarily offline/);assert(missing.error);
 const sessionOnly=new OnlineRecords({storage:{getItem(){throw Error('blocked');},setItem(){throw Error('quota');}},request:async()=>fakeIdentity('Session Driver')});await sessionOnly.create('Session Driver');assert.equal(sessionOnly.profile.name,'Session Driver');assert.equal(sessionOnly.persistent,false);assert.equal(sessionOnly.exportPass().profileId,sessionOnly.profile.id);
 for(const raw of ['{bad','null',JSON.stringify({profile:{id:'x',name:'x'},token:'short'})])assert.equal(new OnlineRecords({request:async()=>{},storage:{getItem:()=>raw}}).profile,null);
}

// Real shipped handler and production SQL in a private PostgreSQL database.
const directory=await mkdtemp(join(tmpdir(),'breuer-online-client-')),realNow=Date.now;
let clock=realNow(),pg,DB;Date.now=()=>clock;
const databaseResult=value=>({rows:value.rows,rowCount:value.affectedRows??value.rows.length});
try{
 pg=new PGlite(directory);await pg.waitReady;const sql={query(text,params=[]){return {text,params,then(resolve,reject){return pg.query(text,params).then(databaseResult).then(resolve,reject);}};},transaction(queries){return pg.transaction(async tx=>{const output=[];for(const query of queries)output.push(databaseResult(await tx.query(query.text,query.params)));return output;});}};await initializeDatabase(sql);DB=postgresAdapter(sql);
 const calls=[];let loseNextFinish=false;
 const request=async(path,body)=>{
  calls.push({path,body:structuredClone(body)});const response=await handleLeaderboardsAPI(new Request('https://game.test/api'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),{DB}),data=await response.json();
  if(!response.ok){const error=Error(data.error);error.code=data.code;error.status=response.status;throw error;}
  if(path==='/runs/finish'&&loseNextFinish){loseNextFinish=false;throw Error('The result was committed, but its reply was lost');}
  return data;
 };
 const storage=memory(),client=new OnlineRecords({request,storage}),anonymous=client.start(config);await anonymous.promise;assert(anonymous.ticket.runToken&&/^[a-f0-9]{64}$/.test(anonymous.ticket.runToken));const row=(await pg.query('SELECT profile_id,run_token_hash FROM breuer_gp.leaderboard_runs WHERE id=$1',[anonymous.ticket.runId])).rows[0];assert.equal(row.profile_id,null);assert(row.run_token_hash!==anonymous.ticket.runToken&&/^[a-f0-9]{64}$/.test(row.run_token_hash));
 clock+=70_000;await client.create('QA First Finish');const first=await client.submit(anonymous,result);assert(first.accepted&&first.improved);assert.equal(first.rank,1);assert.equal((await pg.query('SELECT profile_id FROM breuer_gp.leaderboard_runs WHERE id=$1',[anonymous.ticket.runId])).rows[0].profile_id,client.profile.id,'The new driver can claim the already finished anonymous run');
 const board=await client.board(config);assert.equal(board.totalPlayers,1);assert.equal(board.own.time,60);assert.equal(board.own.name,'QA First Finish');
 const pass=client.exportPass();assert.deepEqual(Object.keys(pass).sort(),['profileId','token','type','version']);const replica=new OnlineRecords({request,storage:memory()});await replica.restore(JSON.stringify(pass));assert.equal(replica.profile.id,client.profile.id);assert(calls.some(call=>call.path==='/profiles/session'),'Import authenticates the private pass with the server');
 const remembered=new OnlineRecords({request,storage});assert.equal(remembered.profile.id,client.profile.id);const originalId=replica.profile.id;
 await assert.rejects(replica.restore({...pass,token:'f'.repeat(64)}),error=>error.code==='PROFILE_AUTH');assert.equal(replica.profile.id,originalId,'A rejected import cannot overwrite the current driver');
 const beforeInvalid=calls.length;for(const value of ['{', 'x'.repeat(8001), {...pass,type:'other'}, {...pass,version:2}, {...pass,token:'bad'}])await assert.rejects(replica.restore(value),/Fahrerpass|Datei/);assert.equal(calls.length,beforeInvalid,'Malformed pass files never send credentials to a server');
 await assert.rejects(replica.create('qa first finish'),error=>error.code==='NAME_TAKEN');assert.equal(replica.profile.id,originalId);
 const bound=client.start({...config,car:4});await bound.promise;assert(!bound.ticket.runToken,'Authenticated tickets use the existing driver');clock+=70_000;loseNextFinish=true;await assert.rejects(client.submit(bound,{time:58,sectors:[20,20,18]}),/reply was lost/);const retry=await client.submit(bound,{time:58,sectors:[20,20,18]});assert(retry.accepted&&retry.duplicate);assert.equal((await client.board({...config,car:4})).own.time,58);assert.equal((await client.board(config)).own.time,60,'The second car keeps its own leaderboard');
 const stranger=new OnlineRecords({request,storage:memory()});await stranger.create('QA Other Driver');await assert.rejects(stranger.submit({...anonymous,accepted:null,submitting:null},result),error=>error.code==='RUN_NOT_FOUND','A different profile cannot claim a completed anonymous ticket');
 // Reopening midway must reuse the original server start, including for a
 // first-time driver whose profile is chosen only after the finish line.
 const anonymousStorage=memory(),anonymousClient=new OnlineRecords({request,storage:anonymousStorage}),resumeKey='breuer-ranked-run:QA0001:driver:12345';anonymousStorage.setItem('unrelated-setting','keep');
 const initial=anonymousClient.start(config,{resumeKey});await initial.promise;const startsBefore=calls.filter(call=>call.path==='/runs/start').length;clock+=35_000;
 const reloaded=new OnlineRecords({request,storage:anonymousStorage}),continued=reloaded.start(config,{resumeKey});assert(continued.resumed);await continued.promise;assert.equal(continued.ticket.runId,initial.ticket.runId);assert.equal(calls.filter(call=>call.path==='/runs/start').length,startsBefore,'A reopened browser reuses the original ticket rather than resetting elapsed time');clock+=35_000;await reloaded.create('QA Rejoin First');const rejoinedResult=await reloaded.submit(continued,result);assert(rejoinedResult.accepted);assert.equal(anonymousStorage.getItem(resumeKey),'null','A successful result removes its private run cache');assert.equal(anonymousStorage.getItem('unrelated-setting'),'keep');assert.equal(new OnlineRecords({request,storage:anonymousStorage}).profile.id,reloaded.profile.id,'Removing the run ticket must preserve the driver pass');
 const categoryKey='breuer-ranked-run:QA0002:driver:12345',oldCategory=client.start({...config,car:1},{resumeKey:categoryKey});await oldCategory.promise;
 const secondClient=new OnlineRecords({request,storage}),newCategory=secondClient.start({...config,car:2},{resumeKey:categoryKey});await newCategory.promise;assert(!newCategory.resumed);assert.notEqual(newCategory.ticket.runId,oldCategory.ticket.runId);clock+=70_000;await client.submit(oldCategory,result);assert.equal(JSON.parse(storage.getItem(categoryKey)).ticket.runId,newCategory.ticket.runId,'Completing an older setup cannot delete a newer ticket in the same cache slot');await secondClient.submit(newCategory,result);assert.equal(storage.getItem(categoryKey),'null');
 const ownerKey='breuer-ranked-run:QA0003:driver:12345',owner=client.start(config,{resumeKey:ownerKey});await owner.promise;const foreignStorage=memory();foreignStorage.setItem(ownerKey,storage.getItem(ownerKey));const foreign=new OnlineRecords({request,storage:foreignStorage});foreign.remember({profile:stranger.profile,token:stranger.exportPass().token});const notMine=foreign.start(config,{resumeKey:ownerKey});await notMine.promise;assert(!notMine.resumed);assert.notEqual(notMine.ticket.runId,owner.ticket.runId,'A different driver cannot recover a profile-bound ticket');
 const expiryKey='breuer-ranked-run:QA0004:driver:12345',expires=client.start(config,{resumeKey:expiryKey});await expires.promise;clock=expires.ticket.expiresAt+1;const fresh=new OnlineRecords({request,storage}).start(config,{resumeKey:expiryKey});await fresh.promise;assert(!fresh.resumed);assert.notEqual(fresh.ticket.runId,expires.ticket.runId,'Expired private tickets never reset an honest finish onto an invalid ticket');
 console.log('PASS OnlineRecords: nonblocking tickets, race/category ownership, anonymous post-finish claim, pending-submit deduplication, reply-loss idempotency, authenticated pass import, storage fallback, private reconnect cache with original start, owner/category/expiry checks and real PostgreSQL round trips');
}finally{Date.now=realNow;await pg?.close();await rm(directory,{recursive:true,force:true});}

// Actual profile/leaderboard UI functions with browser-shaped DOM events.
// This verifies asynchronous UI ownership and escaping, not CSS/GPU rendering.
function uiHarness(client){
 const {doc,win}=mobileDOM(),html=[],links=[];win.innerWidth=568;win.innerHeight=320;const viewport=new Target('visual-viewport');Object.assign(viewport,{width:568,height:320,offsetTop:0,offsetLeft:0});win.visualViewport=viewport;const button=doc.createElement('button');button.setAttribute('id','open-profile');const text=doc.createElement('span');text.setAttribute('data-profile-name','');button.appendChild(text);doc.body.appendChild(button);const leaderboardButton=doc.createElement('button');leaderboardButton.setAttribute('id','open-leaderboard');doc.body.appendChild(leaderboardButton);
 const shade=doc.createElement('div');shade.className='shade';shade.setAttribute('id','dialog');shade.hidden=true;shade.style.setProperty=(name,value)=>shade.style[name]=value;const content=doc.createElement('section');content.setAttribute('id','dialog-content');shade.appendChild(content);doc.body.appendChild(shade);
 const baseSetter=Object.getOwnPropertyDescriptor(Target.prototype,'innerHTML').set;
 const decorate=element=>{element.removeAttribute=name=>{delete element.attrs[name];};let raw='';Object.defineProperty(element,'innerHTML',{configurable:true,get:()=>raw,set:value=>{for(const node of element.descendants())node.isConnected=false;raw=String(value);baseSetter.call(element,raw);for(const node of element.descendants())decorate(node);}});};decorate(content);
 const create=doc.createElement;doc.createElement=tag=>{const element=create(tag);element.click=()=>links.push({href:element.href,download:element.download});return element;};
 const dialog=markup=>{html.push(markup);content.innerHTML=markup;shade.hidden=false;},closeDialog=()=>{shade.hidden=true;};
 const ui=createDriverProfileUI({root:doc,client,dialog,dialogHead:title=>'<h2>'+title+'</h2>',closeDialog,notify(){},getCategory:()=>config,getTrackName:()=>'<Village>'});
 return {doc,win,viewport,ui,shade,content,html,links,byId:id=>doc.getElementById(id)};
}
{
 const client=new OnlineRecords({request:async()=>{},storage:memory()}),h=uiHarness(client);h.ui.profile();
 assert.equal(h.byId('driver-name-save').getAttribute('form'),'driver-name-form','The primary save action is attached to the fixed footer, with native form submission');
 assert.equal(h.byId('driver-name-save').closest('form'),null);
 assert.equal(h.byId('driver-pass-file'),null,'Name entry contains no native file control');
 const input=h.byId('driver-name');input.value='My Draft';input.oninput();input.focus();h.doc.emit('focusin',{target:input});
 h.viewport.height=160;h.viewport.offsetTop=26;h.viewport.emit('resize');
 assert.equal(h.byId('profile-page').dataset.keyboard,'true');assert.equal(h.shade.style['--profile-vv-height'],'160px');assert.equal(h.shade.style['--profile-vv-top'],'26px');
 h.byId('driver-name-save').focus();h.doc.emit('focusout',{target:input});h.doc.emit('focusin',{target:h.byId('driver-name-save')});assert.equal(h.byId('profile-page').dataset.keyboard,'true','Save stays in place through input blur while the keyboard still occupies the viewport');
 h.byId('profile-open-pass').onclick();assert.equal(h.byId('driver-name'),null);assert.equal(h.byId('profile-page').dataset.profileStep,'pass');let picked=0;h.byId('driver-pass-file').click=()=>++picked;h.byId('driver-pass-choose').onclick();assert.equal(picked,1,'A 44px custom action invokes the native file picker on the separate pass page');
 h.byId('profile-pass-back').onclick();assert.equal(h.byId('driver-name').value,'My Draft','Moving between pass and name entry preserves the typed name');
 h.viewport.height=320;h.viewport.offsetTop=0;h.viewport.emit('resize');assert.equal(h.byId('profile-page').dataset.keyboard,'false');
 h.win.innerWidth=320;h.win.innerHeight=568;Object.assign(h.viewport,{width:320,height:568});h.viewport.emit('resize');h.win.innerWidth=568;h.win.innerHeight=320;Object.assign(h.viewport,{width:568,height:320});h.viewport.emit('resize');assert.equal(h.byId('profile-page').dataset.keyboard,'false','A device rotation resets the keyboard height reference');
 h.ui.destroy();assert.equal(h.viewport.listeners.get('resize').size,0);assert.equal(h.viewport.listeners.get('scroll').size,0);
}
{
 const identity=fakeIdentity('<img src=x>'),client=new OnlineRecords({request:async()=>{},storage:memory()});client.remember(identity);const h=uiHarness(client);h.ui.profile();assert(h.html.at(-1).includes('&lt;img src=x&gt;'));assert(!h.html.at(-1).includes(identity.token));assert.equal(h.byId('open-profile').querySelector('[data-profile-name]').textContent,identity.profile.name);
 assert.equal(h.byId('driver-pass-file'),null,'The name/summary page does not expose a native upload field');h.byId('profile-open-pass').onclick();h.byId('driver-pass-export').onclick();assert.equal(h.links.length,1);assert(h.links[0].href.startsWith('blob:'));assert(!h.links[0].href.includes(identity.token));URL.revokeObjectURL(h.links[0].href);
}
{
 const create=deferred(),client=new OnlineRecords({request:()=>create.promise,storage:memory()}),h=uiHarness(client);let readyCount=0;h.ui.profile({onReady:()=>readyCount++});h.byId('driver-name').value='QA delayed';const submitting=h.byId('driver-name-form').onsubmit({preventDefault(){}});assert(h.byId('driver-name-save').disabled);h.byId('profile-done').onclick();assert(h.shade.hidden);const dialogs=h.html.length;create.resolve(fakeIdentity('QA delayed'));await submitting;assert(h.shade.hidden,'A late successful name reservation must not reopen a dismissed dialog');assert.equal(h.html.length,dialogs);assert.equal(readyCount,0,'A dismissed dialog cannot run its old completion callback');assert.equal(client.profile.name,'QA delayed','The server-created identity still remains safely available');
}
{
 const restore=deferred(),client=new OnlineRecords({request:()=>restore.promise,storage:memory()}),h=uiHarness(client);h.ui.profile();assert.equal(h.byId('driver-pass-file'),null,'File transfer is a separate step');h.byId('profile-open-pass').onclick();const identity=fakeIdentity('QA Imported'),pass={type:'breuer-driver-pass',version:1,profileId:identity.profile.id,token:identity.token};const changing=h.byId('driver-pass-file').onchange({target:{files:[{size:200,text:async()=>JSON.stringify(pass)}]}});await ready();h.byId('profile-done').onclick();restore.resolve({profile:identity.profile});await changing;assert(h.shade.hidden,'A late successful file import must not reopen a dismissed dialog');
}
{
 const client=new OnlineRecords({request:async()=>{const error=Error('Dieser Fahrername ist bereits vergeben.');error.code='NAME_TAKEN';throw error;},storage:memory()}),h=uiHarness(client);h.ui.profile();h.byId('driver-name').value='QA Existing';await h.byId('driver-name-form').onsubmit({preventDefault(){}});assert(h.byId('profile-feedback').textContent.includes('bereits vergeben'));assert.equal(h.byId('profile-feedback').dataset.state,'error');assert.equal(h.byId('driver-name').getAttribute('aria-invalid'),'true');assert.equal(h.byId('driver-name-save').disabled,false);assert.equal(client.profile,null,'A rejected name does not create a fake local profile');
 const volatile=new OnlineRecords({request:async()=>fakeIdentity('QA Session'),storage:{getItem:()=>null,setItem(){throw Error('quota');}}});await volatile.create('QA Session');const session=uiHarness(volatile);session.ui.profile();assert(session.html.at(-1).toLowerCase().includes('nur für diese sitzung'));session.byId('profile-open-pass').onclick();assert(session.byId('driver-pass-export'),'A session-only identity offers the private pass export on its dedicated page');
}
{
 const requests=[deferred(),deferred()];let next=0;const client=new OnlineRecords({request:()=>requests[next++].promise,storage:memory()}),h=uiHarness(client);const older=h.ui.leaderboard(config),newer=h.ui.leaderboard({...config,car:4});requests[1].resolve({top:[{profileId:'new',name:'New <Driver>',rank:1,time:58}],own:{rank:12,time:90},totalPlayers:12});await newer;const expected=h.byId('leaderboard-list').innerHTML;assert(expected.includes('New &lt;Driver&gt;'));assert(h.byId('leaderboard-own').textContent.includes('Dein Rang: 12'),'The own rank remains visible outside the top list');requests[0].resolve({top:[{profileId:'old',name:'Outdated',rank:1,time:60}],own:null,totalPlayers:1});await older;assert.equal(h.byId('leaderboard-list').innerHTML,expected,'A late old leaderboard response must not overwrite a newer category');assert(!h.html.some(markup=>markup.includes('a'.repeat(64))),'Private profile credentials never enter markup');
}
{
 const client=new OnlineRecords({request:async()=>({top:[],own:null,totalPlayers:0}),storage:memory()}),h=uiHarness(client);await h.ui.leaderboard(config);
 assert(h.byId('leaderboard-state').closest('.leaderboard-body').classList.contains('is-empty'),'Only an actual empty response enables the optional desktop mechanic');
 assert.equal(h.byId('leaderboard-list').innerHTML,'','An empty leaderboard shows no invented records');assert(h.byId('leaderboard-state').textContent.includes('Noch kein Rekord'));assert(h.byId('leaderboard-refresh'),'The native retry action stays available');
}
console.log('PASS Actual profile UI events: separate pass step, native footer submission, preserved draft, visualViewport keyboard lifecycle, escaped names, private pass blob URL, stale name/import success after dismissal and stale leaderboard replies');
