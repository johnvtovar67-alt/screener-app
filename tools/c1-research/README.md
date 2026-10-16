# C1 isolated retrospective research program

Owner authorization: October 16, 2026 instruction to implement a reproducible research harness, test only after data-integrity/look-ahead gates pass, and deliver a research-only PR. No merge, deployment, live strategy change, account migration or record write is authorized.

Production source: `0a65e20964ae080b8718332e5f6f16daa6def452` (PR #276), confirmed through GitHub and the READY production alias. `champion-source-manifest.json` pins 201 application/configuration sources using SHA-256. All application files, account handlers, production strategy modules and release-freeze guards remain unchanged relative to that commit.

## What is implemented

- Twelve fixed arms at 12/25/50 bps per side: production-current control; four recent-momentum ablations (entry veto, MACD, deterioration exit, giveback exit); nine-candidate selection with three-position capacity; A/B/C sizing at three- and nine-position capacity. These are research hypotheses, not approved trading rules.
- A network-disabled, isolated module loader and exact-count transformation seams over the pinned source. Changes occur in memory, not in `lib/`, application routes or account storage. Changed/missing source seams fail rather than silently drifting.
- Independent actual-dollar books with $25,000/$50,000/$25,000 initial capital; no inter-sleeve transfers. Model seed validation is adjusted only for research dollar units and frozen research parameters. The original $750 minimum trade in $100,000 model units becomes $187.50/$375/$187.50 in the three actual-dollar books; it is not silently raised to $750 per small sleeve. Current risk thresholds, ordinary holding rule, stops and rank retention stay fixed independently of capacity. Only the named momentum ablation is removed in each diagnostic arm.
- The existing stock classifier supplies historical-screen eligibility from audited `screenRows`; the source nine-name queue, sector and issuer selection, liquidity, event, price, gap and personal exclusions are retained. Sizing targets use absolute source rank, with equal Buy/Strong Buy treatment. No price-filling, fabricated MACD or fixture substitution.
- Offline manifest hashing, path containment, causal availability, calendar coverage, adjusted-bar parity, complete dated membership, sector/issuer/event cross-checks, and independent-review requirements. Substantive provenance review is an attestation, not cryptographic proof of historical facts.
- Append-only, credential-redacted FMP raw acquisition, using inherited proxy/CA behavior. This does not collect all required sources or certify point-in-time history.
- Immutable experiment locks bind code, specification, source manifest and data manifest before result execution. Output refuses overwrite. Runs cannot start with the supplied empty evidence template.
- CAGR, total return, zero-risk-free Sharpe, max drawdown, two-sided turnover, costs from fill assumptions, cash utilization/percentiles, holding-age attribution, blocked opportunity-days and full-path paired opportunity-cost differences. Terminal marked equity and common liquidation-cost sensitivity are separate.
- Paired stationary bootstrap (20-session expected blocks, 10,000 replicates, seed 20261016), return/CAGR/Sharpe/drawdown difference intervals and Holm correction over eleven primary comparisons. Fixed stress costs are reported in full, not used to select a favorable result.

## Commands

From repository root, with Node 24 and the existing dependencies:

```sh
node tools/c1-research/test.cjs
node tools/c1-research/run.cjs inspect
node tools/c1-research/run.cjs validate /absolute/research-data/manifest.json
node tools/c1-research/run.cjs freeze /absolute/research-data/manifest.json /absolute/work/experiment-lock.json
node tools/c1-research/run.cjs run /absolute/research-data/manifest.json /absolute/work/experiment-lock.json /absolute/work/new-results.json
```

Keep raw data, experiment locks and results outside the source tree and out of Git. The first target interval is 2023-01-04 through 2026-10-15, with inputs from 2021-11-01 for warmup. Incomplete coverage requires a new versioned preregistration before any returns are computed, not outcome-driven date selection. Run each universe separately; do not pool overlapping Nasdaq and S&P observations as independent samples. Universe field is `sp500` or `nasdaq100`; historical Nasdaq-100 is a separate independent dataset, not a claim about the exact prior Nasdaq research universe.

Raw FMP collection example (not executed successfully here):

```sh
python tools/c1-research/acquire.py historical-sp500-constituent /absolute/work/raw-membership
python tools/c1-research/acquire.py historical-price-eod/dividend-adjusted /absolute/work/raw-prices --symbol AAPL --from-date 2021-11-01 --to-date 2026-10-15
```

`FMP_API_KEY` comes only from the existing runtime binding. Never put it in an argument, receipt URL or Git. Entitlements/license review remains required. `historical-nasdaq-constituent` is available as an acquisition choice. No production/research refresh API is invoked.

## Evidence contract

Start with `evidence-manifest.template.json`; it intentionally fails validation. Artifact paths are relative to its directory, regular JSON files, and cannot escape via traversal or symlinks. Every artifact carries exact bytes/SHA-256 and a credential-free provider URL, retrieval timestamp and license.

Required roles:

| Role | JSON structure / requirement |
|---|---|
| `calendar` | Sorted actual exchange-session date array, including warmup. Independently validate holidays/closures against pinned production calendar. |
| `raw_prices` | Adjusted OHLCV rows with symbol, stable securityId, date, availableAt and decision-date adjustment evidence (`adjustmentAsOf`). Final-vintage adjusted history alone is insufficient because future split/dividend adjustments can alter price/liquidity gates. |
| `membership` | Complete interval rows: securityId, symbol, from, to (inclusive or null), availableAt. Historical omissions fail universe parity. |
| `sector_history`, `issuer_history` | Same interval format plus sector/issuer; one unambiguous causal assignment per evaluated security/date. |
| `corporate_actions`, `delisting_outcomes` | Explicit source action/recovery evidence, including zero recoveries. Empty lists require substantive reviewer confirmation that there are no omitted events. Normalized actions must retain production-supported event semantics. |
| `event_history` | Causally known interval records including blockNewCapital; full company-event coverage, not earnings dates alone. |
| `normalized_sessions` | Existing C1 dataset shape with prices, signals, positionSignals, universeSymbols, corporateActions and audited historical screenRows. Signals carry stable IDs, classification, momentum factors and canonical/causally reconstructed entryTiming. No normalizer is allowed to mark missing evidence clear. |
| `independent_verification` | Named reviewer, independent=true, two independentOrigins, findingsResolved=true, championAdapterParityApproved=true, reviewedArtifactHashes covering every other artifact. Same-vendor endpoints are not independent corroboration. |

The validator checks structural consistency and reviewer coverage. It does **not** independently establish that a named reviewer is independent or that a vendor's history is correct. Human review must verify the underlying evidence, complete removal/delisting handling, corporate-action conversion, screen quote/event methodology, and compiler cross-sectional ranking. Full historical normalization/source qualification is not completed by this PR.

## Three distinct claims

1. Accounting replay applies factual fills to original books. Saved accounting fixtures are suitable references for this arithmetic, not historical signals.
2. Exact historical production decision replay requires accepted vintages, actual account state and captured execution/quote/cash receipts. That evidence remains unavailable.
3. This program's control uses the exact current model source with a **common retrospective screen and dollar-unit adapter**, applying October rules throughout the historical interval. It is current-policy retrospective simulation, not a claim that production used October rules in 2023 or that historical live authority is reproduced. Independent adapter parity approval is required before execution. The old comparison wrapper's pre-October "Champion" is not used as this control.

Daily bars cannot reproduce 120-second quote freshness or unrecorded discretionary account actions. Historical `screenRows` require explicit source/reconstruction methodology and substantive review; setting quoteFreshnessPass=true is not evidence. No historical Schwab balance is invented. All arms use the same research cash/fee assumptions; production brokerage-cash rules are untouched.

## Actual status and limits

No historical comparison was run and no historical alpha result exists. Mechanical tests use explicitly synthetic inputs only; their returns are never reported as investment evidence.

The common managed proxy is unreachable (`Failed to connect to proxy port 8080`) for independent FMP access as well as prior Blob access, despite runtime reporting credentials ready. This is an acquisition transport blocker, not a reason to stop engineering. Once transport works, acquisition can proceed separately from production recovery. Dated sectors, complete event history, delisting outcomes and independent corroboration still need entitled/official sources; FMP membership and adjusted bars alone cannot establish them. An alternative is an immutable independently sourced export satisfying the manifest contract.

Previously recovered GitHub audit logs document original-vintage revisions and a baseline clock issue. Those diagnostic logs are not substituted for missing daily inputs. Reused historical periods remain exploratory; there is no sealed holdout. Bootstrap intervals resample realized returns rather than rerunning path-dependent decisions, and cannot capture all model/data uncertainty. Opportunity cost is measured through full portfolio path differences; rejected-candidate counts are descriptive and are never added as hypothetical profits.

No live parameters, holdings, cash or roles change. Minimum holding periods are analyzed descriptively; no holding-period optimization is implemented. No winner is automatically promoted.

## Deployment prevention

The PR changes `vercel.json` **only** to set `git.deploymentEnabled["research/c1-program-20261016"]=false`, preventing automatic previews for this research branch. Existing branch settings, cron schedules and production configuration are retained. No freeze manifest, checker, build hook or CI requirement is weakened. Research tests join the existing canonical CI through tools/c1-research-program-regression.cjs; no additional workflow is added. This branch must not be merged or deployed.
