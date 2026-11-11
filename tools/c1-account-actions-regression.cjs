const assert=require('node:assert/strict');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const {createWorkflowApi}=require('./fixtures/c1-trading-workflow-api.cjs');
const {approvedOperationalRiskModules}=require('./fixtures/c1-account-policy-risk.cjs');
const {applyAccountPolicyUniverseFixture}=require('./fixtures/c1-account-policy-universe.cjs');
const loader=createResearchModuleLoader(process.cwd());
const {resolveC1AccountActions:resolve,capC1AccountExposure:exposure,applyC1AccountActionsToPlan:apply}=loader.load('lib/c1AccountActions.js');
const {c1OrderDisplayGroups:groups}=loader.load('lib/c1OrderDisplay.js');
const policy={version:'c1-account-policy-v2',active:true,complete:true,identity:'synthetic-policy',blockedSymbols:['AAA'],stockCooldowns:[]};
const buy=(symbol,sleeve='base',shares=2)=>({id:symbol+':'+sleeve,symbol,sleeve,shares,side:'buy',estimatedPrice:100,reason:'Buy'});
let r=resolve({accountPolicy:policy,decisionId:'version-1',orders:[buy('AAA','sector40'),buy('BBB'),{...buy('BBB','cooldown15'),side:'sell',reason:'initial-stop'},buy('CCC')]});
assert.deepEqual(Array.from(r.orders.filter(o=>o.side==='buy').map(o=>o.symbol)),['CCC']);
assert.equal(r.accountActions.find(a=>a.symbol==='BBB').side,'sell','A protective Sell is never cancelled by netting an allocation Buy');
assert.equal(r.blockedOrders.length,2,'Global stock loss and cross-allocation active Sell both block purchases');
const owned=[{symbol:'EXIT',shares:30,stops:[{sleeve:'base',shares:10},{sleeve:'cooldown15',shares:20}],exits:[]}];
const sellIntent=(id,sleeve,shares,reason)=>({id,sleeve,symbol:'EXIT',side:'sell',shares,reason,estimatedPrice:100});
const protective=sellIntent('protective','base',10,'portfolio-drawdown-stop'),owner=sellIntent('owner','base',10,'owner-discretionary-exit');
let duplicate=resolve({accountPolicy:policy,positions:owned,orders:[protective,{...protective},owner]});
assert.equal(duplicate.accountActions[0].shares,10,'Duplicate identities and competing full exits cannot sell the same allocation twice');
assert.equal(duplicate.accountActions[0].reason,'portfolio-drawdown-stop','Protective intent keeps priority over an equal owner exit');
assert.deepEqual(Array.from(duplicate.accountActions[0].orderIds),['protective','owner']);
duplicate=resolve({accountPolicy:policy,positions:owned,orders:[protective,owner,sellIntent('other-allocation','cooldown15',20,'initial-stop')]});
assert.equal(duplicate.accountActions[0].shares,30,'Different allocations retain their full 10 + 20 share account exit');
duplicate=resolve({accountPolicy:policy,positions:owned,openingBooks:{base:{positions:{EXIT:{shares:6}}}},orders:[protective,owner]});
assert.equal(duplicate.accountActions[0].shares,6,'Current actual books cap an older full exit after partial execution');
assert.throws(()=>resolve({accountPolicy:policy,positions:owned,orders:[protective,{...protective,shares:9}]}),/Conflicting account order identity/);
r=resolve({accountPolicy:{...policy,blockedSymbols:[]},positions:[{symbol:'DDD',exits:[{shares:2,condition:'stop-triggered'}]}],orders:[buy('DDD'),{...buy('DDD','sector40'),side:'sell',condition:'stop-triggered'}]});
assert(r.orders.some(o=>o.side==='buy'),'An untriggered conditional standing stop does not become an unconditional exit');
r=resolve({accountPolicy:{...policy,blockedSymbols:[]},decisionId:'stop-version',orders:[buy('DDD'),{...buy('DDD','sector40',3),side:'sell',condition:'stop-triggered'}],
 activeExitInstructions:[{symbol:'DDD',shares:3,reason:'verified-current-stop',allocationBreakdown:[{sleeve:'sector40',shares:3,reason:'verified-current-stop',estimatedPrice:80}]}]});
