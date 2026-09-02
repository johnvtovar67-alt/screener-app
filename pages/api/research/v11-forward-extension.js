import {
  getV11ForwardExtensionReport,
  runV11ForwardExtension,
} from "../../../lib/fmpResearchBacktest";

export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  res.setHeader("Cache-Control", "no-store");
  try {
    const stored = await getV11ForwardExtensionReport();
    // Upgrade the durable report once. Subsequent requests are reads only.
    const report =
      stored?.status === "complete" && Number(stored?.version || 0) < 5
        ? await runV11ForwardExtension()
        : stored;
    return res.status(report?.status === "unavailable" ? 503 : 200).json(report);
  } catch (error) {
    return res.status(500).json({
      status: "failed",
      error: String(error?.message || error).slice(0, 400),
    });
  }
}
