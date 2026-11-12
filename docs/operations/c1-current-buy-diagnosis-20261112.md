# Current C1 Buy / Watch diagnosis — November 12, 2026

Owner instruction: diagnose the live all-Watch/WAIT screen before changing code,
repair software defects without weakening the existing trading policy, run the
required checks, deploy, and verify the current result. This is a supported
behavior-preserving repair under AGENTS.md; it does not authorize trades.

## Production evidence before edits

Canonical main and `/api/version` agreed on b9f2182b7716525bfef58f3fd4cd43b716506ff7.
The regular cron succeeded at 20:15 UTC, using the November 11 accepted close.
That is the expected completed session during November 12 regular hours.
Readiness reported CHECK_PASSED, 11/11 regular quotes and event receipts. That
aggregate receipt does not verify the private account or certify purchases.
The normal account opening review at 20:12:26 returned three checked buy orders;
the browser reported publication at 20:12:53. The healthy broad screen response
at 20:12:50 reported zero broad Buys. These are different decision surfaces:
only the private account/classifier join can publish checked manual quantities.
Neither aggregate logs nor the diagnostic frozen model queue prove an actionable
owner-screen Buy.

A task-specific current screen request reproduced a broken evidence boundary:
OKTA, VEEV, EL, ILMN, CRL, PTC, MTD, TMO and META carried available dated timing
and $329M–$15.6B average dollar volume, but liquiditySessions=0 and
liquidityVerified/liquidityPass=false. `compactEntryTiming` had discarded the
verified observation count; the full-universe screen producer reused that
compacted timing in `applyEntryTimingGate`, which correctly rejected the absent
count. This is missing transport evidence, not proof of inadequate liquidity.

The owner screenshot independently shows genuine recent-momentum waits on
CRL, MTD and A, plus a shared non-executable opening review. It also shows
informational accepted timing mixed into blocker explanations. The screenshot
does not contain the underlying opening error or establish its precise cause.
A real fifty-symbol account/classifier fixture also reproduced healthy Watch
rows losing their known rank/sector/issuer selection reasons to the generic
“Dated monitoring only” fallback.

## Repair

- Preserve liquidity count/lookback/date in future compacted observations.
- For the current full-universe source only, recover a missing count from actual
  accepted, consecutive twenty-session bars ending on the source date. Require
  the original verified/pass evidence and an independently matching dollar
  average. Missing, contradictory, stale or insufficient bars stay unverified.
  Do not invent a count, rewrite the accepted book, fetch replacement history,
  or reinterpret an explicit failed count as passing.
- Preserve the classifier's concrete selection reason in Watch. Report actual
  current liquidity and price failures, and stale momentum provenance.
- Treat accepted timing.pass as informational under the unchanged C1 policy.
  It cannot hide an unresolved final event gate or authorize a purchase.
- Carry the actual shared opening/account waiting reason into every affected
  Watch row, including failed, missing, expired or mismatched review evidence.
  Checked orders and the existing join remain the sole quantity authority.

Only four application files change: c1StockClassification,
replayDatasetCompaction, c1CurrentWatchSelection and c1OpportunitiesProjection.
Only their affected release-freeze hashes are updated, with this authorization.
No freeze checker, build hook, CI job, cron, ranking, strategy threshold, entry,
event, timing, account, cash, concentration, execution or financial record is
changed. Test-only exact inverse seams retain all earlier source/economic
oracle pins and fixtures; the new seam explicitly reverses this repair.

## Verification

Focused regressions reproduce the transport failure before repair and verify
actual timing -> compaction -> snapshot -> producer -> classifier behavior;
missing bars, gaps, revisions, stale evidence, explicit short/zero counts,
failed event checks and insufficient recent momentum remain fail-closed.
The real account join verifies exact selection and opening explanations while
preserving existing checked quantities. Required release validation comprises
normal `npm run build`, critical dependency audit and all three CI browser jobs
on the reviewed head. Release and private owner-screen status must be reported
separately; missing browser/account evidence remains unverified.
