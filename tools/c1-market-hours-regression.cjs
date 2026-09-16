const assert=require('node:assert/strict');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const market=createResearchModuleLoader(process.cwd()).load('lib/marketSession.js');
for(const day of ['2026-11-27','2026-12-24','2027-11-26','2028-11-24']){
 assert.equal(market.marketExecutionState(day+'T17:59:59Z').isOpen,true);
 assert.equal(market.marketExecutionState(day+'T18:00:00Z').isOpen,false);
 assert.equal(market.latestCompletedMarketSessionDay(day+'T18:00:00Z'),day);
 assert.equal(market.marketSessionProgress(day+'T18:00:00Z'),1);
}
assert.equal(market.marketExecutionState('2028-07-03T17:00:00Z').isOpen,false,'DST early close');
assert.equal(market.marketExecutionState('2026-09-16T19:59:59Z').isOpen,true);
assert.equal(market.marketExecutionState('2026-09-16T20:00:00Z').isOpen,false);
assert.equal(market.isUsMarketSessionDay('2026-07-03'),false);
assert.equal(market.isUsMarketSessionDay('2027-12-31'),true,'NYSE does not observe Saturday New Year on Friday');
assert.equal(market.marketExecutionState('2026-11-26T17:00:00Z').isOpen,false);
console.log('PASS: early-close boundaries, normal close, DST, holidays and Saturday New Year exception');
