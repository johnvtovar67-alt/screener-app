// Only purchase-funding checks change. Equity, allocation, sizing, ranking,
// and every exit/risk condition remain byte-for-byte production policy.
module.exports=[
 ['        let budget = Math.min(\n          cash - config.commissionPerOrder,',
  '        const purchaseFundingIndependent=actualReplay?.independentPurchaseFunding(session.date)===true;\n        let budget = Math.min(\n          purchaseFundingIndependent?Infinity:cash - config.commissionPerOrder,'],
 ["if(recordedBuy && (shares<=0 || cost>cash+1e-7))throw new Error('Actual purchase exceeds account cash');",
  "if(recordedBuy && (shares<=0 || (!recordedBuy.brokerageFunded&&cost>cash+1e-7)))throw new Error('Actual purchase exceeds account cash');"],
 ["if (!recordedBuy && (shares < 1 || cost < config.minimumTrade || cost > cash)) {noteEntrySkip(cost>cash?'insufficient-cash':'trade-size-limit');continue;}",
  "if (!recordedBuy && (shares < 1 || cost < config.minimumTrade || (!purchaseFundingIndependent&&cost > cash))) {noteEntrySkip(!purchaseFundingIndependent&&cost>cash?'insufficient-cash':'trade-size-limit');continue;}"]
];
