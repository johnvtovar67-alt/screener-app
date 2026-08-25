const fs=require('fs');
const vm=require('vm');
const assert=(c,m)=>{if(!c)throw new Error(m)};
const daysAgo=d=>new Date(Date.now()-d*86400000).toISOString();

let gov=fs.readFileSync('lib/portfolioGovernor.js','utf8').replace(/export function /g,'function ');
gov+='\nmodule.exports={swingTimeReview};';
let box={module:{exports:{}},exports:{},console,Math,Number,String,Object,Array,Boolean,Map,Set,Date};
vm.createContext(box);vm.runInContext(gov,box);
const {swingTimeReview}=box.module.exports;

let pos=fs.readFileSync('lib/positionReunderwrite.js','utf8').replace(/export function /g,'function ');
pos+='\nmodule.exports={reunderwriteExistingPosition};';
box={module:{exports:{}},exports:{},console,Math,Number,String,Object,Array,Boolean};
vm.createContext(box);vm.runInContext(pos,box);
const {reunderwriteExistingPosition}=box.module.exports;

const stock=(days,pnl,{thesis=70,trade=80,technical=80,momentum=75,leadership=75,capital=78}={})=>({symbol:'TEST',role:'Swing',openedAt:daysAgo(days),lastTradeAt:daysAgo(days),gainLossPct:pnl,recommendation:{expertDecision:{thesisScore:thesis,tradeSetupScore:trade,capitalScore:capital,metrics:{technical,momentum,leadership,risk:45}}}});
const risk={swingCapital:18000,positions:{TEST:{value:1200,pctSwing:.067,factorWeights:{Other:1}}},factorPct:{Other:.067}};

let s=stock(15,0);let t=swingTimeReview(s);assert(t.stage==='Proof'&&!t.review,'15-day flat trade with strong forward evidence should remain normal Proof');
s=stock(16,0,{trade:57,technical:57,momentum:52,leadership:53,capital:60});t=swingTimeReview(s);assert(t.review&&t.proofFailure,'flat weak 15+ day trade must trigger Proof review');let r=reunderwriteExistingPosition({stock:s,decision:{action:'Hold'},risk,timeReview:t});assert(r.action==='Hold'&&r.proofFailure&&/recycle the capital/.test(r.reason),'weak flat Proof trade must explicitly surface recycling');
s=stock(18,-11,{trade:56,technical:54,momentum:50,leadership:52,capital:58});t=swingTimeReview(s);assert(t.review&&t.proofFailure,'double-digit Proof loss must always trigger review');r=reunderwriteExistingPosition({stock:s,decision:{action:'Hold'},risk,timeReview:t});assert(r.action==='Exit'&&/failed Proof/.test(r.reason),'double-digit weak Proof loss must exit');
s=stock(18,-11,{trade:72,technical:66,momentum:62,leadership:63,capital:72});t=swingTimeReview(s);r=reunderwriteExistingPosition({stock:s,decision:{action:'Hold'},risk,timeReview:t});assert(r.action==='Hold'&&/immediate Proof review/.test(r.reason),'double-digit Proof loss with unusually strong forward evidence must not remain an ordinary Hold');
s=stock(7,-15,{trade:56,technical:54,momentum:50,leadership:52,capital:58});t=swingTimeReview(s);assert(t.stage==='Setup'&&t.review&&t.setupFailure,'deep early Setup loss must trigger immediate review');r=reunderwriteExistingPosition({stock:s,decision:{action:'Hold'},risk,timeReview:t});assert(r.action==='Exit'&&r.setupFailure,'deep early Setup loss without exceptional evidence must exit');
s=stock(7,-4,{trade:54,technical:54,momentum:50,leadership:52,capital:58});t=swingTimeReview(s);assert(t.stage==='Setup'&&!t.review,'normal early Setup volatility must retain tolerance');
s=stock(32,-11,{trade:56,technical:53,momentum:50,leadership:52,capital:58});t=swingTimeReview(s);r=reunderwriteExistingPosition({stock:s,decision:{action:'Hold'},risk,timeReview:t});assert(r.action==='Exit'&&/failed re-underwriting/.test(r.reason),'weak double-digit loser in Re-underwrite must exit');
s=stock(57,-11,{trade:56,technical:53,momentum:50,leadership:52,capital:54});t=swingTimeReview(s);r=reunderwriteExistingPosition({stock:s,decision:{action:'Hold'},risk,timeReview:t});assert(r.action==='Exit'&&/Cash now has the stronger claim/.test(r.reason),'aging weak loser must be allowed to exit to cash without a replacement');
console.log('PROOF FOLLOW-THROUGH REGRESSION PASS: 12 checks passed');
