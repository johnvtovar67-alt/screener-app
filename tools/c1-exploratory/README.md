# Exploratory retrospective C1 track

Owner-authorized separate research track in draft PR #277. Nothing here authorizes trading, a production release or strict historical qualification. Application imports do not reference this directory. Strict tools/specifications/gates under `tools/c1-research/` remain unchanged. Never use the retired prototype engine for the control.

`spec.json` fixes the conditional cohort/window, assumptions, twelve arms, costs, sensitivities and decision labels. The pilot is source-policy price-P&L on a conditional historical panel, **not exact historical production decision replay or verified total investment return**. Membership/sector continuity, unknown events, original-vintage adjustments, dividends and vendor volume units remain limitations.

Commands are offline after the authorized acquisition. Raw/licensed inputs remain private. Set `DATA` and `EVIDENCE` to dedicated research directories; never point them at account/application storage.

```sh
python3 tools/c1-exploratory/prepare.py "$EVIDENCE" "$DATA"
node tools/c1-exploratory/compile.cjs "$DATA"
# Supply the recovered current sector proxy map separately for the declared sensitivity.
C1_RESEARCH_ROOT="$PWD" node tools/c1-exploratory/independent-gates.cjs "$DATA/gates"
node tools/c1-exploratory/causal-check.cjs "$DATA"
node tools/c1-exploratory/run.cjs reference "$DATA"
node tools/c1-exploratory/run.cjs freeze "$DATA"
node --max-old-space-size=6144 tools/c1-exploratory/run.cjs control "$DATA"
# Separate, explicit action, only after the control passes:
node --max-old-space-size=6144 tools/c1-exploratory/run.cjs matrix "$DATA"
node --max-old-space-size=6144 tools/c1-exploratory/run.cjs report "$DATA"
```

The current-sector map is symbol→sector from the SHA-verified current FMP sp500/nasdaq responses in `metadata-20261016-v1`. It is a named sensitivity proxy, never historical evidence. Missing current labels retain the dated baseline labels. The map itself is hashed in the run freeze.

The freeze binds code/specification, raw panel, compiled signals, receipt manifest and gate evidence before historical evaluation. Any missing rank, source mismatch, negative cash, fractional/oversold ownership, missing held quote or failed continuation aborts. Completed run files use exclusive creation and resume from existing immutable results. Control never invokes the challenger matrix. Each result retains source-order IDs, allowed orders, explicit hypothetical fills, source continuation state and independent daily accounting assertions.

Source projection already prices unconditional fills with cost. Standing-stop fills add sell cost once to the known stop, clip actual ownership and use the daily low only after opening decisions are fixed. Price gaps receive the worse open. Opening timestamps follow Eastern DST in the fixed pilot window; conditional intraday timestamps are bookkeeping assumptions, not observed intraday evidence. Proposed sales cannot replenish the opening purchase funding cap.

Every sleeve retains normalized source policy and independent actual-dollar cash, cost basis and integer ownership. Starting hypothetical books are25k/50k/25k; there are no MSTR holdings, historical-account records or transfers. Challenger sizing functions apply to each sleeve separately, so aggregate C1 equity is never silently substituted for an accounting book.

Short-period CAGR/Sharpe and paired bootstrap intervals are diagnostics. Block bootstrap cannot repair ex-post cohort selection, a single market regime, unknown event coverage or price-basis revisions. Opportunity diagnostics are descriptive overlapping observations; they do not establish an executable forgone profit.

Technical amendment v2 fixes normal out-of-nine shadow candidates with a named postqueue entry guard; source exit rankings stay complete. It also indexes immutable rows and memoizes the pure six-close momentum-input calculator only for deeply frozen JSON windows. Position/exit/confirmation state is always recomputed. All original validation executes for new or mutable inputs. Independent equivalence includes duplicate rows, stale/availability changes, output mutation, six-window identity, cycles and getters. No strategy parameter was selected from a return. The unfinished slow control produced no result file and was stopped before the v2 freeze.

The v3 technical amendment memoizes unchanged pure eligibility/context calculators and verifies the entire63session C12 run against a separately frozen pre-calculator-cache source reference. `reference` supports rebuilding that oracle from the same panel; it never runs challengers or reports return metrics. All59 eligibility configuration dependencies and the helper body are checked, and mutable/exotic/nonfinite cases retain the original path as required by the focused independent tests. The canonical CI discovers the added root synthetic regression command; no workflow or strict gate changes.
