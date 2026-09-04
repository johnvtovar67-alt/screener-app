import {
  getAlphaCreatorSearch,
  getPointInTimeSp500AlphaProgram,
} from "../../../lib/fmpResearchBacktest";

export const config = { maxDuration: 800 };

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  res.setHeader("Cache-Control", "no-store");
  try {
    if (String(req.query.legacy || "") === "1") {
      const report = await getAlphaCreatorSearch();
      return res.status(200).json({
        ...report,
        authority: "legacy-current-survivor-diagnostic",
        supersededBy: "/api/research/pit-sp500-alpha-creator",
      });
    }

    // The public alpha-creator route is authoritative only when it uses a
    // compiled point-in-time membership dataset. The previous
    // current-survivor search remains available solely as an explicitly
    // labelled historical diagnostic via ?legacy=1.
    const report = await getPointInTimeSp500AlphaProgram();
    if (!report)
      return res.status(202).json({
        version: 1,
        status: "pending",
        authority: "point-in-time-index-research",
        productionChanged: false,
        eligibleForAlphaClaim: false,
      });
    const status = report.status === "failed" ? 500 : report.status === "complete" ? 200 : 202;
    return res.status(status).json({
      ...report,
      authority: "point-in-time-index-research",
      latestResearchGeneration: report.version || 1,
      latestResearchRoute:
        "/api/research/pit-nasdaq-runner-r20-r24",
      frozenR15R19Report:
        "/api/research/pit-sp500-momentum-spine-r15-r19",
      frozenR14Report: "/api/research/pit-sp500-alpha-sec-filing-r14",
      frozenR9Report: "/api/research/pit-sp500-alpha-sizing-r9",
      frozenR8Report: "/api/research/pit-sp500-alpha-batch-r8",
      frozenR7Report: "/api/research/pit-sp500-alpha-research-r7",
      frozenR6Report: "/api/research/pit-sp500-alpha-research-r6",
      frozenR5Report: "/api/research/pit-sp500-alpha-research-r5",
      frozenR4Report: "/api/research/pit-sp500-alpha-research-r4",
      frozenR3Report: "/api/research/pit-sp500-alpha-research-r3",
      frozenR2Report: "/api/research/pit-sp500-alpha-creator-v2",
      frozenV1Report: "/api/research/pit-sp500-alpha-creator",
      legacyCurrentSurvivorDiagnostic: "/api/research/alpha-creator?legacy=1",
    });
  } catch (error) {
    return res.status(500).json({
      version: 1,
      status: "failed",
      authority: "point-in-time-index-research",
      productionChanged: false,
      eligibleForAlphaClaim: false,
      error: String(error?.message || error).slice(0, 400),
    });
  }
}
