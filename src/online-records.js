import {recordCategory} from './race-modes.js';

const PROFILE_KEY='breuer-driver-profile:v1';
const tokenShape=value=>typeof value==='string'&&/^[a-f0-9]{64}$/i.test(value);
const profileShape=value=>value&&typeof value.id==='string'&&value.id.length<=80&&typeof value.name==='string'&&value.name.length<=80;
const runShape=value=>value&&typeof value.runId==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value.runId)&&Number.isFinite(value.expiresAt)&&value.expiresAt>Date.now();

/** Browser-local credentials, database-owned names/results. No network call blocks driving. */
export class OnlineRecords {
 constructor({request,storage,onProfile=()=>{}}){
  this.request=request;this.storage=storage;this.onProfile=onProfile;this.identity=null;this.active=null;this.serial=0;this.persistent=true;
  try{const saved=JSON.parse(storage?.getItem(PROFILE_KEY)||'null');if(profileShape(saved?.profile)&&tokenShape(saved.token))this.identity=saved;}catch{}
 }
 get profile(){return this.identity?.profile||null;}
 credentials(){return this.identity?{profileId:this.identity.profile.id,token:this.identity.token}:{};}
 remember(identity){
  if(!profileShape(identity?.profile)||!tokenShape(identity?.token))throw new Error('Der Fahrerpass ist ungültig.');
  this.identity={profile:{...identity.profile},token:identity.token};
  try{this.storage?.setItem(PROFILE_KEY,JSON.stringify(this.identity));this.persistent=!!this.storage;}catch{this.persistent=false;}
  this.onProfile(this.profile);return this.profile;
 }
 async create(name){const result=await this.request('/profiles',{name});return this.remember(result);}
 async restore(pass){
  let value=pass;if(typeof value==='string'){if(value.length>8000)throw new Error('Diese Datei ist kein gültiger Fahrerpass.');try{value=JSON.parse(value);}catch{throw new Error('Diese Datei ist kein gültiger Fahrerpass.');}}
  if(value?.type!=='breuer-driver-pass'||value.version!==1||typeof value.profileId!=='string'||!tokenShape(value.token))throw new Error('Diese Datei ist kein gültiger Breuer-Fahrerpass.');
  const result=await this.request('/profiles/session',{profileId:value.profileId,token:value.token});
  return this.remember({profile:result.profile,token:value.token});
 }
 exportPass(){if(!this.identity)throw new Error('Lege zuerst deinen Fahrernamen fest.');return {type:'breuer-driver-pass',version:1,profileId:this.identity.profile.id,token:this.identity.token};}
 _cachedTicket(session){
  if(!session.resumeKey)return null;
  try{
   const raw=this.storage?.getItem(session.resumeKey);if(!raw||raw.length>8000)return null;
   const saved=JSON.parse(raw),ticket=saved?.ticket;
   if(saved?.version!==1||JSON.stringify(saved.category)!==JSON.stringify(session.category)||!runShape(ticket))return null;
   if(ticket.runToken?!tokenShape(ticket.runToken):!this.profile||saved.ownerId!==this.profile.id)return null;
   return ticket;
  }catch{return null;}
 }
 _rememberTicket(session,ticket,ownerId){
  if(!session.resumeKey||!runShape(ticket)||ticket.runToken&&!tokenShape(ticket.runToken))return;
  // A late reply from a different setup must not replace this room's newer cache.
  if(this.active&&this.active!==session&&this.active.resumeKey===session.resumeKey&&JSON.stringify(this.active.category)!==JSON.stringify(session.category))return;
  try{this.storage?.setItem(session.resumeKey,JSON.stringify({version:1,category:session.category,ownerId:ownerId||null,ticket}));}catch{}
 }
 _forgetTicket(session){
  if(!session.resumeKey)return;
  try{
   const current=JSON.parse(this.storage?.getItem(session.resumeKey)||'null');
   if(current?.ticket?.runId!==session.ticket?.runId)return;
   if(typeof this.storage?.removeItem==='function')this.storage.removeItem(session.resumeKey);else this.storage?.setItem(session.resumeKey,'null');
  }catch{}
 }
 start(config,{eligible=true,resumeKey=null}={}){
  const session={serial:++this.serial,category:recordCategory(config),resumeKey:typeof resumeKey==='string'&&resumeKey.length>0&&resumeKey.length<=256?resumeKey:null,ticket:null,error:null,promise:null,accepted:null};this.active=session;
  if(!eligible){session.ineligible=true;return session;}
  const cached=this._cachedTicket(session);
  if(cached){session.ticket=cached;session.resumed=true;session.promise=Promise.resolve(cached);return session;}
  // Start an anonymous ticket too, so a first-time driver can choose a name
  // after finishing without losing that already completed race.
  session.promise=Promise.resolve().then(async()=>{
   const credentials=this.credentials(),ticket=await this.request('/runs/start',{category:session.category,...credentials});
   session.ticket=ticket;this._rememberTicket(session,ticket,credentials.profileId);return ticket;
  }).catch(error=>{session.error=error;return null;});
  return session;
 }
 clear(){this.active=null;this.serial++;}
 async submit(session,result){
  if(!this.identity)throw new Error('Wähle zuerst deinen Fahrernamen.');
  if(!session||session.ineligible)throw new Error('Vorführ- und Messfahrten werden nicht in die Bestenliste eingetragen.');
  if(session.accepted)return session.accepted;
  if(session.submitting)return session.submitting;
  session.submitting=(async()=>{
   const ticket=session.ticket||await session.promise;
   if(!ticket?.runId)throw new Error(session.error?.message||'Für diesen Lauf konnte der Rennserver nicht erreicht werden. Deine lokale Bestzeit bleibt gespeichert.');
   const response=await this.request('/runs/finish',{...this.credentials(),runId:ticket.runId,...(ticket.runToken?{runToken:ticket.runToken}:{}),time:result.time,sectors:[...result.sectors]});
   session.accepted=response;this._forgetTicket(session);return response;
  })();
  try{return await session.submitting;}finally{session.submitting=null;}
 }
 board(config,{limit=5}={}){return this.request('/leaderboards',{category:recordCategory(config),...(this.profile?{profileId:this.profile.id}:{}),limit});}
}
