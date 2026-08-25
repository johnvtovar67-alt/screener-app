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

const stock=(days,pnl,{thesis=70,trade=80,technical=80,momentum=75,leadership=75,capital=78}={})=>({
  symbol:'TEST',role:'Swing',openedAt:daysAgo(days),lastTradeAt:daysAgo(days),gainLossPct:pnl,
  recommendation:{
    expertDecision:{
      thesisScore:thesis,
      tradeSetupScore:trade,
      capitalScore:capital,
      metrics:{technical,momentum,leadership,risk:45}
    }
  }
});
const risk={swingCapital:18000,positions:{TEST:{value:1200,pctSwing:.067,factorWeights:{Other:1}}},factorPct:{Other:.067}};

let s=stock(15,0);
let t=swingTimeReview(s);
assert(t.stage==='Proof'&&!t.review,'15-day flat trade with still-strong forward evidence should remain normal Proof');

s=stock(16,0,{trade:57,technical:57,momentum:52,leadership:53,capital:60});
t=swingTimeReview(s);
assert(t.stage==='Proof'&&t.review&&t.proofFailure,'15+ day flat trade with weak follow-through must trigger Proof review');
let r=reunderwriteExistingPosition({stock:s,decision:{action:'Hold',reason:'generic'},risk,timeReview:t});
assert(r.override&&r.action==='Hold'&&r.proofFailure&&/not produced enough follow-through/.test(r.reason),'Proof failure must become a conditional hold, not an affirmative conviction hold');

s=stock(18,-5,{trade:54,technical:54,momentum:50,leadership:52,capital:58});
t=swingTimeReview(s);
assert(t.review,'Losing Proof-stage trade with weak setup must trigger review');
r=reunderwriteExistingPosition({stock:s,decision:{action:'Hold',reason:'generic'},risk,timeReview:t});
assert(r.proofFailure&&/recycle the capital/.test(r.reason),'Weak losing Proof trade must explicitly surface capital recycling');

s=stock(7,-4,{trade:54,technical:54,momentum:50,leadership:52,capital:58});
t=swingTimeReview(s);
assert(t.stage==='Setup'&&!t.review,'Normal early Setup volatility must not be converted into a time-based Proof failure');

console.log('PROOF FOLLOW-THROUGH REGRESSION PASS: 6 checks passed');
