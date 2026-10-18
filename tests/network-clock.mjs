import assert from 'node:assert/strict';
import {NetworkSampleClock} from '../src/network-clock.js';

let monotone=10000,wall=100000;
const sources={now:()=>monotone,wallNow:()=>wall};
const countdown=new NetworkSampleClock({startAt:104000,priorRaceTime:0,...sources});
assert.equal(countdown.read(),0);
monotone+=3500;assert.equal(countdown.read(),0,'A countdown must not send future race seconds');
monotone+=1000;assert.equal(countdown.read(),.5);
wall+=3600000;monotone+=1000;assert.equal(countdown.read(),1.5,'A wall-clock correction cannot move sample time by an hour');

monotone=10000;wall=122000;
const resumed=new NetworkSampleClock({startAt:100000,offset:-6000,priorRaceTime:20,...sources});
assert.equal(resumed.read(),20,'A delayed reconnect cannot go behind the confirmed sample');
monotone+=150;assert.equal(resumed.read(),20.15);
resumed.observe(15);assert.equal(resumed.read(),20.15,'An old acknowledgement cannot roll time back');
resumed.observe(22.2);assert.equal(resumed.read(),22.2,'A fresh server epoch can advance an initially delayed estimate');
monotone+=100;assert.ok(Math.abs(resumed.read()-22.3)<1e-9);
resumed.observe(NaN);resumed.observe(8000);resumed.observe(-1);
assert.ok(Math.abs(resumed.read()-22.3)<1e-9);
monotone-=500;assert.ok(Math.abs(resumed.read()-22.3)<1e-9);
assert.throws(()=>new NetworkSampleClock({startAt:NaN,...sources}));
console.log('PASS network sample clock: real countdown, delayed reconnect, stale acknowledgements and wall-clock corrections preserve a monotone bounded sample timeline.');
