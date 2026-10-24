# Read-only captured-response canary — October 24, 2026

## Defect and bounded remedy

An empty Opportunities count cannot distinguish a legitimate policy/account
outcome from unavailable provider, account or screen evidence. Existing public
health checks only configuration; the authenticated acceptance route checks the
accepted index, not the complete user journey. Calling GET `/api/top5` is not a
read-only probe: it can acquire provider data and write performance records.

First characterize a safe boundary before adding live monitoring. New offline
`tools/c1-readonly-canary.cjs` consumes already-captured responses; it never
fetches URLs, loads credentials, reads Blob, refreshes, records trades or saves
files. It reuses the actual response parser, screen evidence resolver, current
event-receipt reader, quote freshness, portfolio matcher, manual-review builder
and current-order filter. It does not duplicate investment thresholds, generate
trade quantities, or change any production application file or freeze entry.
The manual-review builder only validates/returns the supplied opening orders.

## Input and privacy

The input is a private local JSON capture with:

```js
{
  contract: 'c1-readonly-canary-capture-v1',
  observedAt: 'ISO observation timestamp',
  account: {status: 200, body: /* existing C1 account/execution response */},
  screen: {status: 200, body: /* existing top5 response, including meta */},
  portfolio: [/* existing synchronized holdings for comparison */],
  previousEvidence: /* optional existing browser continuity evidence */
}
```

Run `node tools/c1-readonly-canary.cjs /absolute/path/to/private-capture.json`.
Do not request sync keys, acquire private captures via a protected-workflow
workaround, commit them, or place them in published reports. This slice does
not add a capture/export UI or assume access to the owner's signed-in browser.
Only explicitly supplied files are read. Input size is limited to 8 MiB.

Output includes aggregate counts, fixed reason codes, market-session context,
and diagnostic status only. No symbols, prices, holdings, shares, cash, keys,
raw provider errors, input paths or source/account identifiers are printed.
Malformed inputs produce sanitized failures. Exit 2 indicates unavailable or
incomplete evidence; exit 0 indicates an explained captured state, not trading
authorization. The ordinary automated suite uses synthetic captures only.

## Classifications and limits

| Diagnostic result | Meaning within the captured responses |
|---|---|
| SYSTEM_VERIFICATION_INCOMPLETE | Missing/stale/duplicate/malformed quotes, event receipts, source evidence or screen composition; never call the zero count legitimate |
| ACCOUNT_UNAVAILABLE / ACCOUNT_VERIFICATION_INCOMPLETE | Account response/currentness, portfolio mismatch, identity join or opening review not verified |
| VERIFIED_SYMBOL_BLOCKS | Zero qualified ratings includes fresh verified issuer blocks; other policy checks may also contribute, not a generic global outage |
| VALID_ZERO_QUALIFIED_RATINGS | Complete checked captured evidence yields zero ratings under the existing classifier |
| VALID_ZERO_CHECKED_BUY_ORDERS | Qualified ratings exist, but the current checked account review returns no buy orders |
| CHECKED_BUY_ORDERS_PRESENT | Current supplied server review has matching checked buy orders; this is not a broker instruction or rendered quantity certification |
| MARKET_CLOSED | No current opening quantity is expected outside the regular session |

The capture's age is bounded by the existing manual-review validity interval;
current quote and event timestamps and opening-review expiry are independently
checked. Missing explicit feed-health metadata is not silently assumed healthy.
Changed retained selection without an independent current review is an account
review dependency, not misreported as a provider outage. Account, screen and
execution identities are cross-checked. An expired opening plan outside regular
hours is expected, not automatically an outage.

`CAPTURED_RESPONSES` explicitly does not authenticate origin or establish that
the live production page currently displays those responses. Every report
retains `productionAcceptance: NOT_ESTABLISHED`, `privateAccountParity:
NOT_VERIFIED`, `browserRendering: NOT_VERIFIED`, `executable: false`, and
`brokerageExecutionAuthorized: false`. Checked-order counts are not UI-action
counts: the existing held-position presentation may suppress an Add. A verified
event block on one name does not imply all names are paused. No alpha claim.

## Verification / ownership checkpoint

Focused synthetic composition passes through real account-execution preparation
and the real screen/manual helpers with network disabled and zero fixture
storage writes. Tests cover valid checked buys, legitimate zero ratings/orders,
verified issuer blocks, system/provider failures, stale/future/missing quotes,
expired/missing event evidence, malformed and duplicate rows, missing recent
momentum, source mismatch, account and portfolio failures, changed-selection
review, order-list/identity tampering, premarket behavior, response-order
invariance, input immutability and sanitized CLI errors.

Local full suite/build passed: 119/119 tasks, freeze/canonical guards, optimized
compilation, static generation and traces. Final capture-shape hardening and
its expanded focused regression also pass. All runtime application files,
freeze entries, CI, crons and dependencies are byte-for-byte unchanged.
Released through PR #319: CI #970 (40136356595) SUCCESS on reviewed head
`ce53feaffc4526aa220fd4d2cc424dcf1b5060bf`; preview
`dpl_8YA1ufGPWnkyF4YKahBxiF7aKkQs` READY with version/health HTTP200.
Production `3b6341c2bef960d72616053284b08d7fc6588a47`, deployment
`dpl_HYT9T2gGjmEKGXzqyHFW35qrtmgY` READY with canonical alias/version/health,
all configuration checks pass and scheduler configured. Initial scoped
error/fatal scan was clear. Exact reviewed/merged tree:
`f800d9d22ae485e4567a774742e058227ddb1a37`. This establishes tooling release,
not live account/browser acceptance or completed semantic monitoring.

Next: integrate observability at an existing authorized read-only boundary,
without invoking side-effecting refreshes or saving private captures. Real live
account/browser acceptance is still outstanding, not blocked into a claim of
completion. Provider boundary cleanup, research-route isolation and immutable
screen reads remain separate bounded work. No thesis tests are restarted.
