# September 15 index rollover repair

Owner authorization: repair the September 15 market-data update failure while preserving C1 rules, actual trades and original records. Investigated production/main e9bfa317d98870919978049cc7ebff07497fdd8d.

## Reproduction and evidence

The normal index collector archived September 15 successfully but rejected 29 revised September 14 price anchors. The accepted index record is f61cacce3c57c6f7f0573e561577329c983bd492442483944fe642bf1f63e010. DELL is the only revised symbol with model exposure: virtual buys in all three sleeves on September 11. Its September 14 close changed from 534.08 to 534.28 and volume from 9010491 to 9173800. Open 538.57, high 546.29 and low 525.85 are unchanged.

Two immutable provider observations agree on the anchors and DELL bars. Both payload SHA256 hashes were verified against the archive receipt:

- 76ec512c2da5a676a18887e9e50f35ecb69e218f94fcbb524e84947d847c8e0a, observed 2026-09-15T20:48:19.655Z.
- 43fb1b0ba20f739a6e76657a5bb415456f9d5c061803829e1f505c9862f1c53a, observed 2026-09-15T22:18:20.178Z.

Downloaded from the authenticated private Blob store. These are market observations, not account records. No private account file was changed.

## Repair boundary

lib/c1HeldCloseRevisionReview.js identifies this exact reviewed book, date transition and DELL correction. lib/c1BaselineReconciliation.js permits that exception to the model-exposure guard only when the evidence matches exactly and the complete next-session economic replay agrees between original and revised prior bars. Ledger, pending actions, execution status, execution record and summary must match exactly. It stores the original model result, preserving prior sessions, captures, fills, stops and capital history. Audit metadata identifies the held-close review and archived evidence.

All other exposed-stock revisions, benchmark revisions, changed original book, changed open/high/low, different close/volume, incomplete evidence and economic differences remain blocked. This is not general corporate-action processing or a numerical price tolerance. The prior unexposed-symbol evidence requirements remain active.

lib/c1AccountInput.js now evaluates account exposure as of the revised prior date. A first purchase afterward cannot be historical exposure to that prior close. Adopted positions, any earlier fills, and missing/invalid dates still block; intraday records are checked too. No account holdings, cash or fills are inferred or rewritten. Separate account continuation and actual-fill reconciliation still apply. In particular, an account holding DELL before September 15 remains subject to its account reconciliation block.

## Verification

- tools/c1-held-close-review-regression.cjs run against the original downloaded index and the 22:18 archived observation: advancement to September 15; 29 corrections and one held review; unchanged history and full economics; idempotent retry; rejection of changed evidence/book/provider/membership, earlier observation, malformed/duplicate/missing bars and injected one-dollar economic difference; account exposure dates including invalid and intraday dates.
- tools/c1-unexposed-price-regression.cjs: existing unexposed corrections and exposure/parity rejection tests.
- tools/c1-intraday-regression.cjs: sale, replacement purchase, reload, actual cash and close replay.

The real-data regression accepts paths to the immutable .json.gz files; the private archive is not copied into GitHub. This operational replay is not a rerun of a completed historical alpha experiment.

## Freeze and deployment

Only the three affected application files are added/updated in docs/c1-release-freeze.json. Guard implementation, build hooks, strategy, ranking, sizing, risk parameters and UI are unchanged. Normal cron remains configured as before. Deployment and successful current-session collection must be verified separately before claiming the live update is repaired. This specific reconciliation does not guarantee that every future provider correction is automatically resolvable.
