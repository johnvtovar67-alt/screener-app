# Isolate an already-disabled research engine — October 24, 2026

Starting GitHub main/canonical production:
`e0aef6f16c2be4a2ef062cff614527aab148e4fd` (PR #323). No active hardening
PR or continuing branch edits found. Current AGENTS, audit and ledger read.
The transient older worktree lost its common Git directory; source was recovered
by a fresh clone and checked against the connected GitHub commit, not assumed
to be current. No credentials/configuration were recovered or changed.

## Concrete dependency defect, not an unused-route inference

`/api/research/preview-alpha-lab` already returns404 in production, but its
static import initializes the large research engine before the handler guard.
Synthetic engine-initialization failure interrupts module loading before that
production rejection. No provider, private store or actual finalizer was used.

The starting source passes all121 checks and the normal optimized build. A
fresh native process awaits the compiled Next route module with production
environment and network forbidden. Before its normal404 response it has already
loaded `.next/server/chunks/2215.js` (476,413 bytes), identified by the exact
`R45-R54 worker integrity failed` engine marker. This measures loading, not
request latency or account correctness.

History: route introduced `112d7a0`, simplified to finalization-only `a9aac82`.
The finalizer is also imported by the research cron dispatcher. That dispatcher,
all53 research routes, research/oracle sources, saved evidence and the two normal
scheduled crons are preserved. No tracked URL consumer was found, but that alone
cannot prove an HTTP endpoint unused and is not used to justify deletion.

## Bounded repair

Move only the research import to `await import(...)` immediately after the
unchanged production guard and before existing headers/try/catch. Production
rejects without loading research; nonproduction still invokes the same finalizer
once per request and uses its exact success/failure response. Module-load failure
remains outside the response catch; only initialization timing is deferred.

No new authorization check, method restriction, environment/config policy,
endpoint removal, data access, storage write, logging or infrastructure. No
thesis experiment is run. C1 selection, sizing, four-Swing cap, stops/ranks,
UI, data-integrity guards and actual account/cash/history/fills are unchanged.
Only this route's manifest entry and explicit slice authorization change;
guard/CI/build hooks stay byte-identical.

## Focused verification

`node tools/c1-research-runtime-isolation-regression.cjs` uses the exact old
route (Git blob hash verified) and actual current route with only the engine
boundary synthetic. It proves:

- old static import fails before production rejection if engine init fails;
- six production request methods retain exact404/body/headers/config, with zero
  engine imports, initializations or finalizer calls even with a broken engine;
- 48 environment/method/result combinations retain exact nonproduction response,
  truncation, headers and finalizer call counts, including repeated requests;
- the existing case-sensitive environment convention stays intact;
- a preview engine-load failure still rejects before existing headers/catch.

Existing fixtures/oracles are not edited. No live preview research request is
needed or allowed for verification. A build alone is not private account/browser
parity. Full122-task gate, compiled artifact comparison, exact CI/preview and
production verification completed in PR #324. Main/production
`daff5c07c58230a1167d5e55cb25a05f0c95a8d1`, deployment
`dpl_6djG56NqpG7517mkAqWKzvSpZf4z` READY with canonical version/health200,
all configuration checks true and scheduler configured; live rejection404 and
initial scoped error scan clear. Local122/122/build PASS. Exact head
`cb37527eb547a56ce6b4d0454e7f0fd2dcad3d9f` passed CI #981 (40151172463);
preview `dpl_t7NnkevsugVJm32dULcvzYK18gmL` READY/version/health200. Exact local/
reviewed/merged tree `49396928d6d0b7a723e031333bf6f01b8452576a` matched.
Native compiled repaired route loads zero engine chunks with zero network and
the same404; all53 research routes remain. Ownership handoff complete.

## Reproduce compiled production-load boundary after the standard build

Run in a fresh Node process; never call the actual engine or a preview endpoint:

```js
const fs=require('node:fs'),assert=require('node:assert/strict');
process.env.VERCEL_ENV='production';
global.fetch=()=>{throw Error('Network forbidden');};
(async()=>{
 const route=await require('./.next/server/pages/api/research/preview-alpha-lab.js');
 const loaded=Object.keys(require.cache).filter(p=>p.includes('/.next/server/chunks/')&&
  fs.readFileSync(p,'utf8').includes('R45-R54 worker integrity failed'));
 assert.equal(loaded.length,0);
 const res={status(n){assert.equal(n,404);return this;},
  json(body){assert.deepEqual(body,{error:'Not found'});return this;},
  setHeader(){throw Error('Unexpected header');}};
 await route.default({method:'GET'},res);
})();
```

The async import may still be packaged/traced because preview needs it. Do not
claim the research engine was deleted, the deployment is smaller, or the broader
research-runtime cleanup is complete. This slice only isolates an engine whose
execution was already unreachable by the production handler's contract.
