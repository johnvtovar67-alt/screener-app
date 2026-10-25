# Shared consumed Opportunities projection

State: locally verified; root owns freeze/canonical/full build and exact release
verification. No production request, account/provider/Blob write, cron or research
run was performed.

## What can proceed independently

The earlier full-server-replacement proposal is optional architecture work.
Current quantities already come from the server's `manualRecommendations`.
A useful incremental consolidation was possible without replacing the normal
independently timed join: share the actual presentation projection between the
SSR/browser component and the existing captured-response canary.

The concrete verification gap is that a checked Add can be present in the server
review while the held-position review prevents its display. The canary formerly
counted the checked order and explicitly could not assess that final suppression.
It now consumes the actual projection used by the UI when separate position
quotes are explicitly part of the capture. This is necessary to make such a
captured-projection claim trustworthy; a new all-in-one server response is not
necessary to do that work.

## Implemented

- `lib/c1OpportunitiesProjection.js` contains the previous synchronous
  post-evidence projection: readiness, checked-order filters/grouping, rating
  cards, held actions, Watch priorities and reason callbacks. It receives the
  same account/screen/position/retained-evidence inputs; a supplied clock makes
  deterministic replay possible. Its default clock reads remain at the exact
  prior evaluation points. Hooks, storage retention, evidence resolution and
  timers stay in the component. The renderer runs synchronously as before.
- The existing canary optionally adds only aggregate `presentationProjection`
  counts (actionable Buy/Add groups, sell actions and urgent held reviews) when
  `positionRows` was explicitly captured. Absent independent position quotes
  leave that assessment absent; malformed captures remain unverified.
  No request or server API payload is added. Browser-retained evidence is not
  sent to the server or promoted into checked-order authority.
- Existing canary statuses and counts retain their defined meaning and exact
  output parity. The diagnostic still says browser rendering and private
  account parity are NOT_VERIFIED and production acceptance NOT_ESTABLISHED.

## Exact evidence

- Complete projection extraction reversal reproduces the PR331 component
  SHA256 `794a87727bfb4dcfc17e98fbb6948690fd4fa64606a29febd3cd5e1691a335b2`.
  Reversing the earlier renderer extraction then reproduces the original
  component SHA256 `0b72fd1afff37128fce1f203753a1eebbf3afa6a73dee618a8c919a422d6c71c`.
  Existing frozen source hashes and assertions were not replaced.
- The existing 136 exact complete markup/effect/storage/timer comparisons PASS,
  including an advancing clock around expiry in both modes, retained failure,
  source replacement and independent recovery. Next scoped CSS is unchanged.
- The canary test reverses only the additive optional assessment and recovers
  the entire prior tool SHA256
  `410318bbe5b14dd4f2d8a614159f3cfb0c64887b0a66bba6f55ab89f199d51bd`.
  Every existing fixture compares its complete report with that original tool.
  All original statuses, counts and evidence limitations match exactly.
- A synthetic capture with an existing checked Buy/Add and a held position in
  Review retains positive `checkedBuyOrders` while the actual consumed projection
  reports zero actionable groups. Clearing only the existing held review restores
  that same order's presentation. No new order or quantity is generated; capture
  records remain byte-identical after assessment.
- Existing hold-pill, live-display, stock-classification, historical-UI-restore,
  brokerage-cash-UI, screen-evidence, compact-opportunities, UI-authority,
  position-presentation and purchase-reason-copy tests PASS. The historical
  position suite retains 451 assertions. Source-shape tests inspect the moved
  source or reverse the declared extraction before their original assertions.

## Files and hashes

Application hashes:

- `components/C1AccountOpportunities.js`:
  `4f7d2b6a031f021bd9b544177ab46675241602db1b7e52a72fe5928143ef09b9`
- New `lib/c1OpportunitiesProjection.js`:
  `48c45d1d6f215fdceb4f25b637e3717f3e014b868595eb3d0faf38d79c22c7e1`
- Existing `components/C1AccountOpportunitiesView.js` remains unchanged.

Tool changes: canary/tool regression, new projection-extraction restoration
helper, Opportunities-extraction regression and existing source-shape fixtures
hold-pill/live-display/stock-classification/historical-UI-restore. Root owns
manifest, durable documentation and release integration.

## Required remaining acceptance

Actual signed-in normal screen/account/browser acceptance remains necessary
release evidence. A permitted session and normal request flow must supply that
evidence. Isolated Chromium fixtures can verify failure/recovery composition but
cannot certify real account identity, live conditional persistence or actual
brokerage reconciliation. Brokerage parity specifically requires connected
source records, never screenshots or public health. Root owns the independent
Chromium work to avoid duplicate requests/tests.
