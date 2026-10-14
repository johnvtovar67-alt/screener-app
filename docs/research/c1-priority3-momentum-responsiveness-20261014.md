# C1 momentum responsiveness — independent research assessment

Design and initial evidence only. Reference: deployed commit `f0d46ffceb98ba3fd5fca121beba6d8f23ccbdde`, reviewed October 14, 2026. No alternative scoring, trading rules, performance experiments, account changes or 48-Challenger work were performed. The appended DELL assessment used three bounded read-only FMP history requests; the research design itself used no additional acquisition.

**Judgment:** C1's lag is a verified mechanical characteristic, not verified evidence that five sessions is optimal. Recent information deserves a controlled incremental test, especially as warning evidence. Current evidence supports an advisory extension; it does not justify a faster authoritative rank or earlier exits.

## Verified evidence and its limits

The factor weights 100-session returns ending 20 sessions earlier at 62% and 55-session returns ending five sessions earlier at 38%, combining global and sector percentiles. At completed date t, today's return is absent from both components. An isolated return first enters the shorter component at t+5 and the longer at t+20. This is the earliest inclusion of that return, **not** a promise that the rank will fall five sessions later: previous gains, peer returns and the slower component can keep its rank high. Advancing the history endpoint also rolls both historical anchors. [1]

The entire investment system is more responsive than this factor. Existing daily entry diagnostics already calculate 3-, 5- and 10-session returns, MACD, RSI, chase and falling-knife conditions. Daily Momentum Evidence already reviews five-session return, SMA20 slope, MACD, SPY-relative strength, accepted rank trajectory, recorded-stop proximity and exit-confirmation context. Its weakening classification includes falling-knife evidence, or negative five-session return together with negative SMA20 slope. Adding another five-session warning must demonstrate value beyond this existing context. One-/three-session observations and volatility-relative severity are more clearly incremental. [2]

The reference Champion must include actual current production exits, rather than just the older frozen simulator: 30-session framework, top-three holdings/top-nine queue, outside-top-six exit after the minimum; sessions 5–29 permit three completed sessions outside top nine; during that window, a still-profitable holding with at least 12% peak gain permits two completed sessions outside top six. Keep the 14% catastrophic stop, 12% portfolio breaker, 25/50/25 sleeves, 10/15/10 cooldowns, sector caps, sizing, entry gates and next-open queued-exit timing. Holdings and cash change only through the existing recorded-fill process. [3]

Repository research documentation reports that confirmed profit protection improved the previously examined aggregate historical results and that fixed 4%/6% trailing exits caused more turnover and were less robust. These are **documented prior findings**, not independently reproduced evidence here, not an untouched holdout and not a test isolating the five-session exclusion. Earlier price-pattern code defines recent-return, pullback, acceleration and chase-penalty candidates under different entry/holding/rebalance settings. Their existence does not establish that any recent-return alternative beats the current Champion. In particular, `pricePatternWeights` present in C1's options are inactive under its `momentum-only` mode. [4]

Known historical evidence limitations remain: undated sector classifications despite sector-dependent behavior, substantial previous model selection, and two overlapping universes that are not independent time holdouts. Today's constituents cannot substitute for historical membership. [5]

## Tradeoffs and decision value

Short-term reversals, bid/ask effects, opening gaps and temporary order imbalances provide plausible reasons to exclude recent returns. New information, persistent demand and durable regime changes provide plausible reasons to include them. The balance can depend on the security, volatility, market regime and holding horizon; these are hypotheses, not demonstrated C1 results. A signal that predicts tomorrow but reverses within three sessions may help permitted execution timing while being unsuitable for a 30-session portfolio thesis.

