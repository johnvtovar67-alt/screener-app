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

The old parser classified every null target symbol as `MALFORMED_RESPONSE`. The initial repair accepted the legitimate explicit-null schema but made the entire global feed incomplete. The October 23 production follow-up preserves an `unattributedTargetCount` in the source receipt instead: an anonymous global row is not evidence about every requested issuer and therefore cannot impose a market-wide purchase block. A missing symbol field, invalid non-null symbol, invalid date or malformed body still fails schema validation. No acquirer identity or company-name guess is substituted. A valid target symbol continues to trigger the existing target-company restriction even when descriptive fields are null.

FMP's [latest endpoint](https://site.financialmodelingprep.com/developer/docs/stable/latest-mergers-acquisitions) supplies global paginated records. Its [search endpoint](https://site.financialmodelingprep.com/developer/docs/stable/search-mergers-acquisitions) is a textual company-name search across acquirers/targets; it does not document an issuer-keyed negative-coverage mechanism that resolves an entirely unidentified target. Empty name-search results cannot repair that known gap. No new lookback limit or inferred private-target exemption is introduced.

The unsupported requirement is reliable target attribution/exclusion for that unidentified filing (and any other unidentifiable required record). Until the provider supplies that identity or independently verified matching evidence exists, M&A remains UNVERIFIED and new capital remains blocked. Investigation stops at that limitation; no speculative clearing or new collection infrastructure is added.

## Scope and verification

Only `lib/eventRisk.js` changes application behavior. Its single affected freeze hash and this explicit owner authorization are registered; freeze/integrity implementations and build/CI hooks are unchanged. The isolated branch is added to Vercel's existing disabled-deployment map; main and crons retain their normal behavior.

Observed public response shapes are preserved in a sanitized regression fixture. Focused tests exercise the enrichment-triggered date failure, canonical-date coverage, existing earnings blocking boundaries, valid nullable M&A fields, unresolved/null/name-only targets, and genuinely malformed evidence. Existing missing/stale/adverse/contradictory/capped/paginated cases remain fail-closed. No credentials, account data, accepted history, cash, holdings, transactions, strategy thresholds or eligibility requirements are modified.

Final build, CI, merged commit, production READY status and live CRWD provider receipts are recorded in the isolated PR. A successful earnings repair does not authorize a CRWD purchase while M&A remains unverified.

## Live follow-up: previously masked symbol-shape failures

Production `8a86882ac30e7b009240cb4bad76f7318bfce1f8` removed the date-enrichment failure but the final live check exposed `DAILY_MALFORMED_RESPONSE` and a remaining M&A `MALFORMED_RESPONSE`. The initial scan had checked all dates but had not enumerated every symbol-grammar rejection. A subsequent exact-validator check across every required daily response and the entire first M&A page identified these additional values, observed at `2026-10-22T19:40:31Z`:

- Valid global earnings identifiers containing a literal ampersand: `M&MFIN.BO`, `M&MFIN.NS`, `J&KBANK.NS` and `PE&OLES.MX`. The U.S.-oriented raw-symbol regex rejected them, causing an unrelated global calendar row to invalidate required coverage. Permit only the additional literal ampersand within the existing bounded provider identifier grammar. Do not discard the rows or alter requested C1 membership, eligibility or dates.
- Three Edify acquisition filing variants (`EACPU`, `EAC`, `EACPW`) dated June 9, 2023 use `targetedSymbol:"_"`, target name `ULHI` and null target CIK. The underscore is an explicit unresolved target, not a usable issuer symbol. Treat exactly that sentinel like explicit null: retain it in `unattributedTargetCount`, never map it to a requested issuer, and do not let it block unrelated stocks. Other invalid symbols remain malformed.

## October 23 production follow-up

The owner reported that every Watch candidate showed the same material-event block despite current quotes and available cash, then directed an immediate fix. Production evidence showed one unattributed M&A row made the shared global feed incomplete for all candidates. The repair is intentionally narrow: it changes no event definition, freshness, pagination, earnings, news, ranking, sizing, volatility, account or execution rule. Identified target symbols still block only their matching issuer; malformed, stale, unavailable or incomplete feeds still fail closed.

The all-null QCRH record remains unattributed and auditable; it is not converted into CRWD evidence from a name guess. This follow-up establishes feed coverage from the successfully validated global response while reserving a purchase block for positively identified target symbols. No further external investigation or new diagnostic mechanism is introduced. Required normal regression/build, integrity and freeze checks run in the existing CI on the exact isolated commit, alongside local focused tests and guards. All must pass before the authorized merge/deployment.

Production verification of PR 305 at 3:13 PM CT reached later M&A pages that the former first-page stop had masked. Those pages contained merger-shaped provider records with missing, invalid or wrongly typed target identifiers and optional invalid transaction dates. The follow-up classifies those rows as unattributed diagnostics instead of global issuer evidence. A valid target symbol always remains actionable and blocks its matching issuer even when optional descriptive fields or dates are malformed. A non-array/error payload, stale response, provider failure, incomplete pagination, repeated page or pagination overlap still makes the feed incomplete and fail-closed.
