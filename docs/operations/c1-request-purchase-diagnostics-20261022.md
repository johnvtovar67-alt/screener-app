# C1 MRNA/CRWD request diagnostics — October 22, 2026

The owner explicitly authorized a read-only diagnostic object in the existing authenticated `prepare-execution` response for MRNA and CRWD, focused regression coverage, the normal tests/build and one isolated PR. No merge or deployment is authorized.

## Behavior and boundary

The new `purchaseDiagnostics` field is an allowlisted response projection. The account route enables it only for `prepare-execution`; ordinary analysis, recording and all other callers keep their existing response shape. A recording ticket also disables the projection defensively.

The existing execution request captures references to its reviewed source baseline, original native decision, exact opening-symbol request and validated collector response. At response completion the projection reads those values and the final plan/review outcomes. It starts no collector, provider request, replay, reconciliation, planning operation or write. Context and diagnostics are never attached to an account, opening plan, activity, fill or historical record. Diagnostic failures produce an unavailable diagnostic and leave the normal result intact.

The diagnostic emits only MRNA and CRWD. It includes the deployed commit, source/capture/request timestamps, source factors and configured volatility limits, existing native queue membership, opening request/observation coverage and timestamps, source event verification state, bounded review reason codes and available reconciliation flags. Component predicate comparisons are diagnostic explanations; they neither select stocks nor claim to reconstruct an unretained full native eligibility decision.

It returns no credentials, account identifiers, balances, share quantities, holdings lists, fills, transactions, order IDs, raw provider payloads or arbitrary error text. The existing authenticated account response remains otherwise unchanged. No UI is added. The existing no-store response header and authentication remain in force.

## How to interpret it

- MRNA absent from requested opening symbols with successful collection and no returned MRNA observation is different from a requested quote whose collection failed. The accepted factor and existing native queue membership identify whether the frozen volatility rule is relevant. Missing validated observations remain unavailable; the collector's generic fresh-quote failure does not distinguish absent versus stale raw provider data.
- CRWD's source event state identifies whether the actual capacity review used Manual/Blocked evidence and which verified coverage was retained. Source historical coverage is not described as a newly fetched current event check. No extra event verification is initiated.
- Successful quote collection is separate from a verified final plan. A later plan failure can coexist with returned quote observations. Outside the collection branch, coverage is unavailable rather than inferred from an old saved plan.
- Aggregate deferred reconciliation counts are not assigned to a ticker without explicit recorded attribution. This change does not reapply the July split, correct prices or clear any block.
- The object describes this request's server evidence. It is not a reconstruction of a previous browser's cached card state or an authorization to trade.

## Files and release freeze

Application changes are limited to `lib/c1PurchaseDiagnostics.js`, the additive request-context wiring in `lib/c1AccountExecutionView.js`, and the prepare-only opt-in in `pages/api/c1-account.js`. The freeze manifest registers exactly these affected application hashes under this explicit owner instruction. The checker, canonical integrity implementation and build/CI hooks are unchanged.

`vercel.json` adds only the exact branch `diag/c1-mrna-crwd-request-evidence-20261022` to the existing disabled-deployment map. This prevents the isolated PR push from creating an automatic preview while preserving main and the existing cron configuration. No Vercel API deployment or infrastructure mutation is performed.

## Verification

Focused regression coverage exercises the real authenticated handler and execution path with isolated storage and offline provider responses. It compares diagnostic-enabled and disabled views after removing only the new field, including unchanged collection and replay counts, account bytes and zero persistence. Cases cover both reproduced blockers, requested missing/stale quotes, unavailable observations, downstream plan failures, outside-session behavior, non-prepare operations, authentication, hostile private/sensitive fields and diagnostic projection failure.

The previous `c1-purchase-block-evidence-regression.cjs` remains a characterization of the two unresolved trading-evidence paths; this PR exposes their evidence and does not repair their trading behavior. It preserves the canonical/current volatility boundary and genuine fail-closed event/quote behavior.

Verification on October 22, 2026: normal `npm run build` passed with the release-freeze check, canonical integrity, all 111 regression scripts plus the trade simulation (112/112 tasks), and the complete Next.js production build. Focused syntax and enabled/disabled response checks passed. Independent review found no remaining blockers in the projection or request wiring. Production diagnosis still requires review and an explicitly authorized later deployment; no live ticker verdict is claimed from offline fixtures.
