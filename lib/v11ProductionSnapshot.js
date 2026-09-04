// Durable bridge from the completed point-in-time research compiler to the
// activated C1 live ranking. The completed compiled checkpoint is immutable
// while a new research refresh is running; a separate production snapshot
// prevents a partial refresh from changing live recommendations.

import { get, list, put } from "@vercel/blob";
import { gunzipSync } from "node:zlib";
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
  const blob = blobs.find((item) => item.pathname === pathname) || blobs[0];
  if (!blob) return null;
  const response = await get(blob.url, { access: "private", useCache: false });
  if (!response) return null;
  return JSON.parse(await new Response(response.stream).text());
}

async function readPrivateGzipJson(pathname) {
  const { blobs } = await list({ prefix: pathname, limit: 10 });
  const blob = blobs.find((item) => item.pathname === pathname) || blobs[0];
  if (!blob) return null;
  const response = await get(blob.url, { access: "private", useCache: false });
  if (!response) return null;
  const compressed = Buffer.from(
    await new Response(response.stream).arrayBuffer(),
  );
  return JSON.parse(gunzipSync(compressed).toString("utf8"));
}

async function persistSnapshot(snapshot) {
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
  const ready = Boolean(
    snapshot?.schema === 1 &&
      snapshot?.policyId === V11_PRODUCTION_POLICY_ID &&
      Number.isFinite(snapshotAgeSessions) &&
      snapshotAgeSessions >= 0 &&
      snapshotAgeSessions <= V11_PRODUCTION_MAX_SNAPSHOT_AGE_SESSIONS &&
      Array.isArray(snapshot?.candidates),
  );
  return {
    ...(snapshot || {}),
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
  const latestSession = sessions.at(-1);
  if (!latestSession?.date)
    throw new Error("The latest compiled research session is unavailable");
  const snapshot = buildV11ProductionSnapshot(latestSession, now);
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
    if (assessed.status === "ready" || !refreshIfStale) return assessed;
  }
  if (globalThis[INFLIGHT_KEY]) return globalThis[INFLIGHT_KEY];
  const promise = (async () => {
    let stored = null;
    try {
      stored = await readPrivateJson(V11_PRODUCTION_SNAPSHOT_STORE);
      const assessed = assessSnapshot(stored, now);
      if (assessed.status === "ready" || !refreshIfStale) {
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
