# November 4 incident: exact artifact handoff

Current status: **BLOCKED**. The available connection has not verified the incident deployment's actual private Blob authorization/store binding or retrieved the three incident artifacts below. The existing offline inspector has not run on actual incident evidence. The original November 4 economic cause remains **UNRESOLVED**. Historical artifact access is not a prerequisite for checking current ordinary production recovery; that independent check is scheduled for November 5 at 6:20 a.m. America/Chicago, after the processing budget. PR #352's release and passing tests do not establish incident recovery or any completed session in the five-session stability window.

## 1. Verify the incident deployment's binding first

Use the owner's existing authorized Vercel account. The required incident identity is:

| Field | Required value |
| --- | --- |
| Deployment | `dpl_CKpneR7jSr8NPi9QxcHbinBd5AfN` |
| Commit | `200263dfae6f0ad49d6e160a1e5b70c95dc1e53d` |
| Project | `prj_9MJJaMsEfOdtQKXj4VFI7TfJcBjQ` (`screener-app-cq5t`) |
| Team | `team_vBLhac1QJ54zPEiWFFK7XmGN` |
| Target environment | `production` |

Retain supported, non-secret metadata linking this deployment's actual runtime Blob authorization to a store ID and that store's team/project/environment relationship at the time of deployment. A current project `BLOB_STORE_ID`, its age, a current connected-project panel, or a workspace store ID does not establish this historical binding. Confirming only the plain `BLOB_STORE_ID` is also insufficient if it does not identify the store used by the deployed Blob authorization.

No deployment-specific storage-binding dashboard view has been verified in this investigation. Do not assume that such a tab exists or reveal/decrypt protected environment variables to find the answer. If the existing dashboard or supported connection does not expose the required non-secret historical metadata, use the owner's normal Vercel support channel with this request; do not change bindings:

> Please confirm from existing platform deployment/storage binding metadata which private Vercel Blob store was authorized for runtime Blob access by deployment `dpl_CKpneR7jSr8NPi9QxcHbinBd5AfN`, commit `200263dfae6f0ad49d6e160a1e5b70c95dc1e53d`, production target, project `prj_9MJJaMsEfOdtQKXj4VFI7TfJcBjQ` (`screener-app-cq5t`), team `team_vBLhac1QJ54zPEiWFFK7XmGN`. We need the non-secret store ID and confirmation of its team/project/environment relationship for that deployment, including whether the runtime Blob authorization resolves to that same store. Current project configuration alone is insufficient. Please do not retrieve, decrypt or disclose credentials, tokens or secret environment-variable values, change any binding, enumerate stored objects, or create an export. If the historical binding cannot be established through supported metadata, please identify that specific metadata/access limitation and the existing owner-authorized dashboard access needed to download the three exact objects listed below.

This document prepares that request; it does not send it. Until the deployment-specific binding is established, label the store **unverified** rather than selecting a store from current project settings.

## 2. Download and upload only these three files

After the binding is verified, open that exact store using the same existing authorized Vercel account. Use a supported exact-file lookup/search for each complete pathname below, open only its exact match, and use the normal dashboard download action to save the original gzip. Do not browse folders, search shorter prefixes or enumerate other objects. If the dashboard cannot locate/download an exact pathname without broader enumeration, record that precise limitation and request the existing supported owner download method through Vercel support; do not introduce a credential-based workaround or another export system.

| Exact store pathname | Local filename after attaching the original file in this conversation |
| --- | --- |
| `research/c1-dated-index-production-v1/sp500.json.gz` | `work/incident-market-book.json.gz` |
| `research/c1-dated-index-production-v1/sp500/observations/2026-11-04/7080aa5b3e56463b81199264f9427e0f97713a6de9779f6b22572af988f5b10b.json.gz` | `work/incident-7080aa5b.json.gz` |
| `research/c1-dated-index-production-v1/sp500/observations/2026-11-04/995e86b9c5032ff61f306d7b512337d6964d185f8ac816fa7f539e0b8d4d0422.json.gz` | `work/incident-995e86b9.json.gz` |

Attach those three original files here, with the verified non-secret binding record, their exact pathname-to-filename mapping, download time, and any object size/upload time/ETag/version metadata already shown by the authorized dashboard. The table's `work/` names are the local destinations for inspection after upload; renaming the downloaded files is permitted, changing their contents is not. Do not attach credentials, sync keys, private object URLs, account records or unrelated objects. If one exact file is unavailable, report its full pathname and the displayed result; an archive receipt or a URL is not a replacement for the file contents.

## 3. Check the accepted book's time and identity

The book path is a mutable accepted head written with compare-and-swap; the two content-addressed observations are immutable. For the original November 3→4 rejection, the supplied complete accepted predecessor must end at **2026-11-03**, with its last capture also on November 3. Preserve its original `recordHash`, all captures and its complete model. Retain any incident record-hash/version receipt that ties it to the rejected transition, or the available supported object provenance, and explicitly record any remaining historical identity gap.

A current download that already includes November 4 or later cannot serve as that predecessor. The inspector verifies the book's self hash but does not require the incident's predecessor date. Such a later book can return duplicate acceptance or an already-accepted-input rejection before the relevant economic comparison. Do not truncate it, rebuild an earlier book, edit dates, recalculate its hash, or call that result a reproduction. Report the exact temporal evidence gap if the original predecessor is unavailable through the verified access.

## 4. Run the existing offline inspector after upload

Once the three local files are available and the predecessor identity is established, run from the repository root with a new output directory:

```sh
node tools/inspect-c1-index-transition.cjs \
  --book work/incident-market-book.json.gz \
  --observation work/incident-7080aa5b.json.gz \
  --observation work/incident-995e86b9.json.gz \
  --target 995e86b9c5032ff61f306d7b512337d6964d185f8ac816fa7f539e0b8d4d0422 \
  --output work/incident-inspection
```

The output directory must not already exist. The inspector validates complete observation envelopes/payload hashes, uses their original observation times and the real acceptance path, and writes local reports without provider requests or storage writes. Review `transition-report.json`, both model snapshots, `complete-model-differences.json`, `simulator-state.json` and `complete-simulator-differences.json`. Separately replayed simulator stop/open-position evidence is required because persisted model fields do not contain the full simulator stop state.

Actual incident-bound differences can establish the original economic blocker; new ordinary processing diagnostics can separately identify a current blocker and support the next narrow repair. Check current production logs/readiness regardless of whether these historical files have arrived. If ordinary processing accepts November 4, report the verified accepted source and current recovery while retaining unknown original cause. An accepted local inspection is not proof of production recovery, and a successful current check alone is not a completed stability session. Keep release, current recovery, original cause and five-session stability separate. Do not dispatch a cron manually or change its schedule for this handoff.
