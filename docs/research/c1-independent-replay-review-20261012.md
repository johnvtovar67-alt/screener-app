# Independent review of the recreated C1 continuation

The owner authorized recreation of the missing continuation on an isolated audit branch, without strategy optimization, merge, deployment, or account changes. The recreated application repairs are committed as `d6ec96c`, based on `9097e89`. This review addresses implementation parity and input construction; synthetic checks do not establish historical alpha.

The production account universe is S&P 500. `c1AccountService` rejects account adoption, evaluation, and continuation with a different book universe; `c1DatedBookStore` binds the production record to S&P 500; and `c1IndexLifecycle` explicitly collects `universe: 'sp500'`. The 24 recovered S&P 500 chunks therefore match the current production universe. Preserved Nasdaq figures remain historical context, without a new Nasdaq production result being claimed.

## Execution and cache parity

`tools/c1-production-replay-independent-check.cjs` independently exercises the current production account through its actual projection, reconciliation, and continuation modules. It compares complete outputs against both the cache-disabled adapter and the unmodified research-module loader at 12, 25, and 50 bps. It adds no normal build hook or regression-suite runtime.

The checks deliberately force:

- A rise from $100 to $110 followed by a $95 opening, triggering the 12% sleeve drawdown breaker before entries. All nine sleeve holdings exit on March 12, 2026. The base and sector40 sleeves remain in cash for their full ten-session cooldown and resume on March 27; cooldown15 resumes on April 6 after fifteen sessions. The sleeve high-water mark resets to retained cash at the first eligible resumption open.
- A same-day opening purchase followed by an intraday low below the 14% price stop, with adverse sell costs applied exactly once and whole recorded shares sold.
- A gap below an existing stop, with the adverse opening price used instead of the stop price. The gap is isolated to one name so the portfolio drawdown breaker does not mask this case.
- Two share classes with the same numeric issuer identity, which cannot coexist in one sleeve. SCHW remains excluded.
- An unmatched actual fill. Two attempts through the same cached loader must both retain the original production rejection. A failed simulation cannot supply an accepted resume checkpoint.

The reviewed resume checkpoint captures all mutable maps, arrays, and scalar variables, including the benchmark curves. The initial missing benchmark-curve state was identified and repaired before acceptance. Checkpoints validate the complete session-reference prefix and recorded-fill prefix; source fill consumption is restored only for that validated prefix. Failed simulations clear resume checkpoints. Input contents are hashed before and after replay to detect mutation. Structural equality, including nonfinite values, determines cache equivalence; JSON digests are supplementary receipts.

Run the independent synthetic checks with:

```sh
node tools/c1-production-replay-independent-check.cjs
```

Receipts default to `work/independent-validation/`. `C1_INDEPENDENT_VALIDATION_OUTPUT_DIR` can select a different scratch output directory. Every receipt identifies the exact engine and loader bytes used.

## Current input gate versus recovered archive identity

`compileC1LiveInput` explicitly passes `minimumHistoryRows: 253` to the current compiler. This gate runs before constructing the full factor cohort and calculating global and sector percentiles. The recovered historical compiler convention admitted market-verified quotes with at least 50 observations. Hash verification of that archive establishes original input identity, but cannot establish parity to the current production input gate.

The independent count in `c1-current253-input-assessment-20261012.json` uses the saved raw price checkpoint, dated universe blueprint, original manifest, canonical ticker convention, and the original next-session membership-change convention. Within January 4, 2023–September 1, 2026:

- 918 sessions are present; 863 sessions have different 50- and 253-observation cohorts.
- The 253 gate removes 1,658 stock-session observations, with a maximum reduction of four stocks in one session.
- January 4, 2023 changes from 505 to 504 observations by excluding CEG.
- September 1, 2026 changes from 512 to 509 by excluding FDXF, HONA, and Q.

Removing short-history symbols only from the final eligible ranking pool is insufficient. Percentiles of retained stocks must be rebuilt using the current 253-observation cohort. The validated original chunks must remain intact, with a separate source-pinned derived-current-input artifact and acceptance receipt. This is deterministic application of the current source, not a parameter experiment.

Current live member profiles retain only symbol, name, and sector, and its raw fundamentals and events arrays are empty. Archived CIK and fundamental fields must not accidentally supply a different input contract. This matters particularly because the production issuer check prefers a CIK and otherwise uses normalized company name. Point-in-time historical membership may replace the provider's present-day membership for retrospective construction, but that substitution and the saved sector basis must be recorded.

## Acquisition boundary and remaining limitations

The current live provider requests 550 calendar days of historical prices. The recovered checkpoint begins January 3, 2022. Early 2023 replay sessions therefore cannot reproduce the complete 550-day acquisition and continuity proof. The required numerical factor history is available: `buildHistoricalQuote` bounds features to 253 observations and entry timing uses 220 observations. A numerical current-policy counterfactual can be reproduced without inventing older bars; it must not be described as a complete historical reproduction of the provider acquisition workflow.

The provider also quarantines constituents missing the current completed price before compilation. The independent checkpoint assessment identified 1,865 missing-current member-session observations within the replay window; the active membership count remains at least 505, above the current 490-member floor. Current derived membership must reflect that quarantine while the original membership receipt remains unchanged. One additional within-archive acquisition exception requires disclosure: FRC has a May 3, 2023 price after missing May 1 and May 2 observations. It has enough observations for the numerical 253 gate, but the current live compiler's strict historical continuity check rejects that acquisition history. A numerical compiler counterfactual must not conceal this operational exception or fill the missing bars.

The complete original validation also records 20,232 `Other` sector observations among 571,220 factor rows. Five such names remain in the final saved cohort: AVB, CBOE, EA, INFO, and VMRK. The current `c1LiveMembers` sanitizer explicitly rejects `Other`, `Unknown`, and `N/A` classifications. Replacing these classifications without evidence, renaming the unknown category to evade validation, or bypassing the sanitizer cannot establish exact current-input acceptance. A factor/account calculation conditional on the archived classifications must be labeled separately from a fully accepted current-production historical result.

Other unresolved provenance questions remain separate from arithmetic and source parity: saved sector labels lack independently dated sector history; adjusted vendor snapshots do not establish unrevised, as-known prices; canonical current ticker identities do not independently prove historical issuer continuity; and a model replay does not establish manual brokerage fills or their intraday timestamps. The input hash checks do not eliminate adaptive model-selection bias or create an independent prospective holdout.

For benchmark comparisons, the source simulator's attribution divides the final benchmark value by the baseline benchmark value. Its initial benchmark share count cancels, so that attribution is baseline-close to final-close. An optional first-open-to-final-close comparison must be labeled separately.
