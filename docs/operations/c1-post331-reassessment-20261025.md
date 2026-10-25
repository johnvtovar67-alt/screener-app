# C1 reassessment after PR331 — source checkpoint

Owner instruction: continue independently; classify necessity, establish concrete
blockers, choose the smallest safe solution, and implement authorized work. Preserve
C1 policy, timing, UI, account facts, safeguards and normal crons. The release PR
body is the single current checklist; this document is its source-time evidence.

## Verified baseline

GitHub main and canonical Vercel production matched
`7876a16d2a3fa4a0e024f83c715b5a4fedae19ea`, tree
`fa0d0501067cf5545ed3f1202ea1eeb822395426`. PR331 provides the reviewed tree,
132/132/build/CI/preview and production release record. The exact production
deployment was READY. A fresh scoped error-cluster query found no errors in
the preceding hour; this is not private-account acceptance.

## Each original remaining item reconsidered

| Item | Necessary or optional? | Concrete evidence/blocker | Smallest safe solution and existing authorization |
|---|---|---|---|
| Producer/read separation | Strictly immutable public GET and a complete event archive are optional architecture. Preserving intended observations and coordinated recording is necessary. | All request timestamps can be retained, yet timestamp-order or commit-order replay still loses original states: the actual reducer depends on first/latest read versions and successful CAS lineage. Complete lineage replay succeeds. A mandatory extra archive write adds an availability dependency; its full acquisition/cache/hysteresis contract is not characterized. | Keep legacy GET and existing conditional writes. Implemented a promise-ownership fence for a reproduced stale recording-completion defect. It preserves distinct observations, pass rotation, cache policies and original timestamps. No sampling/new cron/platform/archive scaffold. Full optional architecture remains unfinished; no owner timing change is needed for this repair. |
| Single server-produced Opportunities response | Server-checked quantity/expiry authority is necessary and already present. Replacing all independently timed inputs with one response is optional. | A later holding quote/event or retained selection can correctly change rendering while the checked server response stays identical. A canary counting checked orders alone cannot detect a held Add being suppressed by the actual view. | Implemented a shared synchronous projection used by the actual UI and captured-response canary. Same independent inputs and clock-read order; no added request or authority. Full centralization is not claimed. |
| Signed-in screen/account/browser acceptance | Necessary evidence for certifying the real owner flow; not established by public health. | Tool discovery exposes no permitted owner browser/session-control capability. Installed Chromium and unknown process names do not establish ownership or authorization. No profile/args/key inspection or unknown-browser attachment. | Independently verify actual Home/App normal Reload in isolated Chromium with real account handler and synthetic HTTP/memory evidence. Real acceptance still needs the existing permitted signed-in session, not a sync key or new login. |
| Failure retention and recovery | Necessary behavior; existing implementation already retains state and does not retry mutations automatically. | Existing six-case real request-function proof covers transport/body failure of GET, refresh POST and cash POST. Real device cause/session remain unavailable. | Added the normal Home/App Chromium journey: account transport/body, opening POST and screen failures; full account record retained, quantities paused and explicit normal Reload recovers. This strengthens synthetic evidence; live device recovery remains unverified. |
| Brokerage/economic reconciliation | Necessary before asserting agreement with brokerage source records; not required to refactor rendering safely. | No brokerage records connector is exposed and no actual source holdings/cash/fills were supplied. Screenshots and synthetic fixtures are insufficient. | Compare the permitted app state with actual read-only broker records for the same as-of time. Requires source access/records; no brokerage execution, invented fills or account mutation. |
| Bundled Zod | Unresolved security maintenance obligation; no demonstrated request-controlled exploit path in the inspected graph. | Fresh registry/audit still shows0 critical and4 high chain nodes. Latest official CLI-config0.3.3 actually embeds Zod4.1.11; even latest OIDC major retains it. Concrete config schemas inspected contain no collection validators; vulnerable code remains packaged. | No compatible genuine fix exists now. Keep advisory visible and existing CI gate unchanged. Reopen when an official fixed bundle is selected by a compatible SDK chain, or collection/request-controlled reachability changes. No installed-only override, vendor patch, downgrade or pointless monitor release. No owner action fixes upstream today. |
| Strict owner identity | Additional authorization hardening; necessary to claim strict single-owner identity, not proof the existing high-entropy bearer account model was breached. | Creation freeze does not establish ownership of every old namespace. No intended identity is enrolled; deriving one from records would violate scope. | Recommend private fingerprint enrollment, off→observe→enforce, constant-time pre-storage comparison and admin rollback. Existing authorization permits preparation/proof, not silently changing authentication policy or choosing identity. Owner approves and privately enrolls the intended digest. |
| Ingress rate limits | Availability/cost hardening; not a correction to trading rules or evidence an attack occurred. | Actual client census proves quote fanout is N per reload; a global small API bucket would block normal holdings. Runtime log-line counts are not request/IP counts. Exact active WAF query returns404; plan/limits and owner traffic baseline are not established. | Six generous per-IP fixed60s buckets proposed from a declared24reload/min envelope, log-first, preview429 and manual publication. All-method buckets cover methods the existing expensive routes already accept. No policy/config/draft has been applied; owner approval/publication required. |

