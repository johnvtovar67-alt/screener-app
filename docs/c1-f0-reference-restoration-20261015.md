# Original C1 presentation restoration — October 15, 2026

Owner reference: `f0d46ffceb98ba3fd5fca121beba6d8f23ccbdde` (approved Portfolio Intelligence cleanup). Previous production: `53c1c6c64cadd4a4927f3d937c918d7b2130823f`.

## Actual historical source restored

- `pages/index.js`: literal historical generic Card, Recent Signal Changes, Verification Paused, On Deck, and desktop/mobile Portfolio render structures. Original seven Portfolio columns, Evidence badge, opening date, price and gain/loss alignment; original Entry, Timing, Size, Priority and Plan slots. Historical blob: `b2a7d3638c2344ad262e095ed7825194239ab36d`.
- `components/C1AccountOpportunities.js`: literal historical three green ranked-card frames, separate five-column Watch table, account-plan/reference-price slots and inline exit list. Historical blob: `0bed093604f2233d349179b267103b5a270b7bf9`.
- The original first global stylesheet, scoped Opportunities stylesheet, `styles/card-layout.css`, and six account/cash/activity/reconciliation presentation components already match the reference and remain unchanged. Source regression pins these blocks and restored markup, rather than accepting a recreated visual approximation.

## Essential compatibility bindings

Current verified actions, quote freshness, account handlers, checked quantities, Add veto and decision/evidence selectors remain authoritative. The original pill slots accept current full SELL labels. Existing narrow mobile header/navigation wrapping and non-wrapping SELL pills remain. Empty event badges stay suppressed.

`lib/c1DecisionCopy.js` is a read-only display formatter: concise actual reasons and existing recorded stop/setup levels replace technical essays in the original slots. It distinguishes rank exits, recent-momentum exits, verified profit giveback, missing data and unavailable capital. A setup invalidation is never called a recorded account stop; missing or ambiguous stops never invent a price. It cannot select an action, recompute momentum, authorize quantities or write records. Technical evidence remains internally intact.

No trading engine, API, FMP integration, account record, stop, profit-protection threshold, accounting or execution source changes. Core/cash positions still make zero Swing-evidence resolver calls. Only the three affected presentation hashes are updated under the owner's explicit instruction; release guard, build/CI hooks and dependencies are unchanged.

## Acceptance

Full regression/build and historical source proofs are required before release. [Rendered comparison gallery](c1-f0-layout-restoration-20261015/README.md) contains the previous production, exact historical render and restored render for six views at desktop/mobile widths. Fixtures are deterministic and contain no private owner holdings. Current decisions and shorter explanatory text intentionally differ from historical strategy output; the actual layout, fonts, spacing, card frames, tables and colors are checked against the original. Full SELL labels must remain on one line. Production acceptance is recorded on the release pull request with the exact shipped SHA and public health/version results.
