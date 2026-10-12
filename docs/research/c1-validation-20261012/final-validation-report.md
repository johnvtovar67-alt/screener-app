# C1 conditional current-account-policy replay — October 12, 2026

The repaired, source-pinned conditional core-account-policy calculation is complete at 12, 25 and 50 bps for S&P 500, $100,000 initial capital, January 4, 2023 through September 1, 2026, and 918 inspected historical dates. Each full recorded-source replay verification and independent saved-result arithmetic review passed. This does not establish an exact full-production historical result or validated current C1 alpha.

The original archive and frozen results were preserved. The completed task applies the repaired current source and fixed cost assumptions; no strategy parameters were optimized. No merge, deployment, production change, automatic brokerage execution or owner account-record change is part of this validation.

`actualLiveInputAccepted=false` and `eligibleForAlphaClaim=false` remain in force. The run class is `conditional-current-account-policy-counterfactual`; operational Buy verification, historical event history and brokerage snapshots are not reproduced.

## Conditional current-policy results

The account starts entirely in cash at the January 4, 2023 completed close. The first possible purchases occur at the January 5 open. Decisions use completed sessions and modeled next-open fills, with gap/low stop handling and adverse per-side cost charged once; commissions are zero. Terminal holdings are marked at the September 1, 2026 close.

| Metric | 12 bps | 25 bps | 50 bps |
| --- | --- | --- | --- |
| Ending equity ($) | 389072.4206987598 | 331372.88401869434 | 339505.6478976805 |
| Total return (%) | 289.0724206987598 | 231.37288401869432 | 239.50564789768052 |
| Sharpe | 1.4125513073737135 | 1.2480529769411108 | 1.2712741115754178 |
| Sortino: zero-target downside RMS | 2.228994050030395 | 1.9428148224051232 | 1.9721865307344633 |
| Legacy-source Sortino | 2.1156637537302085 | 1.8414130441639056 | 1.8536653498415432 |
| Maximum drawdown (%) | -22.397381685864026 | -22.920140763005858 | -32.20839960927795 |
| Fills | 723 | 711 | 717 |
| Closed sleeve round trips | 357 | 351 | 354 |
| Win rate (%) | 51.26050420168067 | 50.427350427350426 | 48.58757062146893 |
| Profit factor | 2.3200027551954503 | 2.0427660993839103 | 2.0962961419477515 |
| Mean holding sessions | 19.789915966386555 | 20.074074074074073 | 19.6864406779661 |
| Median holding sessions | 15 | 16 | 15 |
| Two-way traded notional ($) | 12978840.01121877 | 11814163.918418694 | 11403808.503997676 |
| Two-way turnover (%) | 6871.189058550453 | 6598.113922339523 | 6459.893097715373 |
| Annualized two-way turnover (%) | 1886.208761170713 | 1811.2469590735948 | 1773.3039876081416 |
| Mean capital utilization (%) | 76.16605577134989 | 75.60902969109816 | 75.71790167438462 |
| Open terminal sleeve positions | 9 | 9 | 9 |

Risk-free rate is zero; annualization uses 252 sessions. Sharpe uses sample daily-return deviation. Standard Sortino uses downside RMS across all daily returns; legacy-source Sortino retains the source sample deviation of negative daily returns. Median holding length uses the standard midpoint average for even counts. Trade count is completed sleeve round trips, including separate sleeves holding the same symbol; fill count is separate. Two-way turnover is buy plus sell notional divided by mean daily combined equity. Utilization is mean daily `(1 - cash/equity)`.

Modeled costs can change the subsequent trade path as well as each fill price. The observed 50 bps return exceeds the 25 bps return while its drawdown is substantially larger. The three cost assumptions were fixed in advance; this comparison does not select or optimize a trading policy.

## Benchmark comparison

Current benchmarks use baseline-close to final-close returns, matching the source attribution convention. The original cost receipt retains benchmark returns rounded to two decimals: SPY 107.59%, QQQ 171.74%. Original frozen excess is preserved separately from a restatement on the current benchmark series.

| Cost (bps) | Benchmark | Benchmark return (%) | Current excess (percentage points) |
| --- | --- | --- | --- |
| 12 | SPY | 107.5921081316765 | 181.48031256708327 |
| 12 | QQQ | 171.74071656234395 | 117.33170413641582 |
| 25 | SPY | 107.5921081316765 | 123.78077588701784 |
| 25 | QQQ | 171.74071656234395 | 59.63216745635038 |
| 50 | SPY | 107.5921081316765 | 131.91353976600402 |
| 50 | QQQ | 171.74071656234395 | 67.76493133533657 |

