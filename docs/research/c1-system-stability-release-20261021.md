# C1 system-stability release — implementation and acceptance gate

Status: investigation / NOT RELEASE-READY. Do not merge or deploy on the strength of this document alone.

## Production evidence (2026-10-21)

- Production mobile screenshots: October 20 latest completed signal session; October 21 refresh returned "Load failed" or timed out; nine missing screen rows (MRNA, CRWD, MPC, ILMN, HPE, DELL, TWLO, VEEV, HOOD); MSTR/MPC/VEEV provider verification failed.
- Vercel runtime error at `/api/cron/c1-index` on October 20: `stage=connect`, `providerRevision.stage=confirmation`, 504 unconfirmed provider revisions, 287 prior-close mismatches. Sample differences include A 169.89→169.90, ABBV 282.79→282.68. These are observations, not proof that all revisions are benign.
- Previous PR #295 (production `fe7448f`) fixed presentation-level rating/order separation but did not demonstrate healthy live refresh.

## Required work, in order

1. **Trace the live ingestion failure.** Locate the cron index, provider-revision reconciliation, live refresh API, FMP quote verification and timeout paths. Capture structured per-stage outcomes, duration, provider response status, session dates, row counts, and safe diagnostic hashes (never log provider keys or licensed raw payloads). Distinguish network/timeout failures from revision guard failures and stale fallback.
2. **Safe, append-only provider reconciliation.** For same-provider, same-symbol, same-session adjustments, preserve original observation, revised observation, provenance, timestamp and reconciliation decision. Auto-accept only when deterministic evidence validates identity, session alignment, splits/corporate actions, adjusted-vs-unadjusted semantics, and consistent data across required endpoints. Do not adopt a blanket penny tolerance, blindly accept 504 revisions, overwrite account history, or suppress unexplained mismatches. Quarantine ambiguous changes without poisoning unrelated verified symbols. Backfill and replay deterministically.
3. **Decouple signals from execution.** Persist the latest fully verified Buy/Strong Buy rating snapshot with immutable source-session date, observed-at timestamp, model version and evidence status. On provider failure, display the preserved ratings only under an explicit "Last verified — not current" label, with age and the failed-refresh reason. Never silently convert old ratings into current recommendations, invent missing rows, or fabricate orders. Watch remains the remaining candidates.
4. **Independent trading gate.** Fresh quotes, account holdings, cash, stops, opening plan, and order eligibility must be verified separately. Any missing/stale evidence blocks *new authorization* while historical ratings remain readable. Stop risk is urgent but unverified triggers cannot be represented as executable sells. Preserve append-only accounting and no automatic trades.
5. **Bounded refresh and recoverability.** Explicit deadlines, limited retries/backoff, partial-failure diagnostics, stale-state fallback and mobile-visible error state. Do not report success on partial/incomplete screen ingestion. Ensure repeated refreshes cannot duplicate events or corrupt persisted snapshots.

## Mandatory test matrix

- Provider: same-session price correction with independent corroboration; penny revision; widespread 504-revision batch; changed symbol/identity; split/corporate action; inconsistent adjusted close; missing provider endpoint; rate limit; transient 5xx; network timeout; delayed prior-session data.
- Screening: complete healthy feed; partial missing rows; cached verified snapshot on failure; timestamp and stale label; Watch/Buy separation; no rating fabricated from missing evidence; recover on next healthy session.
- Portfolio: fresh/expired quotes, failed held-position verification, stop evidence verified/unverified, broker cash stale/fresh, no orders authorized on any unsafe input, immutable fills and ledger.
- Mobile: iPhone Safari reload, slow connection, repeated tap, timeout and retry, navigation between Opportunities and Portfolio, visible last-verified timestamp, no misleading fresh state.
- Integration: cron ingestion → snapshot persistence → API refresh → mobile rendering → independent trade gate. Include provider mocks with recorded *derived* test fixtures only, not licensed raw feed redistribution.

## Release acceptance (all required)

- Every existing regression green, plus targeted provider-reconciliation, snapshot/fallback, execution-safety, and mobile integration tests.
- Demonstrated replay of October 20 failure inputs with documented reconciliation decisions and no silent loss of symbols or data history.
- Verified live index completes on current session, expected row count, and no unexplained provider-verification failures.
- Verified fallback during simulated outage: timestamped prior ratings remain visible; all purchases and unverified sells remain blocked.
- Vercel preview READY and smoke-tested on mobile; production rollout monitored for successful cron and refresh, not merely successful build.
- Explicit evidence report with GitHub run, preview deployment, production deployment, timestamps, row counts, and observed errors. If any gate fails, NO-GO.

## Guardrails

Do not change ranking formulas, sleeve rotation rules, 30-session constraints, ownership/accounting history, or make trades as part of this repair. Do not bypass FMP checks. Do not declare this release ready based only on unit tests or a successful Vercel build.
