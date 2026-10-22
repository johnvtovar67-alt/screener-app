# FMP event response handling — October 22, 2026

The owner explicitly requests a focused repair of the two production provider failures on `fcb16a9a460ba6586e6c2e84014061d82581acb9`: earnings `DAILY_OUT_OF_RANGE` and M&A `MALFORMED_RESPONSE`. Merge and production deployment are authorized only after required tests, CI, freeze/integrity and build checks pass. No strategy, account, historical-data or eligibility changes are authorized.

## Earnings: optional enrichment changes dates after filtering

At 19:19:42 UTC, the exact FMP `stable/earnings-calendar` query for October 20 returned 247 records with `includeReportTimes=true`: 243 October 20 dates and four October 21 dates. The same query without the optional flag returned 247 records, all dated October 20. Comparing symbol plus EPS/revenue actual/estimate fields proves an identical economic row set; no record was discarded. The changed symbols were `296A.T`, `ACCENTMIC.NS`, `FAL.AX` and `FALFF`. Enriched records also contain optional time, fiscal-period and confirmation fields.

The required verifier treats calendar dates as its policy input. Optional enrichment made an otherwise correctly filtered day fail its exact date-coverage predicate. All ten un-enriched daily queries for the unchanged October 20–29 policy window returned valid, uncapped dates: 247, 410, 987, 585, 187, 5, 375, 898, 1,276 and 1,900 rows respectively. None contained CRWD.

The correction removes only `includeReportTimes` from the required coverage query. It does not filter out spill records, shift dates, enlarge the policy window or relax any check. Raw shape/date/range/cap, complete daily fallback, contradiction, pagination, provider failure, freshness and expiration checks remain. The separate informational material-catalyst function is unchanged.

## M&A: valid nullable schema does not establish target identity

The observed latest-M&A page contains 1,000 rows, including 162 with null target symbols. These are often named private targets, so a null symbol is a legitimate provider shape rather than malformed JSON. Two have a target CIK, but the verifier has no validated issuer mapping that permits substituting that field.

One record has all three target identifiers null:

- Acquirer symbol/name/CIK: `QCRH`, `QCR HOLDINGS INC`, `0000906465`.
- Transaction date: `2022-10-28`; accepted date: `2022-10-28 14:38:59`.
- Target symbol, target company name and target CIK: null.
- Filing: https://www.sec.gov/Archives/edgar/data/906465/000110465922112380/tm2228811-1_s4.htm

The old parser classified every null target symbol as `MALFORMED_RESPONSE`. The repair accepts only the legitimate explicit-null schema, then reports `TARGET_IDENTITY_UNAVAILABLE` with `complete=false`. A missing symbol field, invalid non-null symbol, invalid date or malformed body still fails schema validation. No null/name-only target is ignored or treated as negative evidence; no acquirer identity is substituted. A valid target symbol continues to trigger the existing target-company restriction even when descriptive fields are null.

FMP's [latest endpoint](https://site.financialmodelingprep.com/developer/docs/stable/latest-mergers-acquisitions) supplies global paginated records. Its [search endpoint](https://site.financialmodelingprep.com/developer/docs/stable/search-mergers-acquisitions) is a textual company-name search across acquirers/targets; it does not document an issuer-keyed negative-coverage mechanism that resolves an entirely unidentified target. Empty name-search results cannot repair that known gap. No new lookback limit or inferred private-target exemption is introduced.

The unsupported requirement is reliable target attribution/exclusion for that unidentified filing (and any other unidentifiable required record). Until the provider supplies that identity or independently verified matching evidence exists, M&A remains UNVERIFIED and new capital remains blocked. Investigation stops at that limitation; no speculative clearing or new collection infrastructure is added.

## Scope and verification

Only `lib/eventRisk.js` changes application behavior. Its single affected freeze hash and this explicit owner authorization are registered; freeze/integrity implementations and build/CI hooks are unchanged. The isolated branch is added to Vercel's existing disabled-deployment map; main and crons retain their normal behavior.

Observed public response shapes are preserved in a sanitized regression fixture. Focused tests exercise the enrichment-triggered date failure, canonical-date coverage, existing earnings blocking boundaries, valid nullable M&A fields, unresolved/null/name-only targets, and genuinely malformed evidence. Existing missing/stale/adverse/contradictory/capped/paginated cases remain fail-closed. No credentials, account data, accepted history, cash, holdings, transactions, strategy thresholds or eligibility requirements are modified.

Final build, CI, merged commit, production READY status and live CRWD provider receipts are recorded in the isolated PR. A successful earnings repair does not authorize a CRWD purchase while M&A remains unverified.
