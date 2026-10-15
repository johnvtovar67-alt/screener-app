# Separate fresh C1 historical research

This checkpoint is an executable partial signal study authorized by the owner's October 14, 2026 execution assignment. It starts from the preserved lifecycle specifications in `../c1-lifecycle-20261014/six-challengers.json`. It does not modify the frozen 48-Challenger experiment, PR #262, production trading code or account records.

Read `PROTOCOL.md`, `PERMISSIONS.md` and `acquisition-audit.json` before rerunning. The public checkpoint deliberately contains no prices, price paths, signal event rows or market-derived numerical findings. Public derived-result display rights have not been established. The owner receives the aggregate numerical report privately. No licensed source data was retained.

## Reproduce with the existing authorized connection

Use Python 3.10+ (standard library only) in the account holder's private research environment. An existing `FMP_API_KEY` environment binding is required. Do not put a key in a command argument, file, notebook output or Git. Verify subscription, location, data-use permission and remaining budget for the new session; the saved receipt/readiness is not a permanent entitlement certificate.

```sh
python -m unittest discover -s research/c1-fresh-20261014 -p 'test_*.py' -v
python research/c1-fresh-20261014/acquire.py \
  --private-output /absolute/private/location/owner-aggregate.json \
  --public-audit /absolute/private/location/acquisition-audit.json
```

The private output must be outside the Git checkout. The acquisition audit contains only structural metadata and input-response SHA-256 hashes. The command makes sequential bounded requests with no retry, keeps licensed rows in process memory, validates calendars and adjustment/overlap consistency, then calls pure `analyze(data)`. It writes only the aggregate owner result and non-price audit. Keep both outputs private unless their actual contents and publication rights have been reviewed. The public audit in this checkpoint has been reviewed to contain no price-level/derived-performance data.

Fresh provider vintages can change; response hashes record this run, but no claim of future numerical equality is made because permanent input retention was not authorized. A later session can recover the code/protocol and obtain a new authorized vintage, not reconstruct the exact original private dataset. A private retained-input license would be needed for exact numerical replay.

## Interpretation

Champion/F comparison is the exact raw return factors, not global/sector percentile ranking or their portfolio exits. H/P are fixed-quarterly-entry marginal trigger experiments and compare against a scheduled 63-session adjusted-close reference. The executed numerical comparison covers NVDA/PG only after the documented output-path amendment; the full eight-name acquisition checks remain available. All entries/exits are adjusted-price proxies. Original close-to-next-open timing is preserved; literal traded prices, separate dividends, whole-share accounting and other exits are absent. Forward returns and recovery labels are outcomes, never decision inputs. All observations are dependent development research, with no selected winning rule or production authority.

## Complete portfolio replay still requires

1. Every decision-date eligible security, sector/issuer identity and ranking input, including unheld opportunities; point-in-time universe anchors, changes, removals and delisting cash recoveries.
2. Complete source-compatible adjusted OHLCV plus actual executable opens, corporate-action/share transformations, cash dividends and vintage/availability evidence. Intraday data or a specified conservative OHLC rule is required for stop sequencing and gaps.
3. Canonical seeded account/sleeve state, actual source entry cost bases and original no-op continuation parity, quantities, holdings, cash, fees and capital flows; no account records may be inferred or overwritten.
4. The full unchanged engine order sequence, all stops/portfolio controls, replacement queues, reentries, issuer/sector limits, whole-share affordability and independent 12/25/50 bps cost paths. Include cash opportunity cost and matched ownership endpoints.
5. Documented licensed retention and processing rights, private storage/deletion controls, publication/display rights if results leave the account holder, and remaining subscription budget.
6. Prespecified paired reporting and dependence/multiplicity controls, with a genuinely new prospective untouched validation period before any confirmatory performance claim.

Repository restore does not depend on Blob, archive recovery or production endpoints. The frozen older artifacts are preserved as source context and are not rerun by this code.

Read `CHECKPOINT.md` for execution status and `PROTOCOL.md` for the report-output amendment. `sentinel.py` records the one-time bounded continuation and must not be rerun as an unrestricted acquisition command. For a new authorized study, start with `acquire.py` and a new audit destination.
