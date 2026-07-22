// lib/eventRisk.js
// Mandatory pre-trade event check.
// Blocks Full Buy for known earnings/M&A events.
// Refined rule: do NOT block every Buy just because the M&A endpoint is unavailable.
// Earnings verification matters more; M&A failure becomes a warning only.

function normalizeSymbol(value) {
  return String(value || "").replace("-", ".").toUpperCase().trim();
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function daysFromToday(dateText) {
  const today = new Date();
  const a = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const d = new Date(`${String(dateText).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return Math.round((d.getTime() - a) / 86400000);
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Event-risk request failed: ${response.status}`);
  return response.json();
}

function asArray(value) {
  return Array.isArray(value) ? value : value && typeof value === "object" ? [value] : [];
}

function baseRisk(symbol) {
  return {
    symbol,
    status: "Clear",
    label: "Pre-Trade Check: Passed",
    detail: "No near-term earnings or target-company M&A event was found.",
    blockFullPosition: false,
    earningsDate: null,
    daysToEarnings: null,
    mergerEvent: null,
    checkComplete: true,
    earningsCheckComplete: true,
    mergerCheckComplete: true,
  };
}

export async function fetchEventRiskMap(symbols = []) {
  const apiKey = process.env.FMP_API_KEY;
  const clean = [...new Set(symbols.map(normalizeSymbol).filter(Boolean))];

  const map = new Map(clean.map((symbol) => [symbol, baseRisk(symbol)]));

  if (!clean.length) return map;

  // If no API key exists, fail closed. This means the event check truly cannot run.
  if (!apiKey) {
    for (const symbol of clean) {
      map.set(symbol, {
        ...baseRisk(symbol),
        status: "Incomplete",
        label: "Pre-Trade Check: Incomplete",
        detail: "Event-risk data could not be verified because the market-data API key is unavailable. Full-size Buy is blocked.",
        blockFullPosition: true,
        checkComplete: false,
        earningsCheckComplete: false,
        mergerCheckComplete: false,
      });
    }
    return map;
  }

  const now = new Date();
  const from = isoDate(addDays(now, -2));
  const to = isoDate(addDays(now, 7));

  let earningsOk = false;
  let mergerOk = false;

  // Earnings check: this remains important enough to fail closed if unavailable.
  try {
    const rows = asArray(
      await fetchJson(
        `https://financialmodelingprep.com/stable/earnings-calendar?from=${from}&to=${to}&includeReportTimes=true&apikey=${apiKey}`
      )
    );

    earningsOk = true;

    for (const row of rows) {
      const symbol = normalizeSymbol(row.symbol);
      if (!map.has(symbol)) continue;

      const days = daysFromToday(row.date);
      if (days === null || days < -2 || days > 7) continue;

      const current = map.get(symbol);
      const critical = days >= -1 && days <= 2;

      const label =
        days === 0
          ? "Earnings Today"
          : days === -1
          ? "Earnings Just Reported"
          : days > 0
          ? `Earnings in ${days} day${days === 1 ? "" : "s"}`
          : "Recent Earnings";

      map.set(symbol, {
        ...current,
        status: critical ? "Blocked" : "Caution",
        label: `Pre-Trade: ${label}`,
        detail: critical
          ? "Full-size Buy is blocked until the market digests the earnings event."
          : "Near-term earnings risk requires Starter sizing at most.",
        blockFullPosition: true,
        earningsDate: String(row.date).slice(0, 10),
        daysToEarnings: days,
        earningsCheckComplete: true,
      });
    }
  } catch (error) {
    earningsOk = false;
  }

  // M&A check: useful, but endpoint failure should NOT block every Buy.
  try {
    const rows = asArray(
      await fetchJson(
        `https://financialmodelingprep.com/stable/mergers-acquisitions-latest?page=0&limit=1000&apikey=${apiKey}`
      )
    );

    mergerOk = true;

    for (const row of rows) {
      const target = normalizeSymbol(row.targetedSymbol);
      if (!map.has(target)) continue;

      const current = map.get(target);

      map.set(target, {
        ...current,
        status: "Blocked",
        label: "Pre-Trade: M&A Event",
        detail:
          "This company appears as an acquisition target. Treat it as an event/deal trade; Full-size Buy is blocked.",
        blockFullPosition: true,
        mergerEvent: {
          acquirer: row.companyName || row.symbol || "Acquirer",
          target: row.targetedCompanyName || target,
          transactionDate: row.transactionDate || null,
        },
        mergerCheckComplete: true,
      });
    }
  } catch (error) {
    mergerOk = false;
  }

  for (const symbol of clean) {
    const current = map.get(symbol);

    // If the stock is already blocked by earnings or actual M&A, leave it blocked.
    if (current.blockFullPosition) continue;

    // Earnings source unavailable: fail closed because this was the IRDM problem.
    if (!earningsOk) {
      map.set(symbol, {
        ...current,
        status: "Incomplete",
        label: "Pre-Trade Check: Incomplete",
        detail:
          "Earnings-risk data could not be verified. Full-size Buy is blocked until the earnings check works.",
        blockFullPosition: true,
        checkComplete: false,
        earningsCheckComplete: false,
        mergerCheckComplete: mergerOk,
      });
      continue;
    }

    // M&A source unavailable only: warn, but do not block.
    if (!mergerOk) {
      map.set(symbol, {
        ...current,
        status: "Clear",
        label: "Pre-Trade Check: Passed",
        detail:
          "Earnings check passed. M&A source was unavailable, so manually verify unusual corporate events before taking oversized positions.",
        blockFullPosition: false,
        checkComplete: false,
        earningsCheckComplete: true,
        mergerCheckComplete: false,
      });
      continue;
    }

    // Both checks worked and no event was found.
    map.set(symbol, {
      ...current,
      status: "Clear",
      label: "Pre-Trade Check: Passed",
      detail: "No near-term earnings or target-company M&A event was found.",
      blockFullPosition: false,
      checkComplete: true,
      earningsCheckComplete: true,
      mergerCheckComplete: true,
    });
  }

  return map;
}

export function applyEventRiskGate(stock = {}, eventRisk = null) {
  const risk =
    eventRisk || {
      status: "Incomplete",
      label: "Pre-Trade Check: Incomplete",
      detail: "Event-risk data was unavailable. Full-size Buy is blocked.",
      blockFullPosition: true,
      checkComplete: false,
    };

  const rec = stock.recommendation && typeof stock.recommendation === "object" ? stock.recommendation : {};
  const current = String(rec.label || stock.action || "Avoid");

  const downgraded = risk.blockFullPosition && current === "Buy";
  const action = downgraded ? "Starter" : current;

  const actionSummary = downgraded
    ? `${risk.detail} Starter size only until the event check clears.`
    : rec.actionSummary;

  const entryNote = downgraded
    ? `${risk.label}. Do not use full size; reassess after the event is digested or verified.`
    : rec.entryNote;

  return {
    ...stock,
    action,
    eventRisk: risk,
    preTradeCheck: risk,
    recommendation: {
      ...rec,
      label: action,
      displayLabel: action,
      recommendation: action,
      tradeAction: action,
      actionSummary,
      entryNote,
      triggerNeeded: entryNote,
      blockedBuyNow: downgraded,
      blockedReason: downgraded ? risk.detail : rec.blockedReason || "",
      eventRisk: risk,
      preTradeCheck: risk,
    },
  };
}
