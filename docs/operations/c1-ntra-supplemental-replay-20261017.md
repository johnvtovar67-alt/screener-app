# NTRA supplemental-evidence replay correction

Baseline: production/main `b6b074e6cce8d735fa57d231e732505a5cba034b`, deployment `dpl_GfLh6vzKRbz7iLFz5t385Y8UHUby`. Owner authorized the smallest correction, required tests, then merge/deploy if passing. AGENTS.md read. No account conversion or live record modification is authorized.

## Cause and repair

`pages/api/c1-account.js` applies `c1AccountBook` before the MRNA review. `deriveC1CompletedAccount` and `evaluateC1Account` then apply the saved supplemental coverage again. The old guard rejects any existing symbol, including the identical observation just inserted by the preceding call. The original deployed API reproduces HTTP 409 with `Supplemental observation cannot replace an accepted price: NTRA`, with zero writes.

Normal account/execution paths also apply saved coverage. Repeated identical saved coverage can hit the same guard and prevent execution-plan preparation or completed-trade entry. This diagnosis establishes the reproducible source defect; the actual private account was not accessed, so no claim is made that it contains duplicate receipts or different native NTRA prices.

Only `lib/c1AccountInput.js` application code changes. A private WeakMap records the full canonical validated observation against the exact price object that the overlay inserts. Reapplication is permitted only when both that observation and the inserted price remain exactly identical. The existing native-price collision error remains unchanged. No persisted flag can authorize a replacement. Session wrappers retain price-object provenance; serialization does not.

All existing row, date, provider, adjustment, OHLC and classification checks run before reuse. Duplicate symbols within one receipt still reject. Inherited classification is appended only for a newly inserted price, avoiding duplicate classification rows. The source book and stored receipts remain unchanged; no price, fill, cash or account journal is rewritten.

## Isolated evidence

`tools/c1-supplemental-replay-regression.cjs` uses the actual API, service and execution code with memory storage and forbidden live providers. NTRA is an actually owned renamed synthetic fixture holding, not real market/account data.

- MRNA review: HTTP 200, zero writes, original quantity/basis/date retained, proposed 5/10/5 allocation for the synthetic 20-share lot.
- Normal verified Buy: exact decision and opening-order identity against the same native-price control; actual fill, reload and completed replay reconcile once.
- Completed-trade preparation exposes the dated pending-session plan without the NTRA conflict.
- Native accepted-price collisions (even identical values), changed OHLC/volume/source/classification, unverified rows, duplicate symbols, mutated overlay prices and serialized provenance still reject.
- Repeated identical overlay and inherited classification remain stable; accepted source and saved pre-trade account records remain exact.

Evidence: [workflow](c1-ntra-replay-evidence/workflow.json), [regressions](c1-ntra-replay-evidence/regression-results.json).

Only the affected application hash and its existing compatibility source pin change. Release guard, build hooks, original production fixtures and all strategy/engine files remain unchanged. This is an input-composition repair, not an MRNA conversion or trading-policy change. Research PR #277 and HOLD PR #280 are untouched.

A genuine native/changed-price conflict intentionally remains blocked. Private account access is unavailable to the agent; deployed-account verification cannot be inferred from fixture success.

Validation: normal `npm run build` passed; **108/108 regressions, zero failures**. The required full suite was run once locally after the fix. No live records were accessed or changed.
