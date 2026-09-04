import { runPointInTimeNasdaqAdaptiveReplacementPlaceboWorker } from "../../../lib/fmpResearchBacktest";
import { rejectUnauthorizedResearchMutation } from "../../../lib/researchMutationAuth";

export const config = { maxDuration: 800 };

export default async function handler(req, res) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Method not allowed" }); }
  res.setHeader("Cache-Control", "no-store");
  if (rejectUnauthorizedResearchMutation(req, res)) return;
  try {
    const report = await runPointInTimeNasdaqAdaptiveReplacementPlaceboWorker({ shard: Number(req.query.shard) });
    return res.status(report?.status === "complete" ? 200 : 202).json(report);
  } catch (error) {
    return res.status(500).json({ version: 40, researchGeneration: "R40-R44-strict-placebo", status: "failed", productionChanged: false, eligibleForAlphaClaim: false, eligibleForLiveCapital: false, error: String(error?.message || error).slice(0, 400) });
  }
}
