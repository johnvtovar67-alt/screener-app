# C1 lifecycle research checkpoint — October 14, 2026

This checkpoint preserves the completed historical **fixed-episode exit diagnostic**, independently of the frozen 48-Challenger program. It is not a source-compatible Champion portfolio backtest. Production C1, PR #262, the 48-study, accounts and deployment authority are outside this checkpoint.

Start with [the assessment](assessment.md), [aggregate evidence](aggregate-evidence.json), [original fixed specification](partial-study-plan.md), [six-Challenger specification](six-challengers.json) and [data-readiness decision](data-readiness.md).

## Verified scope

The prior diagnostic used existing historical modeled fills and held-name closing marks over 918 sessions in each of two evidence sets. Saved accounting was checked across 976 fills and 5,508 checkpoints. Eighteen potentially artificial terminal liquidations were excluded, leaving 470 complete sleeve episodes. A separate implementation reproduced 1,410 episode-rule comparisons. Neither source market authenticity nor current-policy historical performance was established.

H7/P50/V2 were compared independently with original recorded exits using fixed entries, quantities and original endpoints. Hypothetical exits occurred at the following session CLOSE, with earlier original exits taking priority. No daily open, replacement investment or counterfactual portfolio was fabricated. No CAGR, Sharpe, portfolio drawdown, stop-frequency or strategy-cost improvement follows.

## Fresh-session retrieval and public verification

Use the immutable commit SHA reported with this checkpoint, rather than assuming a branch is immutable. Through the existing GitHub connector, read this README, `publication-manifest.json`, and the files listed there from that same commit. Validate each SHA-256 and Git blob identity. Alternatively, after an ordinary authorized repository checkout, run:

```sh
python3 research/c1-lifecycle-20261014/verify_public.py
```

This verifies public artifacts and syntax without data, credentials, provider calls, package installation or account access. It does not reproduce empirical results. The manifest cannot include its own hash; its Git blob identity is verified through the immutable remote tree. A separate fresh-context Codex agent retrieved and verified all 16 initial public artifacts. Its [verification receipt](fresh-retrieval-verification.json) is preserved here, bound to immutable initial checkpoint commit `66ba815ab3878ef7efc1ab6f19b89a6188da2706`. This receipt addition changes documentation and manifest only; published research computations and aggregate evidence are unchanged.

## Empirical reproduction when exact authorized inputs already exist

The published scripts are portable copies of the executed scripts. Only local root selection changed; `provenance.json` records matching normalized computation AST hashes, original and public code identities, original input digests and original output digests. These hashes preserve identities, not missing bytes.

Use Python 3 standard library. Set `C1_LIFECYCLE_WORKDIR` to an existing private research directory OUTSIDE the public checkout, and `C1_RESEARCH_SOURCE_ROOT` to an existing authorized local input root with the source fixture layout. No script downloads prices or opens a provider connection. The preparer refuses inputs whose digests differ from the executed study.

Run the published `scripts/prepare_fixture_inputs.py`, `scripts/verify_inputs.py`, `scripts/analyze_partial.py`, `scripts/validate_partial.py`, then `scripts/measure_giveback.py`, in that order. Outputs remain in the explicit private directory. Paths, input rows, episode files, and full generated results must not be committed or pasted into public tools. Public read access to this repository does not establish permission to retain or process provider data.

The two historical fixtures are NOT included in this checkpoint. A new Codex session can retrieve every public artifact now, but exact empirical reproduction remains conditional on authorized input access. The original private/row-level artifacts have only local retention; no durable private backup is claimed or created.

## Protected work and publication boundary

Only this research directory and a branch-specific `deploymentEnabled: false` entry are added relative to the reviewed production base. The no-deployment entry applies only to the new research branch and exists before its first publication. No main update, PR creation, PR #262 update, application-source change, 48-study change, CI change, project setting, release or new store is requested. Existing cron and branch settings remain intact.

`aggregate-evidence.json` contains allowlisted universe-level summaries. No new price/history rows, fills, marks, episode identities, account data, private locations, credentials or access links are published. Original row-output hashes are provenance only. The repository's pre-existing files are not new input publications by this checkpoint.

The six future Challengers remain F/L/E/H/X/P. F/H/P are the execution priority, not selected winners. No comparative portfolio run has occurred; stop at the evidence blocker described in `data-readiness.md` rather than starting an acquisition, credential or infrastructure project.
