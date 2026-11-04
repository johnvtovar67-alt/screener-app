# Verification feedback across ordinary refreshes — November 4, 2026

Continuation of the owner's “Fix it now” request: after PR349 the owner reports
that Verify still appears to do nothing and shows “Holding details changed;
verify again.” Canonical /api/version and main identify PR349's aad00cf release.
Current AGENTS.md was read; no private account or brokerage data was fetched.

Reproduction: execute the actual Home component with isolated hook state and the
existing synthetic account fixture. A successful ordinary click publishes its
quote. Incrementing normal account/cloud read generations with the exact same
reconciled decision and entered portfolio then reproduces the screenshot's false
“holding details changed” message. PR349's quote endpoint worked; its live quote
probe did not establish this page feedback behavior. This reproduction does not
identify the precise sequence of refreshes on the owner's device.

The repair preserves strict request-generation/ownership/revision fences. A
superseded quote is never rebound or published. If a fully reconciled frame with
the EXACT same decision identity (revision, decision ID, source date and entire
positions) and entered portfolio is now current, one NEW public quote GET may
complete the original user action. Both attempts share the existing twelve-second
monotonic browser budget. Changed/unknown evidence, cancellation, a newer same-
symbol action or a second interruption blocks publication; no retry loop occurs.
No account/screen operation or financial mutation is automatically retried.

Completion feedback uses the successfully accepted observation's binding, shows
its check time, verified price and recorded stop levels, and states whether the
current verified price is above or at/below those stops. Momentum/accepted exits
remain separate and authoritative. An ordinary later refresh explains that the
page refreshed; it cannot assert an economic holding change. An interrupted
check explains the refresh and a failed new quote does not mislabel any separate
still-valid account receipt. The current position presentation continues to
control freshness and actions, not a retained historical status message.

Focused tests cover the actual Home click, unchanged refresh feedback, a new
quote after a benign generation change, acceptance of only that second quote,
changed/unknown evidence blocking retry, no looping, and preserved cancellation.
The actual Home/App browser rehearsal adds a successfully delayed quote followed
by normal Reload, one new quote check, visible completion and an identical account
record. Existing stalled-body, revision-change, provider and all three browser
jobs remain required. No live owner journey or brokerage parity is certified.

Only three affected application hashes and release identification/assertions are
updated. The existing exact source inverse is regenerated for this authorized
Home repair while its ORIGINAL 69bc94b baseline and all older economic/source
hashes remain unchanged. No build, CI, cron, threshold, recorded stop, captured
policy, cash, fill, account record or completed experiment is changed. This
supersedes PR349's “no automatic retry” implementation description only for the
single explicitly bounded public quote recheck described above.
