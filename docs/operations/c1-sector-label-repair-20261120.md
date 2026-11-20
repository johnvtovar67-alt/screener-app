# Portfolio sector labels

The owner reports MSTR and MTD as Sector unavailable and explicitly requests a
small repair. Main and canonical production baseline is
6398f3f33df67bf61ddceb099d9bbe5eff301a34.

The portfolio card currently reads only a dated Swing screen candidate or
entryContext.sector. A Core holding has no accountDecision, so Core MSTR cannot
reach either source. Normal entry-context records also omit sector. A literal
Other in a candidate prevents the old truthy fallback from trying another
known source. The exact current private MTD candidate payload is unavailable;
the source gap and the owner's missing-label observation are established.

Only pages/index.js and new pure lib/portfolioSectorLabel.js change in the
application. The same card renderer supplies desktop and mobile labels. Read
a valid same-dated candidate, held entry context, verified same-source opening
exposure holding, or existing stock profile, in that order. Reject placeholder
values before falling back. MTD Healthcare and MSTR Technology are last-resort
display profiles, not trading classifications. MSTR additionally shows
Theme: Bitcoin / Digital Assets. Other genuinely unknown tickers remain
Sector unavailable. A Core holding needs no Swing decision or execution review.

Profiles checked November 20, 2026:
- MTD Healthcare, Diagnostics & Research, precision/laboratory instruments:
  https://www.fidelity.co.uk/factsheet-data/factsheet/US5926881054-mettler-toledo-international-inc/profile
- MSTR information-technology sector (fund filing specifies March 1, 2026):
  https://www.sec.gov/Archives/edgar/data/1928561/000121390026050473/ea0287769-11_497k.htm
- Strategy's Bitcoin treasury and enterprise-software operations:
  https://www.strategy.com/investor-relations

This helper is consumed only by portfolio presentation. It performs no fetch,
storage write, account mutation, financial calculation or authority check.
Sector/issuer facts consumed by C1 exposure and selection remain unchanged.
No ranking, sizing, stops, cooldowns, cash, basis, fills, purchase dates, account
risk references, normal jobs, dependencies or configuration change. No manual
override control or account-schema change is introduced.

Update only these two affected freeze entries and document the authorization.
Preserve every previous fixture/pin using one exact pages/index.js source
inverse. Required exact-head CI jobs and normal production build remain
mandatory. Verify the canonical commit and served bundle; the owner must
separately confirm the actual MSTR and MTD cards after reload. No private
account endpoint is used as a production health check.
