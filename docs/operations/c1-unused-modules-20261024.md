# Retire two unused modules — October 24, 2026

## Scope and authority

Owner-authorized behavior-preserving infrastructure cleanup. Starting main and
production: `cbd7e7a1b536acebf75ef465d7d86d2bbeed76f3` (PR #317).
No active hardening implementation PR was found at takeover; old research and
UI drafts are untouched. No thesis experiment is restarted.

Remove `lib/formatters.js` (70 lines) and `lib/universeBuilder.js` (238 lines).
The former is unused presentation helpers; the latter is an April deterministic
synthetic-stock prototype. Neither supplies current screen or account data.
No runtime consumer, provider behavior, UI, trading rule, cron, account record,
cash, holding, fill or integrity predicate changes. Git preserves both files.

## Evidence before removal

- Full tracked-source search at the exact starting commit for module names and
  unique exports found no consumers outside definitions and docs/freeze metadata.
  Price/percentage formatting names were inspected: current scoring uses its
  own local helper, not these exports.
- Production source and loader/config paths were inspected for dynamic loading;
  the research loader loads explicitly requested modules, not a wildcard registry.
- Both files were read in full. Main history shows only April 20–23 edits:
  formatter commits `d3ecce3`, `74b2498`; builder `47e6d33`, `0d5f66f`.
- Neither appears in any of the 72 prior matching-source optimized server NFT
  traces. No dynamic production-module directory registry was found.
- All surviving frozen application hashes remain unchanged. Only the two
  deleted-file entries are removed and authorization added; guard code, CI
  and build hooks are unchanged.

## Verification and release checkpoint

Full normal build passed: 118/118 regressions, freeze/canonical guards,
optimized compilation, static generation and tracing. All 203 surviving frozen
application hashes are unchanged. The 73-route manifest is unchanged after
sorting its entries; neither removed module occurs in any of 72 new server
NFT traces. Webpack chunk IDs differ across build contexts, so emitted binary
identity is not claimed. No unused module was replaced with a fallback.

Released through PR #318. GitHub CI #968 (40135026856) SUCCESS on exact head
`625e7eaba96f6a6c432de0b5c0065bfba2c14240`; preview
`dpl_92ngT6pVQDo6aZUWeHEpaYW2cV8g` READY, version/health HTTP200.
Production `1c423dc1de23a141e804169d78927a032f5e7d32`, deployment
`dpl_cYqswxJSDJboeNQ5h4fhneW9vMEe` READY with canonical alias; canonical
version and health HTTP200 identify that commit, all checks pass and scheduler
is configured. Initial scoped error/fatal scan was clear. Source tree
`958f5c9355a4b3358da5114592a944bab9d51a6e` matches reviewed/merged source.
Private-account parity is not established; no runtime speedup is claimed.

Next work remains semantic read-only operational canaries, provider boundaries,
research route isolation and immutable screen reads under characterization.
Account identity/configuration policy changes require a separate owner choice.
