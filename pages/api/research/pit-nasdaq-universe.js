import {
  getPointInTimeNasdaqUniverseStatus,
  runPointInTimeNasdaqUniverse,
} from "../../../lib/fmpResearchBacktest";
import { rejectUnauthorizedResearchMutation } from "../../../lib/researchMutationAuth";

export const config = { maxDuration: 120 };

export default async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method === "GET") {
      const status = await getPointInTimeNasdaqUniverseStatus();
      return res.status(200).json({
        version: 1,
        ...(status || { status: "pending" }),
        productionChanged: false,
        eligibleForAlphaClaim: false,
      });
    }
    if (rejectUnauthorizedResearchMutation(req, res)) return;
    const report = await runPointInTimeNasdaqUniverse({
      force: String(req.query.force || "") === "1",
    });
    return res.status(200).json(report);
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
