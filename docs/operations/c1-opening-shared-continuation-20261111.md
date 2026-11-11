# Opening scan continuation recovery — November 11, 2026

The owner's regular-session screen reports an incomplete full dated-universe
opening scan and no authorized purchases. Normal production responses at
18:42:58 and 18:43:11 UTC on `97c458b` both report
`OPENING_VERIFICATION_INCOMPLETE`; existing logs omit scan progress and worker
identity, so they cannot establish which worker served either request.

The real collector and client reproduce the exact failure across fresh workers:
205 names progress 64, then 64, and the client correctly stops stalled progress.
The same warm worker progresses 64, 128, 192, 205. A global JavaScript Map is
process-local and cannot carry continuation reliably across serverless requests.
The existing browser fixture supplied complete opening observations and the
provider test reused one warm module. Their passing results did not verify this
cross-worker production boundary. Increasing batches to 64 reduced round trips
but did not repair that boundary.

The repair uses the existing private Blob service for dated anchor progress
only, in a separate operations namespace. Deployment, environment, exact source
identity, source date and a five-minute expiry bind every record. Validated
normalized market bars are merged with strong ETags and bounded conflict
handling; inconsistent evidence fails closed. No account, accepted input,
financial record, quote, event, cash, order or authorization is stored here.
Current quotes, both membership snapshots, event checks and all existing
execution restrictions remain required. Provider and client time budgets and
64-name batches are unchanged. Bounded normal-journey logs expose counts and
completion without keys, holdings, prices or private source identities.

Only the opening-provider application hash and the new cache module are
authorized. The build guard, dependencies, CI workflow and old source/economic
fixture bytes remain intact through an exact additional inverse. Release must
pass all four exact-head CI jobs. Real cold-worker HTTP behavior and synthetic
storage tests establish software recovery; an ordinary owner reload and its
production response/visible screen are still required for deployed recovery.

## Production-build test boundary

The first Vercel build rejected the release: its production environment caused
the older warm-worker provider regression to select the new default Blob
adapter. Its VM intentionally has no dynamic external-import callback, so it
failed with `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING` before external I/O. Local
and GitHub CI runs without `VERCEL_ENV=production` did not exercise that default.
Explicitly inject `anchorStore:null` into that synthetic warm-worker test; the
new cold-worker regression separately injects and exercises shared storage.
Application behavior and assertions remain unchanged. Re-run the full build
with the production environment plus all four exact-head CI jobs, then verify
the deployed owner path. A failed deployment is not a completed release.
