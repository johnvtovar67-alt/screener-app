import { getPointInTimeSp500AlphaCreatorV2Integrity } from "../../../lib/fmpResearchBacktest";

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  res.setHeader("Cache-Control", "no-store");
  try {
    const report = await getPointInTimeSp500AlphaCreatorV2Integrity();
    if (!report || report.status === "unavailable")
      return res.status(202).json({
        version: 1,
        status: "pending",
        audit: "Post-result V2 price-integrity and trade-concentration audit",
        productionChanged: false,
        eligibleForAlphaClaim: false,
      });
    const status = report.status === "failed" ? 500 : report.status === "complete" ? 200 : 202;
    return res.status(status).json(report);
  } catch (error) {
    return res.status(500).json({
      version: 1,
      status: "failed",
      audit: "Post-result V2 price-integrity and trade-concentration audit",
      productionChanged: false,
      eligibleForAlphaClaim: false,
      error: String(error?.message || error).slice(0, 400),
    });
  }
}
