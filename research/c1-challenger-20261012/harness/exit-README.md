# Research momentum-exit seam

`exit-overlay.cjs` implements the existing frozen exit experiments inside the selected source-pinned account-policy engine. It changes no immutable snapshot or application file and uses no alternate trade walker.

API: `buildExitOverlay(experiment)` returns `transform(relativePath, source)`, `optionPatches`, and metadata. The central `research-loader.cjs` verifies the selected baseline, applies text transforms in memory before the original cache/state adapter, and preloads patched shared exports before seed/projection/continuation consumers load them. Final Challenger comparisons select `production-equivalent`; the saved `audit-historical` reference remains a separate identity.

Supported families are ordinary confirmation/hysteresis, early confirmation/rank, profit activation/confirmation, and large gain plus rank deterioration. Existing early/profit options modify only `C1_ACCOUNT_MOMENTUM_EXIT_POLICY`; their existing age domains, position counters, counter-reset conditions and pending-exit priority remain source code. Ordinary hysteresis changes only the existing ranked exit buffer. Ordinary confirmation uses one strict, unique source seam to replace the ordinary rank predicate with a completed-session position counter. This field is retained naturally by the original position-object snapshots and cleared whenever the original ordinary age/rank condition is false. The source minimum age remains 30 and threshold remains Top6 for that family.

Champion and an explicit ordinary one-session no-op return byte-identical source, no export patches and no additional position state. Unknown/non-exit families return an inactive identity overlay for central composition; unsupported values or additional exit/risk keys are rejected. Changed, missing, duplicate or already-applied source seams fail closed.

Hard stops, universe-removal exits, sleeve breakers, cooldowns, allocation, cash, whole-share mapping, costs, corporate actions and the source ordinary/profit/early exit priority remain unchanged. Large-gain variants weaken the existing early-profit predicate and preserve early Top9/3 and ordinary age-30 Top6/1; the implemented alternatives do not create lifetime winner protection.

Run static/source checks:

```sh
node research/c1-challenger-20261012/harness/exit-regression.cjs --unit-only
```

Run the complete invented-session mechanics check:

```sh
node research/c1-challenger-20261012/harness/exit-regression.cjs
```

The latter checks complete Champion economic/trace/source-graph parity at 12/25/50 bps; source confirmation reset and activation boundaries; next-open timing; transition into age 30; rank-deterioration and current-profit requirements; unchanged intraday/gap stops, universe removal and breaker/cooldown state; and complete cached/uncached confirmation paths at every cost. It also checks the new ordinary counter appears in the source position trace before its queued exit.

`exit-fixtures.cjs` contains invented sessions, prices and normalized synthetic model opening balances only. `exit-unit-results.json` and `exit-mechanics-results.json` are software verification receipts, not historical Challenger results, finalists, return comparisons, forward evidence or alpha certification. No proprietary historical input is needed or contained in these files. The experiment grid is not edited by these checks.