## Preserved frozen S&P 500 comparison

Return and drawdown below come directly from the original preserved cost-audit JSON, Git blob `6637ab6a5f4d6cd7c4a8c3dc9861d1fa3c4c70a2`. That receipt contains no Sharpe: 12 bps Sharpe comes from saved fixture arithmetic; 25/50 bps Sharpe comes from the frozen policy report at three-decimal precision.

| Cost (bps) | Current return (%) | Frozen return (%) | Current minus frozen (pp) | Current Sharpe | Frozen Sharpe | Current max DD (%) | Frozen max DD (%) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 12 | 289.0724206987598 | 380.7204925 | -91.64807180124018 | 1.4125513073737135 | 1.5845164616029748 | -22.397381685864026 | -20.701051498725377 |
| 25 | 231.37288401869432 | 314.20182000000005 | -82.82893598130573 | 1.2480529769411108 | 1.441 | -22.920140763005858 | -24.174085740821948 |
| 50 | 239.50564789768052 | 260.62695999999994 | -21.121312102319422 | 1.2712741115754178 | 1.303 | -32.20839960927795 | -22.925781010669667 |

The saved 12 bps accounting fixtures also permit recovered trade statistics: 508 fills, 254 closed sleeve round trips, 50% wins, profit factor 2.6134886716473846, mean hold 28.137795275590552 sessions, median 31, annualized two-way turnover 1276.6703841736553% and utilization 76.82553130115673%. Supplementary 25/50 bps trade ledgers are unavailable. Original 12/25/50 bps alpha-positive periods were 7/8, 6/8 and 6/8; their selected historical boundaries retain their original interpretation.

Saved first-fill timing was checked directly without rerunning the frozen engine. All three S&P sleeves have $100,000 cash, $100,000 equity and zero positions on January 4; each first buys on January 5. Their first saved cost-adjusted prices are STLD 93.682284, NFLX 30.73684 and FCX 37.074436000000006. There is no January 4 adoption-timing advantage in the preserved frozen result.

The performance delta is a descriptive comparison, not an isolated attribution to the confirmed momentum exits. Verified differences include the current 253-observation cohort, profile/issuer representation, SCHW allocation exclusion, production confirmed/profit/30-plus rank exit logic, actual whole-share double-floor mapping and terminal treatment. Price-factor formulas matched the archive. This task did not optimize or change factor weights, risk thresholds or strategy parameters.

Frozen arithmetic weights three independently simulated $100,000 whole-share books at 25/50/25. Current account mapping applies the source double floor into actual $25,000/$50,000/$25,000 books. Original weighted units are analytical rather than executable share quantities. Frozen fixtures liquidate at the terminal close; current terminal positions remain open and marked, so their closed-trade statistics exclude those positions.

## Hypothetical terminal closing-cost adjustment

For comparability only, the independently checked arithmetic applies the same modeled per-side bps to final marked holdings, leaving terminal cash unaffected. This is a hypothetical closing-cost adjustment under the model assumptions, not an empirical market-execution bound, executed sale or additional policy replay. It does not revise drawdowns or trade statistics.

| Cost (bps) | Terminal invested market value ($) | Modeled extra closing cost ($) | Arithmetic liquidation-equivalent return (%) | Difference from frozen return (pp) |
| --- | --- | --- | --- | --- |
| 12 | 337062.97000000003 | 404.4755640000001 | 288.66794513475975 | -92.05254736524017 |
| 25 | 317274.7 | 793.18675 | 230.57969726869436 | -83.62212273130572 |
| 50 | 304010.65 | 1520.0532500000002 | 237.98559464768056 | -22.64136535231941 |

## Input and software verification

Original input validation recovered and checked all 24 chunks, 409654552 compressed bytes, 1170 original cohorts and 659220 price rows. Original cohorts matched, and reconstructed price-derived factors/timing had zero reported discrepancies; maximum numerical difference was 0. Historical fundamental/quality fields were byte-pinned in the preserved chunks, but no fundamental checkpoint is available to reproduce them independently. This establishes the stated archive and numerical checks, not current live-input acceptance.

