import {
  advancePointInTimeSp500MomentumSpineR15,
  getPointInTimeSp500MomentumSpineR15,
} from "../../../lib/fmpResearchBacktest";
import { rejectUnauthorizedResearchMutation } from "../../../lib/researchMutationAuth";

export const config = { maxDuration: 800 };

export default async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method === "POST" && rejectUnauthorizedResearchMutation(req, res))
      return;
    const report =
      req.method === "POST"
        ? await advancePointInTimeSp500MomentumSpineR15()
        : await getPointInTimeSp500MomentumSpineR15();
    const status =
      report?.status === "failed"
        ? 500
        : report?.status === "complete"
          ? 200
          : 202;
    return res.status(status).json(report);
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

