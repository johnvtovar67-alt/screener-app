# Bundled Zod follow-up and permitted-session discovery

October 25, 2026; read-only investigation during the PR331 continuation.
Current checkout at final evidence capture:
`7876a16d2a3fa4a0e024f83c715b5a4fedae19ea`.
Root independently verifies remote main and production; this review makes no
new deployed-state claim. No application, dependency, policy or credential
change was made.

## Genuine compatible remediation remains blocked upstream

Fresh public registry/audit reads through the supported proxy again report
0 critical and 4 high dependency nodes, all the single advisory chain
`Blob -> OIDC -> CLI-config -> Zod` for
https://github.com/advisories/GHSA-mrhx-c7xc-m3w5 (fixed Zod >=4.6.6).
Evidence: `npm-audit.json`, `*-registry.json`, `cli-config-pack.json`.

- Latest Blob 2.8.2 still requires OIDC ^3.6.1.
- Latest OIDC 3.x is 3.8.10, with CLI-config 0.3.1.
- Latest OIDC overall is 4.0.3, with CLI-config 0.3.3.
- Latest CLI-config 0.3.3 still declares and **embeds** Zod 4.1.11.
- Installed CLI-config 0.2.6 embeds the same Zod version.
- npm's proposed Blob 2.4.0 downgrade is neither authorized nor a verified
  substitute for the current conditional-write and OIDC contracts.

Freshly downloaded latest official CLI-config tarball retains SHA1
`74f2d63bbaf2e7525889cf091366854392954e30`. Actual entrypoint is 101517 bytes,
SHA256 `506e7e10abd141655d019d0b8d3962bb23a6c52eabe44041638f48f4a01285b7`;
installed entrypoint is 101320 bytes, SHA256
`1c03f9f9df7e523051744eb85f35c276b29315cbbb8bde79dc0509be6caf381d`.
Both contain bundled version literals 4.1.11 and only require os/path/fs, not
installed Zod. An installed-package override cannot repair that validator.
A major OIDC change would still retain it and therefore would not repair this
advisory. No package update release is justified as a purported remedy.

## Actual schema reachability narrows observed exposure

The public advisory describes excessive validation issue accumulation in
`$ZodArray` while validating large invalid arrays. The affected array validator
exists in the distributed bundle, so this is not a missing-code false positive.

`inspect-bundled-schemas.cjs` safely evaluates the **actual installed and latest
official bundles** in isolated VMs with empty environments and filesystem
methods that throw. It inspects all 13 concrete CLI-config schema roots,
including the non-exported roots used by parse/read/write helpers. Results are
`schema-reachability.json`; **zero filesystem calls** occurred. No auth/config
files or user profiles were read; no live OIDC acquisition was invoked.

Observed schema types in both bundles are only boolean, enum, literal, number,
object, optional, string, union and unknown. No array, tuple, set, map or record
schema is constructed in these concrete roots. Synthetic arrays supplied as
the auth token, telemetry object or top-level config produce one type issue
each; unknown-property arrays pass through without per-element validation.
These bounded examples complement the full concrete schema graph inspection;
they are not a stress test or live exploit attempt.

Static inspection of the actual OIDC consumers shows CLI-config used for local
global/auth configuration during credential refresh. Current C1 source imports
Blob but does not directly import CLI-config/Zod or pass HTTP request bodies to
their config parsers. Blob's resolver first supports explicit token options,
otherwise attempts OIDC and retains environment read-write-token fallback.
Its OIDC refresh graph still imports CLI-config; actual local optimized
`c1-account.js.nft.json` includes the CLI-config and OIDC distributed files.
Removing the dependency or forcing a different auth branch would change
existing supported authentication contracts and is unnecessary for this
bounded exposure assessment.

Conclusion: **no request-controlled path into the advisory's array-schema
validator was demonstrated in the inspected C1/Blob/OIDC/config graph**.
That does not establish that every possible SDK path or future schema extension
is unexploitable. General parsing/memory exhaustion from large local input is a
separate question; it was not tested. The vulnerable code remains packaged and
the advisory remains open. No scanner suppression or reduced severity is
appropriate on this evidence.

## Exact upstream monitoring / reopen condition

During normal dependency maintenance, inspect official CLI-config releases and
their distributed entrypoints, then the compatible OIDC/Blob dependency chain.
Reopen remediation when:

1. An official CLI-config distribution actually embeds the fixed validator
   (Zod >=4.6.6 or an upstream-supported equivalent), or removes the affected
   bundled validator; manifest-only changes are insufficient.
2. A compatible OIDC release within Blob's supported chain selects that fixed
   distribution without forced SDK downgrade, override, vendor patch or auth
   configuration change.
3. The candidate preserves actual Blob identity GET/strong ETag, conditional
   overwrite/creation, stale-precondition behavior and OIDC contracts under
   focused tests, then the existing full release gates.

Also reassess exposure if upstream config schemas add collection validators or
C1 starts passing request-controlled data into those parsers. Those are concrete
reachability changes, not evidence that a fix already exists.

Existing CI continues to run the unchanged full npm audit and reject critical
production advisories. The high advisory remains visible. No additional monitor
service, scheduled automation, dependency-only release or auth configuration
change was created. The smallest authorized action today is this concrete
read-only exposure assessment with the advisory retained as **blocked**.

## Existing signed-in browser and brokerage access

Enabled tool metadata was searched for browser, computer/CDP, brokerage and
Schwab capabilities. No connected browser/session-control or brokerage/source
records tool is exposed. Vercel analytics and consent-link descriptions mention
browsers but do not provide the owner's signed-in application session. Vercel
sandbox sessions are execution environments, not authenticated owner browser
sessions. Document-control sessions concern office documents, not this flow.
No unrelated sessions/accounts were enumerated.

The local workspace does have Chromium and Playwright installed. Process names
show some Chromium processes, but no exposed permitted session or trustworthy
ownership binding was supplied. Root confirmed it did not start a browser this
turn and directed against attaching to unknown targets. No process arguments,
debugger targets, browser profiles, localStorage, auth files or sync keys were
inspected. Launching a fresh browser would not grant the existing owner session.

Therefore live signed-in screen/account/browser acceptance remains **blocked
by absence of an exposed permitted owner session**, and brokerage reconciliation
remains **blocked by absence of a connected brokerage records capability**.
Configured FMP/Blob access does not substitute for actual brokerage source
records. Screenshots, public health and synthetic account fixtures cannot
establish that reconciliation. An explicitly connected existing owner browser
session and actual connected source records, without credential disclosure or
account enumeration, would unblock these checks. No auth bypass was attempted.
