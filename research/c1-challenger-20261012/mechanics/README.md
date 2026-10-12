The options-only research wrapper is implemented and its synthetic mechanics checks pass. It executes the recovered immutable audit source at commit `006e067697385143684c7417b18bc7909c2d217e`; it does not establish parity with a different deployed commit. Historical execution remains blocked by missing private inputs and the separate deployed-versus-audit provenance check.

`options-loader.cjs` verifies every source-snapshot hash, preloads `C1_FROZEN_OPTIONS`, then applies the selected preregistered export overrides before importing account modules. The seed validator, projection and continuation consequently share the same options. Source expressions, the snapshot and production files remain unchanged. Every nonempty overlay records its experiment ID, exact sleeve changes and experiment-manifest hash in the result source identity.

Supported families are per-sleeve slots, dollar sector caps, sector position limits, entry queue depth, ADV, initial stops and sleeve breakers. Champion has an empty overlay. Compiler sensitivity, ordinary rank hysteresis/confirmation, early/profit exit alternatives and new regime-scaling state remain unimplemented. The wrapper rejects them. This inventory describes software readiness, not historical results or finalist selection.

Reproduce the synthetic verification from the program directory:

```sh
node mechanics/options-mechanics-regression.cjs
```

The report is `mechanics/options-mechanics-results.json`. Three demanding no-op replays match the complete original outputs at 12/25/50 bps, including source identities, traces and cache statistics. Eighteen declared configurations, including Champion, match cached, cache-disabled and literal source execution with the same options on synthetic inputs. These checks are software mechanics only; historical comparisons run is zero.

The tests establish several boundaries relevant to later research:

- The core account simulator removes already-held symbols before truncating the entry queue. On a constructed input containing 24 names, depths 6/9/12/15 therefore count unheld qualified candidates. The separate operational first-nine selected-sector/max-three Buy verification remains absent from this conditional replay.
- ADV compares the observed source dollar volume against the selected floor and retains `liquidityPass`. The current compiler's base liquidity flag uses a $10m floor, below every planned $200m+ experiment. False or missing evidence stays blocking; no flag is invented.
- Slots remain independent per sleeve and do not equal combined unique issuer exposure. The 2/4/5 alternatives preserve the current 99% target through 0.99/N and retain position maxima 1/N. Existing sector caps, two-name sector count, model $750 minimum trade and two-stage whole-share flooring still bind. With all toy candidates in one sector, the two-slot alternative fills one position per sleeve; four/five-slot alternatives fill at most two. These constructed observations are not performance evidence.
- A $1,000 toy account with an $82.30 stock crosses a rounding boundary: 12 bps buys twelve combined shares, while 25/50 bps buy three. Costs therefore change affordability and portfolio state inside the source path. Additional cost cannot be subtracted from a fixed ledger.
- The 12% stop and 10% breaker trigger in constructed scenarios where the 14/16% stops and 12/14% breakers do not. Original 10/15/10 cooldowns remain intact. The all-cash historical evaluation starts with no inherited positions; the source's fixed 14% inherited-position seed stop is not generalized by this wrapper.

Use `makeOptionsLoaderFactory(experimentId)` with the exported original `replayPolicy`, an explicit verified snapshot root and restored accepted inputs when the readiness gates permit historical execution. This module deliberately provides no long-running CLI or candidate-selection procedure. No winning Challenger has been implemented or recommended.
