# Approved access rollout after PR #332

The owner explicitly approved performance POST authorization, production owner
observation and preparation of six logging-only firewall buckets on October 25,
2026. Optional architectural centralization is outside this completion scope.
The release PR is the single current checklist and contains exact local,
CI/preview and production evidence. Earlier proposal documents retain historical
evidence; their approval blockers are superseded by this instruction.

## Implementation and limits

Performance POST uses the existing constant-time server-secret helper in
production and preview. GET, method dispatch, direct internal writers and cron
contracts remain unchanged. Production secret presence was checked through
undecrypted configuration metadata only; preview has no configured server secret
and safely rejects POST with503. No credential is copied or retrieved. All
tracked callers and relevant history were checked. Untracked external writers
remain a migration risk, reported before enforcement: their operators must
privately configure the existing server bearer. No such caller was identified.
See [the implemented policy and permanent evidence](c1-performance-post-auth-proposal-20261025.md).

Owner access is production-only, with default `off` and explicitly configured
`observe` for this rollout. Observation never denies requests, including missing
or malformed enrollment and invalid mode configuration. Only exact `enforce`
activates the dormant tested restriction; it must not be selected until intended
devices and independent recovery administration are verified. No owner
fingerprint has been retrieved or enrolled by the agent. Observations contain
fixed mode/surface/outcome codes only; no bearer, fingerprint, account path,
holdings or body. Existing401, health and unsupported-method behavior, account
paths, ETags, record logic and save conflict handling remain unchanged.

The original six firewall predicates and thresholds remain the approved plan.
Prepare all-match logging first, then threshold logging; neither blocks traffic.
No429, challenge, permanent ban, broad API prefix or cron/research restriction is
approved for activation. Inspect exact entitlement and existing configuration
before staging, and preserve unrelated draft/active changes. Owner publication is
mandatory under the [Firewall skill](skill://plugin_connector_690a90ec05c881918afb6a55dc9bbaa1/vercel-firewall/SKILL.md):
“Stage drafts; let the user publish.” The accompanying firewall draft handoff
records concrete platform/tooling evidence and exact staging commands.

No dependency changes are included. The packaged Zod exposure remains
**unresolved upstream**, with its existing advisory and monitoring/reopen
conditions in [the exposure assessment](c1-bundled-validator-exposure-20261025.md).
An installed-Zod override would not repair the embedded validator.

## Owner walkthrough

1. **Privately enroll and verify recovery.** In your existing production app
   browser, use normal Reload and confirm the intended saved account. Before
   sharing that browser, review the [owner-run fingerprint script](c1-owner-fingerprint.browser.js).
   Open Developer Tools → Console (Chrome: Cmd+Option+J on macOS or Ctrl+Shift+J
   on Windows/Linux), run that reviewed script yourself, and copy only its
   resulting64hex digest privately. Do not disable browser paste protections;
   use a reviewed local DevTools Snippet if paste is blocked. In [Vercel project
   environment settings](https://vercel.com/johnvtovar67-7543s-projects/screener-app-cq5t/settings/environment-variables),
   click Add Environment Variable: name `C1_OWNER_ACCOUNT_SHA256`, type Secret,
   environment Production only, paste the digest and Save. Keep
   `C1_OWNER_ACCESS_MODE=observe`. Clear the Console/close Developer Tools and
   your clipboard before sharing the app tab. Send only **enrolled** in chat;
   the coordinator can perform the already-authorized normal verified redeploy.
   On each intended device, normal Reload must show its original account and
   corresponding `OWNER_IDENTITY_MATCH` in Vercel Logs. Report only device labels
   and match/mismatch, never fingerprints. Separately sign in to Vercel using an
   independent admin browser/device and confirm you can open this variable's Edit
   control and a production deployment's Redeploy control; cancel without changes.
   Do not enable enforcement while either device checks or recovery are incomplete.

2. **Share the existing app browser, without exporting authentication.** In the
   updated ChatGPT desktop app open Settings → Computer Use → Google Chrome →
   Install if needed, install its official extension in the Chrome profile that
   already has the intended app account, then return and confirm Manage. In this
   chat use `@Chrome` or the `+` tab picker to select the already-open production
   app tab. Approve the app host when prompted (Allow once is sufficient), and
   say **verify this existing C1 app tab; no key/storage inspection or account
   edits**. Close enrollment/Vercel secret tabs first. Do not export a profile,
   cookies, localStorage, authorization headers, HAR or keys. Sharing tab context
   alone may not expose control tools; the coordinator must confirm an actual
   permitted session before claiming live acceptance. If Chrome is not offered,
   check Settings → Computer Use and your workspace availability rather than
   launching a new anonymous browser or transferring credentials. [Official
   browser setup instructions](https://learn.chatgpt.com/docs/chrome-extension).

3. **Supply actual read-only brokerage records.** In the existing Schwab website,
   select only the intended account. Open Accounts → Positions → Export for the
   current positions CSV; Accounts → History → Transactions, select a custom date
   range covering the C1 adoption through the same as-of time, and Export CSV.
   Include filled buys/sells, fees, deposits/withdrawals and corporate actions;
   open/unfilled orders do not establish fills. Open Accounts → Balances and use
   the browser Print → Save as PDF to retain the labeled cash/settled-cash values
   and as-of time, including the distinct Funds Available → To Trade → Cash &
   Cash Investments and Settled Funds labels. [Schwab's balance-field guide](https://www.schwab.com/content/how-to-understand-account-balance-and-available-margin)
   explains those values. Keep original export fields/dates, redact account numbers,
   address and unrelated accounts, and attach the files with chat `+` → Add files.
   State the shared as-of time and timezone. If a menu differs, share only that
   permitted read-only page via the browser step so its exact export control can
   be inspected. No brokerage trade, invented fill or account import is needed.

The Chrome path is documented by OpenAI and depends on client/workspace rollout;
no browser-control tool is currently exposed in this execution context. Plugin
discovery found no callable brokerage-record tool; an installed Finances listing
alone does not establish any account/source access. No profile, cookie, key,
fingerprint or brokerage account was inspected. Public health and synthetic
fixtures cannot substitute for these owner/device/source checks.

Schwab is the broker named by the unchanged app's cash/action interface.
[Schwab's navigation guide](https://www.schwab.com/content/hsba-how-to) confirms
Accounts → Positions/History; the exact authenticated export controls have not
been observed here. The walkthrough identifies the expected controls and supplies
the permitted read-only page fallback if the live interface differs.

## Recovery protection

Observe mode itself cannot lock out an existing valid bearer. Before future
enforcement, record the reviewed release/deployment and independently verify
admin recovery as above. Recovery is Vercel Settings → Environment Variables →
`C1_OWNER_ACCESS_MODE` → Edit → `observe` (or `off`) → Save, then Deployments →
reviewed production deployment → menu → Redeploy through normal controls.
Environment changes do not alter an already-built deployment. Keep the account
and its full history intact. Do not add a recovery endpoint, alternate key, IP
exception, fail-open enforce branch or account migration. After any ambiguous
write, explicitly reload saved state before repeating an owner-intended action;
no automatic POST/PUT retries are added. A code rollback to the prior deployment
would also remove the POST repair, so configuration rollback is preferred.
