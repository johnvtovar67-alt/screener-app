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
  runPointInTimeSp500AlphaEarningsDriftR10,
  runPointInTimeSp500DatasetAcquisition,
  getPointInTimeNasdaqAlphaParallelR11,
  getPreservedPointInTimeNasdaqR13Outcome,
  getPointInTimeNasdaqDatasetStatus,
  getPointInTimeNasdaqPriceIntegrity,
  runPointInTimeNasdaqDatasetAcquisition,
  runPointInTimeNasdaqPriceIntegrity,
  preparePointInTimeNasdaqR13Earnings,
  getPointInTimeSp500SecFilingR14Status,
  preparePointInTimeSp500SecFilingR14,
  runPointInTimeSp500AlphaFilingR14,
  getPointInTimeSp500MomentumSpineR15,
  finalizePointInTimeSp500MomentumSpineDevelopment,
  advancePointInTimeSp500MomentumSpineR15,
  freezePointInTimeNasdaqR11Validation,
  freezePointInTimeNasdaqR11Audit,
  finalizePointInTimeNasdaqR11,
  runV11BoundedReviewExperiment,
  runV11ForwardExtension,
  runV11StressTest,
  V11_FORWARD_EXTENSION_TARGET,
} from "../../../lib/fmpResearchBacktest";
import {
  pointInTimeMomentumSpineR15Controls,
  pointInTimeMomentumSpineR15Definitions,
} from "../../../lib/momentumSpineResearch";
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

async function invokeNasdaqR11Workers(req, phase, shardCount) {
  const protectionBypassSecret = String(
    process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "",
  ).trim();
  if (!protectionBypassSecret) {
    throw new Error(
      "VERCEL_AUTOMATION_BYPASS_SECRET is required for protected R11 worker fan-out",
    );
  }
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "")
    .split(",")[0]
    .trim();
  if (!/^[a-z0-9.-]+(?::\d+)?$/i.test(host))
    throw new Error("A valid deployment host is required for R11 fan-out");
  const protocol =
    String(req.headers["x-forwarded-proto"] || "https") === "http"
      ? "http"
      : "https";
  const authorization = String(req.headers.authorization || "");
  const startedAt = new Date().toISOString();
  const workers = await Promise.all(
    Array.from({ length: shardCount }, async (_, shard) => {
      const url = new URL(
        "/api/research/pit-nasdaq-alpha-parallel-r11",
        `${protocol}://${host}`,
      );
      url.searchParams.set("stage", phase);
      url.searchParams.set("shard", String(shard));
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: authorization,
          "Content-Type": "application/json",
          "x-vercel-protection-bypass": protectionBypassSecret,
          "X-R11-Coordinator": "window-fanout-v1",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(780_000),
      });
      const responseBody = await response.text();
      let payload;
      try {
        payload = responseBody ? JSON.parse(responseBody) : {};
      } catch {
        payload = { error: responseBody || `HTTP ${response.status}` };
      }
      if (!response.ok) {
        const rawError = payload?.error ?? payload?.message ?? payload;
        const workerError =
          typeof rawError === "string"
            ? rawError
            : JSON.stringify(rawError);
        console.error("R11 worker request failed", {
          phase,
          shard,
          status: response.status,
          contentType: response.headers.get("content-type"),
          error: workerError.slice(0, 800),
        });
        throw new Error(
          `R11 ${phase} shard ${shard} failed (${response.status}): ${workerError.slice(0, 400)}`,
        );
      }
      return payload;
    }),
  );
  return {
    phase,
    startedAt,
    completedAt: new Date().toISOString(),
    workers,
    allComplete: workers.every((worker) => worker?.status === "complete"),
  };
}

