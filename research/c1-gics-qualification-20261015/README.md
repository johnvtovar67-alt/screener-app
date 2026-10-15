# Separate GICS reconstruction: completed qualification stage

**NO-GO for bulk historical acquisition.** The owner-approved GICS substitution
is frozen in [SPEC.md](SPEC.md); missing historical FMP sectors are no longer a
blocker. The remaining failures concern the completeness of the S&P action and
GICS continuity evidence, not general research authorization. This stage made
**zero additional FMP requests**, acquired no price histories and created no
infrastructure or credentials.

## Resolved and unresolved

| Component | Actual result |
|---|---|
| Shared research method | Both arms use identical historical GICS inputs; exact C1 calculations/accounting are pinned; neither arm is an original FMP-sector replay |
| Baseline | 503 name/class lines / 500 issuers, all reconciled to SEC and dated public observations; zero unresolved baseline name/class joins |
| Regular March changes | Four additions/removals, announced March 7 and effective before March 24 open |
| Regular security identity | 507 distinct research lines in the conditional union; all four entrants have pre-admission issuer/class evidence; WSM uses a 2024 filing |
| Complete membership/identity action continuity | **Unresolved:** full action coverage, especially Millrose and Sandisk temporary S&P 500 legs/entitlements |
| Complete GICS continuity | **Unresolved:** unchanged snapshots and selected MSCI notices do not establish an exhaustive S&P sector-change history |
| Contemporaneous FMP/GICS comparison | Zero verified historical paired observations; historical difference rate is unidentified |

Read [membership/identity evidence](MEMBERSHIP-IDENTITY-EVIDENCE.md) and
[sector evidence](SECTOR-EVIDENCE.md) for primary links, dates and exact gaps.
The prior 503-to-503 result is regular-member reconciliation, **not proof that
the index had 503 lines every day**. If MRP and SNDK were each temporary members
for one session, the union could be 509; that scenario is not certified.

The contemporaneous GICS methodology permits ongoing reviews after events,
annual reports or requests. The monthly-close rule located applies to **MSCI
indexes**. It cannot be extended to every S&P classification. Four actual public
MSCI notices were reviewed: none establishes a target S&P sector migration, but
their universe/sequence cannot certify zero migrations. More endpoint snapshots
would not close that logical gap without applicable implementation rules and
corporate-event coverage.

Temporary lines proven to lack the unchanged compiler's minimum same-security
history cannot affect its factor ranking. A missing sector for such a proven
exclusion is not itself a ranking blocker. Their index action, identity and
mandatory economic entitlement still cannot be discarded; neither parent is
assumed absent from the eventual portfolio. No new 253-bar eligibility rule is
introduced: 253 rows describe context, not a replacement for source exclusions.

## Finite next action

Obtain **one existing S&P DJI/SSGA benchmark action/classification packet**,
confirming the baseline plus all changes through April 3, including explicit
no-other-change coverage, temporary spin-offs, dated security/class joins,
effective open/close conventions and original announcement availability. The
[short draft](DATA-REQUEST-DRAFT.md) is prepared and has not been sent.
This single packet can close both evidence failures; no new price acquisition,
subscription or identifier-master project is proposed. If unavailable, this
historical window stays NO-GO and further speculative metadata searching stops.

An exact acquisition manifest cannot responsibly be certified while the full
union/action set is unresolved. The old 1,750-request ceiling remains a planning
ceiling, not approval. Once the packet passes, enumerate every symbol/alias,
endpoint, date range, action need and validation call from the verified union,
check request/account allowance, and present that exact manifest for final
owner approval. Price/share/volume/action units and no-op accounting parity are
still required before an economic result. No new exit rule is selected here.

## Reproducibility and evidence boundary

`coverage.py` validates complete calendars/closes, per-date member/rankable
identity/sector intervals, source availability, class separation, exclusions
and full-scope continuity. It cannot authenticate a source or infer completeness
from matching counts; evidence verification is an explicit audit assertion.

`build_candidate.py` reconstructs the **incomplete** regular-member candidate
from the private prior source packet. It deliberately leaves proposed continuous
intervals unverified and coverage ledgers absent. The actual candidate has 64
decision dates, 507 distinct regular lines and 32,192 conditional member-date
joins; it fails the validator as expected. These counts are not certified full
roster or ranked-factor coverage. No temporary inclusion or no-change interval
is silently invented. Existing inputs and private failure reports are preserved
as separate versions.

```sh
python -m unittest discover -s research/c1-gics-qualification-20261015 -p 'test_*.py'
python research/c1-gics-qualification-20261015/build_candidate.py --candidate PRIVATE_CANDIDATE --baseline PRIVATE_BASELINE --output NEW_PRIVATE_MANIFEST
python research/c1-gics-qualification-20261015/coverage.py --manifest NEW_PRIVATE_MANIFEST --output NEW_PRIVATE_REPORT
node tools/c1-release-freeze-check.cjs
```

Validator exit 2 means metadata gate failure. Outputs are 0600 and refuse
overwrite; use an existing subscriber-private 0700 directory. The source pins
bind the specification and unchanged application code. Private FMP diagnostics,
source rows, joins and support correspondence are absent from this checkpoint.
The prior private cross-vintage classification diagnostic is not published
or interpreted as a historical difference estimate. Git contains nonproprietary
code/specifications and public-source findings only. Production C1, accounts,
PR #262 and the frozen 48 program are unchanged.
