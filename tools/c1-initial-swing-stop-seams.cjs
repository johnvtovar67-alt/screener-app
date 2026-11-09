// Exact inverse seams for the owner-authorized prospective 10% initial stop.
// Historical oracle hashes stay unchanged; unrelated bytes must still match.
const assert=require('node:assert/strict');
const seams={
  "lib/c1ActualFillReplay.js": [
    [
      "import {marketSessionDistance} from './marketSession';",
      "import {marketSessionDistance} from './marketSession';\nimport {c1CapturedInitialSwingStop} from './c1SwingStopPolicy';"
    ],
    [
      "const brokeragePurchases=new WeakMap(),capacityPurchases=new WeakMap();",
      "const brokeragePurchases=new WeakMap(),capacityPurchases=new WeakMap(),initialStopPurchases=new WeakMap();\nexport function markC1InitialSwingStopPurchase(fill,date,order){\n const pct=c1CapturedInitialSwingStop(order);\n if(fill?.side==='buy'&&pct!==null)initialStopPurchases.set(fill,{date,identity:identity(fill),pct});\n return fill;\n}"
    ],
    [
      "fundedKeys=new Set(),capacityKeys=new Set();",
      "fundedKeys=new Set(),capacityKeys=new Set(),initialStopKeys=new Map();"
    ],
    [
      "const funding=brokeragePurchases.get(f),capacity=capacityPurchases.get(f);",
      "const funding=brokeragePurchases.get(f),capacity=capacityPurchases.get(f),initialStop=initialStopPurchases.get(f);\n    if(initialStop?.date===recordDate&&initialStop.identity===identity(f))initialStopKeys.set(key,initialStop.pct);"
    ],
    [
      ".map(fill=>({...fill,keys:[fill.key],sourceSignal:projectionEvidence.get(fill.key).sourceSignal}));",
      ".map(fill=>({...fill,keys:[fill.key],sourceSignal:projectionEvidence.get(fill.key).sourceSignal,...(initialStopKeys.has(fill.key)?{initialSwingStopPct:initialStopKeys.get(fill.key)}:{})}));"
    ],
    [
      "return {...(matches.every(f=>fundedKeys.has(f.key))?{brokerageFunded:true}:{}),",
      "return {...(initialStopKeys.get(matches[0].key)===10?{initialSwingStopPct:10}:{}),...(matches.every(f=>fundedKeys.has(f.key))?{brokerageFunded:true}:{}),"
    ],
    [
      "    return {...f,key};",
      "    const {initialSwingStopPct:untrustedInitialStop,...normalized}=f;\n    return {...normalized,key};"
    ]
  ],
  "lib/c1AccountLedger.js": [
    [
      "markC1AdditionalCapacityPurchase} from",
      "markC1AdditionalCapacityPurchase,markC1InitialSwingStopPurchase} from"
    ],
    [
      "import {isC1AdditionalCapacityOrder} from './c1AdditionalSwingCapacity';",
      "import {isC1AdditionalCapacityOrder} from './c1AdditionalSwingCapacity';\nimport {c1CapturedInitialSwingStop} from './c1SwingStopPolicy';"
    ],
    [
      "if(!order||order.symbol!==fill.symbol||order.side!==fill.side)throw new Error('Actual fill does not match an account order');",
      "if(!order||order.symbol!==fill.symbol||order.side!==fill.side)throw new Error('Actual fill does not match an account order');\n    c1CapturedInitialSwingStop(order);"
    ],
    [
      "if(isC1AdditionalCapacityOrder(plan,plan.orders.find(o=>o.id===f.orderId)))markC1AdditionalCapacityPurchase(normalized,session.date);",
      "if(isC1AdditionalCapacityOrder(plan,plan.orders.find(o=>o.id===f.orderId)))markC1AdditionalCapacityPurchase(normalized,session.date);\n        markC1InitialSwingStopPurchase(normalized,session.date,plan.orders.find(o=>o.id===f.orderId));"
    ]
  ],
  "lib/c1AccountExecution.js": [
    [
      "markC1AdditionalCapacityPurchase} from",
      "markC1AdditionalCapacityPurchase,markC1InitialSwingStopPurchase} from"
    ],
    [
      "if(isC1AdditionalCapacityOrder(activity.plan,order))markC1AdditionalCapacityPurchase(normalized,activity.date);",
      "if(isC1AdditionalCapacityOrder(activity.plan,order))markC1AdditionalCapacityPurchase(normalized,activity.date);\n    markC1InitialSwingStopPurchase(normalized,activity.date,order);"
    ],
    [
      "additionalSwingCapacity:authorityPlan.additionalSwingCapacity?.contract===C1_ADDITIONAL_SWING_CAPACITY});",
      "additionalSwingCapacity:authorityPlan.additionalSwingCapacity?.contract===C1_ADDITIONAL_SWING_CAPACITY,prospectiveSwingStopPolicy:authorityPlan.prospectiveSwingStopPolicy});"
    ],
    [
      "purchaseFundingIndependent=false,additionalSwingCapacity=false}={})",
      "purchaseFundingIndependent=false,additionalSwingCapacity=false,prospectiveSwingStopPolicy=null}={})"
    ],
    [
      "purchaseFundingIndependent,additionalSwingCapacity});",
      "purchaseFundingIndependent,additionalSwingCapacity,prospectiveSwingStopPolicy});"
    ]
  ],
  "lib/c1AccountProjection.js": [
    [
      "import {c1AdditionalSwingCapacity} from './c1AdditionalSwingCapacity';",
      "import {c1AdditionalSwingCapacity} from './c1AdditionalSwingCapacity';\nimport {C1_NEW_SWING_STOP_POLICY,C1_NEW_SWING_STOP_PCT} from './c1SwingStopPolicy';"
    ],
    [
      "purchaseFundingIndependent=false,additionalSwingCapacity=false},simulate)",
      "purchaseFundingIndependent=false,additionalSwingCapacity=false,prospectiveSwingStopPolicy=null},simulate)"
    ],
    [
      "  const now=new Date(observedAt);",
      "  const now=new Date(observedAt);\n  if(prospectiveSwingStopPolicy!==null&&prospectiveSwingStopPolicy!==C1_NEW_SWING_STOP_POLICY)throw new Error('Invalid prospective Swing stop policy');"
    ],
    [
      "recentMomentumProjectionDate:opening.date}:{})},seed,projectedReplay);",
      "recentMomentumProjectionDate:opening.date,...(prospectiveSwingStopPolicy?{prospectiveSwingStopPolicy}:{})}:{})},seed,projectedReplay);"
    ],
    [
      "sequence:index,estimatedPrice:trade.price,reason:trade.reason,phase:",
      "...(trade.side==='buy'&&prospectiveSwingStopPolicy&&trade.signalSnapshot?.stopDistancePct===C1_NEW_SWING_STOP_PCT?{initialSwingStopPolicy:C1_NEW_SWING_STOP_POLICY,initialSwingStopPct:C1_NEW_SWING_STOP_PCT}:{}),sequence:index,estimatedPrice:trade.price,reason:trade.reason,phase:"
    ],
    [
      "return {contract:'c1-actual-account-opening-plan-v1',status:'projection-only',sourceSessionDate:baseline.date",
      "return {...(prospectiveSwingStopPolicy&&c1RecentMomentumLiveApplies(baseline.date)?{prospectiveSwingStopPolicy}:{}),contract:'c1-actual-account-opening-plan-v1',status:'projection-only',sourceSessionDate:baseline.date"
    ]
  ],
  "lib/c1AccountExecutionView.js": [
    [
      "import {buildC1PurchaseDiagnostics,unavailableC1PurchaseDiagnostics} from './c1PurchaseDiagnostics';",
      "import {buildC1PurchaseDiagnostics,unavailableC1PurchaseDiagnostics} from './c1PurchaseDiagnostics';\nimport {C1_NEW_SWING_STOP_POLICY} from './c1SwingStopPolicy';"
    ],
    [
      "purchaseFundingIndependent:true,additionalSwingCapacity:true};",
      "purchaseFundingIndependent:true,additionalSwingCapacity:true,prospectiveSwingStopPolicy:C1_NEW_SWING_STOP_POLICY};"
    ]
  ],
  "lib/c1RecentMomentumAccountSimulator.js": [
    [
      "const {recentMomentumSourceSessionDate,recentMomentumProjectionDate,...canonicalOptions}=options;",
      "const {recentMomentumSourceSessionDate,recentMomentumProjectionDate,prospectiveSwingStopPolicy,...canonicalOptions}=options;"
    ],
    [
      "recentMomentumLivePolicy:{contract:'c1-recent-momentum-live-v1',sourceSessionDate,projectionDate}",
      "recentMomentumLivePolicy:{contract:'c1-recent-momentum-live-v1',sourceSessionDate,projectionDate,...(prospectiveSwingStopPolicy?{prospectiveSwingStopPolicy}:{})}"
    ]
  ],
  "tools/generate-c1-recent-momentum-challenger.cjs": [
    [
      "import {previousMarketSessionDay,isUsMarketSessionDay,marketSessionDistance} from './marketSession';",
      "import {previousMarketSessionDay,isUsMarketSessionDay,marketSessionDistance} from './marketSession';\nimport {C1_NEW_SWING_STOP_POLICY,C1_NEW_SWING_STOP_PCT} from './c1SwingStopPolicy';"
    ],
    [
      "const distance = number(config.minimumInitialStopPct,0);",
      "const distance = existing?.recentOpeningStopDistancePct ?? fact.initialSwingStopPct ?? number(config.minimumInitialStopPct,0);"
    ],
    [
      "if (!(distance>0 && distance===config.maximumInitialStopPct))",
      "if (!(distance>0 && (distance===config.maximumInitialStopPct||distance===C1_NEW_SWING_STOP_PCT)))"
    ],
    [
      "if (!existing) held.recentProjectionOpenedAt=session.date;",
      "if (!existing) {held.recentProjectionOpenedAt=session.date;held.recentOpeningStopDistancePct=distance;}"
    ],
    [
      "",
      "// The prospective plan opts in only its new ownership periods. Historical\n// recorded purchases receive the policy captured by their reconciled saved order.\nreplace('        const executionSignal=recentExecutionSignal(order,fill,effectiveStopPrice);',\n`        if (!existing) {\n          const initialPct=recordedBuy?.initialSwingStopPct ?? (liveRecentMomentum && recentOpenEnabled(session) &&\n            recentLivePolicy.prospectiveSwingStopPolicy===C1_NEW_SWING_STOP_POLICY ? C1_NEW_SWING_STOP_PCT : null);\n          if(initialPct!==null){stopDistancePct=initialPct;effectiveStopPrice=fill*(1-initialPct/100);}\n        }\n        const executionSignal=recentExecutionSignal(order,fill,effectiveStopPrice);`);\n\n"
    ]
  ],
  "lib/c1OpeningPriceReview.js": [
    [
      "additionalSwingCapacity:plan.additionalSwingCapacity?.contract===C1_ADDITIONAL_SWING_CAPACITY});",
      "additionalSwingCapacity:plan.additionalSwingCapacity?.contract===C1_ADDITIONAL_SWING_CAPACITY,prospectiveSwingStopPolicy:plan.prospectiveSwingStopPolicy});"
    ]
  ],
  "lib/c1IntradayActivity.js": [
    [
      "import {isC1CurrentAdditionalCapacityOrder} from './c1AdditionalSwingCapacity';",
      "import {isC1CurrentAdditionalCapacityOrder} from './c1AdditionalSwingCapacity';\nimport {c1CapturedInitialSwingStop} from './c1SwingStopPolicy';"
    ],
    [
      "  const buys=activity.fills.filter(f=>f.symbol===symbol&&f.side==='buy'&&activity.plan.orders.find(o=>o.id===f.orderId)?.sleeve===sleeve);\n  const priorStop=old?.stops.find(s=>s.sleeve===sleeve)?.price;\n  const entry=buys.length?buys.reduce((n,f)=>n+f.price*f.shares,0)/buys.reduce((n,f)=>n+f.shares,0):p.avgCost;\n  row.stops.push({sleeve,shares:p.shares,price:priorStop??entry*(1-C1_FROZEN_OPTIONS[sleeve].minimumInitialStopPct/100)});",
      "  // Ownership is a lifecycle, not just a ticker. A full sale ends the old\n  // stop/exit evidence; later same-session reentry uses its captured new plan.\n  let held=activity.plan.openingBooks[sleeve].positions[symbol]?.shares||0;\n  let retained=held>0,openingStopPct=C1_FROZEN_OPTIONS[sleeve].minimumInitialStopPct,openingCost=0,openingShares=0;\n  for(const fill of actual.fills.filter(f=>f.symbol===symbol&&activity.plan.orders.find(o=>o.id===f.orderId)?.sleeve===sleeve)){\n   if(fill.side==='sell'){\n    if(!retained&&openingShares>0){openingCost*=Math.max(0,openingShares-fill.shares)/openingShares;openingShares=Math.max(0,openingShares-fill.shares);}\n    held-=fill.shares;\n    if(held===0){retained=false;openingCost=0;openingShares=0;}\n   }else{\n    if(held===0)openingStopPct=c1CapturedInitialSwingStop(activity.plan.orders.find(order=>order.id===fill.orderId))??C1_FROZEN_OPTIONS[sleeve].minimumInitialStopPct;\n    if(!retained){openingCost+=fill.price*fill.shares;openingShares+=fill.shares;}\n    held+=fill.shares;\n   }\n  }\n  (row.retainedOpeningSleeves??=[]).push(...(retained?[sleeve]:[]));\n  const priorStop=retained?old?.stops.find(s=>s.sleeve===sleeve)?.price:null;\n  const entry=openingShares?openingCost/openingShares:p.avgCost;\n  row.stops.push({sleeve,shares:p.shares,price:priorStop??entry*(1-openingStopPct/100)});"
    ],
    [
      "   const owns=sleeve=>Boolean(actual.books[sleeve]?.positions[row.symbol]);",
      "   const retained=new Set(row.retainedOpeningSleeves),owns=sleeve=>retained.has(sleeve)&&Boolean(actual.books[sleeve]?.positions[row.symbol]);\n   delete row.retainedOpeningSleeves;"
    ],
    [
      "   if(shares)orders.push({...order,shares});\n   continue;",
      "   const recordedStop=order.condition==='stop-triggered'?decision.positions.find(p=>p.symbol===order.symbol)?.stops.find(stop=>stop.sleeve===order.sleeve)?.price:null;\n   if(shares)orders.push({...order,shares,...(positive(recordedStop)?{estimatedPrice:recordedStop}:{})});\n   continue;"
    ]
  ],
  "lib/c1AccountDecision.js": [
    [
      "The 14% stop and portfolio loss limit remain active.",
      "The recorded stop and portfolio loss limit remain active."
    ]
  ],
  "lib/c1RecentMomentumChallengerSimulator.js": [
    [
      "",
      "import {C1_NEW_SWING_STOP_POLICY,C1_NEW_SWING_STOP_PCT} from './c1SwingStopPolicy';\n"
    ],
    [
      "      const distance = number(config.minimumInitialStopPct,0);\n      if (!(distance>0 && distance===config.maximumInitialStopPct))\n",
      "      const distance = existing?.recentOpeningStopDistancePct ?? fact.initialSwingStopPct ?? number(config.minimumInitialStopPct,0);\n      if (!(distance>0 && (distance===config.maximumInitialStopPct||distance===C1_NEW_SWING_STOP_PCT)))\n"
    ],
    [
      "      if (!existing) held.recentProjectionOpenedAt=session.date;\n",
      "      if (!existing) {held.recentProjectionOpenedAt=session.date;held.recentOpeningStopDistancePct=distance;}\n"
    ],
    [
      "",
      "        }\n        if (!existing) {\n          const initialPct=recordedBuy?.initialSwingStopPct ?? (liveRecentMomentum && recentOpenEnabled(session) &&\n            recentLivePolicy.prospectiveSwingStopPolicy===C1_NEW_SWING_STOP_POLICY ? C1_NEW_SWING_STOP_PCT : null);\n          if(initialPct!==null){stopDistancePct=initialPct;effectiveStopPrice=fill*(1-initialPct/100);}\n"
    ]
  ]
};
function restoreInitialSwingStopPolicy(source,file){
 source=require('./c1-qualified-selection-seams.cjs').restore(file,source);
 source=require('./c1-opening-sale-source-seams.cjs').restore(file,source);
 for(const [before,after] of [...(seams[file]||[])].reverse()){
  assert.equal(source.split(after).length,2,'Exact initial Swing stop seam: '+file);
  source=source.replace(after,before);
 }
 return source;
}
module.exports={restoreInitialSwingStopPolicy,seams};
