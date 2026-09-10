// Durable bridge from the completed point-in-time research compiler to the
// activated C1 live ranking. The completed compiled checkpoint is immutable
// while a new research refresh is running; a separate production snapshot
// prevents a partial refresh from changing live recommendations.

import { get, list, put } from "@vercel/blob";
import { gunzipSync } from "node:zlib";
import { advanceStoredC1ForwardModel } from "./c1ForwardStore";
import {
  latestCompletedMarketSessionDay,
  marketSessionDistance,
} from "./marketSession";
import {
  buildV11ProductionSnapshot,
  V11_PRODUCTION_MAX_SNAPSHOT_AGE_SESSIONS,
  V11_PRODUCTION_POLICY_ID,
} from "./v11ProductionPolicy";

export const V11_PRODUCTION_SNAPSHOT_STORE =
  "research/c1-production-snapshot-v1.json";
const COMPILED_CHECKPOINT_STORE =
  "research/fmp-provisional-compiled-checkpoint-v1.json";
const MEMORY_KEY = "__c1ProductionSnapshotCacheV1";
const INFLIGHT_KEY = "__c1ProductionSnapshotInflightV1";
const CACHE_MS = 5 * 60 * 1000;

const number = (value, fallback = null) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

async function readPrivateJson(pathname) {
  const { blobs } = await list({ prefix: pathname, limit: 10 });
  const blob = blobs.find((item) => item.pathname === pathname);
  if (!blob) return null;
  const response = await get(blob.url, { access: "private", useCache: false });
  if (!response) return null;
  return JSON.parse(await new Response(response.stream).text());
}

async function readPrivateGzipJson(pathname) {
  const { blobs } = await list({ prefix: pathname, limit: 10 });
  const blob = blobs.find((item) => item.pathname === pathname);
  if (!blob) return null;
  const response = await get(blob.url, { access: "private", useCache: false });
  if (!response) return null;
  const compressed = Buffer.from(
    await new Response(response.stream).arrayBuffer(),
  );
  return JSON.parse(gunzipSync(compressed).toString("utf8"));
}

async function persistSnapshot(snapshot) {
  // A preview may inspect compiled data but must not replace the live snapshot.
  if (process.env.VERCEL_ENV !== "production") return snapshot;
  await put(V11_PRODUCTION_SNAPSHOT_STORE, JSON.stringify(snapshot), {
    access: "private",
    allowOverwrite: true,
    addRandomSuffix: false,
    contentType: "application/json",
    cacheControlMaxAge: 0,
  });
  return snapshot;
}

function assessSnapshot(snapshot, now = new Date()) {
  const requiredSessionDate = latestCompletedMarketSessionDay(now);
  const sourceSessionDate = String(snapshot?.sourceSessionDate || "");
  const snapshotAgeSessions = marketSessionDistance(
    sourceSessionDate,
    requiredSessionDate,
  );
  const candidates = Array.isArray(snapshot?.candidates)
    ? snapshot.candidates
    : [];
  const candidateSymbols = candidates.map((candidate) =>
    String(candidate?.symbol || "").trim().toUpperCase(),
  );
  const candidatesValid =
    candidates.length >= 3 &&
    new Set(candidateSymbols).size === candidates.length &&
    candidates.every(
      (candidate, index) =>
        candidateSymbols[index] &&
        number(candidate?.researchRank, null) === index + 1 &&
        number(candidate?.sourcePrice, 0) > 0 &&
        Number.isFinite(number(candidate?.momentumPercentile, null)) &&
        candidate?.sourceTiming?.available === true &&
        candidate?.sourceTiming?.liquidityPass === true &&
        String(candidate?.sourceTiming?.asOf || "") === sourceSessionDate,
    );
  const ready = Boolean(
    snapshot?.schema === 1 &&
      snapshot?.policyId === V11_PRODUCTION_POLICY_ID &&
      typeof snapshot?.snapshotId === "string" &&
      snapshot.snapshotId.length > 20 &&
      String(snapshot?.datasetThrough || "") === sourceSessionDate &&
      typeof snapshot?.sourceChunkPath === "string" &&
      snapshot.sourceChunkPath.length > 0 &&
      Number.isFinite(snapshotAgeSessions) &&
      snapshotAgeSessions >= 0 &&
      snapshotAgeSessions <= V11_PRODUCTION_MAX_SNAPSHOT_AGE_SESSIONS &&
      candidatesValid,
  );
  return {
    ...(snapshot || {}),
    forwardAccounting:null,
    ...(snapshot?.forwardAccounting?.environment === (process.env.VERCEL_ENV || "local") ? {forwardAccounting:{...snapshot.forwardAccounting,
      status:snapshot.forwardAccounting.sourceSessionDate===requiredSessionDate
        ?snapshot.forwardAccounting.status:"stale",executable:false,eligibleForLiveCapital:false}} : {}),
    status: ready ? "ready" : snapshot ? "stale" : "unavailable",
    requiredSessionDate,
    snapshotAgeSessions,
    maximumSnapshotAgeSessions: V11_PRODUCTION_MAX_SNAPSHOT_AGE_SESSIONS,
  };
}

