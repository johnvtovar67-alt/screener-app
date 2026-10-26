# Actual application refresh failure and recovery coverage

The October23 audit asked for a browser/API test composing the broad screen,
private account handler, retained evidence and rendered Opportunities page. PR334
already added18 browser cases, but supplied the screen body directly. This slice
retains those tests and adds an actual-screen mode to the same application
browser harness. It does not certify a private owner account or brokerage record.

`tools/fixtures/c1-normal-refresh-screen.cjs` recursively loads the current
`/api/top5` handler and its production modules. Quote, fundamental, event and
historical-timing adapters, scoring and gates, durable Strong Buy seeding,
`performanceStore` and `performanceLedger` execute unchanged. Provider HTTP
responses, accepted book/production-snapshot reads and Blob are explicitly
synthetic boundaries. Blob implements strong versioned reads and conditional
writes in memory. The real C1 handler uses the existing isolated account fixture;
the real Home and App execute in a fresh self-launched Chromium profile over
localhost HTTP. No permitted owner session is presumed or attached.

The fixture includes a synthetic previously accumulated fundamental cache and
leaves an issuer cold to exercise the actual fundamental adapter. It preserves
the production24-new-symbol budget instead of inventing an unbounded enrichment
pass for the test. The account and screen use the same accepted fixture session,
symbols and price history. A fake global feed result is not substituted for the
real event adapter; empty synthetic feeds establish real clear receipts through
its normal coverage checks.

## Added failure paths

- HTTP503 and invalid JSON at the synthetic provider transport reach the real
  broad acquisition boundary. A separate malformed benchmark-price case reaches
  its real coverage gate. Prior browser views survive, quantities are withheld,
  and an explicit normal Reload obtains verified evidence after recovery.
- Invalid and interrupted screen bodies are injected **after** the actual
  handler completes. The test therefore covers an uncertain delivery of a
  side-effecting request, without pretending that the successful ledger write
  rolled back or automatically repeating it.
- Existing overlap tests now also run with the actual broad handler. Older
  cloud intent and quote completions cannot replace newer Portfolio state.
- A produced screen waits at the HTTP boundary while the independent opening
  review completes. The fixture clock advances beyond evidence expiry before
  delivery. Delayed data cannot restore quantities; explicit Reload recovers.
- The existing cash editor submits one synthetic observation through the actual
  C1 handler. The store genuinely commits; the HTTP body is then interrupted.
  The form reports the uncertain response without repeating the POST. Explicit
  normal Reload reads the committed version, and the UI displays it. Full
  committed account bytes and protected history are compared; no fill or trade
  is invented. This synthetic balance is not a claim about actual brokerage cash.

`tools/c1-composed-refresh-regression.cjs` adds CI coverage of the actual screen,
provider and account handlers. It additionally makes a synthetic Blob PUT commit
and lose its acknowledgement: the real performance store reports unconfirmed
recording and performs no automatic second write. A later explicit request
retains each committed record and uses the next verified read ETag. Full account
history remains unchanged apart from the explicitly submitted synthetic cash
observation. The browser response reader rejects the interrupted response and
preserves its prior accepted view.

## Commands and evidence

```
node tools/c1-composed-refresh-regression.cjs
C1_NORMAL_BROWSER_ACTUAL_SCREEN=1 \
 C1_NORMAL_BROWSER_CASES=provider-outage,provider-invalid-json,quote-malformed,screen-body-after-handler,screen-interrupted-after-handler \
 C1_NORMAL_BROWSER_ADVANCED=overlap-tabs,overlap-cloud,expired-opening-evidence,uncertain-cash-write \
 C1_NORMAL_BROWSER_EVIDENCE=work/normal-refresh-browser/actual-composed \
 node tools/c1-normal-refresh-browser.cjs
```

The unchanged default command continues to run the prior18 cases, including the
real90second post-header body stall. Output records the current application
source, browser exceptions, HTTP method/operation counts, actual conditional
write lineage and aggregate ledger counts. Rendering must have zero uncaught
exceptions. The fixture never accesses an external provider, real Blob store,
owner account, credentials, brokerage connection, research route or cron.

Final actual-screen run:9 cases passed in Chrome151.0.7922.173 with zero browser
exceptions, one intentionally committed synthetic cash observation and no
automatic mutation retry. Expired opening evidence remained paused and recovered
through explicit Reload. The actual performance store recorded716 synthetic
ledger rows through16 conditional ledger writes; every overwrite used its exact
prior ETag. The complete committed account remained identical after uncertain
cash-response recovery, with all protected history unchanged.

The unchanged default18-case browser run also passed with zero browser
exceptions, zero account writes and complete account bytes unchanged. Its held
opening-response body expired at90,128ms under the existing90second deadline without aborting
or replaying the POST; the late body could not revive authority and explicit
Reload recovered. All218 application file SHA256 hashes were identical before
and after both final runs. The actual-screen evidence additionally records the
23 recursively loaded screen modules' exact source hashes.

Evidence is in `work/normal-refresh-browser/final-actual/normal-journey.json` and
`work/normal-refresh-browser/final-default/normal-journey.json`; the aggregate
actual-handler regression passed6 cases. Exact final build/CI/preview and
production release results belong to the release checklist, rather than being
inferred from these synthetic local results.
