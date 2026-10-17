# Independent exploratory execution route review

Author: independent_control_review agent,2026-10-17. Read AGENTS.md and source research/production adapters. Scope: owner-authorized separate exploratory retrospective track only. No production/strict files edited; no historical run by reviewer.

Smallest defensible route is the corrected source-account adapter, sequentially projecting the unchanged normalized sleeve model, cash-capping full source authority, intersecting current research-screen eligibility, recording explicit hypothetical fills, and continuing exact captured-account state. Do not use createPrototypeEngine: it still inserts researchScreenAllowed before candidate queue construction and modifies account normalization. That known retired control changes replacements when an early candidate fails screening. A newly named exploratory track does not resolve this software defect.

Required causal gates:
- Completed source session and source screen only supply candidate/momentum/ranks. Same-day opening data may apply existing opening gates, not alter yesterday's ranking or compute indicators.
- Source projection's opening-only OHLC construction remains intact. Intraday OHLC are consumed only by a separate hypothetical execution rule after source decisions.
- Unconditional source order estimatedPrice already includes frozen slippage. Do not charge it again. Conditional standing-stop estimatedPrice is unimpacted stop level: daily low<=stop permits sell at min(open,stop)*(1-costBps/10000), subject to actual ownership. When timing ambiguities exist, declare deterministic conservative ordering; do not optimize intraday path.
- Full cash authority precedes screen intersection; rejected screen candidates do not free its budget for unplanned replacements. Persist full authority evidence, accept only screen-permitted order IDs/quantities, preserve each sleeve's cash/basis/whole shares independently.
- Conditional stop size must be capped to actual holdings after allowed opening fills. Planned purchases that failed screen cannot manufacture sellable shares.
- Missing/invalid prices for held assets, negative cash, unexpected source-order identity or continuation ownership/cash mismatch must abort. Never forward-fill to conceal a transition or missing outcome. No sale proceeds fund purchases until explicitly posted in the declared hypothetical profile; source cash authority already enforces this ordering.
- Adjusted-price returns and raw-price execution economics cannot be mixed without a coherent quantity/basis conversion. Source simulator requires adjusted OHLCV and only explicitly handles delisting/universe-removal actions; do not additionally credit dividends already embedded in dividend-adjusted prices. Declare adjusted-dollar hypothetical research as such.

Exploratory data may carry explicitly disclosed assumptions about fixed/reconstructed universe, current sector mappings, issuer mapping/event gaps only within the separately authorized track. Such assumptions are never historical provenance or strict qualification. Sampling current known survivors or selecting names by later data coverage creates selection bias. Record exact universe-selection rule and dropped names/dates before results, report omitted fraction/holdings failures, preserve unchanged strict study interval and gates. Do not label this exact historical Champion replay.

Current blocking defects for a defensible run: reuse of retired prequeue-filter engine; double slippage on source orders; conditional sales without actual shares; hidden carry-forward/ticker splicing; mixing adjusted versus raw economics; unrestricted dynamic selection of covered survivors without frozen manifest. Correct source adapter avoids the first defect and provides ledger enforcement; a separate reviewed deterministic hypothetical fill builder must address the rest before any exploratory performance claims.

## Initial new exploratory files inspection

Read tools/c1-exploratory/{prepare.py,compile.cjs,account-adapter.cjs,transform.cjs}. Source-account route correctly preserves cash-before-screen and captured-authority orchestration. Strict files remain separate by design; reviewer did not edit them.

Actionable checks before execution:
1. Sizing transforms introduce researchTargetPct/researchLowerPct configuration calls; runner must install them in each private sleeve option object before projection. Callback must use completed source snapshot rank, never current opening/future rank, and preserve account normalization (three sleeve books).
2. Q9 target-count substitution also raises buildC1StockScreenSnapshot minimum-candidate requirement to9; add explicit checked seam preserving source minimum3, or3–8candidate days would incorrectly fail the snapshot.
3. prepare.py target cross-view price check currently uses `if d>=start and d in nb`; require every target day in non-split reference before agreement certification. Missing dates must not skip validation.
4. Target-window action/gap exclusions are selected with ex-post information; this is acknowledged sample-selection bias. Report held-fixed conditional cohort and exclusions; never generalize its returns to full production Champion.
5. Split-adjusted prices rebased to nominal baseline are coherent only for the action-free evaluation interval. Warmup volume/dollar-volume adjustments and vendor future revisions remain separate unverified sensitivities. No dividend credit means output must be price-P&L rather than total investment return.

No exploratory performance executed by this reviewer; final runner/fill builder still requires direct inspection and synthetic verification before any execution-readiness approval.

## Runner synthetic gates

Independently authored exploratory-gates.cjs and portable/exploratory-gates.cjs. PASS at12/25/50bps: corrected strict control vs exploratory C exact source-review identity; source decisions invariant to same-day future high/low/close changes; independently computed cash/share/cost-basis ledger matches accepted source books; conditional stop/no-trigger, gap sell impact and actual-owned quantity cap. No historical executions. Evidence exploratory-portable-evidence/exploratory-gates.json. Portable script SHA256 fc9d746ebd47361840f6a388e0035210215fee61c6f6b37d088f8fd322226aac.

Runner review notes: hardcoded14:30Z is actual09:30EST but10:30EDT. For next-opening execution assumptions, derive actual Eastern09:30, or label timestamps explicitly bookkeeping proxies. Frozen transform callback and source rank coverage must remain fail-closed for unavailable queue ranks. This gate does not independently verify every challenger behavior or certify the conditional cohort's provenance.

Reviewed runner SHA256 b544c626feca85da41da674015bf2fa6a2d55bfcc876aa0fa7c915d0dd7c0bc7; transform580199cd44d586582b29b30b3a375378444e2329dd9a73ff5bd9d1f1dffc36de; exploratory adapterd138abf1046d2efcc91184144a67ad10e48c954084e52589e0f963b6ac859420. Scope approved: documented synthetic execution/accounting boundaries only. Strict dataset qualification remains0 approved by this reviewer; exploratory assumptions are not validation evidence.