export async function refreshV11ProductionSnapshot(now = new Date()) {
  const checkpoint = await readPrivateJson(COMPILED_CHECKPOINT_STORE);
  if (
    checkpoint?.complete !== true ||
    !Array.isArray(checkpoint?.chunks) ||
    !checkpoint.chunks.length
  )
    throw new Error("A complete compiled research checkpoint is unavailable");
  const latestChunk = [...checkpoint.chunks]
    .filter(
      (chunk) =>
        typeof chunk?.pathname === "string" && number(chunk?.end, -1) > 0,
    )
    .sort((left, right) => number(right.end, 0) - number(left.end, 0))[0];
  if (!latestChunk) throw new Error("The latest compiled research chunk is missing");
  const payload = await readPrivateGzipJson(latestChunk.pathname);
  const sessions = Array.isArray(payload?.sessions) ? payload.sessions : [];
  if (
    sessions.some(
      (session, index) =>
        index > 0 && String(session?.date || "") <= String(sessions[index - 1]?.date || ""),
    )
  )
    throw new Error("The latest compiled research chunk is not strictly ordered");
  const latestSession = sessions.at(-1);
  if (!latestSession?.date)
    throw new Error("The latest compiled research session is unavailable");
  const sessionDates = Array.isArray(checkpoint?.sessionDates)
    ? checkpoint.sessionDates
    : [];
  const datasetThrough = String(sessionDates.at(-1) || "");
  const requiredSessionDate = latestCompletedMarketSessionDay(now);
  if (
    String(latestSession.date).slice(0, 10) !== datasetThrough ||
    String(latestChunk.lastDate || "").slice(0, 10) !== datasetThrough ||
    number(latestChunk.end, -1) !== sessionDates.length ||
    sessions.length !== number(latestChunk.end, 0) - number(latestChunk.start, 0) ||
    datasetThrough !== requiredSessionDate
  )
    throw new Error(
      `Compiled research integrity mismatch: chunk=${String(latestSession.date).slice(0, 10) || "missing"}, checkpoint=${datasetThrough || "missing"}, required=${requiredSessionDate || "missing"}`,
    );
  let forwardAccounting;
  try {
    forwardAccounting = await advanceStoredC1ForwardModel(sessions, now);
  } catch (error) {
    forwardAccounting = {status:"unavailable",executable:false,eligibleForLiveCapital:false,
      error:String(error?.message||error).slice(0,240)};
  }
  const snapshot = {
    ...buildV11ProductionSnapshot(latestSession, now),
    forwardAccounting:{...forwardAccounting,environment:process.env.VERCEL_ENV || "local"},
    datasetThrough,
    sourceChunkPath: latestChunk.pathname,
    sourceChunkEnd: number(latestChunk.end, null),
    snapshotId: [
      V11_PRODUCTION_POLICY_ID,
      datasetThrough,
      latestChunk.pathname,
      number(latestChunk.end, "unknown"),
    ].join(":"),
  };
  await persistSnapshot(snapshot);
  globalThis[MEMORY_KEY] = { at: Date.now(), snapshot };
  return assessSnapshot(snapshot, now);
}

export async function getV11ProductionSnapshot({
  now = new Date(),
  refreshIfStale = true,
} = {}) {
  const cached = globalThis[MEMORY_KEY];
  if (cached?.snapshot && Date.now() - number(cached.at, 0) < CACHE_MS) {
    const assessed = assessSnapshot(cached.snapshot, now);
    if ((assessed.status === "ready" && assessed.forwardAccounting?.pendingDecisions) || !refreshIfStale) return assessed;
  }
  if (globalThis[INFLIGHT_KEY]) return globalThis[INFLIGHT_KEY];
  const promise = (async () => {
    let stored = null;
    try {
      stored = await readPrivateJson(V11_PRODUCTION_SNAPSHOT_STORE);
      const assessed = assessSnapshot(stored, now);
      if ((assessed.status === "ready" && assessed.forwardAccounting?.pendingDecisions) || !refreshIfStale) {
        globalThis[MEMORY_KEY] = { at: Date.now(), snapshot: stored };
        return assessed;
      }
      return await refreshV11ProductionSnapshot(now);
    } catch (error) {
      const fallback = assessSnapshot(stored, now);
      return {
        ...fallback,
        status: fallback.status === "ready" ? "ready" : "unavailable",
        error: String(error?.message || error || "Snapshot unavailable").slice(
          0,
          240,
        ),
      };
    }
  })();
  globalThis[INFLIGHT_KEY] = promise;
  try {
    return await promise;
  } finally {
    globalThis[INFLIGHT_KEY] = null;
  }
}
