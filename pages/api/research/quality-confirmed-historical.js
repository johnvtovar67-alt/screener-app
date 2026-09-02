import {
  getQualityConfirmedHistoricalAudit,
  runQualityConfirmedHistoricalAudit,
} from "../../../lib/fmpResearchBacktest";

export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  res.setHeader("Cache-Control", "no-store");
  try {
    const stored = await getQualityConfirmedHistoricalAudit();
    const report =
      stored?.status === "complete"
        ? stored
        : await runQualityConfirmedHistoricalAudit();
    return res.status(200).json(report);
  } catch (error) {
    return res.status(500).json({
      status: "failed",
      error: String(error?.message || error).slice(0, 400),
    });
  }
}
