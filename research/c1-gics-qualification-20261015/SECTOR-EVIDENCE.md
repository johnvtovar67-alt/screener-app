# Effective-dated GICS sector qualification

This source check was performed on 2026-10-15 for the separately authorized
GICS reconstruction of 2024-12-31 through 2025-04-03. It made zero FMP API calls,
acquired zero price histories, used no frozen research archive, and changed no
credentials, network configuration, production rules or account records.

## Finding

The historical GICS baseline and March membership-event sectors have credible
dated corroboration. The evidence retrieved so far does **not certify continuous
company-level sector validity for every eligible day**. This is a specific
classification-ledger gap, not a concern about the user's personal FMP/Codex
research authorization and not a requirement to recover the original archive.

Seven in-period public roster snapshots have no observed sector-label changes
among continuing names. The December 31 SEC schedules corroborate all 503
baseline security lines. These checks are useful, but equal snapshots cannot
exclude an intervening reassignment and reversal. No such reversal is alleged.
The missing evidence concerns completeness, not an identified incorrect sector.

## Primary sources checked

1. [August 2024 GICS methodology](https://www.msci.com/indexes/documents/methodology/1_MSCI_Global_Industry_Classification_Standard_GICS_Methodology_20240801.pdf),
   sections 3.2 and 4, pages 16–17, is a contemporaneous methodology describing
   both MSCI and S&P DJI. The issuer's classification propagates to its equity
   securities, while distinct share classes remain distinct securities. Reviews
   can follow significant restructuring, a new annual report or a client request.
   This document does not impose a month-end-only effective-date rule. Annual
   review of the taxonomy is separate from company classification maintenance.

2. [February 2025 MSCI Global Investable Market Indexes methodology](https://app2.msci.com/eqb/methodology/meth_docs/MSCI_GIMIMethodology_Feb2025.pdf),
   section 3.3.3, page 71, says non-event GICS changes are announced twice monthly
   and implemented in MSCI indexes at the last US business-day close. That is an
   MSCI index implementation policy, not demonstrated authority for every S&P
   500 company or the effective dates of GICS Direct. Event-driven changes also
   require separate treatment. Do not use this policy to certify S&P continuity
   without an applicable S&P policy or provider confirmation.

3. Actual [MSCI public announcements](https://app2.msci.com/webapp/index_ann/Announcement?doc_type=ANNOUNCEMENT&format=html&lang=en&prod_type=STANDARD&visibility=public)
   distinguish publication from implementation. Retrieved notices include
   [January 2](https://app2.msci.com/webapp/index_ann/DocGet?format=html&lang=en&pub_key=S4tnc74CeJc%3D),
   [January 16](https://app2.msci.com/webapp/index_ann/DocGet?format=html&lang=en&pub_key=kmHpZoChLTI%3D),
   [February 11](https://app2.msci.com/webapp/index_ann/DocGet?format=html&lang=en&pub_key=fimcQmfq0mw%3D),
   and [April 1](https://app2.msci.com/webapp/index_ann/DocGet?format=html&lang=en&pub_key=7DDD%2FE16Q5w%3D).
   The January 16 notice implements its announced non-US change at January 31
   close; the April 1 change is effective April 30, beyond the test end. These
   notices expressly cover MSCI Global Standard indexes and omit changes solely
   at subindustry level. The retrieved selection is not a complete target-period
   sector-action ledger and does not establish the full S&P coverage set.

4. The official [MSCI US Equity GICS Changes page](https://www.msci.com/indexes/index-resources/index-review-subscribers/us-equity/gics-changes)
   links to `https://app2.msci.com/eqb/option_us/GICS.html`; that resource returned
   HTTP 401 through the supported public web connector. No authorization bypass,
   new credential request or repeated access attempt was made. Do not interpret
   this as proof that historical classifications do not exist or that a new paid
   subscription is required.

5. The [S&P March 7 membership announcement](https://press.spglobal.com/2025-03-07-DoorDash%2C-TKO-Group-Holdings%2C-Williams-Sonoma-and-Expand-Energy-Set-to-Join-S-P-500-Others-to-Join-S-P-100%2C-S-P-MidCap-400-and-S-P-SmallCap-600)
   supports four additions and four deletions, their GICS sectors, and effectiveness
   before March 24 open. These facts may be known from March 7 but must not alter
   membership on March 7. The announcement does not certify no sector changes
   among all other continuing constituents.

6. All eleven sector-fund investment schedules are available in the [March 31,
   2025 SEC semiannual report](https://www.sec.gov/Archives/edgar/data/1064641/000119312525132907/d77488dncsrs.htm).
   It can provide a second primary sector anchor and independent membership/class
   corroboration. Its filing/publication date follows the test period; it is an
   ex-post validation source, not information available to January decisions.
   This check located the document; it does not claim that its full schedule has
   been parsed or reconciled in this component.

7. Current [S&P GICS methodology](https://www.spglobal.com/spdji/en/documents/methodologies/methodology-gics.pdf),
   April 2026, also describes annual/ongoing company review, without a month-end-only
   rule. Current [S&P U.S. indices methodology](https://www.spglobal.com/spdji/en/documents/methodologies/methodology-sp-us-indices.pdf),
   July 2026, establishes the GICS basis of Select Sector partitions but quarterly
   **weight capping** is not a restriction on classification-change timing. Current
   [equity policies](https://www.spglobal.com/spdji/en/documents/methodologies/methodology-sp-equity-indices-policies-practices.pdf),
   August 2026, include event-related attribute updates. These later vintages
   cannot silently establish a 2025 timing contract.

## Smallest credible closure

Obtain one narrowly scoped existing-source evidence packet for this interval:

- an S&P DJI/SSGA effective-dated list of every sector migration for S&P 500
  members from baseline through April 3, including an explicit no-change result
  if none occurred; or
- written confirmation of the applicable S&P classification implementation
  calendar in force during the period, plus the complete classification actions
  at each allowed implementation date and all corporate-event exceptions.

Reconcile its security/class keys to the existing 503-line baseline and four
additions, record prior/new sectors and publication/effective dates, and validate
against the already identified SEC schedules. A provider can certify the bounded
change list without delivering a full historical sector database. First use
existing public reports, fund-manager records or existing institutional access;
no new subscription is proposed. No outbound message has been sent.

The narrow request should specify **S&P 500 membership-linked GICS sector
classification only**, baseline after the December 31, 2024 close through the
April 3, 2025 close inclusive, for the union of every constituent eligible during
that interval. Require the baseline sector for each security and an exhaustive
change ledger, including temporary spin-off/placeholder lines and same-day
changes. For each row require issuer/security identifier, share class, dated
symbol, prior/new sector code and label, exact effective date and market phase
(before open/after close), original announcement date/time or dated source,
first-available/publication date, and any retrospective correction flag. Ask for
explicit confirmation whether the list is complete and whether zero migrations
means no changes, rather than missing coverage. Request an existing export or
record, not new data collection infrastructure. This scope does not request FMP
sector history or seek to equate FMP and GICS classifications.

As-of validity and information availability must be stored independently. A
post-period confirmation may corroborate continuity; it cannot backdate the
availability of information. Use the already prior-dated baseline observation
and contemporaneously announced changes as decision inputs, with delayed SEC
filings reserved for validation. If a corrected event was originally public only
after effectiveness, document the affected decision dates and fail the strict
point-in-time gate for those dates rather than backfill it silently.

If the applicable timing contract is confirmed as month-end-only outside listed
corporate events, full eleven-fund January 31, February 28 and March 31 schedules
become a bounded validation route. They must still be reconciled to the GICS
definition and exception ledger, and their delayed publication must not be used
as if known contemporaneously. Without that contract, month-end holdings alone
remain discrete observations rather than an effective-dated change ledger.

Do not solve the gap by automatically carrying a sector forward, excluding an
unverified high-ranked security, or retroactively assigning a sector from the
March report. A missing member-day must block the full-comparison acquisition
gate and identify the exact evidence required. A separately defined observed-
classification experiment would require an explicit methodology change.

Actual bounded notice review: four retrieved public MSCI Global Standard GICS
notices were published within the target interval (January 2, January 16,
February 11 and April 1). Two report no Industry-level changes; the other two
refer to non-US issuers, with the April notice effective outside the interval.
No target S&P 500 sector migration was established by that selection. This is
**not** a finding of zero S&P 500 migrations: the notice universe and retrieved
date sequence are incomplete for that claim. An April 16 notice was also
inspected as a timing example and is outside the target interval.
