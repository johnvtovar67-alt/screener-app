# C1 client-version body budget — October 30, 2026

This completes the owner's authorized safe-client-handoff work after PR345.
Remote main0238b7be92faaa9ccbbfe2b3f9e11face9579505 has complete source tree
5594fb42fd99ae2334da6f2b5de8b977159f68b9, identical to local starting5acb8f1.
The main reliability program, daily Chrome gates and independent watch remain.

A reproducible version response could deliver headers, then never finish its
JSON body. The existing fetch wrapper ends its header timer at that point, so
the release check's in-flight promise could remain stuck and later checks could
never recover. The added current-helper test fails on the prior source without
waiting forever: after the synthetic deadline, settlement is still false.

Only `lib/c1ClientRelease.js` changes application behavior: bound the complete
version read to ten seconds, return UNVERIFIED on expiry and clear the in-flight
latch. A later explicit check can acquire valid metadata and use the unchanged
safe navigation, draft, full-write-response and loop-prevention barriers. No
automatic request retry, financial mutation replay, new authority or data write.
All existing focused checks pass plus old-fails/current-passes stalled-body recovery. The existing lifecycle/client Chrome job also gains the real HTTP post-header version-body stall, app-usability/no-navigation/no-account-retry and later explicit recovery case; its earlier cases remain unchanged.
Only this manifest file entry changes, with explicit repair authorization. All
freeze/canonical/CI/build gates, strategy/account/records/history/fills and normal
Vercel schedules remain unchanged. Full normal build and exact-head build/Chrome/
preview/main/production verification are required; release proof belongs in the
final pull-request body, superseding this source-time pending checkpoint.
