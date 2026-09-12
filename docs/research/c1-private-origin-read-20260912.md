# Private account fresh-read dependency repair

Production PR 173 logs show successful `VERIFIED_ACCEPTED_VOLUME` compilation on three successive account POSTs at 15:49:08, 15:49:21 and 15:49:59 UTC. The user-visible account still lacked a holding rank. Repeated collection indicates the accepted review is not retained in the subsequently read account. Provider history verification is now confirmed; persistence/display is not.

The production build restored its dependency cache and reported dependencies up to date. The manifest allowed any Blob 2.x release. Official SDK release notes state that 2.5 ignores `useCache:false`, and 2.6 restores origin reads. The exact previously installed production SDK version was not logged, so cached 2.5 is a supported explanation, not a confirmed version observation.

Pin Blob to 2.8.0. Add a prebuild integration check using the real SDK with an isolated Undici mock transport: it must request the private origin-read URL (`cache=0`) and return the matching body and ETag. No private token or network request is used by this check. The check logs the installed SDK version for deployed-build evidence. Existing conditional writes remain intact. A safe save-conflict category identifies when refresh returns the winning stored record and whether the reread version remained unchanged; no identifiers or values are logged.

Validation: actual SDK fresh-read integration and synthetic account regression passed locally. Full CI/build required before merge. Private account persistence and UI success must still be confirmed after deployment through the normal authenticated account request. No historical experiments, cron changes, model changes, account resets, fabricated fills or new UI controls.

Source: https://github.com/vercel/storage/blob/main/packages/blob/CHANGELOG.md (2.5.0, 2.6.0).

Preview build evidence: the cached install reported up to date, and the real-SDK test confirmed 2.8.0. This weakens the cached-old-version hypothesis; pinning is a compatibility guard, not proof that the persistence failure is fixed. The save-conflict diagnostic also records whether the supplied validator is weak, without recording the validator itself. The private persistence result remains the blocker.
