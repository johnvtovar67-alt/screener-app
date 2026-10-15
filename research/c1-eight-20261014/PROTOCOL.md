# Eight-security developmental extension — frozen before acquisition

Owner instruction: expand the successful historical signal study to the eight previously validated securities. This is a separate research extension, independent of production C1, PR #262 and the frozen 48-Challenger experiment. Existing definitions are imported unchanged from `../c1-fresh-20261014/analyze.py` at checkpoint 21addcfbf4d38711e6170b8cf786c2bb1908043b. No rule, threshold, symbol-specific exception, portfolio weight or winning candidate is selected here.

## Prerequisites and bounds

Before any market-data request: verify active existing FMP connection, current account request/bandwidth headroom, existing processing-location notification, permitted private personal use, writable owner-private aggregate destination, pinned source code and successful synthetic tests. Subscription advertised limits do not establish account remainder. The prior study's 20-call budget is exhausted; the owner now authorizes this separately bounded extension.

New maximum20 calls /12MiB response bytes; planned16 calls (nine full adjusted histories, two repeated overlaps, one membership-change feed, two corporate-action feeds, two small split-adjusted full windows). Sequential starts >=0.35seconds, timeout20seconds, no retries, no alternate provider/routes, no credentials displayed. Reserve enough verified current account headroom for the full cap. Stop before acquisition if current headroom or location prerequisites remain unverified. Record the observed quota timestamp/source privately; public audit says only whether gate passed.

No licensed source payload, normalized bar, membership row, reconstructable price path or event-by-date outcome table is persisted or sent to model context. Save only private aggregate numerical JSON/Markdown under a new owner-only directory with mode0700 and files0600 outside Git. Public code/protocol/audit may record schema, endpoint/parameter choices, response hashes, date coverage, validation, code hashes and permissions status; no market-derived outcome numbers. Never overwrite a previous run or report. No new data store, credential, infrastructure recovery or Blob operation is part of this task.

## Cohort, time and vintage

Securities: AAPL, MSFT, NVDA, TSLA, JPM, XOM, PG, JNJ; SPY is solely the calendar/regime reference. All fresh adjusted OHLCV is requested for2019-01-01..2024-12-31. Evaluation2020-01-02..2024-09-30;2019 supplies warmup and formation volatility. Require all independently calculated NYSE sessions, valid adjusted OHLCV, unique dates, correct symbols, repeated overlaps and targeted split/dividend checks. Historical membership feed availability is audited, not substituted for a verified full dated eligible universe. This purposive survivor sample is not an investable C1 universe.

Every payload has a new retrieval timestamp and SHA256. Compare with the prior audit hashes and disclose matches/differences; compute this study exclusively from the new cohort. A differing vintage is never overwritten or spliced into old data. A short common retrieval window is not a vendor atomic snapshot or original-as-known history. Dividend-adjusted prices are total-return-style research units, not literal traded cash fills. Explicit dividend/share/cash accounting remains absent.

## Unchanged definitions

R(L,k)=100*(C[t-k]/C[t-k-L]-1). Champion slow/fast areR(100,20)/R(55,5); fresh F usesR(100,0)/R(55,0). These are raw factors only; full-universe global/sector percentile transforms, official C1 ranks, entries and actions cannot be reconstructed from eight securities.

Deterioration onset: first completed-closeR(5,0)<=-7%, with >=21session intervals since prior onset. For each onset/factor, first factor<=0 fromt..t+63, including already-nonpositive factors. Report the joint response-status matrix, both-responder latency differences, Champion-only/F-only responses, response probabilities, and all-event restricted latency. Nonresponse is assigned63 only in the explicitly capped descriptive latency statistic; it is never called an observed response. Missing/end-censored paths remain separate.