| Proposed observation | Information beyond current daily evidence | First availability | Legitimate current use / principal failure | Complexity and evidence needed |
|---|---|---|---|---|
| Current intraday gap/open-to-now and benchmark divergence | Before-close path and quote freshness | First synchronized, verified on-demand quotes | Direct attention to deterioration, stale authorization or a required verified refresh; isolated prints and reversals mislead | Low; verify delay/adjustments and measure warning false positives. No new trading authority. |
| Recent 1-/3-session returns | Last day or few days can be hidden by a positive five-session return | Respective completed close | Review historical-rank/current-price divergence; news shocks may revert | Low arithmetic cost; conditional predictive value and warning lead time are unknown. |
| Recent 5-/10-session confirmation | Whether the lagged leader is currently continuing or pausing | Completed close | Explanatory confirmation; five-session evidence partly duplicates existing warnings, while positive recent returns can encourage chasing | Low; must outperform existing timing/Momentum Evidence and simple returns controls. |
| Volatility-adjusted recent returns | Severity relative to the security's preceding risk, rather than raw percentage alone | Completed close with adequate prior history | Prioritize unusual moves for attention; changing volatility and estimation error undermine comparability | Medium; compare with raw returns and prior volatility separately. |
| Equal-window acceleration/deceleration | Change in the pace of movement, rather than level of historical return | After two complete windows | Distinguish steady leadership from abrupt deterioration; a rebound after a collapse can show positive acceleration | Medium; must add value after recent return, volatility and existing MACD/SMA context. |
| Small recent component in authoritative ranking | Different capital selection among lagged leaders | Completed close | **Future research hypothesis only**; no legitimate new selection decision is authorized now | High governance/validation cost; requires net portfolio evidence under otherwise identical current rules. |

No reliable misleading-signal frequency is established for these proposals. Report measured false-alert days, subsequent reversals, alert persistence and useful lead time before recommending thresholds. An advisory display with identical orders and fills cannot improve simulated portfolio returns; awareness value and financial benefit are separate outcomes.

## Controlled comparison to register before any later testing

1. **Fix the baseline and eligible pool.** Reproduce the current Champion, including its live-account exit overlay, and accepted daily Momentum Evidence. Use the same dated universe, classifications, liquidity floors, blocked issuers, sleeves, cash, stops and execution semantics. Preserve peer identities, not merely pool counts. Keep this design separate from every 48-Challenger definition, dataset mutation and experiment identifier.

2. **Separate observations from hypothetical rule studies.** Begin with feature-level prediction/lead-time analysis. Define completed-session returns `R_h=P_t/P_(t-h)-1` for h=1,3,5,10, with consistent adjusted prices. Compare each with existing daily evidence and simple current-return/gap controls. No alternative rule or performance backtest is implemented or run now.

3. **Bound the candidate family on paper.** The single predeclared primary mechanism comparison is current C1 versus a skip-zero sensitivity control: retain the long 100-session component ending 20 sessions earlier, all four global/sector weights and the same dated peer pool, but shift the short 55-session window from `P(t−5)/P(t−60)−1` to `P(t)/P(t−55)−1`. This holds return-window length fixed while incorporating the latest five sessions and removing the oldest five; it does not isolate the new observations without also moving the older anchor. It changes only the proposed lag definition, not any other policy parameter. Secondary, multiplicity-adjusted hypotheses are the fixed mixtures `M_h=0.90*M+0.10*C_h` for h=1,3,5,10, where M is current C1's 0–100 momentum factor and C_h combines recent-return global/sector percentiles at 65/35, matching the existing overall balance. Do not tune a grid of weights, horizons, exits or confirmations. All definitions are proposed research specifications only, not implementations or recommended winning formulas.

4. **Test explanation before replacement.** Treat recent returns first as a leader-confirmation/divergence description without action changes. Evaluate an existing high-rank leader's negative recent stock/benchmark-relative return as warning evidence. For normalized severity, propose `Z_h=sum(latest h daily log returns)/(prior daily log-return volatility * sqrt(h))`; estimate volatility from a fixed 60-session window ending before the evaluated return window, with documented handling of tiny volatility and insufficient history. This is a scale convention, not a normally distributed probability. For acceleration use the difference in mean daily log return over two equal adjacent five-session windows, scaled using volatility known before those windows. Test these additions individually; avoid combining every variant into a large search.