The previous blanket producer/server blocker language was too broad. There is no
general proof that request-driven capture or shared presentation is impossible.
The exact failed replay invariant is read/CAS lineage, and the optional archive
also needs worker-local acquisition/hysteresis beforeimages plus a publication
failure contract. Required safety can improve without replacing the public GET.

## New independently actionable defects repaired

1. **Stale recording completion.** A older / B newer recording could be followed
   by A settlement replacing B's in-flight identity. Same-snapshot B then wrote
   twice; an explicit A/B/A return could instead be wrongly suppressed by stale
   A cooldown. Only the actual owning promise may settle cache state now. The
   race-only corrections are intentional and separately tested; this is not
   universal byte parity with erroneous duplicate/suppressed marks. Distinct
   observations and original timestamps,30s success/5s failure boundaries,
   uncertain outcomes and explicit recovery remain characterized.
2. **Three raw-provider disclosures.** Actual `/api`, `/api/entry-timing` and
   `/api/catalysts` catches returned arbitrary provider exception details; two
   also logged them. A shared fixed-message boundary now logs only bounded
   code/stage/status/request ID. Complete successful handler prefixes,
   responses/cache/status/call order match immutable PR331 source fixtures.
3. **Canary versus actual presentation gap.** The canary now consumes the exact
   UI projection with explicitly captured holding-price evidence, adding only
   aggregate actionable groups/held reviews. Every existing report field and
   classification is preserved when that evidence is absent. It still does not
   certify browser rendering, private parity or execution authority.

## Additional approval-required integrity issue

An isolated real-handler→real-store→real-ledger memory test established that
HTTP POST `/api/performance` lacks application authorization and accepts
caller-supplied observations. Those inputs can alter modeled marks/history and
durable continuity. This is not a live exploit, corruption or internet
reachability claim. No private account/fill store was accessed.

The browser uses GET and top5 writes directly through the store. Recommended
minimal change: preserve GET and direct writers; require existing constant-time
server-secret authorization before POST body/store work in every deployed
environment, with missing configuration503 and missing/invalid authorization401.
External writers cannot be declared unused from tracked callers alone. This
authentication-policy change requires explicit owner approval; it is not quietly
included in the behavior-preserving release.

## Verification and release boundary

Focused source/behavior checks, independent reviews and actual Home/App local
Chromium are required. Full existing suite, freeze/canonical and standard
optimized build; exact-head GitHub CI; matching preview; reviewed/merged tree
equality; exact production version/health/scheduler and scoped errors remain the
release gate. Seven affected application hashes plus specific owner authorization
are recorded. Guard/CI/build-hook implementations, dependencies, authentication
policy, WAF configuration, actual account history and cron sources are unchanged.

Detailed evidence: [recording and complete-sequence replay](c1-request-recording-continuity-20261025.md),
[shared projection](c1-shared-opportunities-projection-20261025.md),
[bundled validator exposure/reopen condition](c1-bundled-validator-exposure-20261025.md).
The [access configuration/recovery proposal](c1-access-recommendation-20261025.md) and reviewed owner-only fingerprint script are supplied separately. No actual fingerprint, sync key, source account records, live exploit output or explicit mutation proof payload is included in the repository.

The unauthenticated writer decision is now concrete and reviewable: the unapplied two-line [performance authorization proposal](c1-performance-post-auth-proposal-20261025.md) passed61 complete contract comparisons,24 denied-hostile-body cases and20 unsupported-method checks without application/configuration changes. It remains blocked by the explicit policy decision and external-writer migration, not unfinished routine implementation.
