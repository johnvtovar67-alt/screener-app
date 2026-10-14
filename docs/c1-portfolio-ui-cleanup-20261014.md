# C1 Portfolio Intelligence final UI cleanup — October 14, 2026

Owner authorization: remove the duplicate Momentum Evidence summary strip; show momentum evidence only for noncash C1 Swing positions; keep Core decisions, investment-thesis explanations, prices and gain/loss unchanged. Keep Swing classifications, technical explanations, unavailable/stale disclosures and actions unchanged. Run focused/regression/build checks and deploy through the existing approved GitHub/Vercel workflow if they pass. No methodology, model, account, risk, trading or infrastructure changes are authorized.

## Change boundary

The only application file changed is `pages/index.js`. The summary strip, its derived row array and four dedicated CSS selectors are removed. Portfolio row evidence resolution and rendering now require `role === "Swing"` and a noncash symbol. Core rows have no momentum badge, evidence message, explanatory text or accepted-session date. Their desktop Evidence cell is blank; mobile Core cards have no Evidence field. Their existing action, Why, price, gain/loss and special-situation presentation remain intact.

All 109 library files, all 67 APIs and all 7 components match the prior production source byte-for-byte. In particular, the evidence methodology, input extraction, account service, decisions, reconciliation, sizing, signals, execution, stops, cash, persistence and 30-session framework are unchanged. No production account records or private holdings/actions are inspected or written.

## Verification and release

Existing rendered UI regressions cover the four Swing labels, detailed explanations, accepted dates, stale/unavailable inputs, action independence and special situations. Additional Core MRNA/MSTR cases cover desktop/mobile, Hold/Buy/Sell and injected available/unavailable evidence, checking zero evidence-resolver calls and unchanged action, Why, price and gain/loss. Existing summary assertions now require the redundant strip to be absent. All Swing fixtures are retained. Focused UI/action regressions pass; the existing complete suite and build are required before release.

Only the `pages/index.js` entry changes in `docs/c1-release-freeze.json`, with this explicit owner authorization. Guard implementations, build hooks, dependencies, GitHub CI, Vercel configuration and Blob configuration are unchanged.

Current production and rollback reference:

- Commit: `31c4c2112205ed2df86d012cab29fd5cba59b21d`.
- Deployment: `dpl_B2gXwsCC6jVGHacNLJKHEomSpz9N` (`READY` before release).
- Immutable URL: `https://screener-app-cq5t-7yvgzuavk-johnvtovar67-7543s-projects.vercel.app`.
- Canonical production: `https://screener-app-cq5t.vercel.app`, project `prj_9MJJaMsEfOdtQKXj4VFI7TfJcBjQ`, team `team_vBLhac1QJ54zPEiWFFK7XmGN`.

Release uses the existing review branch, PR into canonical main, Screener CI and Vercel Git integration. Verify the production commit, health, document and served portfolio bundle, and retain the prior deployment. Source and fixture checks verify behavior preservation; private production record contents and live trading actions are not compared or certified.
