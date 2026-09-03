const fs = require("fs");
const { createResearchModuleLoader } = require("./research-module-loader.cjs");

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const loader = createResearchModuleLoader();
const fundamentals = loader.load(
  "lib/secPointInTimeFundamentals.js",
  fs.readFileSync("lib/secPointInTimeFundamentals.js", "utf8"),
);

const row = (start, end, filed, val, accn, form = "10-Q") => ({
  start,
  end,
  filed,
  val,
  accn,
  form,
  fy: Number(end.slice(0, 4)),
  fp: "Q1",
});
const conceptRows = [
  row("2023-01-01", "2023-03-31", "2023-05-01", 100, "old"),
  row("2023-01-01", "2023-03-31", "2025-02-01", 140, "amended"),
  row("2024-01-01", "2024-03-31", "2024-05-01", 120, "current"),
  row("2025-01-01", "2025-03-31", "2025-05-01", 150, "future"),
];
const companyFacts = {
  facts: {
    "us-gaap": {
      RevenueFromContractWithCustomerExcludingAssessedTax: {
        units: { USD: conceptRows },
      },
      OperatingIncomeLoss: { units: { USD: conceptRows } },
      NetCashProvidedByUsedInOperatingActivities: {
        units: { USD: conceptRows },
      },
    },
  },
};

const before2024Filing = fundamentals.pointInTimeYearOverYearChange(
  companyFacts,
  {
    concept: "RevenueFromContractWithCustomerExcludingAssessedTax",
    decisionDate: "2024-04-30",
  },
);
assert(!before2024Filing.available, "A quarter cannot exist before it is filed.");

const asOf2024 = fundamentals.pointInTimeYearOverYearChange(companyFacts, {
  concept: "RevenueFromContractWithCustomerExcludingAssessedTax",
  decisionDate: "2024-05-02",
});
assert(asOf2024.available, "Comparable filed quarters should be available.");
assert(
  Math.abs(asOf2024.changePct - 20) < 1e-9,
  "The point-in-time year-over-year change should be 20%.",
);
assert(
  asOf2024.prior.accession === "old",
  "A later amendment must not leak into an earlier decision date.",
);

const snapshot = fundamentals.pointInTimeFilingChangeSnapshot(companyFacts, {
  decisionDate: "2024-05-02",
});
assert(snapshot.availableFields === 3, "All three causal fields should resolve.");
assert(snapshot.coveragePct === 100, "Coverage must be explicit.");

const cumulativeFacts = {
  facts: {
    "us-gaap": {
      NetCashProvidedByUsedInOperatingActivities: {
        units: {
          USD: [
            row("2023-01-01", "2023-03-31", "2023-05-01", 100, "23q1"),
            row("2023-01-01", "2023-06-30", "2023-08-01", 230, "23q2"),
            row("2024-01-01", "2024-03-31", "2024-05-01", 120, "24q1"),
            row("2024-01-01", "2024-06-30", "2024-08-01", 276, "24q2"),
          ],
        },
      },
    },
  },
};
const cumulativeChange = fundamentals.pointInTimeYearOverYearChange(
  cumulativeFacts,
  {
    concept: "NetCashProvidedByUsedInOperatingActivities",
    decisionDate: "2024-08-02",
  },
);
assert(cumulativeChange.available, "Cumulative cash flow should resolve.");
assert(
  Math.abs(cumulativeChange.current.value - 156) < 1e-9 &&
    Math.abs(cumulativeChange.prior.value - 130) < 1e-9 &&
    Math.abs(cumulativeChange.changePct - 20) < 1e-9,
  "Year-to-date cash flow must be converted into comparable discrete quarters.",
);
assert(
  cumulativeChange.current.derivedFromCumulative === true,
  "A derived quarter must disclose its cumulative origin.",
);

console.log("SEC point-in-time fundamentals regression passed.");
