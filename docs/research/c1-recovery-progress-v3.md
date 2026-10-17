# C1 research recovery v3 — acquisition completed; historical control still blocked

Production/main remains `0a65e20964ae080b8718332e5f6f16daa6def452`, production deployment `dpl_3PZuSSmiKDZ6hNY3fg67ciVHT9Rg`. This update belongs only to draft PR #277. No application, live account, original fill, cost basis, sizing, entry/exit rule, allocation book, brokerage-cash rule, CI workflow or deployment configuration changed. No historical portfolio performance or challenger comparison was run.

## Completed acquisition and qualification measurement

The previous “414 remaining” count double-counted BF.B/BRK.B and their vendor aliases. Rebuilding the request set found **416**, all processed in24 sealed batches: **1,248/1,248** nonempty three-view price responses,287,461,113 bytes, zero request failures. All responses and immutable receipts were reverified on a network-free resumption.

A second12-batch tranche completed633/633 nonempty requests for211 vendor symbols: older short-window names, additional S&P/Nasdaq membership-discovery candidates and benchmarks. A dated symbol-change closure added43 more request candidates;129 responses contained99 nonempty and30 empty views. The three invalid provider strings containing spaces were retained as unresolved reference records rather than guessed into valid symbols. No alias was silently treated as an issuer or a second investment opportunity.

This owner instruction produced **2,442 responses /646,952,156 bytes**, including2,010 price requests and432 reference-data requests. The cumulative new-program audit, including43 responses from the prior turn, covers **2,485 responses /653,069,285 bytes**. Every body and receipt was checked by SHA256. All raw/licensed inputs remain private outside Git.

There are681 requested vendor symbol strings and2,043 price views, including12 symbols with empty views and2,007 nonempty views for669 vendor strings.1,713 views cover all1,244 expected warmup/target source-calendar sessions. These are download/schema figures, **not qualification percentages or counts of distinct historical securities**. Missing pre-IPO or post-delisting dates cannot be classified without dated identity and outcome evidence.

The all-standards unit is a complete **universe-decision-session packet**: every required member, sector/issuer fact, corporate action, event, price unit, original-availability fact and independent review needed by the control on that session. The unchanged source calendar has949 target sessions for each of two universes,2023-01-04–2026-10-15. **0/1,898 packets (0.0%) currently meet every qualification requirement.** Complete historical sector/action and publication-vintage coverage remains absent for both universes. A security-session percentage is deliberately undefined because the complete historical membership denominator is not certified. No505-name or81-cleared subset is accepted as the full universe.

Machine evidence: `c1-acquisition-qualification-v3.json` records per-tranche counts, receipt-index hashes and the private full-audit hash; `c1-price-history-exceptions-v3.json` lists every requested full-view exception without inventing a correction. Bar numeric/OHLC, duplicate-date and source-calendar checks passed for the received nonempty views; these checks cannot certify as-of adjustment or reference facts.

## What the authorized sources actually provide

| Required evidence | Recovered source | What it establishes / what remains |
|---|---|---|
| Membership | FMP stable historical-sp500-constituent(1,531 records), historical-nasdaq-constituent(452); current503/101 anchors; preserved private SEC/public snapshot joins | Dated provider change claims and discovery candidates. Does not certify a closed complete action ledger, original publication availability or temporary-line treatment. Current sectors are not historical facts. |
| Sector | Preserved private2024-12-27 public snapshot and prior qualification artifacts | A dated anchor and documented gaps, not full2021–2026 GICS continuity. Current FMP sector/subSector values were not substituted or remapped into historical facts. |
| Issuer/ticker | FMP symbol-change limit10000 returned5,517 records; current CIK profiles plus dated SEC filing-index responses | More dated change claims and CIK corroboration. Page1/2/3 had returned the identical1,000-record body; raising the supported limit recovered older records. Filing accepted dates do not prove the vendor's normalized ticker was originally present in the filing. Historical security/venue/issuer intervals still need corroboration. |
| Corporate actions | Splits/dividends, six yearly split calendars, LEN/MRP/WDC/SNDK and BDX targeted records | Provider adjustment events and some declaration/payment dates. An adjustment labeled stock-split does not prove legal share-entitlement treatment for a distribution/spin-off. No unsupported share multiplier was applied. |
| Delistings | FMP delisted-companies pages0–150, traversed through2021-10-25 | Dated provider claims covering the requested discovery window, not certified merger settlement, halt/OTC execution or atomic historical membership. Future-dated rows were not used as historical facts. |
| Events | Six yearly earnings/dividend calendars plus240 narrower-window requests | Actual/provider event observations and revision fields.4,000-row truncation persisted in179 partition requests, with238 pending subdivisions at the predeclared cap. No complete event calendar or original scheduled-announcement availability is claimed. `lastUpdated` is not first-publication time. |

Reference provenance remains available in the private immutable receipts under `/workspace/work/c1-control-validation/`. The old273-response recovery remains separately preserved against its sealed journals and was not relabeled as qualified production history.

