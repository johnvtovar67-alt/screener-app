const fs=require('fs');
const vm=require('vm');
const assert=(c,m)=>{if(!c)throw new Error(m)};
const daysAgo=d=>new Date(Date.now()-d*86400000).toISOString();

let gov=fs.readFileSync('lib/portfolioGovernor.js','utf8').replace(/^import .*$/gm,'').replace(/export function /g,'function ');
gov+='\nmodule.exports={swingTimeReview};';
let box={module:{exports:{}},exports:{},console,Math,Number,String,Object,Array,Boolean,Map,Set,Date,marketObservationSessionDay:()=>null};
vm.createContext(box);vm.runInContext(gov,box);
const {swingTimeReview}=box.module.exports;

let pos=fs.readFileSync('lib/positionReunderwrite.js','utf8').replace(/export function /g,'function ');
pos+='\nmodule.exports={reunderwriteExistingPosition};';
box={module:{exports:{}},exports:{},console,Math,Number,String,Object,Array,Boolean,Date};
vm.createContext(box);vm.runInContext(pos,box);
const {reunderwriteExistingPosition}=box.module.exports;

const stock=(days,pnl,{thesis=70,trade=80,technical=80,momentum=75,leadership=75,capital=78,materialCatalysts=[]}={})=>({symbol:'TEST',role:'Swing',openedAt:daysAgo(days),lastTradeAt:daysAgo(days),gainLossPct:pnl,materialCatalysts,recommendation:{expertDecision:{thesisScore:thesis,tradeSetupScore:trade,capitalScore:capital,metrics:{technical,momentum,leadership,risk:45}}}});
const risk={swingCapital:18000,positions:{TEST:{value:1200,pctSwing:.067,factorWeights:{Other:1}}},factorPct:{Other:.067}};
const catalyst={type:'Bellwether Earnings',material:true,days:0,label:'NVDA earnings today',detail:'NVDA is a high-impact factor bellwether.'};
const macroCatalyst={type:'Macro',material:true,days:0,label:'CPI inflation report today',detail:'Broad macro context should not rescue a weak position from a lifecycle exit.'};

let s=stock(15,0);let t=swingTimeReview(s);assert(t.stage==='Proof'&&!t.review,'15-day flat trade with strong forward evidence should remain normal Proof');
s=stock(16,0,{trade:57,technical:57,momentum:52,leadership:53,capital:60});t=swingTimeReview(s);assert(t.review&&t.proofFailure,'flat weak 15+ day trade must trigger Proof review');let r=reunderwriteExistingPosition({stock:s,decision:{action:'Hold'},risk,timeReview:t});assert(r.action==='Review'&&r.proofFailure&&(/recycle the capital|has not earned continued capital/i.test(r.reason)),'weak flat Proof trade must explicitly challenge continued capital as Review');
s=stock(18,-11,{trade:56,technical:54,momentum:50,leadership:52,capital:58});t=swingTimeReview(s);assert(t.review&&t.proofFailure,'double-digit Proof loss must always trigger review');r=reunderwriteExistingPosition({stock:s,decision:{action:'Hold'},risk,timeReview:t});assert(r.action==='Exit'&&/failed Proof/.test(r.reason),'double-digit weak Proof loss must exit');
s=stock(18,-11,{trade:56,technical:54,momentum:50,leadership:52,capital:58,materialCatalysts:[catalyst]});t=swingTimeReview(s);r=reunderwriteExistingPosition({stock:s,decision:{action:'Hold'},risk,timeReview:t});assert(r.action==='Hold'&&r.catalystDeferredExit&&/Material catalyst review/.test(r.reason),'marginal Proof exit may defer for an imminent stock/factor-specific catalyst');
s=stock(18,-11,{trade:56,technical:54,momentum:50,leadership:52,capital:58,materialCatalysts:[macroCatalyst]});t=swingTimeReview(s);r=reunderwriteExistingPosition({stock:s,decision:{action:'Hold'},risk,timeReview:t});assert(r.action==='Exit'&&!r.catalystDeferredExit,'broad macro events must not rescue a weak Proof trade from a lifecycle exit');
s=stock(18,-11,{trade:72,technical:66,momentum:62,leadership:63,capital:72});t=swingTimeReview(s);r=reunderwriteExistingPosition({stock:s,decision:{action:'Hold'},risk,timeReview:t});assert(r.action==='Review'&&/immediate Proof review/i.test(r.reason),'double-digit Proof loss with unusually strong forward evidence must surface as Review, not ordinary Hold');
s=stock(7,-15,{trade:56,technical:54,momentum:50,leadership:52,capital:58});t=swingTimeReview(s);assert(t.stage==='Setup'&&t.review&&t.setupFailure,'deep early Setup loss must trigger immediate review');r=reunderwriteExistingPosition({stock:s,decision:{action:'Hold'},risk,timeReview:t});assert(r.action==='Exit'&&r.setupFailure,'deep early Setup loss without exceptional evidence must exit');
s=stock(9,-13.5,{trade:56,technical:54,momentum:50,leadership:52,capital:58,materialCatalysts:[catalyst]});t=swingTimeReview(s);r=reunderwriteExistingPosition({stock:s,decision:{action:'Hold'},risk,timeReview:t});assert(r.action==='Exit'&&r.catalystConsidered&&!r.catalystDeferredExit,'severe early Setup failure must not be rescued by a bellwether catalyst');assert(/explicitly considered/.test(r.reason)&&/12% Setup-risk threshold/.test(r.reason),'rejected catalyst override must be transparent in the exit explanation');
s=stock(7,-4,{trade:54,technical:54,momentum:50,leadership:52,capital:58});t=swingTimeReview(s);assert(t.stage==='Setup'&&!t.review,'normal early Setup volatility must retain tolerance');
s=stock(32,-11,{trade:56,technical:53,momentum:50,leadership:52,capital:58});t=swingTimeReview(s);r=reunderwriteExistingPosition({stock:s,decision:{action:'Hold'},risk,timeReview:t});assert(r.action==='Exit'&&/failed re-underwriting/.test(r.reason),'weak double-digit loser in Re-underwrite must exit');
s=stock(57,-11,{trade:56,technical:53,momentum:50,leadership:52,capital:54});t=swingTimeReview(s);r=reunderwriteExistingPosition({stock:s,decision:{action:'Hold'},risk,timeReview:t});assert(r.action==='Exit'&&/Cash now has the stronger claim/.test(r.reason),'aging weak loser must be allowed to exit to cash without a replacement');
console.log('PROOF FOLLOW-THROUGH REGRESSION PASS: catalyst boundaries and lifecycle exits verified');
