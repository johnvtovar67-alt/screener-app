# HOLD consistency and blocked MRNA adoption

Owner request: normalize HOLD pills and provide a confirmed, non-trading adoption of existing Core MRNA into C1 Swing ownership. Stop the conversion if existing accounting cannot preserve facts safely. No live account writes, merge, deployment, or research changes are authorized.

Baseline: deployed production/main `8e29b817197a212cb2c74434a97a3dc6fe3810dc`, tree `b7abc77fb2a781ee260ea2b5c47bfd63d07feb1d`. AGENTS.md was read; all 590 baseline blobs were hash-verified before creating an isolated checkout. Research PR #277 remains untouched.

## Completed: HOLD presentation

`lib/c1HoldPill.js` supplies presentation-only label/style helpers for exact HOLD labels, case insensitive. Portfolio desktop/mobile, general cards, Opportunities and held Watch rows use the same style: 26px border-box height, 0/9px padding, 12px font, 24px line height, 800 weight, 999px radius, uppercase HOLD. No color, background, margin or layout-container properties change. Other action labels/styles pass through unchanged. Existing trading and lifecycle decisions are not modified.

Real Chromium renders production CSS and the actual shared helper in five synthetic display contexts with different inherited font sizes at 1440px and 390px viewports. Computed geometry is identical; existing foreground/background/border colors and non-HOLD geometry match their original controls. This is a display check, not a live-account browser test.

## BLOCKED: existing-account non-cash MRNA adoption

No conversion control, confirmation endpoint or migration is implemented. Core MRNA remains Core; no lifecycle-management claim is made for it. The following conflicts are reproducible with the current production contracts:

1. `pages/api/c1-account.js`, `case 'adopt'`, rejects an already saved account with HTTP 409, **“The existing C1 account cannot be reset.”** Explicit prospective confirmation does not override this guard.
2. `lib/c1AccountSeed.js`, `createC1ProspectiveSeeds`/`validateC1AccountSeed`, creates initial opening balances only. It recomputes sleeve scales, cash allocations and retained risk initialization; opening holdings still cannot exceed the frozen initial count. The additional-purchase exception in PR #279 does not authorize a new adoption seed. A three-Swing-plus-MRNA initial-adoption attempt fails **“Account adoption exceeds the frozen sleeve position count.”** That guard is unchanged.
3. `lib/c1AccountLedger.js`, `continueC1ActualAccount`, reconstructs ownership from the original adoption plus confirmed actual fills. Every saved plan must match those reconstructed opening books exactly. There is no dated non-cash position-contribution event. Editing a portfolio role alone cannot put those shares into the books; inserting MRNA into the old adoption backdates ownership and invalidates later opening-book evidence.
4. `lib/c1PositionContext.js`, `recordC1PositionContext`, records purchase/stage evidence only for shares already in the adoption. It cannot import ownership, and rejects the Core MRNA fixture as **“Confirmed entry status does not match adopted holdings: MRNA.”**

A synthetic Buy would manufacture an execution and debit cash. A reset/reseed would replace original ownership/risk initialization. Neither is an acceptable conversion. An in-kind asset changes Swing assets without a cash debit, but the current contracts do not specify its capital-flow treatment for sizing equity and retained high-water marks. Choosing that treatment silently would prevent certification of unchanged risk behavior. These approaches are not implemented or offered.

The synthetic conflict test uses 20 Core MRNA shares, $72.34 original average price, September 1, 2026 original purchase date and $5,000 brokerage cash. These are invented software-fixture facts, **not the owner's account facts**. Rejected conversion attempts preserve all of them, plus adoption, records and fills, with zero storage writes. The test proves safe refusal, not successful adoption or lifecycle management.

### Minimum next approval/design boundary

Approve a separate, narrowly reviewed append-only **in-kind adoption event** design before implementing the blocked conversion. It must specify a prospective effective date and verified mark, per-sleeve whole-share allocation without changing existing ownership/scales, and how the incoming value is accounted for in sizing equity and retained high-water marks so it is not treated as trading profit. It must retain original purchase evidence and initialize stops/holding age/profit peaks from verified history; missing history must remain explicit. The conversion itself must then require a displayed before/after review and explicit owner confirmation, atomic persistence, idempotency, no broker cash mutation, and no automatic order/fill. Subsequent orders must use the unchanged C1 rules.

This identifies the missing accounting contract; it does not approve a new allocation or risk rule. Until that contract is reviewed and tested, the full MRNA Swing lifecycle requirement remains unfulfilled.

## Files and verification

| Files | Scope |
| --- | --- |
| `lib/c1HoldPill.js` | Shared HOLD-only presentation helpers. |
| `pages/index.js`, `components/C1AccountOpportunities.js` | Five existing status-pill slots use those helpers. |
| `tools/c1-hold-pill-regression.cjs`, `tools/c1-hold-pill-browser.cjs` | Exact label/style/non-HOLD checks and real-browser computed geometry/colors. |
| `tools/c1-core-adoption-conflict-regression.cjs` | Isolated API/seed/context refusal; immutable MRNA facts/cash/account evidence. |
| `tools/c1-historical-ui-restore-regression.cjs` | Reverse only the explicit HOLD adapter before comparison to unchanged historical UI/CSS hashes. |
| `tools/c1-compact-opportunities-regression.cjs`, `tools/c1-screen-evidence-regression.cjs`, `tools/c1-position-presentation-regression.cjs`, `tools/stage-badges-regression.cjs` | Supply the actual shared helper to extracted-render fixtures and allow only the HOLD style/capitalization difference. Existing action, evidence, ownership and risk assertions remain. |
| `docs/c1-release-freeze.json` | Only the three reviewed application entries and this explicit authorization; guard implementation/build hooks unchanged. |
| `vercel.json` | Disable automatic deployment for this draft branch only; existing settings/crons retained. |
| This report and evidence directory | Synthetic, non-sensitive test evidence only. |

Reproduce:

```sh
npm ci
npm run build
node tools/c1-hold-pill-browser.cjs
```

The build discovers the new focused regressions automatically. Chromium is required only for the separate browser command. All account fixtures use supplied data and memory storage; live providers are forbidden. No test submits a Schwab order or accesses the owner's account. Existing lifecycle/capacity regression coverage remains intact; it does not substitute for the blocked Core adoption acceptance test.

Evidence: [adoption refusal](c1-mrna-hold-evidence/adoption-conflict.json), [Chromium rendering](c1-mrna-hold-evidence/hold-browser.json), [regressions](c1-mrna-hold-evidence/regression-results.json), [manifest](c1-mrna-hold-evidence/manifest.json).

Verification: normal production build passed, including release-freeze and canonical integrity checks and **107/107 regressions**. Separate real-Chromium HOLD rendering checks passed. The MRNA adoption result is **BLOCKED**, not implemented or lifecycle-qualified.
