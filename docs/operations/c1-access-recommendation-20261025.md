# Remaining access controls: specific recommendation and approval boundaries

Source inspected: main7876a16d2a3fa4a0e024f83c715b5a4fedae19ea (PR331).
This workstream makes no application/configuration changes, WAF drafts, actual
account requests, account enumeration, key lookup, research/cron calls or live
writes. All executable evidence below uses synthetic browser/HTTP/memory storage.

## Necessary versus optional

| Item | Assessment | Smallest safe action | Exact current state |
| --- | --- | --- | --- |
| Unauthenticated performance HTTP writes | Necessary integrity repair, not optional architecture | Preserve public GET and in-process producer writes; authorize only deployed HTTP POST using existing server-secret constant-time helper before body/store work | blocked: explicit new authentication-policy approval required; offline exploitability demonstrated |
| Strict single-owner private-account identity | Needed to meet a strict single-owner authorization objective; current creation freeze alone does not provide it. No account theft/exposure demonstrated | Owner privately derives existing namespace fingerprint, enrolls one allowed SHA256, observe then enforce only the two private interfaces | blocked: owner-controlled identity enrollment, policy and recovery confirmation |
| Shared ingress abuse limits | Necessary availability/cost hardening for public expensive acquisition and account mutation boundaries; not a trading-rule correction or proof of an ongoing attack | Vercel WAF exact route/method IP buckets, initial log-only, measured rollout to temporary429; preserve cron/research worker paths | blocked: concrete policy approval, verified plan/capability and observation/owner publication |
| Per-account fine-grained mutation/operation quotas | Optional second layer until traffic/abuse warrants it | If needed later, count server-verified enrolled identity with shared atomic storage; never arbitrary bearer header values | No new platform, SDK, counter or scaffold proposed now |
| Broad IP allowlisting, CAPTCHA/challenge, Attack Mode, new login platform | Optional and currently unjustified | Keep existing authorization and automatic platform protections | Not recommended; would change normal device/network access and risks lockout |

## New confirmed defect: public performance POST can contaminate history

`pages/api/performance.js:10-14` accepts POST without inspecting authorization,
then forwards caller-provided `stocks` and `timestamp` directly to the real
`updatePerformanceLedger`. In the actual ledger engine, absent verification
fields do not establish a pause. Positive fabricated Buy/Strong Buy observations
therefore create ordinary screener-source signals, and any supplied mark for a
known symbol updates existing excursions/returns before new-signal gating.

Executable evidence: `node work/continue-access/performance-ingress-proof.cjs`.
It runs the actual handler -> actual store -> actual ledger -> memory-only Blob
adapter, including real strong ETag conditional writes and the real durable
continuity reader. It sends no network request and imports no private-account,
portfolio or actual-fill store. Results in `performance-ingress-proof.json`:

The memory-only handler test confirmed unauthorized observation persistence, changes to existing modeled marks and continuity inputs, and retention-cap displacement. Explicit request payloads and mutation proof scripts are retained outside the public source tree. Existing ETag and future-continuity guards were exercised; no private account or fill store was accessed.

Current Vercel/proxy unauthenticated reachability was not tested; this is a
handler authorization/integrity proof, not a live unauthenticated exploit claim.

This demonstrates history/continuity input authority, not a brokerage trade or
an independent bypass of current quote/event/timing/account quantity checks.
Source trace shows those hard entry gates remain. No claim any real ledger was
attacked or corrupted, and no history rewrite/repair is authorized by this proof.

Operational-use evidence: browser `pages/index.js:311` uses only GET. The normal
broad screen directly calls `updatePerformanceLedger` in `top5.js:983`, so an
HTTP POST gate does not interrupt its writer or normal crons. Git history
15e32d9174d86c1f9fac8614b27fd8088d593f8f (August29) replaced the old top5
HTTP self-POST with the direct writer and left the public POST surface intact.
Missing tracked callers does not prove external non-use or permit retirement.

Recommended exact policy to approve: require existing CRON_SECRET authorization
for POST `/api/performance` on every deployed environment, including preview,
using `rejectUnauthorizedResearchMutation`/`researchMutationAuthorized` from the
existing constant-time helper. Check after unchanged GET/405 dispatch and before
reading the POST body or invoking storage: missing server configuration503,
wrong/missing bearer401, valid server authorization retains exact payload,
status, ETag, observation and no-retry behavior. GET and direct offline/in-process
writers stay unchanged. Covering previews avoids an alternate deployed writer
if preview credentials access the same store; that sharing is not assumed proven.
No new secret, browser sync key, account identity guess or CRON_SECRET extraction.
Owner decision also confirms whether any external service uses the HTTP writer;
if so it must be migrated through existing server authorization, not silently
broken. This is an auth-policy choice, not an SDK compatibility question.

