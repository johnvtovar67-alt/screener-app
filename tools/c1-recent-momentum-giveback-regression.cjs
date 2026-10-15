// Focused shared-gate checks with accepted close/MACD inputs. These are decision
// fixtures, not an acquired price history or an investment-performance claim.
const assert = require('node:assert/strict');
const {createResearchModuleLoader} = require('./research-module-loader.cjs');
const loader = createResearchModuleLoader(process.cwd());
const {evaluateC1RecentMomentum:evaluate,C1_RECENT_MOMENTUM_GATE:policy} = loader.load('lib/c1RecentMomentumGate.js');
const {isUsMarketSessionDay} = loader.load('lib/marketSession.js');
let assertions = 0;
const eq = (actual, expected, message) => {assertions++;assert.equal(actual, expected, message);};
const ok = (value, message) => {assertions++;assert.ok(value, message);};
const near = (actual, expected, message) => {assertions++;assert.ok(Math.abs(actual-expected)<1e-10, message);};
const copy = value => JSON.parse(JSON.stringify(value));
const dates = [];
for(let date=new Date('2026-01-02T00:00:00.000Z');dates.length<20;date.setUTCDate(date.getUTCDate()+1)){
  const key=date.toISOString().slice(0,10);
  if(isUsMarketSessionDay(key))dates.push(key);
}
function sessions(closes=[100,101,102,103,104,110,109,108]){
  return closes.map((close,index)=>({date:dates[index],decisionAt:dates[index]+'T21:00:00.000Z',
    prices:[{symbol:'AAA',date:dates[index],open:close,high:index===5?120:close,low:close,close,adjusted:true}],
    signals:[{symbol:'AAA',entryTiming:{available:true,asOf:dates[index],macdImproving:false}}]}));
}
const position = {symbol:'AAA',positionId:'earned-winner',enteredAt:dates[0],entryPrice:100,
  highWatermark:120,recentMomentumPeakVerified:true};
function at(data,index,prior=null,overrides={}){
  return evaluate({sessions:data,sessionIndex:index,symbol:'AAA',sleeve:'base',prior,
    position:{...position,...overrides}});
}

eq(policy.profitGivebackFraction,.5,'The one fixed giveback threshold is half of earned peak gain');

// A winner may surrender meaningful earned gain while its 3/5-session returns
// remain positive. That is the added branch, rather than a warning-only metric.
{
  const data=sessions(),first=at(data,6),second=at(data,7,first.state);
  ok(first.metrics.ret3>0&&first.metrics.ret5>0,'The first decline still has positive longer recent windows');
  ok(second.metrics.ret3>0&&second.metrics.ret5>0,'The second decline still has positive longer recent windows');
  eq(first.state.streak,0,'The existing historical-window deterioration episode has not started');
  eq(second.state.streak,0,'The added branch does not rewrite the ordinary confirmation counter');
  eq(first.state.profitProtectionArmed,true,'A verified 20% peak retains the existing 12% activation');
  eq(first.state.profitGivebackStreak,1,'One weak close starts giveback confirmation');
  eq(first.exitReason,null,'One qualifying close cannot authorize an exit');
  near(first.metrics.currentGainPct,9,'Current gain uses the actual entry basis');
  near(first.metrics.peakGainPct,20,'Peak gain uses the supplied verified since-entry high');
  near(first.metrics.gainGivebackPctPoints,11,'Giveback percentage points distinguish earned-gain erosion from price decline');
  near(first.metrics.gainGivebackFraction,.55,'The earned-gain fraction is (peak-close)/(peak-entry)');
  eq(second.state.profitGivebackStreak,2,'Two distinct consecutive qualifying closes confirm protection');
  eq(second.exitReason,'recent-momentum-profit-protection','Meaningful giveback changes the actual exit decision');
  eq(second.entryAllowed,false,'A confirmed profit exit cannot authorize fresh capital');
  eq(second.holdingStatus,'exit-confirmed','The output is actionable rather than an advisory Hold');
}

// A 50% giveback is included; a smaller giveback is not a new exit trigger.
{
  const boundary=sessions([100,101,102,103,104,111,110,109]);
  const first=at(boundary,6);
  near(first.metrics.gainGivebackFraction,.5,'Exactly half of the earned gain meets the inclusive boundary');
  eq(first.state.profitGivebackStreak,1,'The exact threshold starts, rather than completes, confirmation');
  const shallow=sessions([100,101,102,103,104,119,118,117]);
  const one=at(shallow,6),two=at(shallow,7,one.state);
  eq(two.state.profitProtectionArmed,true,'A shallow correction does not disarm the established activation');
  eq(two.state.profitGivebackStreak,0,'A shallow correction cannot accumulate the new giveback sequence');
  eq(two.exitReason,null,'Two red closes alone are not a giveback-based sale');
  const unarmed=sessions([90,91,92,93,94,106,105,104]);
  unarmed[5].prices[0].high=111.99;
  const below=at(unarmed,6,null,{highWatermark:111.99});
  const belowTwice=at(unarmed,7,below.state,{highWatermark:111.99});
  ok(belowTwice.metrics.gainGivebackFraction>.5,'The earned-gain giveback alone may exceed half before activation');
  eq(belowTwice.state.profitProtectionArmed,false,'A peak below the established 12% activation remains unarmed');
  eq(belowTwice.state.profitGivebackStreak,0,'Giveback cannot bypass the existing peak-gain activation');
  eq(belowTwice.exitReason,null,'Below-activation giveback cannot authorize an accelerated exit');
}

