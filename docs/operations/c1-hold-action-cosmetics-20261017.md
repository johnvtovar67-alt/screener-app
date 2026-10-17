# HOLD pill consistency and Portfolio Action capitalization

Owner requests exactly two cosmetic changes, focused checks, mandatory CI and merge/deploy if passing. Baseline production/main: `e12b10ac984b72e4d02fe9e050d6870b4fb88dfd`. AGENTS.md read. No account, strategy, data, cash or execution code changes.

Reuse PR #280's exact `lib/c1HoldPill.js` helper (Git blob `31255f351918deefe19b5b35214c9783b7e64dd2`) and its five display bindings. Core/Swing desktop/mobile Portfolio, generic cards, Opportunities and held Watch pills share uppercase HOLD, 26px height, 0/9px padding, 12px font, 24px line height, 800 weight and 999px radius. Existing colors and other action/status pills pass through unchanged.

The Portfolio-only section's visible heading changes from `Portfolio actions` to exactly `Portfolio Action`. No other wording or layout changes. Its existing accessibility/selection bindings remain untouched.

The separate requested one-time read-only account access attempt was blocked by the environment's CONNECT 403 policy before reaching production. The receipt was not read or verified. No authentication bypass, alternate route, account reconstruction, transaction replay or new account fixture was created for that check. No live record was modified.

Focused checks passed: `c1-hold-pill-regression`, `stage-badges-regression` (existing Core MSTR/MRNA and Swing display checks), `c1-compact-opportunities-regression`, `c1-historical-ui-restore-regression`, and the reused real-Chromium `c1-hold-pill-browser` at desktop/mobile sizes. See [computed rendering evidence](c1-hold-action-evidence/hold-browser.json). Mandatory normal build/regression checks run in CI; no additional local research or account workflow runs.

Only three application manifest entries change: `pages/index.js`, `components/C1AccountOpportunities.js`, `lib/c1HoldPill.js`. Release guard/build hooks and historical reference hashes remain unchanged. Existing extracted-render tests reuse PR #280's helper bindings; exact historical-source tests reverse only the enumerated cosmetic bindings before their original comparisons, retaining all newer adoption code. No trading/account behavior assertion is relaxed. Research PR #277 and the original draft PR #280 remain untouched.
