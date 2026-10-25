# Approved six-bucket logging preparation

The owner approved PR332's logging-only preparation on October25,2026.
The exact six rule predicates and proposed later thresholds are in
[`c1-firewall-log-plan-20261025.json`](c1-firewall-log-plan-20261025.json).
The first phase logs every matching request and does not count, block, challenge,
redirect, bypass, or change the application. The later threshold-log phase edits
those same six rules; it does not create six additional rules. It remains
prepared only, pending observation of normal traffic. No enforcement is staged.

**Actual platform state: no remote draft was created or published.** These are
local review artifacts. The exposed connection cannot establish a safe draft
mutation path, and its read responses do not establish this team's capacity for
six rules. No plan/billing change, authentication extraction or alternate-team
probe was attempted.

## Concrete platform evidence

Read-only checks at approximately5:18–5:22PM CDT (22:18–22:22UTC), using the
server request timestamps below:

| Check | Actual result | Consequence |
| --- | --- | --- |
| Exact team/project | `team_vBLhac1QJ54zPEiWFFK7XmGN` / `prj_9MJJaMsEfOdtQKXj4VFI7TfJcBjQ`, `screener-app-cq5t` | Target is confirmed; no other project is substituted |
| Active config GET |404 `Seawall Config not found`, request `iad1:sfo1::7tzfw-1792966696106-1e9eb1e96aa7` | Cannot read/preserve existing configuration through this connection; does not prove automatic DDoS or WAF protection absent |
| Draft config GET |404 `Seawall Config not found`, request `iad1:sfo1::pzd7l-1792966938207-7d5d10076ca2` | Existing draft state is not established |
| Team/project metadata | No billing plan or custom/rate-limit quota returned | Cannot certify six-rule entitlement from account metadata |
| Observability schema |404 `Observability Data not found`, request `iad1:sfo1::r87bt-1792966696030-534f24016f06` | Legacy query tool cannot measure per-IP/minute edge request rates |
| Runtime grouped counts, preceding24h |3492 `/api/top5` and9 `/api/c1-account` **log records**; result says top25groups may omit others | These are application-output counts, not requests, IPs, user sessions, p95 or threshold measurements |
| Supported CLI/runtime authentication | No `vercel` executable or configured CLI identity | No authenticated CLI draft operation is available here; no token/profile is obtained |

Official [rate-limit documentation](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting)
was read directly: fixed windows and IP keys are supported on all plans; a60s
window is within every plan's range. The published limits are Hobby: one
rate-limit rule within three custom rules, Pro:40rate-limit rules/project,
Enterprise:250. The **actual team's plan and remaining capacity are unverified**.
Six independent buckets cannot fit Hobby's stated limits. Do not silently merge
buckets, remove existing rules, activate a paid plan or assume an upgrade is
authorized. Initial plain log custom rules do not activate rate-limit counters.
Later rate-limit counting can be usage billed; recheck plan terms at that stage.

