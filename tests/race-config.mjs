import assert from 'node:assert/strict';
import {DEFAULT_RACE_CONFIG,RACE_LAP_OPTIONS,RACE_DIFFICULTIES,normalizeRaceConfig,getTrackMeta,raceRecordKey} from '../src/race-config.js';
import {TRACKS} from '../src/tracks.js';

assert(Object.isFrozen(DEFAULT_RACE_CONFIG)&&Object.isFrozen(RACE_LAP_OPTIONS)&&Object.isFrozen(RACE_DIFFICULTIES));
for(const input of [undefined,null,[],false,'bad'])assert.deepEqual(normalizeRaceConfig(input),DEFAULT_RACE_CONFIG);
for(const laps of RACE_LAP_OPTIONS)assert.equal(normalizeRaceConfig({laps:String(laps)}).laps,laps);
for(const laps of [0,-1,4,6,100,'x'])assert.equal(normalizeRaceConfig({laps}).laps,2);
for(const difficulty of RACE_DIFFICULTIES)assert.equal(normalizeRaceConfig({difficulty:String(difficulty)}).difficulty,difficulty);
assert.equal(normalizeRaceConfig({difficulty:999}).difficulty,.91);
for(const track of TRACKS){assert.equal(normalizeRaceConfig({trackId:track.id}).trackId,track.id);assert.equal(getTrackMeta(track.id),track);}
assert.equal(getTrackMeta('missing').id,'lammersdorf');
for(const [input,expected] of [[0,0],[2.9,2],[-4,0],[8,5],['4',4],[NaN,5]])assert.equal(normalizeRaceConfig({opponents:input}).opponents,expected);
for(const mode of ['time-trial','challenge']){const value=normalizeRaceConfig({mode,rules:'action',opponents:5,laps:10});assert.equal(value.rules,'classic');assert.equal(value.opponents,0);assert.equal(value.laps,10);}
assert.equal(normalizeRaceConfig({mode:'cup'}).mode,'cup');assert.equal(normalizeRaceConfig({mode:'bogus'}).mode,'race');
assert.deepEqual(normalizeRaceConfig({assist:false,autoDrift:false}).assist,false);assert.equal(normalizeRaceConfig({assist:'false',autoDrift:0}).autoDrift,true);
const source={trackId:'bahnhof',laps:5,opponents:2,rules:'classic',mode:'race',difficulty:.76,assist:false,autoDrift:false};const untouched=structuredClone(source);normalizeRaceConfig(source);assert.deepEqual(source,untouched);
const baseline=raceRecordKey(source,0);
for(const change of [{trackId:'kraemer'},{laps:10},{opponents:3},{rules:'action'},{mode:'cup'},{difficulty:1.06},{assist:true},{autoDrift:true}])assert.notEqual(raceRecordKey({...source,...change},0),baseline,'A record must belong to its actual race category');
assert.notEqual(raceRecordKey(source,1),baseline);assert.equal(raceRecordKey({...source,laps:'5'},0),baseline);
console.log('PASS Shared race normalization, exact lap/difficulty options, zero opponents, solo modes, assistance and isolated record categories');
