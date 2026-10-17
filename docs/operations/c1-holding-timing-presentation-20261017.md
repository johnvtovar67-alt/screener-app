# Larger HOLD pills and compact Swing timing

Owner authorizes exactly two presentation corrections. Baseline production/main: `80b5afae5cc437947b816584eadedd60bae58229`. AGENTS.md read. Review PR only: no merge, deployment, account access or record changes.

## Presentation changes

- Remove the HOLD-only fixed 26px/12px/zero-vertical-padding override. Existing `.pill` CSS now supplies the same height, inherited font, 5px/9px padding and 999px radius used by WATCH/SELL in each display context. Uppercase HOLD and existing colors remain. No other pill/CSS changes.
- Reuse the existing desktop/mobile Portfolio Evidence slot for short holding-session, stop, profit-protection and active confirmation lines. Existing badges, source date, action, reason, columns, Core rows and other views remain. The generic momentum sentence is replaced when actual timing fields are present, avoiding duplication.

Read-only `c1HoldingTiming` in the existing presentation-copy module consumes:

| Display | Existing source |
| --- | --- |
| Holding period / remaining | `position.reviewRules[].heldSessions` and `minimumHold` |
| Stop triggered | Existing position presenter result or recorded `initial-stop` exit |
| Stop not triggered | Verified current presenter result, otherwise explicitly scoped to the last C1 close with available recorded stops/close |
| Profit active/inactive | Existing per-sleeve `profitProtectionArmed` flags |
| Rank / profit-rank confirmations | Existing `earlyStreak` / `earlyConfirmations` and `profitStreak` / `profitConfirmations` |
| Momentum confirmations | Available existing `recentMomentumReviews[].state.streak` and `metrics.confirmations` |
| Giveback confirmations | Available existing `state.profitGivebackStreak` and the existing gate's `profitProtectionConfirmations` constant |
| Rank/rotation confirmed | Existing rank-related exit reasons; no missing rank counter is invented |

Remaining counts are simple display subtraction from supplied counts/thresholds, floored at zero. No date-to-session computation, signal evaluation, qualification, counter advancement or new strategy formula is introduced. Differing sleeve values are labeled separately rather than collapsed into a fabricated account counter. Missing thresholds/counters produce a simple pending/unavailable status. Stale account/evidence uses the existing stale/unavailable copy. An active profit-rank review can show its actual zero count; ordinary exit sequences appear only when underway.

## Checks and scope

Focused checks passed: timing formatter input preservation/missing/stale/differing-sleeve cases; actual desktop/mobile row rendering with supplied existing counters; unchanged Core rows, action/quote/ownership/stop/risk assertions; exact historical-source comparisons after reversing only the new display bindings; larger native HOLD geometry matching SELL in real Chromium at desktop/mobile sizes, with original colors and other pills unchanged. See [browser evidence](c1-holding-timing-evidence/hold-browser.json).

Mandatory CI runs the repository's normal build/hooks/regressions once for the frozen PR head. No local full-suite repeat, research or account replay task is run. Existing mandatory tests remain intact.

Application changes are limited to `lib/c1HoldPill.js`, `lib/c1DecisionCopy.js`, and `pages/index.js`. Only those three release-manifest entries plus this owner authorization are updated; guard/build-hook implementations and historical reference hashes are unchanged. Test-source comparison adapters reverse only the explicitly listed timing JSX/import changes. No trading, accounting, ranking, stop, threshold or historical-record module changes. Research PR #277 remains untouched.
