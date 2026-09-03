import { timingSafeEqual } from "node:crypto";
import {
  runAlphaCreatorSearch,
  runAlphaProspectiveChallenger,
  runFmpResearchBacktest,
  runPointInTimeSp500AlphaCreatorV2,
  runPointInTimeSp500AlphaCreatorV2Integrity,
  runPointInTimeSp500AlphaResearchR3,
  runPointInTimeSp500AlphaResearchR4,
  runPointInTimeSp500AlphaResearchR5,
  runPointInTimeSp500AlphaResearchR6,
  runPointInTimeSp500AlphaResearchR7,
  runPointInTimeSp500AlphaBatchR8,
  runPointInTimeSp500AlphaSizingR9,
  runPointInTimeSp500DatasetAcquisition,
  runV11BoundedReviewExperiment,
  runV11ForwardExtension,
  runV11StressTest,
  V11_FORWARD_EXTENSION_TARGET,
} from "../../../lib/fmpResearchBacktest";
import { latestCompletedMarketSessionDay } from "../../../lib/marketSession";

export const config = { maxDuration: 800 };

function authorized(req) {
  const secret = process.env.CRON_SECRET;
  const supplied = String(req.headers.authorization || "");
  if (!secret || !supplied.startsWith("Bearer ")) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(supplied);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!process.env.CRON_SECRET)
    return res.status(503).json({ error: "CRON_SECRET is not configured" });
  if (!authorized(req)) return res.status(401).json({ error: "Unauthorized" });
  try {
    const minimumDatasetThrough =
      latestCompletedMarketSessionDay(new Date()) ||
      V11_FORWARD_EXTENSION_TARGET;
    const report = await runFmpResearchBacktest({
      minimumDatasetThrough,
    });
    const v11ForwardExtension = await runV11ForwardExtension();
    const boundedReviewExperiment =
      report.status === "complete"
        ? await runV11BoundedReviewExperiment()
        : null;
    const v11StressTest =
      report.status === "complete" ? await runV11StressTest() : null;
    const alphaCreator =
      report.status === "complete" ? await runAlphaCreatorSearch() : null;
    const alphaProspectiveChallenger =
      report.status === "complete"
        ? await runAlphaProspectiveChallenger()
        : null;
    const pointInTimeSp500Dataset =
      await runPointInTimeSp500DatasetAcquisition();
    const pointInTimeSp500AlphaCreator =
      pointInTimeSp500Dataset.status === "compiled"
        ? await runPointInTimeSp500AlphaCreatorV2()
        : null;
    const pointInTimeSp500AlphaCreatorIntegrity =
      pointInTimeSp500AlphaCreator?.status === "complete"
        ? await runPointInTimeSp500AlphaCreatorV2Integrity()
        : null;
    const pointInTimeSp500AlphaResearchR3 =
      pointInTimeSp500AlphaCreatorIntegrity?.assessment
        ?.adjustedPriceIntegrityPass === true
        ? await runPointInTimeSp500AlphaResearchR3()
        : null;
    const pointInTimeSp500AlphaResearchR4 =
      pointInTimeSp500AlphaResearchR3?.status === "complete" &&
      pointInTimeSp500AlphaResearchR3?.allHistoricalScreenGatesPassed !== true
        ? await runPointInTimeSp500AlphaResearchR4()
        : null;
    const pointInTimeSp500AlphaResearchR5 =
      pointInTimeSp500AlphaResearchR4?.status === "complete" &&
      pointInTimeSp500AlphaResearchR4?.candidateDisposition ===
        "rejected-by-historical-screen"
        ? await runPointInTimeSp500AlphaResearchR5()
        : null;
    const pointInTimeSp500AlphaResearchR6 =
      pointInTimeSp500AlphaResearchR5?.status === "complete" &&
      pointInTimeSp500AlphaResearchR5?.candidateDisposition ===
        "rejected-by-historical-screen"
        ? await runPointInTimeSp500AlphaResearchR6()
        : null;
    const pointInTimeSp500AlphaResearchR7 =
      pointInTimeSp500AlphaResearchR6?.status === "complete" &&
      pointInTimeSp500AlphaResearchR6?.candidateDisposition ===
        "rejected-by-historical-screen"
        ? await runPointInTimeSp500AlphaResearchR7()
        : null;
    const pointInTimeSp500AlphaBatchR8 =
      pointInTimeSp500AlphaResearchR7?.status === "complete" &&
      pointInTimeSp500AlphaResearchR7?.candidateDisposition ===
        "rejected-by-historical-screen"
        ? await runPointInTimeSp500AlphaBatchR8()
        : null;
    const pointInTimeSp500AlphaSizingR9 =
      pointInTimeSp500AlphaBatchR8?.status === "complete" &&
      String(pointInTimeSp500AlphaBatchR8?.candidateDisposition || "")
        .startsWith("rejected-")
        ? await runPointInTimeSp500AlphaSizingR9()
        : null;
    res.setHeader("Cache-Control", "no-store");
    return res.status(report.status === "complete" ? 200 : 202).json({
      ...report,
      boundedReviewExperiment: boundedReviewExperiment
        ? {
            status: boundedReviewExperiment.status,
            implementationPass: boundedReviewExperiment.implementationPass,
            completedAt: boundedReviewExperiment.completedAt,
          }
        : null,
      v11StressTest: v11StressTest
        ? {
            status: v11StressTest.status,
            robustnessPass: v11StressTest.robustnessPass,
            completedAt: v11StressTest.completedAt,
          }
        : null,
      alphaCreator: alphaCreator
        ? {
            status: alphaCreator.status,
            completedAt: alphaCreator.completedAt || null,
            datasetThrough: alphaCreator.datasetThrough || null,
            forwardWindow: alphaCreator.forwardWindow || null,
            allEvidenceGatesPassed:
              alphaCreator.allEvidenceGatesPassed === true,
        }
        : null,
      alphaProspectiveChallenger: alphaProspectiveChallenger
        ? {
            status: alphaProspectiveChallenger.status,
            completedAt: alphaProspectiveChallenger.completedAt || null,
            datasetThrough:
              alphaProspectiveChallenger.datasetThrough || null,
            prospectiveWindow:
              alphaProspectiveChallenger.prospectiveWindow || null,
            prospectiveSessions:
              alphaProspectiveChallenger.prospectiveSessions || 0,
            allEvidenceGatesPassed:
              alphaProspectiveChallenger.allEvidenceGatesPassed === true,
          }
        : null,
      v11ForwardExtension: v11ForwardExtension
        ? {
            status: v11ForwardExtension.status,
            completedAt: v11ForwardExtension.completedAt || null,
            window: v11ForwardExtension.window,
          }
        : null,
      pointInTimeSp500Dataset,
      pointInTimeSp500AlphaCreator: pointInTimeSp500AlphaCreator
        ? {
            status: pointInTimeSp500AlphaCreator.status,
            completedAt: pointInTimeSp500AlphaCreator.completedAt || null,
            datasetThrough:
              pointInTimeSp500AlphaCreator.datasetThrough || null,
            selectedCandidateId:
              pointInTimeSp500AlphaCreator.selectedCandidateId || null,
            allHistoricalScreenGatesPassed:
              pointInTimeSp500AlphaCreator
                .allHistoricalScreenGatesPassed === true,
            eligibleForAlphaClaim: false,
          }
        : null,
      pointInTimeSp500AlphaCreatorIntegrity:
        pointInTimeSp500AlphaCreatorIntegrity
          ? {
              status: pointInTimeSp500AlphaCreatorIntegrity.status,
              completedAt:
                pointInTimeSp500AlphaCreatorIntegrity.completedAt || null,
              adjustedPriceIntegrityPass:
                pointInTimeSp500AlphaCreatorIntegrity.assessment
                  ?.adjustedPriceIntegrityPass === true,
              historicalAuditConcentrationWarning:
                pointInTimeSp500AlphaCreatorIntegrity.assessment
                  ?.historicalAuditConcentrationWarning === true,
              eligibleForAlphaClaim: false,
            }
          : null,
      pointInTimeSp500AlphaResearchR3: pointInTimeSp500AlphaResearchR3
        ? {
            status: pointInTimeSp500AlphaResearchR3.status,
            completedAt:
              pointInTimeSp500AlphaResearchR3.completedAt || null,
            selectedCandidateId:
              pointInTimeSp500AlphaResearchR3.selectedCandidateId || null,
            allHistoricalScreenGatesPassed:
              pointInTimeSp500AlphaResearchR3
                .allHistoricalScreenGatesPassed === true,
            eligibleForAlphaClaim: false,
        }
        : null,
      pointInTimeSp500AlphaResearchR4: pointInTimeSp500AlphaResearchR4
        ? {
            status: pointInTimeSp500AlphaResearchR4.status,
            completedAt:
              pointInTimeSp500AlphaResearchR4.completedAt || null,
            selectedCandidateId:
              pointInTimeSp500AlphaResearchR4.selectedCandidateId || null,
            allHistoricalScreenGatesPassed:
              pointInTimeSp500AlphaResearchR4
                .allHistoricalScreenGatesPassed === true,
            eligibleForAlphaClaim: false,
        }
        : null,
      pointInTimeSp500AlphaSizingR9: pointInTimeSp500AlphaSizingR9
        ? {
            status: pointInTimeSp500AlphaSizingR9.status,
            completedAt:
              pointInTimeSp500AlphaSizingR9.completedAt || null,
            selectedCandidateId:
              pointInTimeSp500AlphaSizingR9.selectedCandidateId || null,
            candidateDisposition:
              pointInTimeSp500AlphaSizingR9.candidateDisposition || null,
            eligibleForAlphaClaim: false,
          }
        : null,
      pointInTimeSp500AlphaBatchR8: pointInTimeSp500AlphaBatchR8
        ? {
            status: pointInTimeSp500AlphaBatchR8.status,
            completedAt:
              pointInTimeSp500AlphaBatchR8.completedAt || null,
            selectedCandidateId:
              pointInTimeSp500AlphaBatchR8.selectedCandidateId || null,
            candidateDisposition:
              pointInTimeSp500AlphaBatchR8.candidateDisposition || null,
            eligibleForAlphaClaim: false,
          }
        : null,
      pointInTimeSp500AlphaResearchR7: pointInTimeSp500AlphaResearchR7
        ? {
            status: pointInTimeSp500AlphaResearchR7.status,
            completedAt:
              pointInTimeSp500AlphaResearchR7.completedAt || null,
            selectedCandidateId:
              pointInTimeSp500AlphaResearchR7.selectedCandidateId || null,
            allHistoricalScreenGatesPassed:
              pointInTimeSp500AlphaResearchR7
                .allHistoricalScreenGatesPassed === true,
            eligibleForAlphaClaim: false,
          }
        : null,
      pointInTimeSp500AlphaResearchR6: pointInTimeSp500AlphaResearchR6
        ? {
            status: pointInTimeSp500AlphaResearchR6.status,
            completedAt:
              pointInTimeSp500AlphaResearchR6.completedAt || null,
            selectedCandidateId:
              pointInTimeSp500AlphaResearchR6.selectedCandidateId || null,
            allHistoricalScreenGatesPassed:
              pointInTimeSp500AlphaResearchR6
                .allHistoricalScreenGatesPassed === true,
            eligibleForAlphaClaim: false,
          }
        : null,
      pointInTimeSp500AlphaResearchR5: pointInTimeSp500AlphaResearchR5
        ? {
            status: pointInTimeSp500AlphaResearchR5.status,
            completedAt:
              pointInTimeSp500AlphaResearchR5.completedAt || null,
            selectedCandidateId:
              pointInTimeSp500AlphaResearchR5.selectedCandidateId || null,
            allHistoricalScreenGatesPassed:
              pointInTimeSp500AlphaResearchR5
                .allHistoricalScreenGatesPassed === true,
            eligibleForAlphaClaim: false,
          }
        : null,
    });
  } catch (error) {
    console.error("FMP research backtest cron:", error);
    return res.status(503).json({
      ok: false,
      error: error?.message || "Research replay failed",
    });
  }
}
