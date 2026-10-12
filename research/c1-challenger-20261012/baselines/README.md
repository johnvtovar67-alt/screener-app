# Explicit research baselines

The owner resolved the source mismatch by requiring two distinct research baselines. `audit-historical` reproduces the separately preserved conditional 289.07% audit; `production-equivalent` supplies the Champion for final Challenger comparisons. No historical reproduction has been performed by these synthetic checks.

`production-equivalent/source/lib/` contains the exact 25 replay application modules extracted from engineering repair commit `e2b98471311fb702113baf0ca64473b92ccfd142`. SCHW is excluded before entry/allocation and retained in the existing holding-rank pool. This source identity describes the owner's selected production-equivalent policy; it makes no claim about current deployment status. The independently preserved audit snapshot in `../imported/source` is unchanged.

The two application graphs differ only in `lib/c1AccountSimulator.js`:

| Baseline | Simulator SHA-256 | 25-module graph SHA-256 |
| --- | --- | --- |
| audit-historical | 2c5e4036d4fac8992c8bedbeb0899c627a82e3b54b4f1cf59e924409dc95ac83 | ac7355c070966f6ce34fcbd5d930f93280c8d271dedb469146a5c27afa262fdb |
| production-equivalent | aa9171972572607cbe63fbe68911c0825f4d67113e5ebf2649704d04f4cf6e13 | b1a5d79c017cb96ff55037029dd343d75d4826a8fd7ba341ad2d183dc8d1c5bf |

The production-equivalent snapshot also preserves eight unchanged replay tools from audit commit `006e067697385143684c7417b18bc7909c2d217e`; tool provenance is recorded separately from the engineering application source. The replay engine remains `36a8e41afdd825de46d0302b0fc3008354b30ff0ba2bd5483920ad12721d532a` and its computational adapter remains `75590e07a8280a91b8310936a625269932dbfdc66cf186955bb3a8c6889c5ab9`. Changing the selected application graph changes the policy whose portfolio path is replayed; preserved audit metrics are not transplanted to that graph.

Use `selection.cjs` before constructing any research loader:

```js
const {selectBaseline,verifyBaseline} = require('./baselines/selection.cjs');
const baseline = verifyBaseline('production-equivalent');
// baseline.sourceRoot and baseline.manifestPath are absolute verified paths.
```

Selection requires an explicit ID. Verification checks every file's byte count and SHA-256, rejects added/missing files and symbolic links, and reconstructs the exact 25-module graph. These checks detect accidental changes; repository administrators can modify manifests and sources. Source snapshots must remain unchanged; research overlays live in the separate harness.

Focused verification:

```sh
node research/c1-challenger-20261012/baselines/policy-regression.cjs
cd research/c1-challenger-20261012/baselines/production-equivalent/source
node tools/c1-production-policy-replay-regression.cjs
```

`policy-synthetic-results.json` records 14 checks using four invented sessions. All three sleeves and the real opening projection exclude SCHW allocation while retaining the selected holding-rank behavior. Separate fixtures demonstrate divergence of the early Top9/3, profit Top6/2, and age-30 Top6 exit paths between the two baselines.

`production-equivalent/replay-equivalence-synthetic.json` records the 48-session invented regression at 12/25/50 bps: complete cached/uncached state parity, parity with literal unmodified engineering source, full chronological recorded-source verification, stops/cooldowns, all exit paths, whole shares, double-floor account mapping, issuer constraints, and funded cash. These are software-equivalence checks and supply no historical or forward performance evidence. Raw matched private historical inputs remain a separate acceptance gate.
