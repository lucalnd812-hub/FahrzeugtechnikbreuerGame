import {TRACKS} from './tracks.js';

// One small, renderer-independent rules module is shared by the browser and
// the room API. Changing a setting can never silently change the finish line.
export const RACE_LAP_OPTIONS=Object.freeze([1,2,3,5,10]);
export const RACE_DIFFICULTIES=Object.freeze([.76,.91,1.06]);
export const DEFAULT_RACE_CONFIG=Object.freeze({trackId:'lammersdorf',laps:2,difficulty:.91,opponents:5,rules:'action',mode:'race',assist:true,autoDrift:true});
const catalog=Array.isArray(TRACKS)?TRACKS:Object.values(TRACKS);
const trackLookup=new Map(catalog.map(track=>[track.id,track]));
const boolean=(value,fallback)=>typeof value==='boolean'?value:fallback;

export function getTrackMeta(id='lammersdorf'){
 return trackLookup.get(id)||trackLookup.get(DEFAULT_RACE_CONFIG.trackId);
}

export function normalizeRaceConfig(input={}){
 const value=input&&typeof input==='object'&&!Array.isArray(input)?input:{};
 const number=Number(value.laps),difficulty=Number(value.difficulty),opponents=Number(value.opponents);
 const mode=['race','time-trial','cup','challenge'].includes(value.mode)?value.mode:DEFAULT_RACE_CONFIG.mode;
 return {
  trackId:trackLookup.has(value.trackId)?value.trackId:DEFAULT_RACE_CONFIG.trackId,
  laps:RACE_LAP_OPTIONS.includes(number)?number:DEFAULT_RACE_CONFIG.laps,
  difficulty:RACE_DIFFICULTIES.includes(difficulty)?difficulty:DEFAULT_RACE_CONFIG.difficulty,
  opponents:mode==='time-trial'||mode==='challenge'?0:Number.isFinite(opponents)?Math.max(0,Math.min(5,Math.trunc(opponents))):DEFAULT_RACE_CONFIG.opponents,
  rules:mode==='time-trial'||mode==='challenge'?'classic':['action','classic'].includes(value.rules)?value.rules:DEFAULT_RACE_CONFIG.rules,
  mode,
  assist:boolean(value.assist,DEFAULT_RACE_CONFIG.assist),
  autoDrift:boolean(value.autoDrift,DEFAULT_RACE_CONFIG.autoDrift)
 };
}

export function raceRecordKey(input,car=0){
 const config=normalizeRaceConfig(input),track=getTrackMeta(config.trackId);
 // Track revisions, lap counts and assistance/rules have separate records.
 return ['breuer-record-v2',config.trackId,track.version,String(car),config.laps,config.rules,config.mode,config.opponents,config.difficulty,config.assist?'assist':'manual',config.autoDrift?'auto-drift':'manual-drift'].join(':');
}
