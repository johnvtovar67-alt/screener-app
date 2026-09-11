# C1 readiness decision — September 11, 2026

The diagnostic repair is deployed and verified on production commit `c4e15835af7389601bacf64bb42cb831d3a7c6ac` ([PR 145](https://github.com/johnvtovar67-alt/screener-app/pull/145)). C1 trading reactivation does not pass the current acceptance review. This is a release/evidence conclusion, not a claim that C1's saved returns were negative or that the sector-data issue has a measured return impact.

| Check | Result |
|---|---|
| Regression suite and production build | Passed |
| Exact-head Vercel preview | Verified |
| Production health and commit | Verified |
| Known invalid baseline | Original preserved; separate diagnostic book initialized |
| Fabricated fills or validation sessions | None; zero fills, zero observed forward sessions |
| Shared Opportunities/Portfolio model status | Verified in browser and matching API documents |
| Queue coverage | All 27 sleeve entries / nine distinct names preserved |
| Repeated refresh | Same model identity and revision |
| Full-size authority | Off; zero target names, zero target allocation, no orders |
| Hosted holdings submission | Not executed: automatic approval review rejected the synthetic preview POST as potential sensitive disclosure; local comparison tests passed |
| Complete account-specific trading flow | Not established |

The companion `c1-production-acceptance-20260911.json` records hashes, identities, exact checks, and limitations. Browser navigation preserved the displayed refresh time on both preview and production. This verifies that tested navigation sequence, not every Safari/iPad reload scenario. The browser logs contained extension metadata errors and no application errors during these checks.

## Specific data dependency

The [Nasdaq universe status](https://screener-app-cq5t.vercel.app/api/research/pit-nasdaq-universe) and [dataset status](https://screener-app-cq5t.vercel.app/api/research/pit-nasdaq-dataset-status), retrieved September 11, explicitly disclose unavailable historical sectors. Their old R11 strategy disabled sector constraints. Frozen C1 instead uses sector limits of 50%, 50%, and 40% in its three books.

Source inspection in `lib/fmpResearchBacktest.js` shows that the Nasdaq compiler copies a profile sector without a decision-date lookup. The S&P compiler similarly copies a discovery profile sector/theme. The return-blind synthetic dependency check proves that sector labels can change C1 fills. It does not establish which real historical labels changed, or the direction or magnitude of any performance bias. Verified membership histories and price-only ranking do not resolve this separate input dependency.

The historical Nasdaq data is frozen through September 1. The production diagnostic book uses the different provisional broad universe through September 10. It cannot inherit historical index-universe performance merely because it calls the same simulator.

## What would change the decision

1. Establish dated sector assignments for the historical C1 member-dates actually consumed, preserving the classification semantics; any corrected replay remains a correction of inspected history, never a new holdout. Do not remove the sector limits to make the data issue disappear.
2. Bind a declared tested universe and timestamped market inputs to the frozen three-book engine, then verify its complete manual recommendation path across both pages. Shared diagnostic status is only part of that path.
3. Close the original fold and model-selection interpretation. The completed 1,000-seed fixed-candidate controls are post-selection diagnostics, not family-wise correction. Their existing records must remain unchanged.
4. Establish account state before calculating account-specific quantities. A broker connection is not inherently required: manually confirmed holdings, cash and transactions may establish that state. Current aggregate shares cannot establish undocumented historical sleeve ownership.

The user waived the 60-new-session waiting requirement. No replacement waiting period has been imposed. Existing holdings were not edited, no brokerage transaction was placed, and no historical result or control seed was rerun by this release check. The independent three-name, 1%-each, two-session pilot policy was not expanded.
