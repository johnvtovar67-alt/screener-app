// Exercise known account limits before real opening selection, using synthetic
// accepted observations and a proposed risk choice supplied only to this test.
// The production operational-risk decision remains pending owner approval.
const assert=require('node:assert/strict');
const {createWorkflowFixture}=require('./fixtures/c1-trading-workflow.cjs');
const {applyAccountPolicyUniverseFixture}=require('./fixtures/c1-account-policy-universe.cjs');
const eq=(a,b,label)=>assert.equal(JSON.stringify(a),JSON.stringify(b),label);
function fixture(mode){
 const f=createWorkflowFixture('buy',{baselineDate:'2026-11-10',now:'2026-11-11T17:00:00Z',portfolio:[{symbol:'CASH',role:'Swing',shares:40000,avgCost:1}]});
 const spec=applyAccountPolicyUniverseFixture(f);
 for(const session of f.sessions)for(const field of ['signals','positionSignals'])for(const row of session[field]){
  const index=spec.symbols.indexOf(row.symbol);row.researchFactors.volatility60Pct=20;
  row.issuer=mode==='issuer'&&index<24?'MRNA':row.symbol;
  if(mode==='sector'&&index<24)row.sector='Shared Sector';
 }
 const portfolio=mode==='sector'?[{symbol:'MRNA',role:'Swing',shares:100,avgCost:100,openedAt:'2026-11-10'},
  {symbol:'BBB',role:'Swing',shares:90,avgCost:100,openedAt:'2026-11-10'},{symbol:'CASH',role:'Swing',shares:21000,avgCost:1}]:
  [{symbol:'MRNA',role:'Swing',shares:100,avgCost:100,openedAt:'2026-11-10'},{symbol:'CASH',role:'Swing',shares:20000,avgCost:1}];
 const signature=f.loader.load('lib/portfolioGovernor.js').portfolioCompositionSignature(portfolio);
 f.account=f.service.adoptC1Account({portfolio,capitalRecord:{version:2,highWater:mode==='sector'?40000:30000,portfolioSignature:signature,reconciliationRequired:false},book:f.book,now:new Date('2026-11-10T22:00:00Z')});
 const policy={...f.loader.load('lib/c1AccountPolicy.js').buildC1AccountPolicy(f.account,{date:'2026-11-11',now:f.now}),
  operationalRiskDecision:{status:'approved',mode:'next-open-after-verified-liquidation'}};
 const books=f.loader.load('lib/c1AccountLedger.js').c1AccountBooks(f.account.adoption);
 const baseline=f.book.model.sessions.at(-1);
 const input={adoption:f.account.adoption,baseline,sessions:[baseline],historySessions:f.book.model.sessions,books,opening:f.opening(),observedAt:f.now,
  purchaseFundingIndependent:true,additionalSwingCapacity:true,accountPolicy:policy,brokerageCashAvailable:mode==='sector'?21000:20000,prospectiveSwingStopPolicy:'c1-new-swing-initial-stop-10-v1'};
 return {f,spec,input,project:f.loader.load('lib/c1AccountProjection.js').projectC1AccountSession};
}
for(const mode of ['issuer','sector']){
 const {f,spec,input,project}=fixture(mode),before=JSON.stringify({account:f.account,book:f.book,input});
 const plan=project(input),expected=mode==='sector'?spec.expectedSelected.slice(0,2):spec.expectedSelected;
 eq(plan.additionalSwingCapacity.symbols,expected,'Real opening selection advances beyond twenty-four known '+mode+' rejects');
 const buys=plan.orders.filter(order=>order.side==='buy');
 eq([...new Set(buys.map(order=>order.symbol))],expected,'Real account engine proposes the same verified lower-ranked replacements');
 assert(!buys.some(order=>spec.blockedLeaders.includes(order.symbol)),'A known disqualification cannot leak through another allocation');
 if(mode==='issuer')assert.equal(plan.accountPolicy.purchaseBlocks.BBB,'account-issuer-limit');
 else assert.equal(plan.accountPolicy.purchaseBlocks.CCC,'account-sector-position-limit');
 const {capC1AccountExposure}=f.loader.load('lib/c1AccountActions.js');
 const capped=capC1AccountExposure({orders:plan.orders,openingBooks:input.books,brokerageCash:input.brokerageCashAvailable,exposure:plan.accountExposure});
 const held=new Set(Object.values(input.books).flatMap(book=>Object.keys(book.positions)));
 for(const order of capped.orders)if(order.side==='buy')held.add(order.symbol);
 assert(held.size<=4,'Account exposure counts unique stocks across all three allocations');
 eq(JSON.stringify({account:f.account,book:f.book,input}),before,'Selection cannot change financial history, ownership, basis or accepted observations');
 const unknown=project({...input,brokerageCashAvailable:undefined});
 eq(unknown.additionalSwingCapacity.symbols,[],'Unverified actual brokerage cash cannot fabricate an eligible purchase');
}
const {f,input,project}=fixture('issuer'),plan=project(input),{buildC1AccountPurchaseBlocks}=f.loader.load('lib/c1AccountPurchaseEligibility.js');
const incomplete={...plan.accountExposure,holdings:[]};
assert.equal(buildC1AccountPurchaseBlocks({openingBooks:input.books,brokerageCash:20000,exposure:incomplete,quotes:input.opening.prices}).complete,false,'Missing existing holding marks fail closed');
const poor=buildC1AccountPurchaseBlocks({openingBooks:input.books,brokerageCash:50,exposure:plan.accountExposure,quotes:input.opening.prices});
assert.equal(poor.complete,true);assert.equal(poor.purchaseBlocks.X12,'brokerage-cash-insufficient');
const partial=buildC1AccountPurchaseBlocks({openingBooks:input.books,brokerageCash:1000,exposure:plan.accountExposure,quotes:input.opening.prices});
assert(!partial.purchaseBlocks.X12,'A partially fundable target remains eligible; the unchanged cash cap determines its final quantity');
// A whole share can fit both real brokerage cash and the global position cap,
// yet the same allocation's rounded model trade can miss its $750 minimum.
// Supply a small canonical prior balance: this is behavior evidence only.
const options=f.loader.load('lib/c1FrozenOptions.js').C1_FROZEN_OPTIONS.base;
const metadata={X12:{sector:'First Sector',issuer:'issuer:X12'},X13:{sector:'Second Sector',issuer:'issuer:X13'}};
const runs={base:{seed:{actualDollarsPerModelDollar:1},config:options,prior:{endingCash:2500,openPositions:[],
 pendingDecisions:[['X12',600],['X13',400]].map(([symbol,price])=>({symbol,side:'buy',action:'Buy',sector:metadata[symbol].sector,issuer:metadata[symbol].issuer,factor:metadata[symbol].sector,stopPrice:price*.86,signal:{price}}))}}};
const minimum=buildC1AccountPurchaseBlocks({openingBooks:{base:{cash:2500,positions:{}}},brokerageCash:30000,
 exposure:{holdings:[],candidates:metadata,maxPositionPct:1/3,maxSectorValue:20000,maxDistinctPositions:4,maxSectorPositions:2,maxIssuerPositions:1},
 quotes:[{symbol:'X12',open:600},{symbol:'X13',open:400}],priorRuns:runs,purchaseFundingIndependent:true});
assert.equal(minimum.purchaseBlocks.X12,'account-allocation-trade-size-limit','One model share costing $600.72 fails the unchanged minimum');
assert(!minimum.purchaseBlocks.X13,'Two model shares costing $800.96 clear the unchanged minimum and remain eligible');
console.log('PASS: real account opening skips issuer/sector/concentration-ineligible leaders, selects ranks25+, preserves cash/partial-quantity and aggregate four-stock capacity.');
