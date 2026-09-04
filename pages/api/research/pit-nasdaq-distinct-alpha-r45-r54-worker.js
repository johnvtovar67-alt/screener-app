import { runPointInTimeNasdaqDistinctAlphaWorker } from "../../../lib/fmpResearchBacktest";
import { rejectUnauthorizedResearchMutation } from "../../../lib/researchMutationAuth";
export const config = { maxDuration: 800 };
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (rejectUnauthorizedResearchMutation(req, res)) return;
  try { const report = await runPointInTimeNasdaqDistinctAlphaWorker({ candidateId: String(req.query.candidateId || "") }); return res.status(200).json(report); }
  catch (error) { return res.status(500).json({ version: 45, status: "failed", error: String(error?.message || error).slice(0, 400), productionChanged: false }); }
}
