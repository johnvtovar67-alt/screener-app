# Literal C1 interface restoration — October 15, 2026

The owner requested a direct restoration from `f0d46ffceb98ba3fd5fca121beba6d8f23ccbdde`, preserving the released recent-momentum engine, verified market-data path, account records, and execution safeguards. The files were extracted with `git show`; this change does not approximate the historical layout.

## Historical source and restored regions

| Historical file | Git blob |
| --- | --- |
| `pages/index.js` | `b2a7d3638c2344ad262e095ed7825194239ab36d` |
| `components/C1AccountOpportunities.js` | `0bed093604f2233d349179b267103b5a270b7bf9` |
| `styles/card-layout.css` | `b652f6ff7a40fbe70ebbbd6cd465f68c58563b08` |

The original generic opportunity Card, account Buy tiles, separate five-column Watch table, seven-column desktop Portfolio table, mobile Portfolio rows, visible holdings editor, and original styling are restored. Portfolio columns are Position, Open Date, Decision, Evidence, Why, Price, and Gain/Loss. The rebuilt Watch cards, six-column Portfolio layout, and 96-line density overlay are removed. The superseded `components/C1PositionDetails.js` and `lib/c1DisplayFormat.js` are deleted after removing their callers.

`tools/c1-historical-ui-restore-regression.cjs` pins the historical source regions, not a rewritten fixture. Important SHA-256 pins:

| Region | SHA-256 |
| --- | --- |
| Original application CSS | `fe3b39074dfa1061bda6ba18e80d207df25249d38440635c0114c4fd875dddd2` |
| Complete external card CSS | `7deed53e823d07eee10cb4dd5cdfa7929e6576b1b0311d05f0faf93c48be4477` |
| Account Opportunities CSS, 118 bytes | `1040a44e51ecf2f74a26094a5a4f398cd6940b04cd562a15f161e61e8357ba46` |
| Account state/evidence/authorization/order/Watch-composition prefix, 2,972 bytes | `1213174d9a7e2d939ff29111976bc90485be041eac58e694f9fa54d945c62215` |

The account prefix begins at `const [,expire]=useState(0);` and ends before the added `holdingPresentation` adapter. It is byte-identical to the historical prefix ending before `let nextWatchPriority=`. The regression also pins the original Portfolio desktop/mobile JSX after substituting only the two current action-color bindings, all seven Portfolio headers, and the Home return after explicitly enumerated market-data compatibility substitutions.

## Necessary compatibility exceptions

These retain current decisions and verification without rebuilding the historical presentation:

- Portfolio rows bind the shared `c1PositionPresentation` label and brief reason into the original Decision/Why slots. Current Swing stop, momentum, profit-protection, and urgent-verification actions keep their correct colors; Core and cash retain their existing paths.
- Account Opportunities accepts `positionRows` and uses the same presenter for held securities, including the original Watch Entry check and existing exit list. A Core/mismatch row with no Swing presentation falls back safely instead of dereferencing a missing presentation.
- Original ranked Buy tiles remain in their original section. A green purchase requires a current checked quantity and, for holdings, `held.canAdd`. Blocked purchases are neutral `NO PURCHASE`; held actions use their current label and neutral background. The existing metadata line names the underlying investment rating separately. No rating or quantity is invented.
- Original Portfolio Buy/Add tiles retain the checked-order list and quantities, with the current stop/exit Add veto. A held stock's primary action remains consistent with Portfolio; a permitted Add is a separate capital proposal. Existing sell-before-replacement guidance remains intact.
- The current market-data freshness banner, screen-observation wording, held quote rows, and forced provider verification on Analyze are retained. A separate small CSS block supports the existing freshness message, navigation wrapping, and long action labels; the restored historical stylesheet itself remains unchanged.

## Account components already identical to the historical release

No restoration edits were needed in these six files. Each current Git blob matches the historical blob exactly.

| File | Matching Git blob |
| --- | --- |
| `components/C1BrokerageCash.js` | `120f2cbdfcf6c2f3cff70e2ea66bd261f9064d0a` |
| `components/C1AccountActivity.js` | `08c8a772b54be192ed021762698654854cb2f2d5` |
| `components/C1AccountDifferences.js` | `5d4337bca8b45f7e55cda4f94b8db7b5a4c68f64` |
| `components/C1IntradayActivity.js` | `770ba029a2cc4f9a7c25ed15b21b4ecef08c4b13` |
| `components/C1PositionContextImport.js` | `5de954a5ef55cd516bad152244d57651526af36a` |
| `components/C1ReconciliationDetails.js` | `e7d3dc78c77f574fa213198a26d43da45dbf9b94` |

## Preserved runtime behavior

Against the repair starting commit `0a5ceab093cce51ee56d9a5134825dfc9c6ddf4d`, the Home state, handlers, and decision-preparation prefix before `PortfolioRow` is byte-identical (61,292 bytes; SHA-256 `aed59886c10ad88a27913f0b5dde87af6f86897e41f671528901b18a2f311f78`). The derived values after `PortfolioRow` and before the Home return are also byte-identical (715 bytes; SHA-256 `66a3bc03c627c441e63d451b4eb5b0b95643cfd32ba31332fed260b29a80c6c0`).

The application diff contains no API changes, momentum-policy changes, execution/accounting changes, quote-verification changes, or account-record edits. The only library removal is the superseded display formatter. Release metadata and affected freeze-manifest entries are separate release bookkeeping; guard and build enforcement remain in place.

## Release checks

`npm run build` passed on the restored source: release-freeze and canonical-integrity guards, all 102 discovered regression scripts plus the trade simulation (103/103), and the optimized Next.js production build. The position-presentation script retains 300 assertions covering verified stops, stale/unverified evidence, current quotes, refresh and capital restrictions. The Core/mismatched Watch rendering failure has a permanent regression fixture.

Ten existing tests had source/markup expectations for the superseded presentation. Those assertions now check the literal historical layout; independent review confirmed that cash, accounting, authorization, stale-data, ordering, Core separation and record-immutability expectations remain intact. No investment-performance claim is made.

The visual evidence uses labeled, deterministic browser fixtures rather than private owner holdings. No private account endpoint was accessed and no account record or brokerage operation was submitted. Public production version/health and the shipped rendering assets are checked separately during release.

## Rendered comparison

The [three-way screenshot gallery](c1-original-ui-20261015/README.md) compares the actual historical build, production starting commit `0a5ceab`, and the restored optimized build. Opportunities, Portfolio, Themes, Single, Account settings and completed-trade entry were exercised at 1440, 390 and 360 pixels: 18 restored cases, no page/console errors, and unchanged fixture holdings. The gallery contains the representative desktop/mobile full-page images for all six views.

Without resizing or masking the compared regions, desktop Single, On Deck and Account regions are pixel-identical to `f0d46ff`; mobile On Deck is also identical. The remaining mobile Single/Account regions have identical geometry and less than 0.03% raster differences (mostly channel deltas of 1–2). Portfolio and account Opportunities intentionally retain the current decision text and capital restrictions in the original layout: verified DELL stop SELL, MPC HOLD, neutral blocked HPE, and the checked VEEV two-share purchase in the fixture.

The original Watch table uses horizontal scrolling. Historical completed-trade selects retain their original bounds, producing a 401-pixel document width at narrow widths; the historical Themes select reaches 371 pixels at 360. The original build had the same element bounds plus 417-pixel navigation overflow. Existing navigation wrapping is retained, but these original form layouts are not redesigned in this restoration.
