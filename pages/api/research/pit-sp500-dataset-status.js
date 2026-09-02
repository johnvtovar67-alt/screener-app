import { getPointInTimeSp500DatasetStatus } from "../../../lib/fmpResearchBacktest";

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  res.setHeader("Cache-Control", "no-store");
  const report = await getPointInTimeSp500DatasetStatus();
  if (!report)
    return res.status(202).json({
      version: 1,
      status: "pending",
      productionChanged: false,
      eligibleForAlphaClaim: false,
    });
  return res.status(report.status === "failed" ? 500 : 200).json(report);
}