5. **Measure economically relevant outcomes.** Report first-observation persistence, one-/five-/ten-/20-/30-session forward returns, benchmark/sector-relative returns and adverse excursion starting from a realistically available price. Condition on baseline rank, Momentum Evidence, volatility, gap, sector and regime. For high-ranked deterioration episodes, ask whether the new observation precedes the **existing** warning/exit, whether the adverse move persists, and whether it affords usable response time. Also measure recoveries/missed winners that a faster signal would incorrectly penalize. Keep initial feature analysis distinct from any later portfolio replay.

6. **Require actual permitted timing.** A daily feature computed at the close cannot obtain that same already-known close as its fill. Later authorized portfolio studies must use next eligible execution plus realistic manual latency, spread/slippage/fees, opening gaps and limit-fill uncertainty. A new observation does not extend quote validity or waive entry limits. Preserve every existing exit/holding rule; earlier exits or changed entry qualifications would require separate owner authorization and cannot be credited to this read-only interface.

7. **Control data and selection bias.** Use point-in-time membership including delistings, dated sectors, corporate-action-consistent prices, original availability and provider revisions. No future high/low/volume as inputs. Historical corrected prices do not recreate the observation available at the time. Test missing-data behavior and coverage; cohort-only studies must be labeled accordingly. DELL and previously inspected periods are development illustrations, not untouched tests. Cluster observations by security/session; bootstrap chronological blocks; purge overlapping forward-return labels at split boundaries; disclose all candidate definitions and multiple-test treatment.

8. **Require chronological generalization.** Train any thresholds on earlier windows, select the small specification in separate validation windows, and evaluate untouched later periods with no retuning. Report uncertainty, performance by regime/sector, costs and dependence on a few winners. Require reproducible incremental prediction and economically meaningful improvement under conservative execution costs before any rule-change recommendation. If point-in-time data or independent samples are insufficient, keep the finding inconclusive and use later authorized shadow evidence. No fixed waiting period is imposed.

## DELL and the prioritized decision

A high historical momentum rank coexisting with a sharp recent decline is an intended mathematical possibility of this lagged factor. It can reveal a useful attention gap, but it is not by itself an exploitable weakness. DELL's current price, accepted adjusted history, date, benchmark path, ranking inputs, existing daily warnings and recorded stop/exit context must be reconciled separately before diagnosing the episode. A one-name hindsight example cannot show what an investor could have earned or whether a faster rule would help across the eligible universe. Do not tune a threshold to DELL's decline or recovery.

**Prepare for review now:** the independently implemented, timestamped, read-only quote advisory layer, retaining current authority and manual refresh. **Validate next:** conditional one-/three-session divergence, volatility-relative severity, and a small five-/ten-session confirmation comparison. **Defer:** any authoritative recent-component rank and any new entry/exit rule pending point-in-time/out-of-sample economic evidence and explicit authorization. **Reject for this phase:** continuous polling, unvalidated volume/VWAP indicators, a broad parameter search, DELL-specific optimization, and claims that adding observations alone improves returns.

## Pinned source evidence

All references use the deployed commit above.

1. `lib/historicalSignalEvaluator.js:69–73,335–340,535–538` — exact skipped-return construction and factor weights.
2. `lib/entryTiming.js:73–94`; `lib/c1MomentumEvidence.js:49–91,93–133` — recent daily diagnostics and existing explanatory warnings.
3. `lib/c1FrozenOptions.js:40–68,112–140,184–212,222–234`; `lib/c1AccountSimulator.js:2983–3022`; `lib/v11ProductionPolicy.js:51–54`; `docs/research/c1-momentum-exit-production-20260926.md:10–22` — baseline policy, live overlay and execution boundaries.
4. `docs/research/c1-momentum-exit-production-20260926.md:24–39`; `lib/fmpResearchBacktest.js:4676–4727,4774–4784`; `lib/walkForwardBacktest.js:894–912,1066–1067` — documented prior evidence, differing prior candidate settings and inactive price-pattern mode under current momentum-only selection.
5. `docs/research/c1-final-review-20260915.md:57`; `docs/research/v12-active-swing-ensemble-c1.md:1–7,64–68` — historical data, selection and holdout limitations; superseded authorization statements do not govern the current system.


