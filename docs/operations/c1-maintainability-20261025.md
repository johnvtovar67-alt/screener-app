# Maintainability workstream — October 25, 2026

Baseline: PR330/main `d386ae579527a0a7e5d53feea4a9186e65c77e62`.
Root owns current main/production identity and all release verification.

## Implemented: Opportunities renderer extraction

State: locally verified (not CI/preview or production verified).

Explicit current owner authorization covers behavior-preserving UI component
extraction under complete behavioral/golden parity. Move the literal JSX and
its scoped stylesheet from `C1AccountOpportunities` to referenced
`C1AccountOpportunitiesView`. Its hook-free render function is invoked synchronously in the parent, avoiding a new React scheduling point for expiry-sensitive callbacks. Hooks, retained-screen state, storage effects,
expiry timers, readiness checks, selection, quantities, holding reviews,
reason closures and early-return condition remain in the original parent.
Both opportunity and portfolio modes use the extracted renderer. No new
request, account mutation, retry, dependency, public interface, auth/config
policy, economic calculation or visible design is introduced.

Changed application hashes:

- `components/C1AccountOpportunities.js`:
  `794a87727bfb4dcfc17e98fbb6948690fd4fa64606a29febd3cd5e1691a335b2`
- New `components/C1AccountOpportunitiesView.js`:
  `6b4ff4d8cc0319dd89bfed5cdc0768333f6e3f290c08a5fea66bb4e17a1a4660`

Focused verification:

- New `tools/c1-opportunities-extraction-regression.cjs` reverses just the
  extraction and requires the entire baseline component SHA256:
  `0b72fd1afff37128fce1f203753a1eebbf3afa6a73dee618a8c919a422d6c71c`.
  No prior fixture or source pin changes.
- 136 exact complete-markup comparisons pass, retaining Next scoped CSS
  classes as well as localStorage operations/contents, hook state, timers and
  their callbacks. Eighteen states cover checked buys, portfolio mode, pending
  and missing screen evidence, missing/failed opening review, stale/mismatched
  accounts, foreign revision, expired review, zero/missing cash, conditional
  orders, changed event, stale quote, absent source candidates and recorded
  stops. Persistent render sequences verify retained selection, failed refresh,
  independent recovery, changed source and timer expiry; SSR and browser-cache
  restore are both compared. Advancing-clock traces preserve the exact Date/callback sequence around quote/recommendation expiry. Source account/order/price inputs remain unchanged.
- Existing compact-opportunities, screen-evidence, UI-authority,
  trading-workflow, stock-classification, live-display, unexposed-price,
  hold-pill, purchase-reason-copy and position-presentation regressions pass.
  Position-presentation retains all 451 historical assertions. The workflow
  loader now loads referenced real child components. Source-shape assertions
  inspect both files; hold-pill source reconstruction keeps all earlier
  assertions/pins intact. The workflow source pin additionally reverses the
  producer agent's accounting extraction before its unchanged historical seams.
- No live provider requests or account writes are used. Private signed-in
  browser/account/brokerage acceptance remains separate and unverified.

Owned test files: new c1-opportunities-extraction-regression.cjs; modified
c1-hold-pill-regression.cjs, c1-live-display-regression.cjs,
c1-stock-classification-regression.cjs, c1-trading-workflow-regression.cjs,
c1-unexposed-price-regression.cjs. Root owns manifest and durable docs.

## Server-produced joined Opportunities contract: concrete parity boundary

The server already produces the quantity/expiry contract in
`buildC1ManualRecommendations`, while `classifyC1StockScreen` and
`resolveC1ScreenEvidence` preserve independently timed browser composition.
The normal `load()` in pages/index.js starts authenticated prepare-execution
and then independently fetches top5 rows. The renderer also receives separate
latest holding quotes and a previous verified selection from memory/storage.
Those inputs are not all present in the existing account API request/response.

Actual preserved tests demonstrate different correct displays for the same
server response:

1. In c1-screen-evidence-regression, checked MRNA Buy2 / HPE Add3 / DELL Sell4
   can display all three with full independent evidence. A changed MRNA event
   suppresses Buy2 and preserves Add3; missing screen rows suppress both buys
   and retain Sell4. Original server plan/review stay byte-identical.
2. In c1-position-presentation-regression, the completed-session decision and
   screen quote can be identical while a separately verified holding quote85
   (versus screen90) renders a triggered DELL stop. Request-local quote evidence
   cannot be replaced by the earlier account response's close.
3. Retained browser selection and a missing refresh can preserve prior rated
   cards while withholding quantities until independent opening review agrees.

Thus moving the full final projection into the current account response alone
fails the exact same-input/display invariant. A complete server join requires
the actual independently timed screen/position observations and retained
selection identity to be transmitted or coordinated, with cache/deadline/order
and source identity parity. Changing request sequencing or using server-local
substitutes has not been proven equivalent. Adding an unused new view field,
duplicating the plan, or returning unconsumed display groups would not finish
this obligation. Do not mark joined contract consolidation complete on the
basis of the renderer extraction.

## Preserved code/oracles

The previous bounded unused-module review remains applicable: the 126 legacy
lib modules have actual runtime/test/CLI consumers, with documented compatibility
and immutable oracle consumers. No public route or interface is removed merely
because literal in-repo URL callers are absent. No additional deletion candidate
was established. No thesis/research runner is invoked. The producer agent owns
the separate simulator accounting phase extraction; frozen engines and golden
fixtures remain untouched.
