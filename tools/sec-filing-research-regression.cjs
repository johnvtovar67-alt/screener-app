const fs = require("fs");
const { createResearchModuleLoader } = require("./research-module-loader.cjs");

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const loader = createResearchModuleLoader();
const research = loader.load(
  "lib/secFilingResearch.js",
  fs.readFileSync("lib/secFilingResearch.js", "utf8"),
);

const rows = (values) =>
  values.map(({ start, end, filed, val, accn }) => ({
    start,
    end,
    filed,
    val,
    accn,
    form: "10-Q",
    fy: Number(end.slice(0, 4)),
    fp: "Q1",
  }));

const quarters = [
  {
    start: "2022-01-01",
    end: "2022-03-31",
    filed: "2022-05-01",
    accn: "22q1",
  },
  {
    start: "2023-01-01",
    end: "2023-03-31",
    filed: "2023-05-01",
    accn: "23q1",
  },
  {
    start: "2024-01-01",
    end: "2024-03-31",
    filed: "2024-05-01",
    accn: "24q1",
  },
];
const concept = (values) => ({
  units: {
    USD: rows(quarters.map((quarter, index) => ({ ...quarter, val: values[index] }))),
  },
});
const companyFacts = {
  cik: "320193",
  entityName: "Example Issuer",
  facts: {
    "us-gaap": {
      RevenueFromContractWithCustomerExcludingAssessedTax: concept([
        100,
        110,
        132,
      ]),
      OperatingIncomeLoss: concept([10, 12, 18]),
      NetCashProvidedByUsedInOperatingActivities: concept([8, 11, 17]),
    },
  },
};

const compact = research.compactSecCompanyFacts(companyFacts, {
  earliestFiled: "2020-01-01",
  latestFiled: "2024-12-31",
});
assert(
  Object.keys(compact.facts["us-gaap"]).length === 3,
  "Only required SEC concepts should survive compaction.",
);

const events = research.buildPointInTimeFilingEvents(compact, {
  symbol: "AAPL",
  cik: "320193",
  datasetThrough: "2024-12-31",
});
assert(events.length === 2, "Two comparable filing events should be emitted.");
assert(
  Math.abs(events[1].revenueGrowthPct - 20) < 1e-9,
  "The newest event must use the newly filed revenue quarter.",
);
assert(
  Math.abs(events[1].revenueAccelerationPctPoints - 10) < 1e-9,
  "Revenue acceleration must compare consecutive point-in-time filing signals.",
);
assert(
  events[1].marginChangePctPoints > 2.7 &&
    events[1].cashConversionChangePctPoints > 2.8,
  "Margin and cash conversion changes should be derived from aligned quarters.",
);

const calendar = ["2024-05-01", "2024-05-02", "2024-05-03"];
const signal = { symbol: "AAPL", researchFactors: {} };
const annotated = research.addFilingEventsToDataset(
  {
    sessions: calendar.map((date) => ({
      date,
      signals: [signal],
      positionSignals: [signal],
    })),
  },
  calendar,
  events,
);
assert(
  annotated.sessions[0].signals[0].researchFactors.filingDate ===
    "2023-05-01",
  "The 2024 filing must not be available on its filing date.",
);
assert(
  annotated.sessions[1].signals[0].researchFactors.filingDate ===
    "2024-05-01",
  "The filing must first become available on the next market session.",
);
assert(
  research.pointInTimeSecFilingR14Definitions().length === 5 &&
    research.pointInTimeSecFilingR14Controls().length === 2,
  "The frozen R14 family must contain five candidates and two controls.",
);

console.log("SEC filing research regression passed.");