## Strict owner identity: recommended configuration and enrollment

Recommend production-only configuration:

- `C1_OWNER_ACCOUNT_SHA256`: one lowercase64hex SHA256 of the intended existing
  bearer namespace, set privately by the owner in the exact Vercel project.
- `C1_OWNER_ACCESS_MODE`: `off`, `observe`, `enforce`; initial unchanged default
  `off`, approved initial rollout `observe`. A deployment with `enforce` and
  missing/malformed digest must503 before storage instead of silently failing
  open. Admin-controlled rollback is required before enabling it.

Scope enforcement to GET/POST `/api/c1-account` and authenticated GET/PUT
`/api/portfolio-sync`, with the existing public `?health=1` GET unchanged. Preserve
all existing401 shape checks; compare the derived namespace hash in constant
time before private storage/provider work. Mismatch returns403 with bounded
copy/code. No namespace moves/deletes, multiple-account inference, changes to
ETags/account paths, record resets, rotations or strategy/UI changes.

Enrollment does not require a new endpoint or product UI. Proposed reviewed
owner-only script is `c1-owner-fingerprint.browser.js`:

1. Owner first uses the existing permitted signed-in production browser's normal
   Reload and confirms it shows the intended saved account. Do not use an agent
   browser, create a login, inspect secret files or collect request headers.
2. Owner reviews/runs the short WebCrypto script only in that existing browser.
   It reads the exact localStorage value already used by normal app requests,
   hashes it locally, and emits only its64hex fingerprint. It performs no HTTP,
   clipboard or storage write. It never displays, asks for or transfers the key.
3. Owner privately enters that fingerprint into `C1_OWNER_ACCOUNT_SHA256` in
   Vercel; neither key nor digest is sent in chat, screenshots or agent output.
   The fingerprint names the existing namespace; it is not itself a login token.
4. In observe mode, normal Reload from each existing permitted device must yield
   bounded `OWNER_IDENTITY_MATCH` telemetry, without logging key/hash/account
   path, and the original account must remain visible. A mismatch is investigated
   by the owner without namespace enumeration or automatic migration.
5. Enable enforcement only after successful observation and verified recovery
   access. Ordinary Reload covers accountGET, portfolioGET and prepare-execution
   POST. Verify PUT in synthetic preview tests and later an owner-intended normal
   save; do not invent a production test edit, fill, trade or mutation retry.

Synthetic proof: `node work/continue-access/fingerprint-procedure-proof.cjs`
passes correct digest output for all three known project production origins,
zero key reads on an unknown origin, and no network/clipboard/storage mutation.
This is verification of the procedure, not actual owner enrollment.

Recovery must remain control-plane based: independently verified Vercel project
admin access plus known reviewed deployment/configuration. If the owner is
locked out, the admin changes mode back to observe/off and redeploys through the
normal controls (environment changes require a deployment to take effect).
Do not add a public recovery endpoint, alternate secret, system bypass, IP
exception or fail-open branch. Keep the new-account creation freeze. Reload the
saved state explicitly before retrying any ambiguous mutation. Never reset or
migrate history as recovery. One digest is recommended; enrolling more requires
an explicit ownership decision, not inferred multiple-device identity.

## Source-derived ordinary request rates

`client-request-profile.cjs` parses and executes the actual Home orchestration
functions against synthetic HTTP.12 cases cover0/4/25/100 noncash holdings in
Opportunities/Portfolio/Themes. Finance/scoring outputs are mocked only to isolate
request orchestration; this is not an economic or signed-in browser acceptance test.

| Normal explicit Reload | Actual API calls with current connected account |
| --- | --- |
| Opportunities | N single-symbol quote GETs + portfolioGET + accountGET + prepare-executionPOST + top5GET + performanceGET = N+5 |
| Portfolio | N quoteGETs + portfolioGET + refresh-inputsPOST + prepare-executionPOST + top5GET + performanceGET + one entry-timingGET when N>0 = N+6 |
| Themes | portfolioGET + top5GET + performanceGET =3 |