async function advancePointInTimeNasdaqR11(req) {
  const dataset = await getPointInTimeNasdaqDatasetStatus();
  if (dataset?.status !== "compiled")
    return {
      stage: "dataset",
      report: await runPointInTimeNasdaqDatasetAcquisition(),
    };
  const integrity = await getPointInTimeNasdaqPriceIntegrity();
  if (
    integrity?.status !== "complete" ||
    integrity?.assessment?.allDataGatesPassed !== true ||
    integrity?.datasetFingerprint !== dataset.datasetFingerprint
  )
    return {
      stage: "integrity",
      report: await runPointInTimeNasdaqPriceIntegrity(),
    };
  const current = await getPointInTimeNasdaqAlphaParallelR11();
  const earnings = await preparePointInTimeNasdaqR13Earnings();
  if (earnings?.status !== "complete")
    return { stage: "earnings", report: earnings };
  if (["complete", "failed"].includes(current?.status))
    return { stage: "terminal", report: current };
  if (current?.status === "awaiting-validation") {
    const fanout = await invokeNasdaqR11Workers(req, "validation", 2);
    return {
      stage: "validation",
      fanout,
      report: fanout.allComplete
        ? await freezePointInTimeNasdaqR11Audit()
        : current,
    };
  }
  if (current?.status === "awaiting-audit") {
    const [historicalAudit, forwardDiagnostic] = await Promise.all([
      invokeNasdaqR11Workers(req, "historicalAudit", 2),
      invokeNasdaqR11Workers(req, "forwardDiagnostic", 1),
    ]);
    const allComplete =
      historicalAudit.allComplete && forwardDiagnostic.allComplete;
    return {
      stage: "audit",
      fanout: { historicalAudit, forwardDiagnostic, allComplete },
      report: allComplete ? await finalizePointInTimeNasdaqR11() : current,
    };
  }
  const fanout = await invokeNasdaqR11Workers(req, "development", 3);
  return {
    stage: "development",
    fanout,
    report: fanout.allComplete
      ? await freezePointInTimeNasdaqR11Validation()
      : current,
  };
}

async function advancePointInTimeSp500R14() {
  const facts = await getPointInTimeSp500SecFilingR14Status();
  if (facts?.status !== "complete") {
    const acquisition = await preparePointInTimeSp500SecFilingR14();
    return {
      stage: "sec-data",
      report: {
        status: acquisition.status,
        datasetThrough: acquisition.datasetThrough,
        requestedSymbols: Array.isArray(acquisition.requestedSymbols)
          ? acquisition.requestedSymbols.length
          : acquisition.requestedSymbols,
        completedSymbols: Array.isArray(acquisition.completedSymbols)
          ? acquisition.completedSymbols.length
          : acquisition.completedSymbols,
        coveredSymbols: acquisition.coveredSymbols,
        remainingSymbols: acquisition.remainingSymbols,
        coveragePct: acquisition.coveragePct,
        eventRows: acquisition.eventRows,
        productionChanged: false,
        eligibleForAlphaClaim: false,
        eligibleForLiveCapital: false,
      },
    };
  }
  const report = await runPointInTimeSp500AlphaFilingR14();
  return {
    stage: report.stage || report.status,
    report,
  };
}

async function invokeMomentumSpineWorkers(req) {
  const protectionBypassSecret = String(
    process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "",
  ).trim();
  if (!protectionBypassSecret)
    throw new Error(
      "VERCEL_AUTOMATION_BYPASS_SECRET is required for R15-R19 worker fan-out",
    );
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "")
    .split(",")[0]
    .trim();
  if (!/^[a-z0-9.-]+(?::\d+)?$/i.test(host))
    throw new Error("A valid deployment host is required for R15-R19 fan-out");
  const protocol =
    String(req.headers["x-forwarded-proto"] || "https") === "http"
      ? "http"
      : "https";
  const authorization = String(req.headers.authorization || "");
  const definitions = [
    ...pointInTimeMomentumSpineR15Definitions(),
    ...pointInTimeMomentumSpineR15Controls(),
  ];
  const startedAt = new Date().toISOString();
  const workers = await Promise.all(
    definitions.map(async (definition) => {
      const url = new URL(
        "/api/research/pit-sp500-momentum-spine-r15-r19-worker",
        `${protocol}://${host}`,
      );
      url.searchParams.set("candidateId", definition.id);
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: authorization,
          "Content-Type": "application/json",
          "x-vercel-protection-bypass": protectionBypassSecret,
          "X-R15-Coordinator": "parallel-family-fanout-v1",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(780_000),
      });
      const responseBody = await response.text();
      let payload;
      try {
        payload = responseBody ? JSON.parse(responseBody) : {};
      } catch {
        payload = { error: responseBody || `HTTP ${response.status}` };
      }
      if (!response.ok) {
        const rawError = payload?.error ?? payload?.message ?? payload;
        const workerError =
          typeof rawError === "string" ? rawError : JSON.stringify(rawError);
        console.error("R15-R19 worker request failed", {
          candidateId: definition.id,
          status: response.status,
          contentType: response.headers.get("content-type"),
          error: workerError.slice(0, 800),
        });
        throw new Error(
          `${definition.id} worker failed (${response.status}): ${workerError.slice(0, 400)}`,
        );
      }
      return {
        candidateId: definition.id,
        status: payload.status,
        startedAt: payload.startedAt,
        completedAt: payload.completedAt,
        cached: payload.cached === true,
      };
    }),
  );
  return {
    startedAt,
    completedAt: new Date().toISOString(),
    workers,
    allComplete: workers.every((worker) => worker.status === "complete"),
  };
}