assert(!r.orders.some(o=>o.side==='buy'));assert(r.orders.some(o=>o.condition==='stop-triggered'),'Verified stop recommendation preserves the original conditional broker-order identity');
assert.equal(r.accountActions.find(action=>action.symbol==='DDD').shares,3);assert.equal(r.accountActions[0].side,'sell');
r=apply({orders:[buy('AAA'),buy('CCC','sector40')],riskBySleeve:{base:{operationalRisk:{purchaseRiskReady:false,status:'liquidation-evidence-required'}},sector40:{operationalRisk:{purchaseRiskReady:true}}}}, {accountPolicy:{...policy,blockedSymbols:[]},decisionId:'v'});
assert.deepEqual(Array.from(r.orders.map(o=>o.symbol)),['CCC'],'An allocation waiting for liquidation evidence cannot freeze another ready allocation');
const limits={maxPositionPct:1/3,maxSectorValue:100000,maxSectorPositions:2,maxIssuerPositions:1,maxDistinctPositions:4,candidates:{NEW:{sector:'S',issuer:'I'},AAA:{sector:'S',issuer:'I'}}};
const openingBooks={base:{cash:1000,positions:{AAA:{shares:2},ALIAS:{shares:2}}}};
const held=[{symbol:'AAA',sector:'S',issuer:'I',price:100},{symbol:'ALIAS',sector:'T',issuer:'I',price:100}];
assert.equal(exposure({orders:[buy('AAA')],openingBooks,brokerageCash:10000,exposure:{...limits,holdings:held}}).blockedOrders[0].blockReason,'account-issuer-limit','An Add cannot bypass an inherited issuer alias conflict');
assert.equal(exposure({orders:[buy('AAA')],openingBooks:{base:{positions:{AAA:{shares:2}}}},brokerageCash:10000,exposure:{...limits,holdings:[held[0]],candidates:{AAA:{sector:'Other',issuer:'Different'}}}}).blockedOrders[0].blockReason,'account-exposure-unverified','An Add cannot silently reclassify existing exposure');
assert.equal(exposure({orders:[buy('NEW')],openingBooks:{base:{positions:Object.fromEntries(['A','B','C','D'].map(symbol=>[symbol,{shares:1}]))}},brokerageCash:10000,exposure:{...limits,holdings:['A','B','C','D'].map(symbol=>({symbol,sector:symbol,issuer:symbol,price:100}))}}).blockedOrders[0].blockReason,'account-position-limit');

