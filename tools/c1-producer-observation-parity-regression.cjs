'use strict';
// Synthetic only. Real pure production functions, no network, storage or handlers.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const loader=createResearchModuleLoader(process.cwd());
const {applyPerformanceObservation}=loader.load('lib/performanceLedger.js');
const {recentStrongBuySymbols}=loader.load('lib/opportunityDecision.js');
const plain=x=>JSON.parse(JSON.stringify(x));
const events=[
 {at:'2026-10-23T14:01:00.123Z',symbol:'SYNTHETIC',price:100,action:'Buy'},
 {at:'2026-10-23T14:03:00.456Z',symbol:'SYNTHETIC',price:110,action:'Watch'},
 {at:'2026-10-23T14:04:00.789Z',symbol:'SYNTHETIC',price:105,action:'Buy'},
];
const apply=observations=>observations.reduce((records,{at,...row})=>plain(applyPerformanceObservation(records,[row],at)),[]);
const intraday=apply(events);
const cronSample=apply([{...events[2],at:'2026-10-23T14:15:00.000Z'}]);
const replay=apply(events.map(x=>structuredClone(x)));
assert.deepEqual(replay,intraday);
const summarize=records=>({signal:records.find(x=>x.recordType==='signal'),states:records.filter(x=>x.recordType==='state').map(({action,timestamp,price})=>({action,timestamp,price}))});
const a=summarize(intraday),b=summarize(cronSample);
assert.equal(a.signal.price,100);assert.equal(b.signal.price,105);
assert.equal(a.states.length,3);assert.equal(b.states.length,1);
assert(Math.abs(a.signal.pathMfePct-10)<1e-10);assert.equal(b.signal.pathMfePct,0);
assert(Math.abs(a.signal.lastMarkPct-5)<1e-10);assert.equal(b.signal.lastMarkPct,0);
assert.notEqual(a.signal.timestamp,b.signal.timestamp);
// Cached GETs can still update the durable lastMarkAt after the 30s recording cooldown.
const cachedAgain=plain(applyPerformanceObservation(intraday,[{symbol:'SYNTHETIC',price:105,action:'Buy'}],'2026-10-23T14:04:31.000Z'));
assert.notEqual(cachedAgain.find(x=>x.recordType==='signal').lastMarkAt,a.signal.lastMarkAt);
// Moving the earned timestamp to a cron boundary changes actual hysteresis membership.
const realEarned=Date.parse(events[0].at),cronEarned=Date.parse('2026-10-23T14:15:00.000Z');
const evaluateAt=Date.parse('2026-10-23T20:40:00.000Z');
const memory=earnedAt=>new Map([['SYNTHETIC',{action:'Strong Buy',earnedAt,interruptedAt:0}]]);
const trueMemory=plain(recentStrongBuySymbols(evaluateAt,memory(realEarned)));
const shiftedMemory=plain(recentStrongBuySymbols(evaluateAt,memory(cronEarned)));
assert.deepEqual(trueMemory,[]);assert.deepEqual(shiftedMemory,['SYNTHETIC']);
const evidence={scope:'Synthetic local pure functions only; no production calls, handlers, provider, Blob or account access',baseline:'d386ae579527a0a7e5d53feea4a9186e65c77e62',observations:events,intraday:a,scheduled15Minute:b,cachedReadNewMarkAt:cachedAgain.find(x=>x.recordType==='signal').lastMarkAt,hysteresis:{evaluateAt:new Date(evaluateAt).toISOString(),requestEarnedSymbols:trueMemory,scheduledEarnedSymbols:shiftedMemory},exactCapturedEventReplay:'full-object equality',result:'Scheduled-only replacement fails exact observation/entry/mark/extrema/state/hysteresis parity. Exact replay requires preserving every original acquisition and observation timestamp before changing the read contract.'};
fs.mkdirSync('work', {recursive:true});
fs.writeFileSync('work/producer-characterization.json',JSON.stringify(evidence,null,2)+'\n');
console.log('PASS: exact captured-event replay; detected scheduled-only entry, timestamp, extrema, return, transitions and hysteresis parity failures; cached-read mark timestamps remain request driven.');
