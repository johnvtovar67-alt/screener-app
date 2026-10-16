// Synthetic mechanics only. Never emits investment performance or uses private data.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createEngine,verifySources,replaceOnce}=require('./engine.cjs'),{metrics,bootstrapDifferences}=require('./metrics.cjs'),{validateEvidence,sha}=require('./evidence.cjs');
const spec=require('./research-spec-v1.json'),root=path.resolve(__dirname,'../..');let checks=0;
const ok=(v,m)=>{checks++;assert.ok(v,m);},eq=(a,b,m)=>{checks++;assert.deepEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)),m);};
verifySources(root);ok(true,'Pinned sources verified');assert.throws(()=>replaceOnce('aa aa','aa','x'),/ambiguous/);checks++;
const {fixture}=require('../c1-recent-momentum-challenger-regression.cjs');
const f=fixture(Array(14).fill(100));for(const s of f.dataset.sessions)s.screenRows=s.signals.map(x=>({...x,expertDecision:{strongBuyPass:true,metrics:{quoteFreshnessPass:true}},eventRisk:{blockNewCapital:false}}));
const before=JSON.stringify(f.dataset),controlByCost=new Map();
for(const cost of [12,25,50])for(const arm of spec.arms){
 const engine=createEngine(root,arm,cost),run=engine.run(f.dataset,f.start,f.end,cost);
 ok(run.curve.length===14&&run.trades.length>0,arm.id+' executes checked queues at '+cost);
 ok(run.curve.every(x=>x.cash>=0),arm.id+' nonnegative independent cash');
 for(const [id,r] of Object.entries(run.sleeves)){eq(r.config.rankedExitBuffer,6,arm.id+' fixed rank threshold');eq(r.config.rankedMinimumHoldSessions,30,'Holding rule preserved');eq(r.config.minimumTrade,id==='cooldown15'?375:187.5,'Normalized minimum-trade economics preserved');eq(r.config.minimumInitialStopPct,14,'Initial stop preserved');eq(r.config.portfolioDrawdownStopPct,12,'Breaker preserved');ok(r.trades.every(t=>Number.isSafeInteger(t.shares)),'Whole actual shares');}
 if(arm.id==='C'){controlByCost.set(cost,run);ok(run.screenDecisions.some(x=>x.screenCapacitySuppressed),'Shadow screen identifies capacity-suppressed screen-eligible candidates');ok(run.screenDecisions.filter(x=>x.screenCapacitySuppressed).every(x=>x.entryEvidence.sector!=='Sector 0'&&x.entryEvidence.sector!=='Sector 1'&&x.entryEvidence.sector!=='Sector 2'),'Sector duplicates are not counted as missed screen opportunities');}
 if(arm.family==='momentum-ablation'){eq(run.curve,controlByCost.get(cost).curve,'No-trigger ablation equity parity');eq(run.trades,controlByCost.get(cost).trades,'No-trigger ablation fill parity');}
 if(arm.id==='S-A-cap9')ok(Object.values(run.sleeves).some(r=>r.curve.some(x=>x.positions>3)),'Nine-capacity adapter permits more than three without combining books');
 const m=metrics(run);ok(Number.isFinite(m.cagr)&&m.transactionCount===run.trades.length,'Metric extraction');
}
eq(JSON.stringify(f.dataset),before,'All arms preserve inputs');
const control=createEngine(root,spec.arms[0]);const gate=control.loader.load('lib/c1RecentMomentumGate.js');
const short=f.dataset.sessions.slice(-6);short.at(-1).signals.find(x=>x.symbol==='AAA').entryTiming.macdImproving=false;
const missing=JSON.parse(JSON.stringify(short));delete missing.at(-1).signals.find(x=>x.symbol==='AAA').entryTiming.macdImproving;
ok(!gate.readC1RecentMomentum({sessions:missing,symbol:'AAA'}).available,'Missing canonical MACD blocks capital');
const future=JSON.parse(JSON.stringify(short));future.at(-1).prices.find(x=>x.symbol==='AAA').availableAt='2099-01-01T00:00:00Z';
ok(!gate.readC1RecentMomentum({sessions:future,symbol:'AAA'}).available,'Future price evidence rejected');
const dup=JSON.parse(JSON.stringify(short));dup[1].date=dup[0].date;ok(!gate.readC1RecentMomentum({sessions:dup,symbol:'AAA'}).available,'Duplicate session rejected');
const flat={cost:12,curve:[{date:'2025-01-02',equity:100,cash:100},{date:'2025-01-03',equity:100,cash:100}],trades:[]};
eq(metrics(flat).sharpe,null,'Zero variance Sharpe undefined');eq(metrics(flat).maxDrawdown,0,'Flat drawdown');eq(metrics(flat).meanCashWeight,1,'All idle cash measured');
const draw={...flat,curve:[flat.curve[0],{date:'2025-01-03',equity:80,cash:0},{date:'2025-01-06',equity:90,cash:0}]};ok(Math.abs(metrics(draw).maxDrawdown+.2)<1e-12,'Drawdown uses prior high');
const b1=bootstrapDifferences([0,.01,-.01,.02],{same:[0,.01,-.01,.02],worse:[-.01,0,-.02,.01]},{replicates:200}),b2=bootstrapDifferences([0,.01,-.01,.02],{same:[0,.01,-.01,.02],worse:[-.01,0,-.02,.01]},{replicates:200});
eq(b1,b2,'Deterministic paired bootstrap');eq(b1.same.ci95,[0,0],'Identical returns have zero paired interval');ok(b1.worse.meanDailyReturnDifference<0&&b1.worse.holmAdjustedP>.05,'Negative result not called superior');
const template=path.join(__dirname,'evidence-manifest.template.json');const failed=validateEvidence(template,spec);eq(failed.status,'FAIL','Empty evidence template fails');ok(failed.errors.some(x=>x.includes('normalized_sessions')),'Accounting fixtures cannot substitute for inputs');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'c1-evidence-test-'));try{
 const m=JSON.parse(fs.readFileSync(template));m.artifacts=[{role:'calendar',path:'../outside.json',bytes:0,sha256:'x'}];fs.writeFileSync(path.join(temp,'manifest.json'),JSON.stringify(m));ok(validateEvidence(path.join(temp,'manifest.json'),spec).errors.some(x=>x.includes('Unsafe')),'Traversal blocked');
 fs.writeFileSync(path.join(temp,'calendar.json'),'[]');m.artifacts=[{role:'calendar',path:'calendar.json',bytes:2,sha256:'bad'}];fs.writeFileSync(path.join(temp,'manifest.json'),JSON.stringify(m));ok(validateEvidence(path.join(temp,'manifest.json'),spec).errors.some(x=>x.includes('digest')),'Tampered artifacts rejected');
 m.artifacts[0].sha256=sha(Buffer.from('[]'));m.artifacts[0].source={url:'https://example.org?apikey=secret',retrievedAt:'2026-10-16T00:00:00Z',provider:'test',license:'test'};fs.writeFileSync(path.join(temp,'manifest.json'),JSON.stringify(m));ok(validateEvidence(path.join(temp,'manifest.json'),spec).errors.some(x=>x.includes('Credential-bearing')),'Secret-bearing provenance URL rejected');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
// Targeted ablation checks use only an explicitly synthetic gate input.
function reviewPath(armId,values,{macd=false,peak=100,verified=false}={}){
 const helper=createEngine(root,spec.arms.find(a=>a.id===armId)).loader.load('lib/c1RecentMomentumGate.js');
 const dates=f.dataset.sessions.slice(-values.length).map(s=>s.date),sessions=values.map((close,i)=>({date:dates[i],decisionAt:dates[i]+'T21:00:00Z',prices:[{symbol:'AAA',date:dates[i],close,high:Math.max(close,peak),adjusted:true}],signals:[{symbol:'AAA',entryTiming:{available:true,macdImproving:macd,asOf:dates[i]}}]}));
 const position={symbol:'AAA',entryPrice:100,enteredAt:dates[0],positionId:1,highWatermark:peak,recentMomentumPeakVerified:verified};let prior=null,out;
 for(let i=5;i<sessions.length;i++){out=helper.evaluateC1RecentMomentum({sessions,sessionIndex:i,symbol:'AAA',prior,position,sleeve:'base'});prior=out.state;}
 return out;
}
const falling=[110,109,108,107,106,105,104,103];
ok(reviewPath('C',falling).exitReason==='recent-momentum-deterioration','Control confirms ordinary deterioration');
eq(reviewPath('M-deterioration-off',falling).exitReason,null,'Named ablation removes only deterioration path');
ok(reviewPath('C',[100,101,102,103,104,111,110,109],{peak:120,verified:true}).exitReason==='recent-momentum-profit-protection','Control confirms independent giveback');
eq(reviewPath('M-giveback-off',[100,101,102,103,104,111,110,109],{peak:120,verified:true}).exitReason,null,'Giveback ablation preserves rising longer windows without sale');
ok(!reviewPath('C',falling.slice(0,6)).entryAllowed,'Control entry veto');
ok(reviewPath('M-entry-off',falling.slice(0,6)).entryAllowed,'Entry-only ablation removes veto');
eq(reviewPath('C',falling,{macd:true}).exitReason,null,'Control respects improving MACD');
ok(reviewPath('M-macd-off',falling,{macd:true}).exitReason!==null,'MACD ablation changes confirmed deterioration');
// Full evidence-contract fixture, explicitly synthetic and never supplied to run CLI.
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'c1-full-evidence-'));try{
 const d=JSON.parse(JSON.stringify(f.dataset));for(const session of d.sessions){
  for(const p of session.prices){p.securityId=p.symbol;p.availableAt=session.decisionAt;p.adjustmentAsOf=session.date;}
  if(session.date<f.start){session.signals=[];session.positionSignals=[];session.screenRows=[];continue;}
  for(const x of session.signals){x.securityId=x.symbol;x.eventRisk={blockNewCapital:false,availableAt:session.decisionAt};}
  session.screenRows=session.signals.map(x=>({...x,availableAt:session.decisionAt,expertDecision:{strongBuyPass:true,metrics:{quoteFreshnessPass:true}}}));
 }
 const dates=d.sessions.map(s=>s.date),first=dates[0],last=dates.at(-1),since=first+'T00:00:00Z',symbols=d.sessions[0].universeSymbols;
 const classification=Object.fromEntries(d.sessions.at(-1).signals.map(x=>[x.symbol,x]));
 const rows=field=>symbols.map(symbol=>({securityId:symbol,symbol,from:first,to:last,availableAt:since,...(field==='sector'?{sector:classification[symbol].sector}:field==='issuer'?{issuer:symbol}:field==='event'?{blockNewCapital:false}:{})}));
 const content={calendar:dates,raw_prices:d.sessions.flatMap(s=>s.prices),membership:rows(),sector_history:rows('sector'),issuer_history:rows('issuer'),corporate_actions:[],delisting_outcomes:[],event_history:rows('event'),normalized_sessions:d};
 const manifest={universe:'sp500',schema:'c1-independent-evidence-v1',label:'retrospective-independent-research',startDate:f.start,endDate:last,warmupStart:first,artifacts:[]};
 const write=(role,value)=>{const b=Buffer.from(JSON.stringify(value)),file=role+'.json';fs.writeFileSync(path.join(tmp,file),b);manifest.artifacts.push({role,path:file,bytes:b.length,sha256:sha(b),source:{provider:'SYNTHETIC-TEST-ONLY',url:'https://example.org/'+role,retrievedAt:'2026-10-16T00:00:00Z',license:'Synthetic test contract, no financial evidence'}});};
 for(const [role,value] of Object.entries(content))write(role,value);
 write('independent_verification',{reviewer:'SYNTHETIC-TEST-ONLY',independent:true,independentOrigins:['SYNTHETIC-ONE','SYNTHETIC-TWO'],championAdapterParityApproved:true,findingsResolved:true,reviewedArtifactHashes:manifest.artifacts.map(a=>a.sha256)});
 const file=path.join(tmp,'manifest.json'),localSpec=JSON.parse(JSON.stringify(spec));Object.assign(localSpec.data,{target_start:f.start,target_end:last,warmup_start:first});
 const save=()=>fs.writeFileSync(file,JSON.stringify(manifest));save();
 eq(validateEvidence(file,localSpec).status,'READY_FOR_RESEARCH','Structurally complete test evidence validates; not real source certification');
 function updateDataset(){const b=Buffer.from(JSON.stringify(d)),a=manifest.artifacts.find(x=>x.role==='normalized_sessions');fs.writeFileSync(path.join(tmp,a.path),b);a.bytes=b.length;a.sha256=sha(b);save();}
 d.sessions.at(-1).signals[0].marketAvailableAt='2099-01-01T00:00:00Z';updateDataset();ok(validateEvidence(file,localSpec).errors.some(x=>x.includes('look-ahead')),'Future signal fails even when artifact hash updated');
 d.sessions.at(-1).signals[0].marketAvailableAt=d.sessions.at(-1).decisionAt;d.sessions.at(-1).signals[0].sector='invented';updateDataset();ok(validateEvidence(file,localSpec).errors.some(x=>x.includes('sector mismatch')),'Undated sector substitution fails');
 d.sessions.at(-1).signals[0].sector=classification[d.sessions.at(-1).signals[0].symbol].sector;d.sessions.at(-1).prices[0].close+=1;updateDataset();ok(validateEvidence(file,localSpec).errors.some(x=>x.includes('raw adjusted-price')),'Normalized price revision fails raw parity');
 const rawArtifact=manifest.artifacts.find(x=>x.role==='raw_prices'),rawPath=path.join(tmp,rawArtifact.path),raw=JSON.parse(fs.readFileSync(rawPath));raw.push(raw[0]);const rawBytes=Buffer.from(JSON.stringify(raw));fs.writeFileSync(rawPath,rawBytes);rawArtifact.bytes=rawBytes.length;rawArtifact.sha256=sha(rawBytes);save();ok(validateEvidence(file,localSpec).errors.some(x=>x.includes('duplicate raw')),'Ambiguous raw source duplicates rejected');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
console.log(JSON.stringify({status:'PASS',assertions:checks,scope:'Synthetic mechanics, source pinning and evidence integrity only; no historical performance evaluated'}));