Fixed quarterly first-session adjusted-open entries; entryage0. Identical entry schedule for H/P, no entry slippage. H: first closeage>=5 withR(5,0)<=-7%. P: latch completed-close gain>=12%, then current gain<=half observed peak, age>=5, no rank dependence/no age30 cutoff. Decisionsages5..62 execute following adjusted open with12bps adverse sale cost; age63 adjusted close with same cost is the fixed no-trigger reference. No stops, replacement trades, source-qualified C1 entries, sizing, cash or reinvestment are modeled. All-lot effects retain the reference for nontriggered lots; trigger-conditioned outcomes are reported separately.

## New measurements; no new signal threshold

1. Per-security and pooled counts, response coverage, speed and declines before response. Explicitly distinguish matched responders from unmatched events.
2. Adjusted next-open-to-forward-close returns over5/21/63 sessions following onset and each raw-factor/H/P response. Censor missing/end horizons, expose denominators; no complete-case outcome is relabeled as full coverage.
3. Recovery proxies: positive21session adjusted change, recovery to the fixed pre-signal/onset completed-close peak within21 subsequent closes, and their joint count. These are not proven actual C1 false exits. H/P retains original lot-specific peak; factor/onset uses fixed onset trailing20-close peak.
4. Risk normalization uses sampleSD of20 daily simple returns ending five sessions before the event/signal, in percentage units. Five-session shock z=R5/(sigma*sqrt5); standardized forwardh=adjusted return/(sigma_known_at_signal*sqrt(h)). No clipping, fitted scaling, adaptive threshold or trade-rule change. This normalization is a risk-unit diagnostic, not a calibrated probability, Sharpe ratio or tested volatility-adjusted Challenger.
5. Profit-gain giveback at decision and following-open proxy, hypothetical proceeds/return difference versus matched scheduled reference, and recoveries/missed gains. Trigger cohorts differ; neither better average forward return nor fewer exits selects a rule.

## Security, regime and influence checks

Frozen high/low security-volatility groups use the original2019 daily-returnSD median across all eight; report security identities and counts. Both event-weighted and equal-security summaries are needed; do not let event-rich NVDA silently define the result. Compute leave-one-security-out summaries for every original security, specifically disclose excluding NVDA and excluding both NVDA/TSLA where coverage supports it.

Calendar-year blocks2020,2021,2022,2023,2024YTD are reported without selecting periods by outcomes. Also classify causal SPY regimes at the prior close: sign of trailing63session return × trailing20daily-returnSD above/below the median of2019 rolling20SD. Onset/factor comparisons use onset regime; all-lot effects use entry regime; trigger-only outcomes use signal regime and are labeled separately. Regimes can transition within forward horizons. Calendar labels and causal groups are descriptive, not independent holdouts.

## Uncertainty

Primary descriptive95% intervals use circular moving blocks of two consecutive calendar quarters, drawing a common quarter sequence across securities,2000 draws with fixedseed20261014. Keep the19evaluation quarters including zero-event quarters. Preserve contemporaneous cross-security shocks and adjacent-quarter dependence; record valid bootstrap replicates when sparse groups produce undefined metrics. Intervals for matched latency exclude unmatched responders by definition; all-event response/restricted-time statistics complement them. Per-security small counts and limited time clusters constrain uncertainty. No multiplicity-adjusted significance, winner selection, portfolio alpha or confirmatory claim.

## Recommendation criterion for a subsequent test

This extension may justify a separately prespecified larger historical TEST of volatility-scaled deterioration if it reveals stable risk-scale heterogeneity across several securities and regimes, not merely mechanical lag removal or one influential growth name. Require adequate lagged-risk coverage, transparent recovery/opportunity-cost tradeoffs, uncertainty and leave-one-name sensitivity. A promising normalization does not establish a beneficial volatility-adaptive exit. Any next test must freeze its rule before new data, preserve Champion hard protections/timing, include fixed7%H as a control, assess multiple securities and genuinely additional periods, and remain private research. If effects are sparse, regime-dependent or dominated by an influential name, recommend further coverage/measurement rather than a claimed superior trading rule.