A current-account normal reload makes no portfolioPUT. Mutations may later
perform an intended syncPUT; non-cash adoption/reconciliation flows are separate.
The60s page interval updates display clock state and does not poll the API.
A409 non-cash account mutation may add one GET, never a replayed POST. Existing
local retention catches transport or non-JSON WAF failure without mutation retry.
The100-row case is a conservative storage/cardinality envelope, not a claim that
100 holdings all pass C1's independent timing/strategy checks (entry-timing caps25).

Declared planning envelope: two devices, two active tabs each, six explicit
reloads per minute per tab =>24 screens/min and up to2400 quoteGETs/min at100
rows; four reloads may start together. Portfolio mode yields48 accountPOSTs/min.
Add12 intended edits/min across devices for planning accountPOST<=60 and
portfolioPUT<=12. This is a generous stated envelope, not measured owner behavior
or a new app policy. More devices/local rows, shared NAT users or external callers
can exceed it; log-first measurement must precede enforcement.

## Recommended WAF buckets

Use production path conditions, fixed_window60seconds, keys=`ip`, independent
counters per rule. First log all matches, then evaluate the proposed threshold
with exceed action `log`; ultimately return429 only after approved observation
and preview verification. Do not use persistent `duration`,403 or challenges.
No bearer header value, account hash, IP identity guess or JA4 count key.

| Rule name | Route/method predicate | Proposed requests per60s perIP | Planning margin / allowed immediate burst |
| --- | --- | ---: | --- |
| C1 broad acquisition | exact `/api/top5`, every method |120 |5x24screens; up to120 instant |
| C1 single-symbol acquisition | exact `/api`, `/api/`, `/api/index`, `/api/lookup`, every method |12000 |5x2400quote fanout; up to12000 instant |
| C1 account POST | exact `/api/c1-account`, POST |300 |5x48opening/review+12intended edits; up to300 instant |
| C1 portfolio PUT | exact `/api/portfolio-sync`, PUT |120 |10x12intended edits; up to120 instant |
| C1 saved-state reads | GET on exact `/api/c1-account`, `/api/portfolio-sync`, `/api/performance` |600 combined |>=5x72normal reads plus24conflict/recovery reads; up to600 instant |
| C1 auxiliary acquisition | every method `/api/entry-timing`, GET `/api/options`, POST `/api/catalysts` |300 combined |24timing checks plus generous manual diagnostics; up to300 instant |

Every-method scope on the first, second and entry-timing paths is deliberate:
those current handlers do not reject other methods before provider work. A
GET-only rule would leave alternate-method resource acquisition uncounted. Do
not change their405/public-interface behavior without separate authorization.
Routing aliases above share the same quote bucket; including an alias that
currently404s adds no application behavior. All query parameters/verification
passes share a path bucket, preventing counter reset by query variation.

Fixed windows permit up to2x the limit across a window boundary and counters are
per region, not a global spend/concurrency ceiling. The large quote limit is
intentionally a gross-abuse guard; it does not cap provider costs tightly. If a
smaller limit is desired, first measure actual normal holdings/device fanout and
external use, then obtain approval of that smaller usage envelope. Do not claim
these initial numbers are mathematically safe for every shared mobile/NAT user.

Exclude `/api/cron/*`, `/api/research/*`, static/UI routes, version, health and ops
acceptance from these conditions; existing auth remains. No broad `/api` prefix,
no header-based cron bypass and no system/DDoS bypass. The saved-state rule covers
the existing portfolio health query on its exact route; monitor that cadence.
Performance POST should receive the explicit server authorization repair above;
new WAF POST thresholds for unknown trusted writers are optional after usage review.

Concrete log-only CLI syntax from the installed skill, proposed only (not run):

    vercel --scope team_vBLhac1QJ54zPEiWFFK7XmGN firewall rules add "C1 broad acquisition" \
      --condition '{"type":"environment","op":"eq","value":"production"}' \
      --condition '{"type":"path","op":"eq","value":"/api/top5"}' \
      --action log --yes

After authorized all-match observation, threshold evaluation keeps action nonblocking:

    vercel --scope team_vBLhac1QJ54zPEiWFFK7XmGN firewall rules edit "C1 broad acquisition" \
      --action rate_limit --rate-limit-window 60 --rate-limit-requests 120 \
      --rate-limit-keys ip --rate-limit-algo fixed_window --rate-limit-action log --yes

