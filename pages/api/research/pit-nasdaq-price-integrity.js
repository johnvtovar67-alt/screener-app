import {
  getPointInTimeNasdaqPriceIntegrity,
  runPointInTimeNasdaqPriceIntegrity,
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
    if (
      req.method === "POST" &&
      rejectUnauthorizedResearchMutation(req, res)
    )
      return;
    const report =
      req.method === "POST"
        ? await runPointInTimeNasdaqPriceIntegrity({
            force: String(req.query.force || "") === "1",
          })
        : await getPointInTimeNasdaqPriceIntegrity();
    if (!report || report.status === "unavailable")
      return res.status(202).json({
        version: 1,
        status: "pending",
        productionChanged: false,
        eligibleForAlphaClaim: false,
      });
    return res.status(report.status === "failed" ? 500 : 200).json(report);
  } catch (error) {
    return res.status(500).json({
      version: 1,
      status: "failed",
      productionChanged: false,
      eligibleForAlphaClaim: false,
      error: String(error?.message || error).slice(0, 400),
    });
  }
}
