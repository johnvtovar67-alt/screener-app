import { getPointInTimeNasdaqDistinctAlphaR45 } from "../../../lib/fmpResearchBacktest";
export const config = { maxDuration: 800 };
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  res.setHeader("Cache-Control", "no-store");
  const report = await getPointInTimeNasdaqDistinctAlphaR45();
  return res.status(report?.status === "complete" ? 200 : 202).json(report);
}