Commands require a verified linked exact project and a current CLI supporting
these documented flags. No Vercel CLI is installed here; no command was run.
Use repeated condition groups for auxiliary OR methods; when editing conditions,
include all route/method/environment conditions because edits replace them.
No JSON API schema or draft format is guessed from an unknown-value tool field.

Rollout: approved plan/capability check and exact project link -> review staged
all-match log rules/diff -> owner publication -> at least one real market-open,
normal Reload/device/edit cycle with owner review of false positives -> log-only
threshold review -> preview429 exercise against synthetic routes/state -> owner
publication of production429 rules. Use the same proposed limits initially;
only tighten later on measured evidence and approval. Scope preview counterparts
explicitly, without removing production logging. Do not use production top5 or
mutating routes to manufacture threshold traffic. Test429 routing/retention with
synthetic preview interception; observe real production user traffic passively.

Recovery: a429 should expire within the60s window; stop requests, retain the full
local view/edit, then explicitly reload saved state before any repeated write.
Do not add automatic POST/PUT retries. Admin may stage action log/disable the
specific rule and have owner publish; no persistent duration means no lasting
client ban survives policy rollback. Keep out-of-band Vercel admin access and
normal cron evidence throughout. Required skill publication control is explicit:
`skill://plugin_connector_690a90ec05c881918afb6a55dc9bbaa1/vercel-firewall/SKILL.md`,
“Stage drafts; let the user publish” and “ask the user to run
`vercel firewall publish --yes` themselves.” No draft was created because this
request withholds configuration mutations pending a concrete choice.

## Current read-only platform evidence and limits

Exact project `prj_9MJJaMsEfOdtQKXj4VFI7TfJcBjQ`, team
`team_vBLhac1QJ54zPEiWFFK7XmGN`, project name screener-app-cq5t were confirmed.
Current project response identifies READY production deployment
`dpl_Gbfxa2rze9NHB9QkSG3j2LCdzYa1`; root establishes final production identity.
Project metadata reports SSO protection all_except_custom_domains, no password
protection and no trusted-IP restriction. This is deployment access metadata,
not proof of the app's owner identity. Known-team read exposes no billing plan;
do not assume six custom rate-limit rules or Enterprise-only token buckets.

Exact active WAF read again returned404 Seawall Config not found, request
`iad1:sfo1::v44fg-1792961727195-def28f42664b`. This does not prove automatic
DDoS protection absent. Current runtime log grouping over24h reports3964
/api/top5 log lines and9 /api/c1-account lines. These are application log-line
counts, not request counts or owner/IP bursts. A bounded fulltext request-event
query returned other timing phases too and is not a reliable filter/baseline.
The observability schema tool returned404 Observability Data not found,
request `iad1:sfo1::fgsmm-1792961779854-54bf68235198`; no unsupported metric
names or hidden identities were guessed. The safe current recommendation is
source-based conservative thresholds plus log-first observation, not an invented
live p95 or claim that no owner will be throttled.

## Consolidated choices needed before implementation/configuration

1. Approve server-secret authorization for deployed HTTP performancePOST,
   retaining GET/direct writers and migrating any actual external caller.
2. Approve one enrolled existing owner fingerprint, production private-route
   scope, observe/enforce semantics and control-plane recovery. Owner privately
   performs fingerprint enrollment; agent never receives the key/digest.
3. Approve the six specific IP/window buckets and staged log-first429 rollout,
   subject to actual project plan support and owner publication. Default no
   challenge, no persistent ban, no cron/research route restriction.

Authorized engineering completed now: source/operational history investigation,
actual-client request census, isolated real-ledger integrity reproduction,
reviewed synthetic-tested fingerprint procedure, concrete settings/burst and
recovery recommendations. Authentication enforcement, enrollment, WAF drafts/
publication and live owner-account acceptance remain blocked and are not marked
complete. No unused application scaffold or documentation-only release is needed.

Reviewable unapplied implementation: [two-line POST authorization proposal](c1-performance-post-auth-proposal-20261025.md), with its [patch](c1-performance-post-auth-proposal.patch). The patch passed61 complete baseline HTTP/storage comparisons,24 hostile-body denial cases and20 unsupported-method checks in memory, and applies cleanly. pages/api/performance.js remains unchanged; no production authorization fix is claimed. Existing Next8MB body parsing still precedes the handler.
