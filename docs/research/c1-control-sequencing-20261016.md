# Research control repair — execution remains blocked

Production/main is `0a65e20964ae080b8718332e5f6f16daa6def452`; Vercel production alias resolves to `dpl_3PZuSSmiKDZ6hNY3fg67ciVHT9Rg` at that commit. PR #277 remains draft. No application, account, strategy, release-freeze manifest, workflow, merge or deployment changes are included in this update.

| Gate | Status | Reproducible evidence |
|---|---|---|
| Demonstrated adapter sequencing defect | PASS, repaired in replacement control API | `node tools/c1-research/control-parity-test.cjs`; `docs/research/c1-control-sequencing-parity-20261016.json`: 795 assertions, 13 synthetic differential scenarios |
| Overall historical control parity approval | BLOCKED | Current source opening/screen/cash/ledger orchestration matches the oracle cases; no independent approval, full-window October activation review, 25/50bps execution-path proof, or qualified retrospective execution profile exists |
| Historical input qualification | BLOCKED | `docs/research/c1-recovery-tranche-20261016.json`, hash-verified source receipts; raw data remain private |
| Control-only execution readiness | BLOCKED | Separate `control-only.cjs` gate exists; qualified inputs, immutable audited execution profile, and full-window policy activation evidence are absent. No historical execution occurred |

## Repair and differential scope

The old adapter filtered signals before queue formation, allowing a screen-blocked AAA to be replaced by an unplanned DDD. The replacement `control-adapter.cjs` calls unchanged `planC1ActualAccountOpening` / `planC1ContinuedAccountOpening`, preserving the normalized 100k model units, 25/50/25 conversion and source whole-share rounding. It subsequently intersects projected buys with `resolveC1ScreenEvidence.buySymbols`, never creating or reranking orders. Existing sales and conditional stops survive screen rejection. `capC1ExecutionCash` then applies the unchanged source cash overlay. Explicit hypothetical fills go through source reconciliation and continuation; projections do not become ownership.

The old direct-dollar C engine is retired from `createEngine`. Its prototype remains only as explicitly synthetic test scaffolding and the original defect counterexample. `run.cjs run` fails closed before the legacy matrix. No challenger parameter changed. The original preregistration and study specification are retained byte-for-byte; a separately hashed technical amendment records this authorized repair before results.

The 13 cases cover clear entries, event blocks/no backfill, sector and issuer exclusions, nonintegral normalized quantities/whole account shares, incomplete screens, zero cash, multi-session momentum exits/recovery, opening gap-stop priority, intraday stop execution, exits with zero cash, sleeve breaker/cooldown continuation, and partial fills/fees. Oracle and adapter use separate loaders. The oracle calls unchanged production functions directly and independently applies the component's screen intersection and source cash cap. Full raw projection, screen evidence, ordered permitted plans, decisions including IDs, reconciled books and continued risk/account state must match exactly. Inputs/adoption remain immutable. Duplicate fills are idempotent; conflicting duplicates fail.

Differential numeric tolerance is **zero** in these deterministic cases. Existing source ledger invariants remain $0.000001 for cash and 0.0000001 share for whole-share validation; they are not relaxed. These tests establish orchestration equivalence for the listed synthetic cases, not an independently approved historical replay or exhaustive browser/server quote-authority parity. No synthetic returns are presented.

## New acquisition and precise qualification failures

Authorized FMP access succeeded through the inherited managed proxy, supported executor network permission, and existing secret binding. No credentials were exposed or alternate security route used. This update obtained **43 responses / 6,117,129 bytes**, verified every body against its receipt SHA-256, and retained raw bodies outside Git. Existing private recovery comprises 273 original responses with hashes matched to sealed journals; it is not newly qualified history.

Nine previously unacquired names were attempted: ANSS, AVB, BF.B, BK, BRK.B, CBRE, CCI, CCL, CDNS, using all three FMP price views over 2021-11-01–2026-10-15. Dotted BF.B/BRK.B returned empty; current BF-B/BRK-B profiles and all three hyphenated price views were separately recovered. Those aliases have 1,244 bars but still need dated identity corroboration. ANSS ends 2025-07-17, AVB ends 2026-08-24 and BK ends 2026-05-21: continuity/delisting evidence is required, not imputation. CBRE/CCI/CCL/CDNS cover the requested bar interval; completeness alone does not certify vintage, liquidity units, or membership.

LEN/MRP/WDC/SNDK splits/dividends were recovered. FMP reports LEN's 2025-01-21 factor 1033/1000 and WDC's 2025-02-24 factor 1323/1000. These vendor adjustments do not establish a complete spin-off ledger, original availability or temporary index membership. Empty MRP/SNDK split lists do not prove no corporate events.

The old conditional 505-name Q1 union still has 414 names without acquired price requests after these nine attempts; none of the newly attempted names is declared cleared. The old 81-cleared count is a subset and is not accepted as a complete universe. The sealed stage1 disposition still has 1,521 unverified facts and 192 continuity gaps. Complete dated membership/security actions (including LEN/MRP and WDC/SNDK), sector continuity, issuer continuity, events/fundamentals, point-in-time adjustment vintages, delisting outcomes, entitlement and independent corroboration remain unresolved. BDX retains 316 volume-unit failures at the original tolerance. The original 2023-12-29–2025-04-03 acquisition interval does not cover the frozen 2023-01-04–2026-10-15 study; Nasdaq coverage also remains incomplete.

Private evidence locations (not committed):

- `/workspace/work/c1-control-validation/recovered/`: original response bodies, sealed journals, inventories and `validated-recovery-summary.json`.
- `/workspace/work/c1-control-validation/next-tranche-20261016/`: immutable request plan, 35 receipts, raw bodies and summary.
- `/workspace/work/c1-control-validation/alias-evidence-20261016/`: immutable alias request plan, eight receipts, profiles/prices and summary.

## Explicit control command and remaining work

```sh
node tools/c1-research/control-only.cjs validate MANIFEST PROFILE
node tools/c1-research/control-only.cjs freeze MANIFEST PROFILE NEW_LOCK
node tools/c1-research/control-only.cjs run MANIFEST PROFILE LOCK NEW_OUTPUT
```

This is an explicit control-only decision/accounting audit command, never a matrix or a claim of a completed performance runner. It requires qualified data, an independently reviewed hypothetical execution profile and a pre-execution hash lock. Current production's date gate is preserved, so the frozen historical interval is additionally blocked until the separately proposed retrospective October activation has parity evidence. Only the current-source 12bps execution audit profile is supported; 25/50bps parity remains unfinished. The command creates no fills, authorizations, reviewer approvals or performance claims. A/B/C and queue-nine candidates remain frozen, unapproved and unexecuted.

No infrastructure permission is currently needed. The remaining external evidence action is an entitled, dated full-universe membership/classification/security-action/event export with original-availability provenance; FMP current profiles and adjusted bars cannot replace it. Engineering still needs independent review of the replacement boundary and qualified full-window execution/cost activation. No owner decision on strategy or live account changes is requested. Any decision to shorten the interval or waive provenance would change the study specification and is not assumed. Historical execution awaits the required evidence and explicit approval.
