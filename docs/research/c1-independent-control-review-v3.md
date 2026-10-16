# Independent research control review

Author: independent_control_review, separate review agent authorized by owner. Reviewed production commit 0a65e20964ae080b8718332e5f6f16daa6def452 and research worktree /workspace/work/c1-program. No production/account edits or historical executions.

## Initial findings

FAIL — screen/cash sequencing. Production caps the source opening plan in lib/c1AccountExecutionView.js before C1AccountOpportunities intersects current screen ratings. The research adapter filtered before cash authority. Reproducer review.cjs and cash-screen-counterexample.json show source-visible BBB17 versus adapter BBB80/CCC17 with10000cash and event-blockedAAA. The795 existing assertions pass because their oracle copied the same wrong sequence. Full authority must remain separate from screen-eligible fills; blocking a candidate must not release its authority budget implicitly.

PASS, limited — unchanged source projection and normalized whole-share ledger use. Existing synthetic differential suite passed795 assertions. This proves the tested component orchestration only; it is insufficient for overall independent approval.

BLOCKED — October current-policy retrospective activation and25/50bps execution parity pending implementation and independent rerun. Source gate is2026-10-14 and applies both account simulator and screen. A retrospective research seam must activate both across unchanged study dates while preserving date/session validation. Cost seam must affect all3 sleeves' slippageBps, preserve commission and avoid charging costs again on explicit recorded fill replay.

BLOCKED, explicitly excluded operational boundary — currentStopCapitalReview, broker/provider receipt/membership rechecks, stale quote and manual10minute authority validation. Hypothetical profile must not be represented as recovered actual execution authority. Production buildC1ManualRecommendations requires providerVerified/sourceReceipt, valid verified basis, membershipCheckedTwice, quoteValidUntil and matching decision source. Adapter currently directly projects and reconciles hypothetical fills. The historical control may only claim source policy/accounting consistency under a separately declared execution profile.

Missing test strength: cooldown case records38 cooldown observations but resumedBuys0; it does not establish expiry/re-entry. Record evidence needs full cash-authority plan while accepted buys must match eligible subset and quantities; direct ledger validation alone only checks plan economics.

Dataset qualification remains independently unapproved. Review does not certify historical data or authorize any performance run.

## Repaired adapter review

PASS — repaired cash-before-screen component sequencing. Re-executed review.cjs against revised adapter: exact BBB17 and noCCC for constrained-cash/event case. Unauthorized blocked-symbol and oversized eligible fills are rejected before ledger reconciliation. cash-screen-repaired.json records the repaired comparison. Original failing output was BBB80/CCC17; latest cash-screen-counterexample.json is rerun output, not archived original failure.

PASS — explicit October current-policy research activation and12/25/50bps source-cost component parity. Own independently constructed policy-cost-review.cjs uses production loader without source transforms, replaces the exported private-module applicability predicate with market-session eligibility before imports, and mutates only private exported slippageBps options. Repaired adapter instead uses checked source seams. Tested preactivation baseline2025-11-18 and5subsequent synthetic sessions per cost,3sales each, with explicit0.01fill fee. Exact equality of rawplan, cash-authority plan, allowed order subset, ledger reconciliation, captured authority evidence and multi-session continuation passes. Report policy-cost-review.json. No tolerance relaxation or decimal rounding; source invariants remain1e-6cash/1e-7whole-share.

This is independent approval only of the described synthetic policy/source orchestration boundaries, not complete production operational execution parity, statistical results, point-in-time dataset certification, or authorization to run historical research. Live receipt/freshness/intraday overlays remain outside scope; the historical control must carry a clear retrospective-hypothetical execution profile and cannot claim recovered actual manual decisions. Data qualification and independently verified provenance remain mandatory before historical execution.

PASS — control-only profile temporal rejection tests. profile-temporal-review.cjs verifies aligned hypothetical profile accepted and rejects future decision availability, wrong Eastern session, preopen observation, not-yet-closed session, nonhypothetical fills, unapproved cost and missing explicit current-policy mode (8cases). This tests qualification function only, not historical execution or complete data qualification. CLI's explicit single-control arm/cost/mode and hash-bound lock preserve no implicit challenger invocation.

Remaining execution-profile review requirements: hypothetical fill selection and stop-trigger/cost application must be independently justified from qualified price observations; the source ledger intentionally accepts explicit fill economics and does not itself prove a stop was triggered or that supplied hypothetical price matches frozen cost assumptions. This review does not approve any actual profile or dataset.

Reviewed final file SHA256:
- tools/c1-research/control-adapter.cjs: c17502011b0a4aac1a155b36e9fbf581ff8a0b937a195a3338c3796c4d0c4bd2
- tools/c1-research/control-only.cjs: 0ab5e50ee87f8874c193407cf810bd95ab64fc081366354e7f5cb52c29b2a569

Final disposition: PASS for specified corrected synthetic source-policy/accounting, retrospective activation, costs and control-profile temporal boundaries. BLOCKED for complete historical control execution until full dated data and a reviewed deterministic hypothetical fill profile pass. No production or live account state changed by this reviewer; all reviewer files are in the separate review directory.

## Portable reviewer test artifacts

Prepared portable/*.cjs for eventual tools/c1-research/independent-review/ placement. Root is C1_RESEARCH_ROOT or path.resolve(__dirname,'../../..'); output directory is explicit argv[2], C1_REVIEW_OUTPUT_DIR, or a new temporary directory. Output writes refuse overwrites. Existing production regression fixtures require cwd=root; scripts set their own process cwd accordingly. Added explicit exact serialized identity assertion to cash-screen test to exclude irrelevant VM prototype identities while preserving all values/order. All tests rerun successfully with C1_RESEARCH_ROOT=/workspace/work/c1-program and output directory portable-evidence-v3. Earlier v1/v2 attempt directories retain failed adaptation attempts; only v3 is the successful portable verification. No network or historical runs.

Portable SHA256:
- review.cjs:08a8efee69bdc2717ec9efb649658b5da423f455ccf412f821c92a42a907b94b
- policy-cost-review.cjs:b2d6db9600f4e1e119fe888b2cc495e40874482d275c9d5c07b4be3674008538
- profile-temporal-review.cjs:e1d7e179e3a4650d8e0608d5aa280a63edc54681b6c5001bf88c0258c792cf05
