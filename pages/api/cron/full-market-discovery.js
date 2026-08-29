import { timingSafeEqual } from "node:crypto";
import { refreshFullMarketDiscovery } from "../../../lib/fullMarketDiscovery";
import { refreshAllFmpFundamentalsBulk } from "../../../lib/fmpFundamentals";

export const config = { maxDuration: 60 };

function authorized(req) {
  const secret = process.env.CRON_SECRET;
  const supplied = String(req.headers.authorization || "");
  if (!secret || !supplied.startsWith("Bearer ")) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(supplied);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!process.env.CRON_SECRET)
    return res.status(503).json({
      error: "CRON_SECRET is not configured; on-demand daily discovery remains active.",
    });
  if (!authorized(req))
    return res.status(401).json({ error: "Unauthorized" });
  try {
    const snapshot = await refreshFullMarketDiscovery();
    let fundamentals = null;
    try {
      fundamentals = await refreshAllFmpFundamentalsBulk(
        snapshot.eligibleSymbols || snapshot.candidates.map((row) => row.symbol),
      );
    } catch (error) {
      console.warn("bulk fundamental cache warm failed:", error?.message || error);
      fundamentals = {
        ok: false,
        error: error?.message || "Bulk fundamental refresh unavailable",
        fallback: "bounded per-symbol cache refresh remains active",
      };
    }
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({
      ok: true,
      builtAt: snapshot.builtAt,
      sourceUniverseSize: snapshot.sourceUniverseSize,
      eligibleUniverseSize: snapshot.eligibleUniverseSize,
      candidateCount: snapshot.candidateCount,
      maxProviderCalls: snapshot.maxProviderCalls,
      fundamentals,
    });
  } catch (error) {
    console.error("full-market discovery cron:", error);
    return res.status(503).json({
      ok: false,
      error: error?.message || "Discovery refresh failed",
    });
  }
}
