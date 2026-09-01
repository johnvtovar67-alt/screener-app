const fs = require("fs");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const source = fs.readFileSync("lib/fmpResearchBacktest.js", "utf8");
const contract = source.slice(
  source.indexOf("export function v11StressScenarioDefinitions"),
  source.indexOf("function realizedWinnerConcentration"),
);
for (const id of [
  "baseline",
  "cost-25bps",
  "cost-50bps",
  "ten-position",
  "fifteen-position",
  "slow-cycle",
  "fast-cycle",
  "confirmed-entry",
  "tight-gap",
  "tight-sector",
])
  assert(contract.includes(`id: "${id}"`), `Missing V11 stress scenario: ${id}`);
assert(
  (contract.match(/id: "/g) || []).length === 10,
  "The stress suite must remain fixed at ten predeclared scenarios.",
);
assert(
  source.includes("productionChanged: false") &&
    source.includes("freshIndependentHoldout: false") &&
    source.includes("firstLiveSessionIncludedInHistoricalReplay: false"),
  "The stress report must not change production or mislabel reused evidence.",
);
console.log("V11 STRESS TEST PASS: frozen thesis and ten predeclared stress scenarios verified.");
