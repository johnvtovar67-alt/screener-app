import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { get, list } from "@vercel/blob";
import { C1_FROZEN_OPTIONS } from "../../../lib/c1FrozenOptions";
import {
  simulatePointInTimePortfolio,
  slicePointInTimePortfolioRun,
} from "../../../lib/walkForwardBacktest";

export const config = { maxDuration: 800 };

const DATASETS = {
  sp500: "research/pit-sp500-compiled-checkpoint-v1.json",
  nasdaq: "research/pit-nasdaq-index-compiled-checkpoint-v1.json",
};
const START = "2023-01-04";
const END = "2026-09-01";
const WINDOWS = [
  ["2023-01-04", "2023-07-06"],
  ["2023-07-07", "2024-01-04"],
  ["2024-01-05", "2024-07-08"],
  ["2024-07-09", "2025-01-06"],
  ["2025-01-07", "2025-07-10"],
  ["2025-07-11", "2026-01-08"],
  ["2026-01-09", "2026-07-13"],
  ["2026-07-14", "2026-09-01"],
];
const PRIMARY = {
  earlyRankExitStartSessions: 5,
  earlyRankExitEndSessions: 30,
  earlyRankExitThreshold: 9,
  earlyRankExitConsecutiveSessions: 3,
};
const VARIANTS = [
  ["current-14", {}],
  ["stop-12-only", { minimumInitialStopPct: 12, maximumInitialStopPct: 12 }],
  ["proposed-12-top9x3", {
    minimumInitialStopPct: 12,
    maximumInitialStopPct: 12,
    ...PRIMARY,
  }],
  ["early-only-14-top9x3", PRIMARY],
];
const DOWNSIDE_GRID = [
  ["current-14", {}],
  ...[9, 12, 15].flatMap((threshold) =>
    [2, 3, 5].map((confirmations) => [
      `loss-top${threshold}-x${confirmations}`,
      {
        earlyRankExitStartSessions: 5,
        earlyRankExitEndSessions: 30,
        earlyRankExitThreshold: threshold,
        earlyRankExitConsecutiveSessions: confirmations,
      },
    ]),
  ),
];
const UPSIDE_GRID = [
  ["current-14", {}],
  ...[8, 12].flatMap((activation) =>
    [6, 9].flatMap((threshold) =>
      [2, 3].map((confirmations) => [
        `profit-rank-${activation}-top${threshold}-x${confirmations}`,
        {
          profitRankExitStartSessions: 5,
          profitRankExitEndSessions: 30,
          profitRankExitActivationPct: activation,
          profitRankExitThreshold: threshold,
          profitRankExitConsecutiveSessions: confirmations,
        },
      ]),
    ),
  ),
  ...[8, 12].flatMap((activation) =>
    [4, 6].map((distance) => [
      `profit-trail-${activation}-by${distance}`,
      {
        profitTrailActivationPct: activation,
        profitTrailDistancePct: distance,
      },
    ]),
  ),
];

async function exact(pathname) {
  const { blobs } = await list({ prefix: pathname, limit: 10 });
  const blob = blobs.find((row) => row.pathname === pathname);
  if (!blob) throw new Error(`Missing research artifact: ${pathname}`);
  const response = await get(blob.url, { access: "private", useCache: false });
  if (!response) throw new Error(`Unreadable research artifact: ${pathname}`);
  return Buffer.from(await new Response(response.stream).arrayBuffer());
}

async function loadDataset(universe) {
  const manifestBytes = await exact(DATASETS[universe]);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const chunks = manifest.chunks.filter(
    (chunk) => chunk.lastDate >= START && chunk.firstDate <= END,
  );
  const sessions = [];
  for (const chunk of chunks) {
    const compressed = await exact(chunk.pathname);
    if (chunk.compressedBytes && compressed.length !== chunk.compressedBytes)
      throw new Error(`Incomplete research chunk: ${chunk.pathname}`);
    const raw = gunzipSync(compressed);
    if (
      chunk.contentSha256 &&
      createHash("sha256").update(raw).digest("hex") !== chunk.contentSha256
    )
      throw new Error(`Research checksum mismatch: ${chunk.pathname}`);
    const rows = JSON.parse(raw.toString("utf8")).sessions || [];
    sessions.push(...rows.filter((row) => row.date >= START && row.date <= END));
  }
  return {
    dataset: { metadata: manifest.datasetMetadata, sessions },
    evidence: {
      manifestSha256: createHash("sha256").update(manifestBytes).digest("hex"),
      sessions: sessions.length,
      firstSession: sessions[0]?.date,
      lastSession: sessions.at(-1)?.date,
      chunks: chunks.length,
    },
  };
}

function combinedCurve(runs) {
  const maps = runs.map((run) => new Map(run.curve.map((row) => [row.date, row])));
  return runs[0].curve.map((row) => ({
    date: row.date,
    equity:
      maps.reduce((sum, map) => sum + Number(map.get(row.date)?.equity || 0), 0) /
      maps.length,
  }));
}

