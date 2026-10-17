# Champion control validation — October 16, 2026

Disposition: **DO NOT RUN HISTORICAL CONTROL OR CHALLENGERS YET.** Data transport is working. The recovered data is not qualified, and the source-to-research adapter has a reproducible decision mismatch. PR #277 remains draft; no strategy parameters or application/account modules were changed by this review.

Production/main: `0a65e20964ae080b8718332e5f6f16daa6def452`, READY deployment `dpl_3PZuSSmiKDZ6hNY3fg67ciVHT9Rg`. Research source reviewed: PR #277 head `47389e112279e19146d6198a3dd7c46bb5cdb997`. Its frozen source/specification files remain unchanged.

## Access finding and completed recovery

The earlier statement that the proxy infrastructure was broken was incorrect. Default sandboxed commands lacked executor network permission. Using the supported `sandbox_permissions: with_additional_permissions` with `network.enabled: true` allows the inherited proxy to reach approved destinations. TLS, proxy settings, network allowlists and credential injection were retained. No secret was printed, credential moved, proxy unset, direct route opened or blocked endpoint relayed through production.

FMP acquisition succeeded with the existing binding. Three new raw response receipts are private in the research workspace: 1,531 historical S&P constituent-change records, 452 Nasdaq change records, and 1,244 SPY adjusted-bar observations from 2021-11-01 through 2026-10-15. These are acquisition evidence, not a point-in-time certification. Retrieval-date adjusted bars do not establish decision-date adjustment vintages.

The authorized Blob SDK also works with executor network permission and Node's inherited environment-proxy support. A bounded `research/` listing returned 531 objects in one page. The old expected `pit-sp500-*`/production-index object paths were absent; existing staged research objects were accessible. Using their returned object URLs recovered:

| Sealed source | Responses | Original bytes | Verification |
|---|---:|---:|---|
| `research/c1-rotation-2025q1/stages/stage1-20261015-v1/` | 25 | 2,273,904 | Journal and every decompressed response match original SHA-256 and size |
| `research/c1-rotation-2025q1/stages/stage2-20261015-v1/` | 248 | 14,686,994 | Journal and every decompressed response match original SHA-256 and size |

Total: **273 original responses / 16,960,898 original bytes**, with zero new FMP requests for that recovery. Both evidence archives' inventories also verify: 17 stage-one and 11 stage-two listed evidence files. Raw payloads and private URLs remain outside Git.

Recovered archive hashes:

- Stage-one evidence tar: `cbcf4fdcb09d33f2bb35bc7de26c10517dbf65b6d09504aa4ae5ab746970b3e7`
- Stage-two evidence tar: `c4a8f171264dc6ed77b173b706e1d7e58829eeaa4f531e40856804eabdcae8c7`
- Stage-one journal (uncompressed): `c09c2b7b252520d706f0335fe357d3a257fb0287039b0f1d1034880b1edba6a9`
- Stage-two journal (uncompressed): `759b1307257f148bbb08ada823333626729a2b614b1e6afca200e1b34371a98e`

The alternate Vercel control-plane path was investigated without starting compute: both old study sessions are stopped; log retrieval returns HTTP 410 `sandbox_stopped`, and no snapshots exist. No completed study was rerun. GitHub's latest 50 workflow runs contained only CI jobs; its connector does not support repository-wide artifact listing. No connector was repurposed to relay credentials or bypass destination policy.

## Data-integrity and point-in-time disposition

Byte-level recovery: **PASS**. Full-universe economic-study qualification: **FAIL / INCOMPLETE**.

The recovered stage-two manifest covers **2023-12-29–2025-04-03**, with 253 warmup and 63 evaluation sessions. The sealed completion reports **81 cleared constituent lines, one quarantined BDX line, and 423 unacquired lines**. This does not cover the frozen 2023-01-04–2026-10-15 study interval or its full opportunity universe. Running a control over the acquired subset would introduce selection bias.

Recovered `metadata-qualification/FINAL-DISPOSITION-v1.json` explicitly records `NO_GO_FOR_FULL_ACQUISITION`, 1,521 unverified facts and 192 continuity gaps. Its two closed-scope unresolved source questions are the complete benchmark membership/security-action ledger (including temporary security legs) and dated GICS continuity/event exceptions. Its baseline-carried sector approximation is not independent dated sector proof for this study. Older recorded waivers are not adopted as new certification.

Complete event history, delisting/corporate-action economics, original availability dates, and cross-sectional compiler/screen inputs have not been established for the frozen interval. No absent timestamps, MACD observations, event clearances, sectors or vanished-security proceeds were manufactured. The existing evidence gate continues to fail rather than importing this packet as a qualified normalized dataset.

## Source-to-research adapter parity review

Source hash verification passes. Mechanical equivalence does **not** pass merely because files match.

Reproduce the completed differential review from repository root:

```sh
node tools/c1-champion-control-parity-review.cjs
# Expected current outcome: exit 2, PARITY_NOT_ESTABLISHED.
# Optional argument writes a new, non-overwritten detailed review JSON.
```

This is a synthetic mechanical counterexample, not a historical control, a performance comparison, or authorization to trade. It compares the unchanged production opening projector followed by the unchanged source stock-screen filter with the research control's fills. It intentionally does not fabricate live manual-review or brokerage-cash authority.

| Scenario | Source projected buys after same source screen | Research control fills | Finding |
|---|---:|---:|---|
| Clear entries | 9 across three sleeves | 9 | Prices, symbols and quantities match |
| Top-ranked AAA event-blocked consistently in signals and screen rows | 6: BBB/CCC in each sleeve | 9: BBB/CCC/**DDD** in each sleeve | Research adds an unplanned replacement |

The adapter inserts `researchScreenAllowed` **before** the simulator's entry queue is formed. Production separates model projection from current screen permission. In the counterexample the original projector consumes the first three model slots; filtering AAA leaves BBB/CCC, while the research adapter suppresses AAA early and fills DDD. That is a material portfolio-construction difference in the purported control.

The research dollar-unit conversion also requires multi-session reconciliation against the production normalized-plan/whole-share/actual-fill continuation boundary. A one-opening clear-entry match does not prove equality of later rounding residuals, stops, high-water marks, completions, and cooldown state. No such broad parity approval is asserted here.

The review is complete with a negative finding: **do not mark `championAdapterParityApproved` true**. Repair must make the research control follow the source's causal projection/execution/continuation sequence, with independently checked traces and a versioned technical preregistration amendment before historical results. It must not silently change the frozen strategy, eligibility rules or exit parameters.

The current `run` command also runs the entire arm matrix. It was not invoked. The requested first historical run must be a separately gated control-only invocation after qualification and parity approval; no current command should be used to start challengers automatically.

## Execution disposition

No historical control, challenger, optimization, merge or deployment was run. No production state or source module was modified. Existing study/specification hashes remain intact; this adds review evidence only.

**No access or infrastructure action is now required from the owner:** the supported executor network permission resolved transport. The remaining execution blockers are substantive: the recovered packet lacks complete qualified inputs, and the current control adapter fails the differential parity test. A working network must not be represented as solving those scientific/engineering gates.
