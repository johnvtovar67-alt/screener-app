// Reverse only the owner-requested opening-refresh completion repair.
module.exports=[
  [
    "      if(execution.decision?.decisionId!==view.decision.decisionId)return;",
    "      if(execution.decision?.decisionId!==view.decision.decisionId)throw new Error('The account changed during opening verification. Tap Reload to recheck the current account.');"
  ],
  [
    "    try{\n      const account=t===\"opportunities\"?await refreshC1Account():null;",
    "    let openingReview=null;\n    try{\n      const account=t===\"opportunities\"?await refreshC1Account():null;"
  ],
  [
    "      if(account)void prepareC1Execution(account);",
    "      if(account)openingReview=prepareC1Execution(account);"
  ],
  [
    "    finally{await holdingQuotes;const remaining=650-(Date.now()-started);",
    "    finally{await Promise.allSettled([holdingQuotes,openingReview]);const remaining=650-(Date.now()-started);"
  ]
];
