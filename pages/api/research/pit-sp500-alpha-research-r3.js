import {
  getPointInTimeSp500AlphaResearchR3,
  runPointInTimeSp500AlphaResearchR3,
} from "../../../lib/fmpResearchBacktest";

export const config = { maxDuration: 800 };

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  res.setHeader("Cache-Control", "no-store");
  try {
    const report =
      String(req.query.run || "") === "1"
        ? await runPointInTimeSp500AlphaResearchR3({
            force: String(req.query.force || "") === "1",
          })
        : await getPointInTimeSp500AlphaResearchR3();
    if (!report || report.status === "unavailable")
      return res.status(202).json({
        version: 3,
        researchGeneration: "R3",
        productionCandidateVersion: "V13",
        status: "pending",
        productionChanged: false,
        eligibleForAlphaClaim: false,
      });
    const status =
      report.status === "failed"
        ? 500
        : report.status === "complete"
          ? 200
          : 202;
    return res.status(status).json(report);
  } catch (error) {
    return res.status(500).json({
      version: 3,
      researchGeneration: "R3",
      productionCandidateVersion: "V13",
      status: "failed",
      productionChanged: false,
      eligibleForAlphaClaim: false,
      error: String(error?.message || error).slice(0, 400),
    });
  }
}
