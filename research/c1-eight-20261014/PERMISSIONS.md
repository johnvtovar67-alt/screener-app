# FMP permissions and acquisition gate — eight-security expansion

Reviewed 2026-10-15 UTC / 2026-10-14 America/Chicago, before new market-data acquisition. This is a record of evidence and conservative handling arrangements, not a new license grant. The earlier experiment and its permissions note remain unchanged.

## Permitted scope and private handling

The preserved account receipt was rechecked read-only: **Ultimate Access — Annual, August 29, 2026 through April 24, 2027**. The receipt, payment details, mailbox identifiers and credentials are excluded from this checkpoint.

[FMP's private-research guidance](https://site.financialmodelingprep.com/insights/platform/can-you-publish-fmpsourced-charts-tables-or-research-in-a-newsletter) permits the individual account holder's personal, non-business notebook or spreadsheet, subject to the plan and terms. It distinguishes that use from employer/client work, multi-person reports and public publication. Calculated returns, rankings and signals can still require display rights; transformation or a small table is not an exemption.

The expansion is limited to that same private personal research arrangement:

- Process licensed response bodies, prices, adjusted prices and membership rows only in memory in the existing execution environment. Do not place licensed inputs in model context, stdout, logs, disk, Git or public artifacts.
- Preserve only aggregate numerical summaries for the individual owner in a private, non-Git output location; exclude raw/normalized inputs, reconstructable price paths, dated per-event outcome tables and provider response bodies. Preflight the destination before acquisition. Do not interpret private-summary preservation as perpetual licensed-input retention.
- Publish only nonproprietary code, formulas, declared symbols/dates, non-price structural audit, hashes, provenance, tests and limitations. Keep market-derived numerical results, signal tables and licensed inputs out of the public repository.
- On termination, follow applicable cessation/deletion requirements for licensed inputs and derived information. Recheck rights before business use, sharing with another person, public numerical output, retained input datasets or any audience change.

[FMP Terms of Service](https://site.financialmodelingprep.com/terms-of-service), last updated August 1, 2023, limit individual licenses to personal non-business use (§2.2.1), restrict publishing/transferring data and derived information (§§2.2, 2.6), and address copying and deletion (§§2.2.1, 6.2–6.3). Section 2.8 requires controlled processing/storage locations and notification to FMP of their IP/domain aliases. Existing location-notification evidence was not found; continuing in the existing environment does not prove this duty was discharged. No new processor, location, credential or infrastructure is authorized by this note. The terms-linked Acceptable Data Use Policy was unavailable in the earlier review; no broader rights are inferred.

## Request and bandwidth evidence

The [current personal pricing page](https://site.financialmodelingprep.com/developer/docs/pricing) lists Ultimate full historical access, bulk/batch delivery, **3,000 calls/minute** and **150 GB over a trailing 30 days**. These are advertised ceilings, not the current account remainder.

The previous experiment consumed its full **20-call** local cap (3.58 MB recorded). The owner has now authorized a separate bounded expansion. The proposed new local cap is **20 calls and 12 MiB cumulative uncompressed response bytes**, with approximately 16 planned calls: eight securities plus SPY calendar, two overlap checks, four corporate-action checks and one membership request. This cap is independent of account usage by the production application or other sessions. No add-on, plan change, retry budget or additional purchase is authorized. FMP may meter bandwidth before compression, according to its [usage FAQ](https://site.financialmodelingprep.com/faqs?code=platform).

## Actual remaining account quota — not yet verified

[FMP's dashboard documentation](https://site.financialmodelingprep.com/insights/platform/fmp-dashboard-update-monitoring-account-and-api-activity) identifies a Usage block below the API key with current calls against the limit and trailing-30-day bandwidth. The [FAQ](https://site.financialmodelingprep.com/faqs?code=platform) gives the paths Dashboard → API Key and Dashboard → View Data Bandwidth Consumption → Data Usage; a detailed report can be requested from support. The documented review route does not require a historical or quote request.

Public documentation searches did not establish a supported API-key-authenticated remaining-quota endpoint. This execution context has the existing FMP API-key connection, but no verified authenticated dashboard session. Targeted read-only account correspondence confirmed the subscription receipt but provided no current usage report or additional display/retention/location grant. No login, API-key probe, credential rotation or market-data call was made for this review.

**Acquisition gate at this review:** remaining account request/bandwidth headroom is **UNVERIFIED**. The new 20-call local cap must not be represented as the remaining subscription quota. A successful data response would establish entitlement at that instant, not the required advance confirmation of remaining account quota.

**Concrete completion path:** obtain a current read-only Usage/API Details reading for this existing account, with the key and account identifiers redacted, showing enough call headroom for the proposed cap and at least 12 MiB uncompressed bandwidth headroom. Record source, observation time, applicable reset/rolling window and the processing-location notification status in the private audit. Then declare the separate new provider vintage, preflight private outputs, and execute once within the cap. Do not recover old archives, create credentials, troubleshoot Blob storage or change production C1, PR #262 or the frozen 48-Challenger research. Code, protocol and synthetic verification can proceed while this gate is unresolved.