The official CLI implementation at
[`c628be7835e03a965b93e9cf9e2bd5ac2acbf5eb`](https://github.com/vercel/vercel/tree/c628be7835e03a965b93e9cf9e2bd5ac2acbf5eb/packages/cli/src/commands/firewall)
uses `PATCH /v1/security/firewall/config/draft` for rule staging. The exposed
`update_firewall_config` connector targets `PATCH /v1/security/firewall/config`
and exposes no draft selector. A whole-config PUT would also risk replacing
unreadable settings. Neither was used. CLI `--yes` skips its optional immediate
publication prompt; the generated commands contain no publish operation.

## Scope and ordinary-use verification

Every OR group repeats `environment = production`; path conditions use exact
equality. Auxiliary acquisition is exactly:

    production AND (
      path = /api/entry-timing
      OR (path = /api/options AND method = GET)
      OR (path = /api/catalysts AND method = POST)
    )

The broad screen, quote aliases and entry-timing retain all-method counting
because their existing handlers may acquire data before rejecting a method.
No query is part of the key; `?health=1` portfolio reads match the saved-state
bucket. Cron/research, health/version/ops, static and UI paths are excluded.
No authorization-header logging or bearer/JA4 counting key is added.

`node tools/c1-firewall-log-regression.cjs` passes2016independent combinations of
environment, exact path, method and query, including protected-route exclusions,
alias coverage and auxiliary OR behavior. Six first-phase commands and six later
edits are checked for explicit project scope and nonblocking actions.

An additional isolated proof evaluated the actual official CLI condition parser
and action builder against all12generated commands: exact condition groups and
nonblocking action objects passed. Upstream source SHA256 values:

- `parse-conditions.ts`: `3459c4e779e9e4fbb0d12cad00df2375a7ec69ab4312fe30ed3d0402118ecdf4`
- `condition-types.ts`: `8dcb74e0e77ba743a3c5d73a522494f5f23d53aac7dac0a979aecc0244c77a32`
- `build-action.ts`: `42c5d458619f735451a806403c55c0f2fdb21a56fec7b499d5dc02514869c1a9`

The actual Home request orchestration was rerun against synthetic HTTP on base
`105919ef37edf0dbbf0428ccc55e8637d0128516`; `pages/index.js` blob
`d5db3a39a67600a15b71c0fdea9e0a06afb1df26` is unchanged. All12ordinary request
profiles (Opportunities/Portfolio/Themes,0/4/25/100holdings) retain PR332's census
and generous planning margins. This is source-derived normal-use verification,
not measured owner market-open behavior or signed-in acceptance. There was no
production load test, top5 call, account write, research call or cron invocation.

## Exact safe staging and owner publication

1. Open [this project's Firewall](https://vercel.com/johnvtovar67-7543s-projects/screener-app-cq5t/firewall)
   → **Configure**. Verify the selected team/project and at least six remaining
   custom-rule slots; verify later six-rate-limit capacity under the existing
   plan. If a plan upgrade is offered or capacity is insufficient, stop there;
   report the displayed plan/capacity without changing billing. No credentials
   need to be shared. An already authenticated current Vercel CLI can perform the
   equivalent read-only preflight from a checkout of this release:

       vercel --scope team_vBLhac1QJ54zPEiWFFK7XmGN firewall status --project prj_9MJJaMsEfOdtQKXj4VFI7TfJcBjQ
       vercel --scope team_vBLhac1QJ54zPEiWFFK7XmGN firewall rules list --project prj_9MJJaMsEfOdtQKXj4VFI7TfJcBjQ --json
       vercel --scope team_vBLhac1QJ54zPEiWFFK7XmGN firewall diff --project prj_9MJJaMsEfOdtQKXj4VFI7TfJcBjQ

2. Preserve any existing rules/draft. Do not discard, overwrite or publish
   unrelated changes. If these six names already exist, inspect them and use
   reviewed edits rather than duplicate adds. After the checks pass, print the
   exact initial six stage commands, inspect commands and diff command:

       node tools/c1-firewall-log-draft.cjs

   This command prints only; it does not execute anything. Run the printed
   `rules add ... --action log --yes` commands in the independently authenticated
   CLI, one at a time, stopping on failure. Then run every printed `rules inspect`
   and `firewall diff`. There must be exactly the intended six additions, all
   `log`, production-only, with no existing-rule/settings changes. Partial drafts
   have no live effect; review before continuing rather than retrying blindly.

3. **Owner publishes** only that reviewed log-only diff:

       vercel --scope team_vBLhac1QJ54zPEiWFFK7XmGN firewall publish --project prj_9MJJaMsEfOdtQKXj4VFI7TfJcBjQ --yes

   This is the mandatory boundary in
   [the Firewall skill](skill://plugin_connector_690a90ec05c881918afb6a55dc9bbaa1/vercel-firewall/SKILL.md):
   “Stage drafts; let the user publish” and “ask the user to run
   `vercel firewall publish --yes` themselves.” There is no repeated request for
   policy approval; the owner already approved log-only preparation.

4. Open the project's **Firewall → Traffic**, filter each new rule ID from
   `rules list`, and observe one actual normal market-open/device/edit cycle.
   Confirm intended routes/methods, quote fanout, shared-network bursts and
   portfolio-health cadence; retain any legitimate external service calls.
   The later command `node tools/c1-firewall-log-draft.cjs --threshold-log`
   merely prints reviewed same-rule edits with60s fixed-window/IP counters and
   `--rate-limit-action log`. Do not run those until this first-phase observation
   and capacity/pricing check. It still cannot enable429 enforcement.

Rollback for the initial phase is staging `rules disable` for the exact affected
rule IDs, reviewing the diff, and owner publication. Do not disable system
mitigations or existing protections. If future approved429limits fire, stop
requests for the60swindow, retain the view/edit, explicitly reload saved state
before repeating an ambiguous mutation, and keep existing no-auto-POST/PUT-retry
behavior. No persistent action duration or client ban is proposed.
