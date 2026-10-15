# Original C1 UI and concise decision copy — October 15, 2026

Historical UI source: `f0d46ffceb98ba3fd5fca121beba6d8f23ccbdde`. Production starting version: `483aaf74368c8eb308c9a759cb38996b494efbac`. The original components, typography, spacing, colors and CSS were restored in PR #270; this release corrects the remaining card-frame and badge differences and applies the owner's subsequent explicit request to remove technical narratives.

- Restore the exact historical `className="idea green"` on ranked Opportunities tiles. Three ranked Buy tiles retain their original green frames when available; their actual action badges and purchase quantities still obey current checks.
- Keep full SELL labels on one line. The existing card/position header may wrap the whole badge, using the original font, size, padding and colors. No replacement components or layout framework are introduced.
- Show one plain-English reason per decision. Portfolio hides its technical Evidence column/badge; original dates, values, six remaining column styles and action stay. Generic Cards retain their original structure minus Entry, Timing/Size/Priority and Plan explanations. Watch, On Deck and changed/paused signals use one action and one reason, without raw internal explanations or next-trigger paragraphs.
- `lib/c1DecisionCopy.js` formats display copy only. It cannot select actions, authorize quantities or mutate evidence. A stop amount is shown only when the existing presenter already confirms a triggered stop and there is one unambiguous recorded stop; missing or conflicting stops do not invent an amount.
- Hide empty event labels rather than rendering an empty badge. Secondary analysis that already directs users to Opportunities retains that direction in its short reason instead of implying a different account purchase decision.

The user's latest concise-copy request explicitly authorizes these content removals from the historical interface. They are enumerated exceptions, not a claim that the historical prose still renders. Both historical style blocks and the original external stylesheet remain pinned. Current decision/fetch/account handlers, source evidence and all engine, FMP, stop, profit-protection, accounting and execution modules remain unchanged.

Checked order quantities and necessary operational account-form instructions are retained. No account records, market-data state or brokerage services are modified. The same recorded-stop, quote-verification and capital restrictions remain authoritative.

The freeze manifest changes only the two affected presentation files plus the new display-only copy helper, under the owner's specific instruction. Guard implementations, build hooks, CI and dependencies are unchanged.

Rendered historical/current/final desktop/mobile comparisons: [screenshot gallery](c1-original-ui-final-20261015/README.md). All screenshots use labeled deterministic fixtures; they do not assert private-owner holdings or investment returns.

Release checks: `npm run build` passed all 103 regression/simulation scripts and the optimized Next.js build. The focused position/ancillary-view script passed 326 assertions. Independent review confirmed that the copy changes retain actions, cash/quantity restrictions, stale-data behavior, stop priority, Core separation and all underlying account/evidence values. Only UI text/source expectations were updated; engine/accounting test expectations remain intact.

Actual rendered acceptance passed all 18 page/viewport cases (six major views at 1440, 390 and 360 pixels) with zero browser errors or fixture holding changes. All 27 full SELL-label fit checks passed across three labels, three surfaces and three widths. The historical green frames, fonts, sizes and padding match the pinned source. Single correctly directs users to Opportunities and does not render empty event labels. Original Watch horizontal scrolling and original narrow-form bounds are retained. These intentional historical behaviors are documented in the comparison gallery.