async function run(){
 const api=createWorkflowApi('buy',{baselineDate:'2026-11-10',portfolio:[{symbol:'CASH',role:'Swing',shares:100000,avgCost:1}],moduleOverrides:approvedOperationalRiskModules()});
 api.fixture.setCash(100000);applyAccountPolicyUniverseFixture(api.fixture);
 const originalHistory=JSON.stringify({adoption:api.fixture.account.adoption,records:api.fixture.account.records});
 let response=await api.request('POST',{operation:'prepare-execution'});assert.equal(response.status,200,response.body.error);
 const view=response.body,buyOrders=view.openingPlan.orders.filter(o=>o.side==='buy');
 assert.equal(view.actionVersion,view.decision.decisionId);assert.equal(view.executionDecision.decisionId,view.decision.decisionId);
 assert.equal(view.manualRecommendations.decisionId,view.decision.decisionId);assert.equal(view.openingPlan.actionVersion,view.decision.decisionId);
 assert.equal(buyOrders.length,9);assert.equal(groups(buyOrders).length,3,'Nine allocation orders become three account instructions with accounting breakdown');
 assert.equal(view.openingPlan.accountActions.length,3);
 api.fixture.setEventEvidence([]);
 let missingEvents=await api.request('POST',{operation:'prepare-execution'});assert.equal(missingEvents.status,200,missingEvents.body.error);
 assert.equal(missingEvents.body.openingPlan.orders.filter(order=>order.side==='buy').length,0);
 assert.equal(missingEvents.body.decision.selectionEvidence?.evidenceComplete,false,'All missing current events is explicit incomplete evidence, not no qualifying opportunities');
 const publication=loader.load('lib/c1PublicationStatus.js').c1PublicationStatus;
 assert.equal(publication({sourceSessionDate:'2026-11-10',analysisSessionDate:'2026-11-10',selectionEvidence:missingEvents.body.decision.selectionEvidence,now:api.fixture.now}).code,'ENTRY_EVIDENCE_INCOMPLETE');
 const {currentEventEvidenceFor}=require('./fixtures/c1-trading-workflow.cjs');
 const universe=api.fixture.sessions.at(-1).universeSymbols;
 api.fixture.setEventEvidence(currentEventEvidenceFor(universe,api.fixture.now,Object.fromEntries(universe.map(symbol=>[symbol,{state:'VERIFIED_BLOCKED'}]))));
 missingEvents=await api.request('POST',{operation:'prepare-execution'});assert.equal(missingEvents.status,200,missingEvents.body.error);
 assert.equal(missingEvents.body.decision.selectionEvidence?.evidenceComplete,true,'Verified blocked events are completed disqualifications, not missing evidence');
 assert.equal(missingEvents.body.openingPlan.orders.filter(order=>order.side==='buy').length,0);
 api.fixture.setEventEvidence(currentEventEvidenceFor(api.fixture.sessions.at(-1).universeSymbols,api.fixture.now).filter(event=>event.symbol!=='X12'));
 missingEvents=await api.request('POST',{operation:'prepare-execution'});assert.equal(missingEvents.status,200,missingEvents.body.error);
 assert.equal(missingEvents.body.decision.selectionEvidence?.evidenceComplete,false);
 assert(missingEvents.body.openingPlan.orders.some(order=>order.side==='buy'&&order.symbol==='X15'),'A missing higher-ranked current event never blocks the verified lower-ranked stock');
 api.fixture.setEventEvidence(null);
 const {joinC1Opportunities:join}=api.fixture.loader.load('lib/c1OpportunitiesContract.js');
 const {projectC1Opportunities:project}=api.fixture.loader.load('lib/c1OpportunitiesProjection.js');
 const input={...view,screenRows:api.fixture.screenRows(),positionRows:api.fixture.screenRows(),screenCurrent:true,portfolio:api.fixture.portfolio};
 const joined=join(input,{readTime:()=>api.fixture.now});
 assert.equal(joined.projection.actionableBuys.length,3,'The real account-to-classifier-to-publication join consumes one instruction per stock');
 const staleRatings=[{symbol:'OLD',rating:'Watch',priority:-999,entryEvidence:{momentumScore:100,close:999}},
  ...joined.evidence.ratings.map(row=>({...row,priority:-999,appearanceCount:999,entryEvidence:{momentumScore:100,close:999}}))];
 const stale=project({...input,evidence:{...joined.evidence,ratings:staleRatings,decisionId:'an-older-account-version'}},{readTime:()=>api.fixture.now});
 assert.equal(stale.actionableBuys.length,0,'An older live screen still cannot authorize purchases');
 assert.equal(stale.ratedTiles.length,0,'An older live screen cannot publish actionable rating cards');
 assert(stale.watchView.rows.length>0,'The matching current dated server source still supports monitoring while live verification waits');
 const currentSources=new Map(input.executionDecision.stockScreen.candidates.map(row=>[row.symbol,row]));
 assert(!stale.watchView.rows.some(row=>row.symbol==='OLD'),'An older screen cannot introduce its previous candidates');
 assert(stale.watchView.rows.every((row,index)=>row.priority===currentSources.get(row.symbol)?.researchRank&&
  row.close==='$'+currentSources.get(row.symbol).sourcePrice.toFixed(2)&&
  (index===0||row.priority>stale.watchView.rows[index-1].priority)),
 'Monitoring uses only current dated ranks and prices; stale priorities and appearance counts cannot leak');
 const staleSource=project({...input,decision:{...input.decision,current:false},executionDecision:{...input.executionDecision,current:false},
  evidence:{...joined.evidence,decisionId:'an-older-account-version'}},{readTime:()=>api.fixture.now});
 assert.equal(staleSource.watchView.rows.length,0,'A genuinely stale server source remains unknown rather than a current monitoring list');
 assert.equal(staleSource.watchSelection.totalEligible,null);
 assert.equal(join({...input,decision:{...input.decision,current:false,accountMismatch:true}},{readTime:()=>api.fixture.now}).projection.actionableBuys.length,0,'A current execution view cannot override the ownership-mismatch veto');
 assert.equal(join({...input,executionDecision:{...input.executionDecision,revision:input.decision.revision+1}},{readTime:()=>api.fixture.now}).projection.actionableBuys.length,0,'Competing account revisions cannot publish mixed instructions');
 const serverDecision=loader.load('lib/c1OperationalRiskDecision.js');
 assert.equal(serverDecision.C1_OPERATIONAL_RISK_DECISION.status,'approved','The production configuration records the explicit owner approval');
 const defaultCap=createResearchModuleLoader(process.cwd(),{'lib/c1OperationalRiskDecision.js':{...serverDecision,
  C1_OPERATIONAL_RISK_DECISION:Object.freeze({status:'pending-owner-decision',mode:null})}}).load('lib/c1ExecutionCashAuthority.js').capC1ExecutionCash;
 const rejected=defaultCap({plan:{...view.openingPlan,accountPolicy:{...view.openingPlan.accountPolicy,operationalRiskDecision:{status:'approved'}},riskBySleeve:{base:{operationalRisk:{purchaseRiskReady:true,decisionRequired:false}}}},account:api.fixture.account,strategyCash:100000,now:api.fixture.now});
 assert(!rejected.orders.some(o=>o.side==='buy'),'Serialized approval or stale plan flags cannot bypass the actual pending server risk decision');
 const quantity=buyOrders.filter(o=>o.symbol==='X12').reduce((sum,o)=>sum+o.shares,0);
 response=await api.request('POST',{operation:'record-intraday',expectedRevision:api.fixture.account.revision,ticket:{id:'synthetic-account-buy',symbol:'X12',side:'buy',shares:quantity,price:100.12,fee:0,executedAt:api.fixture.now.toISOString()}});
 assert.equal(response.status,200,response.body.error);
 const partial=Math.floor(buyOrders.filter(o=>o.symbol==='X13').reduce((sum,o)=>sum+o.shares,0)/2);
 response=await api.request('POST',{operation:'record-intraday',expectedRevision:api.fixture.account.revision,ticket:{id:'synthetic-second-stock',symbol:'X13',side:'buy',shares:partial,price:100.12,fee:0,executedAt:api.fixture.now.toISOString()}});
 assert.equal(response.status,200,response.body.error||'A second legitimate stock must retain verified marks for the first posted purchase');
 const record=api.fixture.loader.load('lib/c1IntradayActivity.js').recordC1IntradayActivity;
 assert.throws(()=>record({account:api.fixture.account,plan:{...view.openingPlan,activeExitSymbols:['X13'],orders:[...view.openingPlan.orders,{id:'fresh-protective-exit',symbol:'X13',side:'sell',sleeve:'base',shares:1,estimatedPrice:100}]},
  ticket:{id:'blocked-old-plan-add',symbol:'X13',side:'buy',shares:1,price:100.12,fee:0,executedAt:api.fixture.now.toISOString()},expectedRevision:api.fixture.account.revision,now:api.fixture.now}),/remaining C1 quantity/,'A stale captured Buy cannot survive a fresh active Sell');
 response=await api.request('POST',{operation:'record-intraday',expectedRevision:api.fixture.account.revision,ticket:{id:'synthetic-account-loss',symbol:'X12',side:'sell',shares:quantity,price:99,fee:1,executedAt:api.fixture.now.toISOString(),recordingReason:'owner-discretionary-exit'}});
 assert.equal(response.status,200,response.body.error);
 response=await api.request('POST',{operation:'prepare-execution'});assert.equal(response.status,200,response.body.error);
 assert(response.body.decision.accountPolicy.blockedSymbols.includes('X12'));
 assert(!response.body.openingPlan.orders.some(o=>o.side==='buy'&&o.symbol==='X12'),'No allocation can repurchase the completed losing stock');
 assert(response.body.openingPlan.orders.some(o=>o.side==='buy'&&o.symbol==='X15'),'The newly available lower-ranked unrelated stock remains eligible through the actual API');
 assert.equal(response.body.decision.accountPolicy.stockCooldowns.find(row=>row.symbol==='X12').durationSessions,15);
 assert.equal(JSON.stringify({adoption:api.fixture.account.adoption,records:api.fixture.account.records}),originalHistory,'Prospective actions cannot rewrite the adopted or completed financial record');
 console.log('PASS: actual account handler completed same-day multi-allocation loss, global repurchase ban and unrelated lower-ranked entry; one version across manual/Portfolio/Opportunities/Watch, protective-exit priority, conditional stops, exposure/cash/capacity checks, immutable history, stale-frame suppression and serialized-risk-approval rejection. Synthetic software evidence only.');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
