import { runPointInTimeSp500MomentumSpineWorker } from "../../../lib/fmpResearchBacktest";
import { rejectUnauthorizedResearchMutation } from "../../../lib/researchMutationAuth";

export const config = { maxDuration: 800 };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  res.setHeader("Cache-Control", "no-store");
  if (rejectUnauthorizedResearchMutation(req, res)) return;
  try {
    const report = await runPointInTimeSp500MomentumSpineWorker({
      candidateId: String(req.query.candidateId || ""),
    });
    return res.status(report?.status === "complete" ? 200 : 202).json(report);
  } catch (error) {
    return res.status(500).json({
      version: 15,
      researchGeneration: "R15-R19",
      status: "failed",
      productionChanged: false,
      eligibleForAlphaClaim: false,
      eligibleForLiveCapital: false,
      error: String(error?.message || error).slice(0, 400),
    });
  }
}

