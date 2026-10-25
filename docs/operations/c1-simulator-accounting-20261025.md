# Simulator phase extraction — local evidence

State: **locally verified**. Release/CI/preview/production gates belong to root and are not claimed here.

Owner instruction explicitly authorizes simulator phase extraction under complete behavioral/golden parity. The chosen bounded phase is result accounting, not ranking, queue generation, allocation, fills, stop decisions or exits.

- `lib/c1AccountSimulator.js` delegates its existing metrics closure through new referenced `lib/c1SimulatorAccounting.js`.
- The complete 264-line `roundTripDiagnostics` / `benchmarkAttribution` / `metricsFromCurve` block is byte-identical (`sha256:53221eb0d59e1273e8fc0f7ae2f85135c841f067640c0655ca2417749f18d5d1`). A pure factory receives the engine's existing number/optionalNumber/clamp/round/average/standardDeviation helpers and stop-reason set, retaining the original closure semantics without copying numeric primitives.
- This is an incremental phase extraction. The recent-momentum live engine still has its inline accounting; no claim all simulator duplication is consolidated.
- The account generator applies the extraction only after its existing policy, funding and historical pins. The challenger generator restores this extraction before its unchanged canonical SHA check, preserving the challenger output byte-for-byte.
- `tools/c1-simulator-accounting-extraction.cjs` enforces exact wrapper/body seams and reconstructs the pre-extraction canonical engine at its original `63b1909359361e35ae7d0c2e833fecbb043013f7b337f9f2c96dc0a3adb2f31e` SHA. Existing source-reversal tests call this restoration before their original pinned assertions; no pinned expected hash changed. UI owner handled the shared trading-workflow test line.
- Frozen simulator, legacy simulator, existing challenger simulator, immutable accounting/source fixtures, all comparison oracles and their expected hashes remain unchanged.

Verification:

- `node tools/c1-simulator-accounting-regression.cjs` PASS: 162 complete phase objects,21 complete canonical simulator golden objects,63 complete chronological slices, input immutability and zero network. Full output comparisons include config, metrics, curves, both benchmarks and attribution, exposure/fallback/clamping, trade P&L, holding durations, stops, position/cash/queue, rank diagnostics and actual partial-sale/unfilled paths across all3 sleeves. Source reconstruction and unchanged oracle pins are enforced.
- Both simulator generator `--check` commands PASS.
- Existing non-cash adoption, additional-capacity and brokerage-rule-parity regression scripts PASS with the original source pins.
- `git diff --check` PASS.
- Running the existing account-seed regression encountered `child_process.execFileSync` EPERM from the execution environment even though its child generator reported status0. No regression assertion or subprocess wrapper was removed/changed. Root owns normal full-suite execution and resolution.

No research runner/experiment, live account/provider/Blob call, new platform, cron/config/auth change, trading policy, execution or account-history write was performed. No speedup, production acceptance or actual account/brokerage parity is inferred from synthetic evidence.

Remaining simulator phase debt is not a blocker for this authorized slice: ranking, queue construction, fills and exits remain in their existing engines and are preserved rather than represented as extracted. Further phase extraction can be proposed independently under the same preservation condition; this release does not claim those larger phases complete.