## DELL: initial descriptive evidence

Read-only descriptive assessment, October 14, 2026. Reference implementation: deployed/main `f0d46ffceb98ba3fd5fca121beba6d8f23ccbdde`. Existing FMP key and inherited network configuration were used without credential/configuration changes. Three successful bounded REST reads acquired DELL dividend-adjusted daily history, DELL raw daily history and SPY dividend-adjusted daily history, each covering 378 sessions from April 14, 2025 through October 14, 2026. Collection began at 5:31:17 p.m. America/Chicago, after regular-session close. No account, stop, storage or actual-ranking records were accessed. No alternative trading rule or portfolio backtest was implemented or run.

**Finding:** the observed DELL decline is consistent with the intended mathematics of lagged momentum, while providing a useful test case for whether that design creates an economically costly delay. It does not establish that recent momentum is superior or that an earlier sale would improve C1 returns. Existing completed-session Momentum Evidence already has a price-deterioration path independent of the lagged rank.

## Observed prices and returns

DELL's October 14 raw and dividend-adjusted closes both were **$507.93**, versus $572.47 on October 13. Recent raw and adjusted closes matched for every date used in the 1/3/5/10-session comparisons below. These are newly retrieved provider histories, not proof of what was available at a past trading decision.

| Window ending October 14 | DELL adjusted return | SPY adjusted return | DELL minus SPY |
|---|---:|---:|---:|
| 1 session | -11.27% | -1.08% | -10.19 percentage points |
| 3 sessions | -13.33% | -1.15% | -12.18 percentage points |
| 5 sessions | -12.27% | -0.98% | -11.29 percentage points |
| 10 sessions | -5.58% | +0.91% | -6.49 percentage points |

DELL also closed 13.33% below its highest closing price in the latest eleven observations ($586.06 on October 9). This is a trailing close-to-close drawdown, not drawdown from an actual C1 entry or an intraday high.

At the same close, the two raw-return inputs underlying C1's momentum percentiles remained:

| C1 component | Exact observed anchors | DELL adjusted return | Combined global/sector weight |
|---|---|---:|---:|
| `return120Ex20` | April 23–September 16, 2026: 100 sessions ending 20 sessions before October 14 | +165.97% | 62% |
| `return60Ex5` | July 21–October 7, 2026: 55 sessions ending five sessions before October 14 | +43.25% | 38% |

The 62%/38% weights apply to global/sector **percentiles**, not to these raw returns. No weighted raw-return calculation is presented as C1's score. Actual percentiles and ranking require the complete contemporaneous eligible peer pool and sector membership, which this three-request observation did not collect. The user's reported high DELL rank therefore remains account/screen context, not a rank independently verified here.

## Where the recent decline is and is not visible

For a fixed session, peer pool and adjusted-history basis, the score uses prices at T-20/T-120 and T-5/T-60. Its direct sensitivity to DELL prices in the most recent five sessions is zero. The October 14 price shock cannot directly enter the 38% component until five later completed sessions, or the 62% component until twenty later completed sessions. This is an earliest mathematical inclusion time, not a predicted exit time: relative percentile effects, recovery and confirmation streaks can materially change the result. Rankings can still move during this period because older anchors roll or peers/eligibility change.

Recent information is not invisible to all of C1. Current price, trailing dollar liquidity and 60-session volatility affect eligible pools. The sampled numerical values were above the $5/$300 million floors and below the 100% volatility cap: DELL's adjusted-close-times-volume average over twenty sessions was approximately **$3.90 billion**, and C1's annualized sample standard deviation of sixty simple daily returns was **78.97%**. Those numerical gates alone would not remove DELL. This does not certify membership, every entry check or trading qualification.

