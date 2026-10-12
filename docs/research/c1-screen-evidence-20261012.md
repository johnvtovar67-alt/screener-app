# Same-session C1 screen evidence contract — October 12, 2026

The owner explicitly authorized repairing the confirmed first-load/reload
composition defect, retaining verified selection when required evidence is
incomplete, without changing ranking, account decisions, strategy, cash or
execution rules. Merge and deployment remain unauthorized until demonstration.

## Defect and repair

The Opportunities loader previously captured candidates before the parallel
account read finished. An initial compact request could omit `screenSymbols`,
discard C1 candidates under the broad 80-row cutoff, and classify lower-ranked
names in their place. Missing rows were then described as currently ineligible.

`pages/index.js` now obtains the current read-only account analysis first, passes
its complete candidate list to the unchanged compact endpoint, and fences
superseded screen loads. Opening preparation remains a separate downstream call.
There is one compact screen request and no full-universe fallback.

`lib/c1ScreenEvidence.js` validates required-symbol presence, current-session
identity, non-stale rows and existing quote verification. Its continuity identity
includes the accepted source hash from the account decision ID and the complete
source stock-screen snapshot; account/cash revision numbers do not reset it.
The last verified classification is retained for that identity. Unavailable
evidence or live checks that would change its selected set pause fresh capital,
rather than replacing it with lower-ranked selections. A changed accepted source
identity invalidates the retained classification. Without prior verified state,
the screen remains pending and cannot select lower names from partial evidence.

`components/C1AccountOpportunities.js` retains that state in a mounted-component
ref and commits verified state after render. Retained ratings are continuity,
never capital authority. Fresh quantities require current complete evidence and
the unchanged manual recommendation/opening checks. Exit orders retain their
existing path. Held treatment and priority numbering are unchanged. Missing
rows no longer produce a source-ineligibility assertion.

The continuity ref and bounded browser cache hold only classification evidence:
no production account or market record is written. A new page mount restores
only a cache matching the exact accepted source identity, then requires complete
current evidence again before permitting fresh quantities. Pending results never
overwrite the verified cache. Source changes invalidate it.

## Scope and release guard

The existing classifier, source ranking, source eligibility, sector/issuer
selection, account service, account ledger, entry/exit policy, cash/brokerage
cash calculations, execution checks, and `/api/top5` selector are unchanged.
Only the two changed application files and new evidence module receive updated
entries in `docs/c1-release-freeze.json`, alongside this owner authorization.
Neither release guard, canonical guard, build hook nor dependency is changed.

## Verification

`tools/c1-screen-evidence-regression.cjs` executes the real loader with delayed
account reads and the unchanged compact selector. It checks first load with no
account state, later reload, nine candidates in exactly 80 rows, one screen
request, exact classification parity and ten same-session repeats. It checks
omission, stale/unverified rows, changed event/quote/gap/liquidity checks,
accepted-source invalidation, account revision continuity and superseded loads.
The compiled real React component verifies retained tiles/Watch, pending wording,
held DELL and VLO/ILMN priorities. Existing classifier, response, UI authority
and cash UI regressions also pass during focused verification.

The final guarded `npm run build` passed both unchanged release guards, all
87 suite checks (regression scripts plus trade simulation), Next compilation,
static page generation and production build tracing. The extended browser-cache
remount and Buy/Add-versus-exit regression also passed separately after the
suite. Ten ranking/compact/account/exit/execution/manual/cash authority files
were compared byte-for-byte against deployed main and remain unchanged. Main
and production both remain f683bfc4e819c1d87909086f271af15addd8120c; the repair is
local on `fix/c1-same-session-evidence`. No commit, push, merge or deployment was
performed.

After the demonstrated fix, the owner explicitly authorized merging and
deploying it, followed by repeated same-session production verification.
Only synthetic offline fixtures are used; production data, holdings and cash are
not modified, and completed historical research is not rerun.

## Impact of the original defect on recommendations and triggers

The compact screen was not an input to server account analysis, continuation,
opening projection, recording validation or manual recommendation generation.
`prepareC1AccountExecution` rebuilds from the saved account and accepted book,
collects the required opening inputs, projects through the account simulator,
checks price revisions and applies execution cash caps. Its manual review is
built from that checked plan. No browser stock list is submitted to those paths.

The browser could nevertheless change real recommendation visibility. An
omitted source candidate could lose its Buy rating and its Buy/Add quantity in
the Opportunities tiles and Portfolio action box. A lower candidate falsely
selected by the incomplete classifier could expose an already checked matching
server Buy/Add order. It could not fabricate that order or create a quantity for
a stock absent from the checked plan. Display suppression and promotion could
therefore influence an owner's manual trading decisions, even though the server
authorization was not changed.

The held-position early Top-9 and age-30 rank exit counters use the complete
accepted opportunity pool inside `c1AccountSimulator`, not the compact screen.
Profit arming and counters use accepted highs, entry basis, close gain and that
same pool. Stops and portfolio drawdown controls use account economics and
accepted/verified prices. None is incremented, reset or persisted by screen
classification. A displayed currently-ineligible MPC was not automatically
outside Top 6/Top 9 for account counter purposes.

Server manual recommendation orders/quantities remain isolated; the subset and
labels presented to the owner could be affected. Broker execution is manual;
recording still requires a server-checked order and actual reported fill, cash
authority and remaining quantity. The new regression explicitly checks visible
new-entry Buy and Add quantities, incomplete-screen suppression, unchanged
server plan/review objects, and continued visibility of checked exit quantities.