function summarize(runs) {
  const curve = combinedCurve(runs);
  let peak = Number(curve[0]?.equity || 100000);
  let maxDrawdownPct = 0;
  const returns = [];
  for (let index = 1; index < curve.length; index++) {
    const prior = Number(curve[index - 1].equity);
    const next = Number(curve[index].equity);
    if (prior > 0) returns.push(next / prior - 1);
    peak = Math.max(peak, next);
    if (peak > 0) maxDrawdownPct = Math.min(maxDrawdownPct, (next / peak - 1) * 100);
  }
  const first = Number(curve[0]?.equity || 100000);
  const last = Number(curve.at(-1)?.equity || first);
  const totalReturnPct = (last / first - 1) * 100;
  const mean = returns.reduce((sum, value) => sum + value, 0) / Math.max(1, returns.length);
  const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    Math.max(1, returns.length - 1);
  const sharpe = variance > 0 ? (mean / Math.sqrt(variance)) * Math.sqrt(252) : 0;
  const benchmark = runs[0].metrics?.benchmarkComparisons || {};
  const trades = runs.flatMap((run) => run.trades || []);
  const closed = trades.filter((trade) => trade.side === "sell" && trade.positionClosed === true);
  const early = closed.filter((trade) => trade.reason === "early-rank-deterioration");
  const profitRank = closed.filter(
    (trade) => trade.reason === "profit-rank-deterioration",
  );
  const profitTrail = closed.filter(
    (trade) => trade.reason === "profit-trailing-stop",
  );
  const sessions = new Map(runs[0].curve.map((row, index) => [row.date, index]));
  const buys = trades.filter((trade) => trade.side === "buy");
  const whipsaws = early.filter((exit) => {
    const exitIndex = sessions.get(exit.date);
    return buys.some((buy) => {
      const buyIndex = sessions.get(buy.date);
      return buy.symbol === exit.symbol && buyIndex > exitIndex && buyIndex <= exitIndex + 10;
    });
  });
  const reasons = {};
  for (const trade of closed) reasons[trade.reason] = (reasons[trade.reason] || 0) + 1;
  return {
    totalReturnPct,
    vsQqqPct: totalReturnPct - Number(benchmark.QQQ?.simpleReturnPct || 0),
    vsSpyPct: totalReturnPct - Number(benchmark.SPY?.simpleReturnPct || 0),
    maxDrawdownPct,
    sharpe,
    closedTrades: closed.length,
    annualizedTurnoverPct:
      runs.reduce((sum, run) => sum + Number(run.metrics?.annualizedTurnoverPct || 0), 0) /
      runs.length,
    averageExposurePct:
      runs.reduce((sum, run) => sum + Number(run.metrics?.averageActiveExposurePct || 0), 0) /
      runs.length,
    earlyExits: early.length,
    earlyExitWhipsaws: whipsaws.length,
    earlyExitWhipsawPct: early.length ? (whipsaws.length / early.length) * 100 : 0,
    profitRankExits: profitRank.length,
    profitTrailExits: profitTrail.length,
    exitReasons: reasons,
  };
}

function runVariant(dataset, overrides) {
  const runs = Object.entries(C1_FROZEN_OPTIONS).map(([id, options]) =>
    simulatePointInTimePortfolio(dataset, {
      ...options,
      ...overrides,
      thesisId: `c1-momentum-loss-${id}`,
      thesisLabel: id,
      startDate: START,
      endDate: END,
      liquidateAtEnd: true,
    }),
  );
  return {
    aggregate: summarize(runs),
    windows: WINDOWS.map(([start, end]) => ({
      start,
      end,
      ...summarize(runs.map((run) => slicePointInTimePortfolioRun(run, start, end))),
    })),
  };
}

export default async function handler(req, res) {
  if (process.env.VERCEL_ENV === "production")
    return res.status(404).json({ error: "Not found" });
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  res.setHeader("Cache-Control", "private, no-store");
  try {
    const universe = String(req.query.universe || "sp500");
    if (!DATASETS[universe]) return res.status(400).json({ error: "Unknown universe" });
    const mode = String(req.query.mode || "comparison");
    const variants =
      mode === "downside-grid"
        ? DOWNSIDE_GRID
        : mode === "upside-grid"
          ? UPSIDE_GRID
          : mode === "comparison"
            ? VARIANTS
            : null;
    if (!variants) return res.status(400).json({ error: "Unknown mode" });
    const { dataset, evidence } = await loadDataset(universe);
    const results = variants.map(([id, overrides]) => ({
      id,
      overrides,
      ...runVariant(dataset, overrides),
    }));
    const payload = {
      status: "complete",
      productionChanged: false,
      universe,
      mode,
      evidence,
      primaryCandidate: mode === "comparison" ? "proposed-12-top9x3" : null,
      results,
    };
    if (req.query.format === "frame") {
      const serialized = JSON.stringify(payload).replaceAll("<", "\\u003c");
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(200).send(
        `<!doctype html><meta charset="utf-8"><p>Research calculation complete.</p><script>parent.postMessage({type:"c1-momentum-loss-result",payload:${serialized}},location.origin)</script>`,
      );
    }
    return res.status(200).json(payload);
  } catch (error) {
    return res.status(500).json({
      status: "failed",
      productionChanged: false,
      error: String(error?.message || error).slice(0, 500),
    });
  }
}
