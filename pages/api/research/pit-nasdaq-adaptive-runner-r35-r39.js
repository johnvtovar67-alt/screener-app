import { getPointInTimeNasdaqAdaptiveRunnerR35 } from "../../../lib/fmpResearchBacktest";

export const config = { maxDuration: 800 };

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  res.setHeader("Cache-Control", "no-store");
  try {
    const report = await getPointInTimeNasdaqAdaptiveRunnerR35();
    const status = report?.status === "failed" ? 500 : report?.status === "complete" ? 200 : 202;
    return res.status(status).json(report);
  } catch (error) {
    return res.status(500).json({ version: 35, researchGeneration: "R35-R39", status: "failed", productionChanged: false, eligibleForAlphaClaim: false, eligibleForLiveCapital: false, error: String(error?.message || error).slice(0, 400) });
  }
}