## BDX and incomplete histories

BDX's new provider action is159/125 on2026-02-10. Across all316 original Q1 observations, `nominal_volume = ROUND_HALF_UP(full_volume /1.272,2)` reproduces the reported field exactly. Full volume is integer on316 dates; nominal volume is fractional on257. The unrounded residual still exceeds the unchanged0.00001-share tolerance on257 dates, maximum0.004465408805031446541 share. The earlier price-ratio inference had failed316 dates.

**The numerical cause is reproduced; BDX remains unqualified.** Native traded-share volume and the vendor's treatment of a non-stock-split distribution need provider/exchange corroboration. No tolerance was enlarged,2026 action inserted into2025 decision evidence, or1.272 ownership multiplier applied. Reproduce with `python3 tools/c1-research/diagnose-bdx.py PRIVATE_EVIDENCE_ROOT`; see `c1-bdx-volume-diagnosis-v3.json`.

ANSS prices end2025-07-17, matching FMP's delisting date; merger/settlement economics remain unverified. BK ends2026-05-21, matching a BK→BNY change claim; profiles and both dated filing-index queries agree on CIK0001390777. BNY has a full backfilled series, but that is not authority to replace old ticker observations or combine histories. AVB's2026-08-17 delisting claim conflicts with a price tail through2026-08-24 and needs venue/action clarification. The retrieved profile is inactive. Ten queried when-issued aliases returned empty; absence of returned bars is not proof of no index membership, trading, entitlement or eligibility.

## Independent control review and source parity

The owner-authorized separate review agent found a second genuine defect: production caps the **full projection before** the component intersects permitted stock-screen buys. The former research adapter screened first and could release a rejected candidate's cash budget. With blocked AAA and$10,000 funding, production allowed only BBB17; the old adapter incorrectly allowed BBB80 plus CCC17.

The repaired adapter now preserves the full cash-capped `authorityPlan`, derives screen-permitted buys afterward, rejects hypothetical fills outside that permitted subset, and persists the full source authority as execution evidence. Source reconciliation/continuation retains independent books and actual recorded economics; rejected projections never become ownership or cash. No production code was altered.

The explicit research-only `retrospective-current` mode activates the existing October policy throughout the frozen research interval; it is not a claim of historical deployment. Cost12/25/50 changes only the three private option objects' slippage settings. Independent tests use a separately constructed always-active exported source predicate and separately mutated oracle options, not the adapter's source-text transformations. Exact projection, authority, IDs, sequence, integer shares, explicit fills/fees, decisions and continued books/risk state match. Source cash/whole-share invariants retain their original tolerances.

The independent review passes the documented component boundary and eight profile time/configuration checks. It does **not** approve historical inputs, live quote/provider/membership receipt authority, intraday stop-capital overlays, or an unreviewed hypothetical fill-selection policy. The complete review, portable scripts and evidence are in `c1-independent-control-review-v3.md`, `tools/c1-research/independent-review/` and companion JSON files. A/B/C and queue-nine proposals remain unapproved and unexecuted.

`control-only.cjs` binds the explicit mode/cost, decision-input availability, hypothetical-fill label, session clocks, data/profile/code hashes and separate independent reviews. It never launches a challenger matrix. Its data gate still rejects the current evidence. The source ledger accepting an explicit hypothetical fill does not prove that the fill's trigger, price or timing matches the frozen execution model; that profile still needs independent justification before any run.

## Reproducible commands and remaining blocker

```sh
python3 tools/c1-research/acquire-cohort.py PRIVATE_EVIDENCE_ROOT --verify-only
python3 tools/c1-research/acquire-cohort.py PRIVATE_EVIDENCE_ROOT --phase extension --verify-only
python3 tools/c1-research/acquire-cohort.py PRIVATE_EVIDENCE_ROOT --phase aliases --verify-only
python3 tools/c1-research/audit-acquisition.py PRIVATE_EVIDENCE_ROOT
node tools/c1-research/control-parity-test.cjs --full-policy-cost
node tools/c1-research/control-only.cjs validate QUALIFIED_MANIFEST HYPOTHETICAL_PROFILE
```

Price resumption verifies all2,010 newly acquired price responses without network requests; reference-data verification also passed. The reusable tools preserve inherited proxy/TLS/credential handling, reject hash mismatches, use explicit bounded plans and seal new writes atomically. The original specification, dates, strategy parameters, preregistration and prior technical amendment remain unchanged; technical amendment v3 records this authorized repair and recovery before any historical results.

**A defensible historical control run is still not possible.** The remaining external evidence requirement is a dated, entitlement-backed historical reference packet covering both universes: complete membership/security and GICS/issuer/action continuity with original availability, plus independently corroborated event timing, volume/share units and delisting economics. Existing authorized FMP/current reference responses and the recovered private anchors do not contain those missing facts. Additional downloads of the same current classifications cannot supply them. No network/infrastructure repair is currently required; no scope/date waiver is assumed or requested.