async function advanceMomentumSpineProgram(req) {
  const current = await getPointInTimeSp500MomentumSpineR15();
  if (current?.status === "complete" || current?.status === "failed")
    return { stage: "terminal", report: current };
  if (
    current?.status === "awaiting-validation" ||
    current?.status === "awaiting-audit" ||
    current?.status === "awaiting-strict-placebo"
  )
    return {
      stage: current.status,
      report:
        current.status === "awaiting-strict-placebo"
          ? current
          : await advancePointInTimeSp500MomentumSpineR15(),
    };
  const fanout = await invokeMomentumSpineWorkers(req);
  return {
    stage: "parallel-development",
    fanout,
    report: fanout.allComplete
      ? await finalizePointInTimeSp500MomentumSpineDevelopment()
      : await getPointInTimeSp500MomentumSpineR15(),
  };
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
    // R13 is immutable inspected evidence. A later deployment SHA must never
    // restart it or turn its holdouts back into a tuning surface.
    const pointInTimeNasdaqR11 = {
      stage: "preserved-terminal",
      report: await getPreservedPointInTimeNasdaqR13Outcome(),
    };
    const pointInTimeSp500R14 = await advancePointInTimeSp500R14();
    const momentumSpine =
      pointInTimeSp500R14.report?.status === "complete"
        ? await advanceMomentumSpineProgram(req)
        : null;
    res.setHeader("Cache-Control", "no-store");
    return res
      .status(momentumSpine?.report?.status === "complete" ? 200 : 202)
      .json({
      ok: true,
      priorityResearch: "R15-R19-parallel-momentum-spine",
      momentumSpine,
      pointInTimeSp500R14,
      pointInTimeNasdaqR11: {
        stage: pointInTimeNasdaqR11.stage,
        status: pointInTimeNasdaqR11.report.status,
        selectedCandidateId:
          pointInTimeNasdaqR11.report.selectedCandidateId || null,
        candidateDisposition:
          pointInTimeNasdaqR11.report.candidateDisposition || null,
        reportDigest: pointInTimeNasdaqR11.report.reportDigest || null,
        productionChanged: false,
        eligibleForAlphaClaim: false,
        eligibleForLiveCapital: false,
      },
      legacyResearchRerun: false,
      nextStep:
        momentumSpine?.report?.nextStep ||
        pointInTimeSp500R14.report?.nextStep ||
        "Continue only the frozen parallel momentum program.",
      productionChanged: false,
      eligibleForAlphaClaim: false,
      eligibleForLiveCapital: false,
    });
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
    const pointInTimeSp500AlphaEarningsDriftR10 =
      pointInTimeSp500AlphaSizingR9?.status === "complete" &&
      String(pointInTimeSp500AlphaSizingR9?.candidateDisposition || "")
        .startsWith("rejected-")
        ? await runPointInTimeSp500AlphaEarningsDriftR10()
        : null;
    res.setHeader("Cache-Control", "no-store");
    return res.status(report.status === "complete" ? 200 : 202).json({
      ...report,
      pointInTimeNasdaqR11: {
        stage: pointInTimeNasdaqR11.stage,
        status: pointInTimeNasdaqR11.report.status,
        candidateDisposition:
          pointInTimeNasdaqR11.report.candidateDisposition || null,
        selectedCandidateId:
          pointInTimeNasdaqR11.report.selectedCandidateId || null,
        productionChanged: false,
        eligibleForAlphaClaim: false,
        eligibleForLiveCapital: false,
      },
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
      pointInTimeSp500AlphaEarningsDriftR10:
        pointInTimeSp500AlphaEarningsDriftR10
          ? {
              status: pointInTimeSp500AlphaEarningsDriftR10.status,
              completedAt:
                pointInTimeSp500AlphaEarningsDriftR10.completedAt || null,
              selectedCandidateId:
                pointInTimeSp500AlphaEarningsDriftR10.selectedCandidateId ||
                null,
              candidateDisposition:
                pointInTimeSp500AlphaEarningsDriftR10.candidateDisposition ||
                null,
              eligibleForAlphaClaim: false,
            }
          : null,
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
