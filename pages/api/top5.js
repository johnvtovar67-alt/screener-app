// Compatibility adapter: existing GET refreshes still trigger their original production.
// The produced result is consumed read-only; this route is not a read-only canary.
import { produceC1Screen } from "../../lib/c1ScreenProducer";
import { readC1ScreenSnapshot } from "../../lib/c1ScreenSnapshotView";
import { buildTop5UnavailableResponse } from "../../lib/top5Response";
import { profileTop5Request, top5Phase, isTop5Deadline, top5ObserveScreenResponse, top5ObserveScreenFailure, top5RequestId } from "../../lib/top5Diagnostics";

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  return profileTop5Request(async () => {
  try {
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.setHeader("X-C1-Request-Id", top5RequestId());
    return await produceC1Screen(req.query, (production) => top5Phase("serialize-response", () => res
      .status(200)
      .json(top5ObserveScreenResponse(readC1ScreenSnapshot(production)))));
  } catch (err) {
    try { top5ObserveScreenFailure(err); } catch {}
    return res
      .status(503)
      .json(buildTop5UnavailableResponse(isTop5Deadline(err)));
  }
  }, { compact: String(req.query.compact || "") === "1", verificationPass: Number(req.query.verificationPass) || 0 });
}
