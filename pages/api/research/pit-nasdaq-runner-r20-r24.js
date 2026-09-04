import { getPointInTimeNasdaqRunnerR20 } from "../../../lib/fmpResearchBacktest";

export const config = { maxDuration: 800 };

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  res.setHeader("Cache-Control", "no-store");
  try {
    const report = await getPointInTimeNasdaqRunnerR20();
    const status =
      report?.status === "failed"
        ? 500
        : report?.status === "complete"
          ? 200
          : 202;
    return res.status(status).json(report);
  } catch (error) {
    return res.status(500).json({
      version: 20,
      researchGeneration: "R20-R24",
      status: "failed",
      productionChanged: false,
      eligibleForAlphaClaim: false,
      eligibleForLiveCapital: false,
      error: String(error?.message || error).slice(0, 400),
    });
  }
}
