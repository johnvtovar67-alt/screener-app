# Price-unit qualification sources

The staged sentinel test qualifies units and coverage. It does not reconstruct
the ranking universe and cannot report a C1 historical portfolio result.

Public FMP documentation, reviewed October 15, 2026:

- [Historical price guide](https://site.financialmodelingprep.com/how-to/fmp-historical-price-apis-from-light-charts-to-dividendadjusted-analysis), updated March 31, 2026: the non-split endpoint supplies historical nominal prices despite its `adjOpen/adjHigh/adjLow/adjClose` field names. The dividend-adjusted endpoint is described as a total-return-style history, rather than traded dollar prices. This is endpoint intent, not independent numeric validation.
- [Unadjusted Stock Price API](https://site.financialmodelingprep.com/developer/docs/stable/historical-price-eod-non-split-adjusted): OHLC values do not incorporate stock-split adjustments. Daily volume is supplied, but the page does not precisely establish the adjustment convention for volume.
- [FMP FAQ](https://site.financialmodelingprep.com/faqs?code=data): the `close` field is split-adjusted and the dividend-adjusted close also incorporates dividends. Field names must still be interpreted in their endpoint context.
- [Dividend company API](https://site.financialmodelingprep.com/developer/docs/stable/dividends-company) and [dividend calendar](https://site.financialmodelingprep.com/developer/docs/stable/dividends-calendar): `date` is the ex-dividend date; declaration, record and payment dates are separate fields. The market calendar has a documented maximum 90-day request range, 4,000 rows and pagination. A sampled page is not evidence of complete market coverage.
- [Split company API](https://site.financialmodelingprep.com/developer/docs/stable/splits-company) and [split calendar](https://site.financialmodelingprep.com/developer/docs/stable/splits-calendar): numerator divided by denominator is new shares per old share. A split date needs to be checked against the transition observed in the two price views; no announcement-date timing is inferred.

## Offline checks

`validation.py` maps the full endpoint's unprefixed OHLC fields separately from
the other two endpoints' `adj` fields. It rejects malformed, duplicate,
out-of-range, nonfinite or geometrically invalid bars. Its independent calendar
includes [January 9, 2025's exceptional NYSE closure](https://ir.theice.com/press/news-details/2024/The-New-York-Stock-Exchange-Will-Close-Markets-on-January-9-to-Honor-the-Passing-of-Former-President-Jimmy-Carter-on-National-Day-of-Mourning/default.aspx): 316 context sessions comprise
253 observations through December 31 and 63 evaluation sessions.

The three views are matched by security and date. Nominal/full price scale is
compared across every OHLC field; complete company split records, where acquired,
test that scale including post-evaluation splits. Those later actions may explain
the current-vintage scale without becoming in-period economic events. Dividend
and full prices are tested for a common within-day adjustment, with ex-date
factor changes checked against acquired dividend records.

The volume relationship is measured rather than presumed. An identical volume
field across endpoints does not independently certify historical exchange units.
The validator separately checks dividend-adjusted volume against full-endpoint
volume. For each decision date, it tests whether dividing that current bar's
volume by `nominalClose[t] / fullClose[t]` restores the nominal endpoint's unit.
That divisor removes later split scaling from a causal prefix; it differs from
the dividend-adjusted price rebasing multiplier. Neither operation permits use
of future rows in a decision's indicators.
Missing observations are reported individually and never imputed or explained
as IPOs without separate identity evidence. Overlap retrievals are compared
after normalization without merging different provider vintages.

A cash-dividend holding return and a backward-adjusted return have distinct
formulas. The validator reports their residual rather than forcing equality.
Dividend receivables, payment availability, nominal shares and actual execution
dollars still require the separate portfolio accounting adapter. The diagnostic
tolerances are fixed rounding checks, not tunable strategy thresholds.

The detailed numerical report and all licensed inputs remain private. Internal
agreement does not establish independent vendor validation, original-as-known
history, completeness of an unacquired action calendar, or account-wide quota.
