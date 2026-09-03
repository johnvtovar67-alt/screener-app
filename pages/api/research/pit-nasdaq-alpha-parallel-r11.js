import {
  finalizePointInTimeNasdaqR11,
  freezePointInTimeNasdaqR11Audit,
  freezePointInTimeNasdaqR11Validation,
  getPointInTimeNasdaqAlphaParallelR11,
  runPointInTimeNasdaqR11WindowShard,
} from "../../../lib/fmpResearchBacktest";
import { rejectUnauthorizedResearchMutation } from "../../../lib/researchMutationAuth";

export const config = { maxDuration: 800 };

const workerPhases = new Set([
  "development",
  "validation",
  "historicalAudit",
  "forwardDiagnostic",
]);

export default async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method === "GET") {
      const report = await getPointInTimeNasdaqAlphaParallelR11();
      if (!report || report.status === "unavailable")
        return res.status(202).json({
          version: 11,
          researchGeneration: "R11",
          productionCandidateVersion: "V21",
          status: "pending",
          productionChanged: false,
          eligibleForAlphaClaim: false,
          eligibleForLiveCapital: false,
        });
      return res.status(report.status === "failed" ? 500 : 200).json(report);
    }
    if (rejectUnauthorizedResearchMutation(req, res)) return;
    const stage = String(req.query.stage || "");
    let report;
    if (workerPhases.has(stage)) {
      const shard = Number(req.query.shard);
      if (!Number.isInteger(shard) || shard < 0)
        return res.status(400).json({ error: "A valid shard is required" });
      report = await runPointInTimeNasdaqR11WindowShard({
        phase: stage,
        shard,
      });
    } else if (stage === "freeze-validation") {
      report = await freezePointInTimeNasdaqR11Validation();
    } else if (stage === "freeze-audit") {
      report = await freezePointInTimeNasdaqR11Audit();
    } else if (stage === "finalize") {
      report = await finalizePointInTimeNasdaqR11();
    } else {
      return res.status(400).json({
        error:
          "stage must be development, freeze-validation, validation, freeze-audit, historicalAudit, forwardDiagnostic, or finalize",
      });
    }
    return res.status(report?.status === "failed" ? 500 : 200).json(report);
  } catch (error) {
    return res.status(500).json({
      version: 11,
      researchGeneration: "R11",
      productionCandidateVersion: "V21",
      status: "failed",
      productionChanged: false,
      eligibleForAlphaClaim: false,
      eligibleForLiveCapital: false,
      error: String(error?.message || error).slice(0, 400),
    });
  }
}
