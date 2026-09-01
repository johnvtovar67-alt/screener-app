import {
  getV11BoundedReviewExperiment,
  runV11BoundedReviewExperiment,
} from "../../../lib/fmpResearchBacktest";

export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  res.setHeader("Cache-Control", "no-store");
  try {
    // Execution is intentionally preview-only. Production exposes the durable
    // result but cannot be used as a public compute trigger.
    const run = req.query.run === "1";
    if (run && process.env.VERCEL_ENV !== "preview")
      return res.status(403).json({ error: "Experiment execution is preview-only" });
    const result = run
      ? await runV11BoundedReviewExperiment({ force: req.query.force === "1" })
      : await getV11BoundedReviewExperiment();
    return res.status(result?.status === "unavailable" ? 503 : 200).json(result);
  } catch (error) {
    return res.status(500).json({
      status: "failed",
      error: String(error?.message || error).slice(0, 400),
    });
  }
}
