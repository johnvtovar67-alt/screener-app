#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

function argument(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}
const key = process.env.FMP_API_KEY || process.env.FMP_KEY;
const output = argument("output", "research-results/fmp-capability-report.json");
const sampleDate = argument("date", "2026-08-28");
if (!key) {
  console.error("FMP_API_KEY is required. The command never prints or stores it.");
  process.exit(2);
}

const endpoints = [
  {
    id: "ratiosTtmBulk",
    path: "ratios-ttm-bulk",
    params: {},
    fields: ["symbol"],
  },
  {
    id: "incomeGrowthBulk",
    path: "income-statement-growth-bulk",
    params: { year: "2026", period: "Q2" },
    fields: ["symbol"],
  },
  {
    id: "companyScreener",
    path: "company-screener",
    params: {
      exchange: "NYSE",
      isEtf: "false",
      isFund: "false",
      isActivelyTrading: "true",
      limit: "2",
    },
    fields: ["symbol", "marketCap", "price"],
  },
  {
    id: "eodBulk",
    path: "eod-bulk",
    params: { date: sampleDate },
    fields: ["symbol", "date", "open", "high", "low", "close", "volume"],
  },
  {
    id: "delistedCompanies",
    path: "delisted-companies",
    params: { page: "0", limit: "2" },
    fields: ["symbol"],
  },
  {
    id: "profileBulk",
    path: "profile-bulk",
    params: { part: "0" },
    fields: ["symbol"],
  },
  {
    id: "incomeBulk",
    path: "income-statement-bulk",
    params: { year: "2026", period: "Q2" },
    fields: ["symbol", "date"],
  },
  {
    id: "balanceBulk",
    path: "balance-sheet-statement-bulk",
    params: { year: "2026", period: "Q2" },
    fields: ["symbol", "date"],
  },
  {
    id: "cashFlowBulk",
    path: "cash-flow-statement-bulk",
    params: { year: "2026", period: "Q2" },
    fields: ["symbol", "date"],
  },
];

function asRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") return [payload];
  return [];
}

async function probe(item) {
  const params = new URLSearchParams({ ...item.params, apikey: key });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  const started = Date.now();
  try {
    const response = await fetch(
      `https://financialmodelingprep.com/stable/${item.path}?${params}`,
      { signal: controller.signal },
    );
    const contentType = response.headers.get("content-type") || "";
    const body = await response.text();
    let payload = null;
    try {
      payload = JSON.parse(body);
    } catch {}
    const rows = asRows(payload);
    const sample = rows[0] || {};
    return {
      id: item.id,
      endpoint: `/stable/${item.path}`,
      ok: response.ok && rows.length > 0,
      status: response.status,
      latencyMs: Date.now() - started,
      rowsReturned: rows.length,
      contentType,
      requiredFields: Object.fromEntries(
        item.fields.map((field) => [field, sample[field] !== undefined]),
      ),
      acceptedDatePresent:
        sample.acceptedDate !== undefined || sample.acceptedDateTime !== undefined,
      adjustedClosePresent:
        sample.adjClose !== undefined || sample.adjustedClose !== undefined,
      error:
        response.ok && rows.length
          ? null
          : String(payload?.message || body || "No rows").slice(0, 240),
    };
  } catch (error) {
    return {
      id: item.id,
      endpoint: `/stable/${item.path}`,
      ok: false,
      status: null,
      latencyMs: Date.now() - started,
      rowsReturned: 0,
      error: error?.message || "Request failed",
    };
  } finally {
    clearTimeout(timer);
  }
}

(async () => {
  // Sequential by design: capability checks should never resemble a request storm.
  const results = [];
  for (const endpoint of endpoints) results.push(await probe(endpoint));
  const byId = Object.fromEntries(results.map((row) => [row.id, row]));
  const report = {
    generatedAt: new Date().toISOString(),
    sampleDate,
    providerCalls: results.length,
    capabilities: {
      liveFullMarketDiscovery: byId.companyScreener?.ok === true,
      liveFundamentalsBulk:
        byId.ratiosTtmBulk?.ok === true && byId.incomeGrowthBulk?.ok === true,
      historicalEodBulk: byId.eodBulk?.ok === true,
      historicalListingsAndDelistings:
        byId.profileBulk?.ok === true && byId.delistedCompanies?.ok === true,
      statementBulk:
        byId.incomeBulk?.ok === true &&
        byId.balanceBulk?.ok === true &&
        byId.cashFlowBulk?.ok === true,
      filingAcceptedDateObserved:
        byId.incomeBulk?.acceptedDatePresent === true ||
        byId.balanceBulk?.acceptedDatePresent === true ||
        byId.cashFlowBulk?.acceptedDatePresent === true,
      adjustedOhlcObserved: byId.eodBulk?.adjustedClosePresent === true,
      revisionSafeFundamentalValues: false,
      pointInTimeMaterialNews: false,
    },
    results,
    researchDecision:
      "Endpoint access is necessary but not sufficient. Revision-safe filing values and as-known material-news/event history remain separately required before the runner will label results eligible for independent review.",
  };
  const destination = path.resolve(output);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`FMP capability report: ${destination}`);
  for (const result of results)
    console.log(
      `${result.ok ? "PASS" : "FAIL"} ${result.endpoint} ${result.status ?? "network"}`,
    );
  process.exit(results.every((result) => result.ok) ? 0 : 1);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
