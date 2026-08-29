import { timingSafeEqual } from "node:crypto";
import { runFmpResearchBacktest } from "../../../lib/fmpResearchBacktest";

export const config = { maxDuration: 300 };

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
    return res.status(503).json({ error: "CRON_SECRET is not configured" });
  if (!authorized(req)) return res.status(401).json({ error: "Unauthorized" });
  try {
    const report = await runFmpResearchBacktest();
    res.setHeader("Cache-Control", "no-store");
    return res.status(report.status === "complete" ? 200 : 202).json(report);
  } catch (error) {
    console.error("FMP research backtest cron:", error);
    return res.status(503).json({
      ok: false,
      error: error?.message || "Research replay failed",
    });
  }
}