The derived current factor cohort applies the fixed current minimum of 253 observations before global/sector percentiles are rebuilt. Across the 918-date evaluation window, 863 dates change and 1658 short-history stock-session rows are removed. Missing-current-price membership quarantine affects 1865 member-session observations in this window. Original chunks and prices remain preserved. The current compiler uses the current source's empty fundamentals/events shape; archived fundamental fields and issuer CIKs are not silently reused.

The selected 64-date check compares cached, cache-disabled and unmodified-source outputs over an explicitly non-performance-selected prefix. Independent synthetic fixtures exercise portfolio drawdown exits and full cooldowns, intraday and gap stops, issuer identity, SCHW exclusion and repeated invalid-fill rejection. These are software-equivalence evidence. The full recorded-source receipts separately verify the complete chronological simulator replay of generated modeled executions and per-session state; they do not supply missing operational Buy or broker evidence.

| Cost (bps) | Full recorded-source receipt | Source passed | Arithmetic passed | Maximum independent metric difference | Source graph / input / manifest |
| --- | --- | --- | --- | --- | --- |
| 12 | current-12bps-source-verification.json.gz.base64 | true | true | 0 | true / true / true |
| 25 | current-25bps-source-verification.json.gz.base64 | true | true | 0 | true / true / true |
| 50 | current-50bps-source-verification.json.gz.base64 | true | true | 2.2737367544323206e-13 | true / true / true |

The independent metric checker permits a difference of `1e-8 × max(1, |metric|)`; its cash/PnL/terminal-price arithmetic checks use a difference below `1e-7`. The final report writer separately requires the maximum observed metric difference to be at most `1e-9`. The table discloses the actual differences, which are much smaller. Canonical engine metrics are preserved. Source-output/state comparisons retain their exact recorded equality, and independent book arithmetic is reported separately in each receipt.

## Remaining limitations and guard rejections

- Literal current sector validation rejects archived `Other` or missing classifications. The strict run stops at ANSS; metadata guard failures exist on all 918 dates. The conditional calculation preserves these classifications without declaring them accepted.
- FRC has a May 3, 2023 price following missing May 1 and May 2 rows. Its numerical factor history can be computed, but the strict current historical-continuity guard rejects that acquisition history; the missing bars were not invented.
- The current provider requests 550 calendar days. The checkpoint begins January 3, 2022, leaving the complete benchmark acquisition prefix unavailable for 124 evaluation dates, January 4–July 3, 2023. Numerical 253-observation factor history does not establish the complete acquisition workflow.
- Completed-session observation times are modeled at 21:30 UTC; original acquisition timestamps remain preserved. These modeled clocks establish a conditional causal ordering, not proof of actual historical observation timing.
- Archived sector/name classifications lack independently dated provenance, and adjusted vendor snapshots do not establish unrevised prices as known on each date. Canonical current tickers do not independently certify historical issuer continuity.
- Whole-share arithmetic applies to supplied adjusted-price share units. Historical pre-split broker-lot granularity and real corporate-action share changes are not independently reconstructed.
- Operational selected-sector/max-three Buy verification, live quote/event checks, manual release and brokerage snapshots are absent. Modeled account-plan fills therefore assume execution without those additional blocks; no automatic brokerage execution or actual fill observations are claimed.
- The dataset was inspected during model development. Fixed-candidate controls do not reconstruct the full search or establish selection-adjusted significance. Overlapping universes and replayed dates provide no untouched time holdout or new prospective evidence.
- Fixed slippage costs and adjusted daily bars do not establish achievable intraday execution or market impact. Historical data-vintage and model-selection uncertainties remain unresolved.

## Alpha assessment and thesis implications

Current C1 alpha is not validated by this task. The literal current input workflow rejects parts of the archive, and the complete operational recommendation/execution path is not reproduced. The numerical tables describe only the conditional current core-account-policy model. Their comparison can strengthen or weaken confidence in that modeled implementation; it cannot certify or conclusively disprove full-production or future alpha.

At 12 bps, the conditional model returns 289.0724206987598% versus preserved frozen 380.7204925%, a difference of -91.64807180124018 percentage points. This numerical deterioration weakens support for carrying the original frozen headline into the current implementation; it is not certified production disproof.

All three conditional runs have lower returns and Sharpe ratios than their preserved frozen counterparts, while all three retain positive simple excess return over SPY and QQQ. There is no conditional current-policy outperformance of frozen C1 at any of the three costs on return or Sharpe. At 50 bps, maximum drawdown is -32.20839960927795% versus preserved frozen -22.925781010669667%. This weakens historical support for the current implementation and its cost/risk robustness; it does not establish full-production or future-alpha disproof.

