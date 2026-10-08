const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {createHash}=require('node:crypto');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const loader=createResearchModuleLoader(process.cwd());
const service=loader.load('lib/c1AccountService.js');
const now=new Date('2026-09-11T21:00:00Z');
const symbols=Array.from({length:12},(_,i)=>'T'+i);
const session={date:'2026-09-11',decisionAt:now.toISOString(),universeSymbols:symbols,
 prices:[...symbols,'SPY','QQQ'].map(symbol=>({symbol,date:'2026-09-11',open:100,high:101,low:99,close:100,volume:10000000,adjusted:true})),
 signals:symbols.map((symbol,i)=>({symbol,sector:'Sector'+i%4,price:100,researchFactors:{momentumPercentile:100-i,volatility60Pct:20,coverage:1},entryTiming:{available:true,liquidityPass:true,averageDollarVolume20:500000000}}))};
const book={universe:'sp500',model:{sessions:[session]},captures:[{sessionDate:session.date,hash:'fixture-source-hash',observedAt:now.toISOString()}]};
const portfolio=[{symbol:'CASH',role:'Swing',shares:3037.90,avgCost:1},{symbol:'MSTR',role:'Core',shares:2},{symbol:'MRNA',role:'Core',shares:3}];
const signature=loader.load('lib/portfolioGovernor.js').portfolioCompositionSignature(portfolio);
const original=service.adoptC1Account({portfolio,capitalRecord:{version:2,highWater:3037.90,portfolioSignature:signature,reconciliationRequired:false},book,now});
const route=fs.readFileSync('pages/api/c1-account.js','utf8').replace(/^import .*;$/gm,'').replace(/export const /g,'const ').replace(/export function /g,'function ').replace('export default createC1AccountHandler();','globalThis.factory=createC1AccountHandler;');
const context={...service,...loader.load('lib/c1AccountSave.js'),...loader.load('lib/c1ManualRecommendations.js'),...loader.load('lib/marketSession.js'),
 createHash,process:{env:{}},Date,console,
 readStoredC1DatedBook(){throw Error('Unexpected provider call');},
 get(){throw Error('Unexpected provider call');},put(){throw Error('Unexpected provider write');},
 collectC1AccountOpening(){throw Error('Cash update cannot collect opening prices');},
 collectC1HoldingCoverage(){throw Error('Cash update cannot refresh holdings');},
 collectC1HeldRankReviews(){throw Error('Cash update cannot refresh ranks');},
 reconcileC1BrokerCash(){throw Error('Cash update cannot reconcile strategy cash');}};
vm.createContext(context);vm.runInContext(route,context);
(async()=>{
 let stored={record:original,etag:'"original-strong-etag"'},writes=0,conflict=false;
 const handler=context.factory({environment:'preview',commit:'cash-fixture',clock:()=>now,readBook:async()=>({record:book}),
  store:{read:async()=>stored,write:async(path,record,etag)=>{
   assert.equal(etag,stored.etag,'Metadata update must retain strong ETag conditional writes');
   if(conflict){const error=Error('precondition failed etag mismatch');error.status=412;throw error;}
   writes++;stored={record,etag:'"revision-'+writes+'"'};
  }}});
 const request=async(body,authorized=true)=>{const res={setHeader(){},status(code){this.code=code;return this;},json(value){this.body=value;return this;}};
  await handler({method:'POST',body,headers:authorized?{authorization:'Bearer '+'fixture'.repeat(6)}:{}},res);return res;};
 const payload={operation:'update-brokerage-cash',brokerageCash:363.36,expectedRevision:0};
 assert.equal((await request(payload,false)).code,401);assert.equal(writes,0);
 const updated=await request(payload);
 assert.equal(updated.code,200,JSON.stringify(updated.body));assert.equal(writes,1);
 assert.equal(updated.body.decision.strategyCash,3037.90);
 assert.equal(updated.body.decision.actualCash,updated.body.decision.strategyCash);
 assert.equal(updated.body.decision.brokerageCash,363.36);assert.equal(updated.body.decision.executableCash,363.36);
 const {revision,brokerageCash,...unchanged}=stored.record;
 const {revision:oldRevision,...oldProtected}=original;
 assert.equal(JSON.stringify(unchanged),JSON.stringify(oldProtected),'Only metadata and revision may be persisted');
 assert.equal(revision,oldRevision+1);assert.equal(brokerageCash.source,'manual-broker-balance');assert.equal(brokerageCash.observedAt,now.toISOString());
 assert.equal(stored.record.cashReconciliations,undefined);
 assert.equal((await request(payload)).code,409);assert.equal(writes,1,'Stale revision cannot change metadata');
 for(const invalid of [-1,1.001,'363.36',null,Infinity,NaN]){
  assert.equal((await request({...payload,brokerageCash:invalid,expectedRevision:1})).code,409);assert.equal(writes,1);
 }
 conflict=true;const failed=await request({...payload,expectedRevision:1});
 assert.equal(failed.code,409);assert.equal(failed.body.code,'ACCOUNT_SAVE_CONFLICT');assert.equal(writes,1);
 conflict=false;const zero=await request({...payload,brokerageCash:0,expectedRevision:1});
 assert.equal(zero.code,200);assert.equal(zero.body.decision.strategyCash,3037.90);assert.equal(zero.body.decision.executableCash,0);
 assert.equal(zero.body.decision.current,true,'Broker cash must not suppress completed analysis');
 console.log('PASS: dedicated authenticated broker cash API changes only metadata/revision, preserves strategy economics, validates cents, and enforces revision plus ETag conflicts.');
})().catch(error=>{console.error(error);process.exitCode=1;});