More importantly, existing daily entry diagnostics classify a five-session return at or below -7% as `fallingKnife`. The observed -12.27% satisfies that diagnostic. Current deployed Momentum Evidence treats `fallingKnife` as a weakening input, independently of whether lagged rank remains strong. Once this session and its timing evidence are accepted/current, that input supports a weakening explanation; no actual account badge or action was inspected here. DELL's SMA20 slope remained positive (+0.93%), illustrating why relying only on a medium-term moving-average slope could overlook this shock. Recorded stops, portfolio loss controls and confirmed rank-exit rules remain separate, and no actual stop breach can be inferred without the recorded basis.

## Interpretation and decision value

The exclusion plausibly reduces whipsaw from short reversals, volatility and overreaction to news. It also deliberately makes an abrupt breakdown slower to affect rank. This case demonstrates that tradeoff in actual factor inputs; it cannot determine which side dominates across C1's trades. A one-name, retrospectively selected decline creates no evidence of exploitable alpha.

The immediate incremental value of an intraday panel is **before-close attention**: it can show current/open/prior-close movement, synchronized benchmark divergence and distance to a supplied recorded stop while the daily evidence still refers to yesterday. It can help an owner check the broker quote, existing stop execution and new-entry conditions within current authority. It must not convert a deterioration observation into an early sale, score demotion or reset confirmation streak. The DELL snapshot was collected after close and therefore does not establish when the decline became observable intraday, alert lead time or false-alert frequency.

A controlled study should compare the actual deployed Champion, including its daily Momentum Evidence, with pre-registered recent-return hypotheses across **all supported historical names and dates**, rather than tuning around DELL. Test 1/3/5/10-session returns as small additions to lagged percentiles, separate confirmation/warning overlays and lagged-volatility-normalized measures. Use prior-only volatility estimates and equal-window acceleration/deceleration. Hold universe, sleeve allocation, costs, execution timing and all unrelated rules fixed; distinguish ranking-only predictive analyses from hypothetical policy changes. Include an intentional skip-zero comparison as a clear sensitivity case, rather than a wide parameter search. No such alternative was implemented here.

Require contemporaneous adjusted data or disclosed revision limitations, point-in-time membership/sectors/delistings, matched decision availability, realistic later execution and untouched chronological/prospective evaluation. Measure missed emerging leaders, avoidable deterioration, rebound-related false warnings, turnover and opportunity cost. Existing daily evidence is a stronger baseline than lagged rank alone. Without representative out-of-sample net results and false-warning burden, neither removing the five-session exclusion nor tightening exits is justified.

## Reproducibility and source

- Offline calculation/reconciliation: `node tools/c1-priority3-dell-evidence.cjs`; it reads only the captured market-data JSON, makes no requests and writes nothing. The original three-request acquisition receipts and exact source rows are retained in the evidence JSON.
- Sanitized endpoint receipts, numeric daily observations and calculations: `docs/research/c1-priority3-dell-evidence-20261014.json`. No URLs with query credentials, keys or account information are retained.
- Exact formulas: `lib/historicalSignalEvaluator.js:69`, `:335`, `:537`; C1 rank mode: `lib/c1AccountSimulator.js:1070`.
- Numeric eligibility conditions: `lib/c1AccountSimulator.js:1399`, `:1540`; frozen parameters: `lib/c1FrozenOptions.js:15`, `:36`.
- Existing short-price warning: `lib/entryTiming.js:81`; daily evidence classifier: `lib/c1MomentumEvidence.js:122`; accepted-session integration: `lib/c1AccountService.js:54`.

Authoritative code, rankings, decisions, sleeve rules, stops, account records, storage records and production deployment were not changed. The separate 48-Challenger protocol was not accessed or initiated.
