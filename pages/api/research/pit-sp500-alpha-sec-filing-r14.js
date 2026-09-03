import {
  getPointInTimeSp500AlphaFilingR14,
  runPointInTimeSp500AlphaFilingR14,
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
        ? await runPointInTimeSp500AlphaFilingR14()
        : await getPointInTimeSp500AlphaFilingR14();
    const status =
      report?.status === "failed"
        ? 500
        : report?.status === "complete"
          ? 200
          : 202;
    return res.status(status).json(report);
  } catch (error) {
    return res.status(500).json({
      version: 14,
      researchGeneration: "R14",
      status: "failed",
      productionChanged: false,
      eligibleForAlphaClaim: false,
      eligibleForLiveCapital: false,
      error: String(error?.message || error).slice(0, 400),
    });
  }
}
