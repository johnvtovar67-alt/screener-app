import { getPointInTimeNasdaqEventAlphaR55 } from "../../../lib/fmpResearchBacktest";
export default async function handler(req, res) {
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return res.status(405).json({ error: "Method not allowed" }); }
  const report = await getPointInTimeNasdaqEventAlphaR55();
  res.setHeader("Cache-Control", "no-store"); res.setHeader("X-Robots-Tag", "noindex");
  return res.status(report?.status === "complete" ? 200 : 202).json(report);
}