Current C1 alpha is weakened and remains unvalidated. The core active-momentum thesis need not be replaced on this evidence: the conditional calculations still beat both benchmarks at every fixed cost. Confidence and performance claims should narrow to the bounded historical model, and the preserved frozen headline should not be presented as the current implementation result. This audit does not warrant a parameter optimization or trading-policy change.

The remaining uncertainty is material: literal archive/input rejection, undated sector/name and data-vintage provenance, adjusted share-lot units, absent operational/broker evidence, model selection and lack of an untouched holdout prevent full-production alpha certification. These limitations also prevent treating the conditional deterioration as conclusive disproof of the core thesis.

## Saved evidence

Before the first long portfolio run, the recreated code and final input/parity receipts were persisted on `audit/c1-current-policy-validation-20261012` at remote commit `c1eb92321cf11b0a0cd9991154f45ca4bdbcef0c`, with tree `a9dbf8eb4384d0c14e032bad7cf77de039e37303` identical to the local checkout. A complete local Git bundle was also verified. The accepted 12 and 25 bps results were checkpointed on GitHub at `67e201755689963b2a8198d41d75698a38630d27` and `24f08cf370f2de1fe0bf6c17473ec92ead4dcfd4` during later runs. Raw private price/factor chunks remain outside the public Git repository; public receipts preserve their identities and recovery/source contracts.

- Original archive identity: `original-input-validation.json` and `original-export-receipts.json`.
- Conditional current construction: `current-input-manifest.json`, `current-input-public-summary.json`, `current-input-acquisition-guard-evidence.json`, `independent-derived-input-review.json`.
- Preserved baseline: `preserved-frozen-cost-audit.json`, `preserved-frozen-12bps-metrics.json`, and `../v12-active-swing-ensemble-c1.md`.
- Descriptive saved-result comparison: `current-vs-preserved-comparison.json`.
- Source/software checks: `selected-real64-equivalence.json`, `selected-real64-final-input-match.json`, `selected64-receipt-review.json`, `independent-stop-parity.json`, `independent-breaker-parity.json`, `failed-cache-rejection.json`, `final-source-convention-review.json`.

Public result checkpoints are `current-{12,25,50}bps-results.json`. Public source-verification receipts are `current-{12,25,50}bps-source-verification.json.gz.base64`, decoded as base64 then gzip. The result checkpoints record the canonical decoded verifier hashes and the private complete run/summary hashes; workspace `.verify.json` paths are not presented as GitHub-hosted files.

| Public evidence | SHA-256 |
| --- | --- |
| current-12bps-results.json | fe6289af568c1491227dad08a311ef5da0c726f595a5a8b6ea08a1f20b2ef877 |
| current-12bps-source-verification.json.gz.base64 | eac49420789d6016e9735575e24e43ee32134ad217e90a19a286a31063592df3 |
| current-12bps-source-verification.json.gz.base64 decoded canonical JSON | 0c6a794e8fe8d92b6604fca7b40d8b5ccb66acbb52285814872ae725d79ebe9b |
| current-12bps-independent-arithmetic-review.json | af8b8948b73bb86181d93229dd044f4542f40bfc3d697ca122bf8763a58493a8 |
| current-25bps-results.json | b8b2814b089990fd162744a979fe7e89ebf6bee945be910a8e25da86f448fe4d |
| current-25bps-source-verification.json.gz.base64 | b046640397f4a51cd79bf281c9db12c0335438d7c770d2742378dce2184d4968 |
| current-25bps-source-verification.json.gz.base64 decoded canonical JSON | 453d9821768e45c632380518c9bd6203bd903edcd358bda3c8a2015179e00220 |
| current-25bps-independent-arithmetic-review.json | a358f597bb455efc7f191bf143810eae72ad4cd88ffee960ca4c8854a7de02ee |
| current-50bps-results.json | 18844acc1feda28295d77dd14494b6aa292cbc4fd96999ca07c6bd1d373a89ed |
| current-50bps-source-verification.json.gz.base64 | 2d9a3f0585f095f7476f041bf03c3fc6358564444a094def38a50ff3d51c7f83 |
| current-50bps-source-verification.json.gz.base64 decoded canonical JSON | 6560799afff88b3de9608454701d2103cc747b06491760b5580b77cafd1ec68b |
| current-50bps-independent-arithmetic-review.json | 798e62c561a0824726f8819eee5003d981086ff499e813d787483e27ff203a71 |

