import { getV11ForwardExtensionReport } from "../../../lib/fmpResearchBacktest";

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const report = await getV11ForwardExtensionReport();
  res.setHeader("Cache-Control", "no-store");
  return res.status(report?.status === "unavailable" ? 503 : 200).json(report);
}