// A temporary rebound or improving MACD resets only the added counter.
{
  const green=sessions([100,101,102,103,104,110,109,109.2]);
  const first=at(green,6),second=at(green,7,first.state);
  eq(second.state.profitGivebackStreak,0,'A green recovery breaks the new giveback sequence');
  eq(second.state.profitProtectionArmed,true,'The recovery preserves the armed latch');
  eq(second.exitReason,null,'A temporary correction followed by a green close is retained');
  const improving=sessions();improving[7].signals[0].entryTiming.macdImproving=true;
  const one=at(improving,6),two=at(improving,7,one.state);
  eq(two.state.profitGivebackStreak,0,'Improving MACD breaks giveback confirmation even on a red close');
  eq(two.exitReason,null,'Improving current momentum prevents a new giveback sale');
}

// Missing or opaque peaks cannot be converted into earned-gain evidence.
for(const [label,changes] of [
  ['unverified numeric peak',{recentMomentumPeakVerified:false}],
  ['missing peak',{highWatermark:undefined}],
  ['numeric-looking peak',{highWatermark:'120'}],
  ['non-finite peak',{highWatermark:Infinity}],
  ['peak at entry basis',{highWatermark:100}],
]){
  const data=sessions(),one=at(data,6,null,changes),two=at(data,7,one.state,changes);
  eq(two.metrics.verifiedPeak,false,`${label}: the new branch has no verified earned-gain denominator`);
  eq(two.metrics.gainGivebackFraction,null,`${label}: no missing gain fraction is invented`);
  eq(two.state.profitGivebackStreak,0,`${label}: no unsupported confirmation is accumulated`);
  eq(two.exitReason,null,`${label}: no new giveback exit is authorized`);
}

// The pre-existing arm can remain latched after gains disappear; two new weak
// closes still require independently verified peak evidence for this branch.
{
  const data=sessions([100,101,102,103,104,110,109,99]);
  const one=at(data,6),two=at(data,7,one.state);
  eq(two.state.profitProtectionArmed,true,'Losing the remaining gain does not disarm protection');
  ok(two.metrics.gainGivebackFraction>1,'A loss can surrender more than the earned peak gain');
  eq(two.state.streak,1,'The original negative-window sequence alone is still unconfirmed');
  eq(two.exitReason,'recent-momentum-profit-protection','The independent two-close giveback sequence remains actionable after gains vanish');
}

// Repeated observations and altered same-date provenance cannot manufacture a
// second close or turn an unverified peak into accepted protection.
{
  const data=sessions(),one=at(data,6),repeat=at(data,6,one.state);
  eq(repeat.state.profitGivebackStreak,1,'The same completed close is idempotent');
  eq(repeat.exitReason,null,'Repeating a close cannot complete two-close confirmation');
  const opaque=at(data,6,null,{recentMomentumPeakVerified:false});
  const revised=at(data,6,opaque.state,{recentMomentumPeakVerified:true});
  eq(revised.available,false,'A same-date change in peak provenance requires review');
  eq(revised.exitReason,null,'Revised same-date provenance cannot create an exit');
}

// A gap, missing observation or stale source clears confirmation while retaining
// the already-established activation latch. A later close starts at one again.
for(const [label,mutate] of [
  ['stale timing',data=>{data[7].signals[0].entryTiming.stale=true;}],
  ['missing close',data=>{data[7].prices=[];}],
  ['duplicate bar',data=>{data[7].prices.push(copy(data[7].prices[0]));}],
  ['future data',data=>{data[7].prices[0].availableAt='2099-01-01T00:00:00.000Z';}],
]){
  const data=sessions([100,101,102,103,104,110,109,108,107]);
  const first=at(data,6);mutate(data);const bad=at(data,7,first.state);
  eq(bad.available,false,`${label}: unavailable evidence cannot qualify`);
  eq(bad.entryAllowed,false,`${label}: unavailable evidence cannot authorize capital`);
  eq(bad.exitReason,null,`${label}: unavailable evidence cannot manufacture protection`);
  eq(bad.state.profitGivebackStreak,0,`${label}: confirmation is broken`);
  eq(bad.state.profitProtectionArmed,true,`${label}: accepted activation remains latched`);
}
{
  const data=sessions([100,101,102,103,104,110,109,108,107]);
  const first=at(data,6);data.splice(7,1);const next=at(data,7,first.state);
  eq(next.available,false,'A missing market session cannot count as a consecutive confirmation');
  eq(next.state.profitGivebackStreak,0,'A market gap breaks giveback evidence');
  const one=at(sessions(),6),newLife=at(sessions(),7,one.state,{positionId:'new-purchase',highWatermark:108,recentMomentumPeakVerified:false});
  eq(newLife.state.profitGivebackStreak,0,'A replacement ownership lifecycle does not inherit the old sequence');
  eq(newLife.state.profitProtectionArmed,false,'A later purchase does not inherit the prior winner arm');
}

// The original armed deterioration episode keeps its small-green continuation.
// The added counter may reset without changing that established decision.
{
  const data=sessions([100,101,102,103,104,100,99,99.01]);
  const one=at(data,6),two=at(data,7,one.state);
  eq(one.state.streak,1,'The existing all-negative episode starts normally');
  eq(two.state.streak,2,'A small green close retains the original negative-window continuation');
  eq(two.state.profitGivebackStreak,0,'The green close resets only the added giveback sequence');
  eq(two.exitReason,'recent-momentum-profit-protection','The original armed two-close protection still acts');
}

console.log(`PASS: ${assertions} focused recent-momentum gain-giveback assertions.`);
