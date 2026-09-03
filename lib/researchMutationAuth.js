import { timingSafeEqual } from "node:crypto";

export function researchMutationAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  const supplied = String(req?.headers?.authorization || "");
  if (!secret || !supplied.startsWith("Bearer ")) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(supplied);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function rejectUnauthorizedResearchMutation(req, res) {
  if (!process.env.CRON_SECRET) {
    res.status(503).json({ error: "CRON_SECRET is not configured" });
    return true;
  }
  if (!researchMutationAuthorized(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return true;
  }
  return false;
}
