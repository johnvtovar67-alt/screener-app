#!/usr/bin/env python3
"""Render aggregate-only research results to new owner-private Markdown/CSV.

No network, source-bar ingestion, fitting or production imports. This renderer
does not calculate a selected winner. Input must be the aggregate schema from
stats.py. Files are exclusively created outside every detected Git worktree.
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import math
import os
from pathlib import Path


PRIMARY = {
    "holding_delta_vh": "Holding V minus H, pp",
    "holding_delta_h_ref": "Holding H minus scheduled reference, pp",
    "holding_delta_v_ref": "Holding V minus scheduled reference, pp",
    "entry_e21": "Entry V minus H cash-veto effect at 21, pp/opportunity",
    "entry_e63": "Entry V minus H cash-veto effect at 63, pp/opportunity",
    "episode_matched_delta": "Episode matched V minus H response, sessions",
    "episode_capped_delta": "Episode capped V minus H response, sessions",
}
SCOPES = ("per_security", "sectors", "regimes", "risk_groups", "years",
          "leave_one_security_out")


def _fmt(value, digits=3):
    if value is None:
        return "—"
    if isinstance(value, bool):
        return "yes" if value else "no"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ValueError("Nonfinite aggregate value")
        return f"{value:.{digits}f}"
    return str(value)


def _cell(value):
    return _fmt(value).replace("|", "/").replace("\n", " ")


def _table(headers, rows):
    rows = list(rows)
    if not rows:
        return "No observations in this fixed scope."
    return "\n".join(["| " + " | ".join(map(_cell, headers)) + " |",
                      "| " + " | ".join("---" for _ in headers) + " |"] +
                     ["| " + " | ".join(map(_cell, row)) + " |" for row in rows])


def _ci(metric):
    interval = metric.get("ci95_percentile", [None, None])
    if len(interval) != 2 or None in interval:
        return "—"
    return f"[{_fmt(interval[0])}, {_fmt(interval[1])}]"


def _metric(group, key):
    return group.get("uncertainty", {}).get(key, {})


def _estimate(group, key):
    metric = _metric(group, key)
    text = _fmt(metric.get("mean")) + " " + _ci(metric)
    return text + (" *" if metric.get("low_coverage") else "")


def _numeric(aggregate, key):
    return aggregate.get("numeric", {}).get(key, {})


def _boolean(aggregate, key):
    return aggregate.get("boolean", {}).get(key, {})


def _rate(value):
    return f'{value.get("true", 0)}/{value.get("observed", 0)} ({_fmt(value.get("rate"))})'


def _counts(group):
    counts = group.get("counts", {})
    return [counts.get(k, 0) for k in ("entry", "holding", "episode")]


def _primary_table(group):
    return _table(["Metric", "N", "Mean [95%]", "Nonempty quarters", "Valid/requested draws", "Sparse"],
        ([label, _metric(group, key).get("n", 0), _estimate(group, key),
          _metric(group, key).get("nonempty_quarters"),
          f'{_metric(group, key).get("valid_replicates", 0)}/{_metric(group, key).get("requested_replicates", 0)}',
          _metric(group, key).get("low_coverage")]
         for key, label in PRIMARY.items()))


def _classifier_table(group):
    classifier = group.get("entry", {}).get("classification", {})
    return _table(["Veto", "TP", "FP", "FN", "TN", "Precision", "Recall", "False-positive rate", "Recovered/observed", "Positive21/observed"],
        ([method] + [classifier.get(method, {}).get(k) for k in ("tp", "fp", "fn", "tn", "precision", "recall", "false_positive_rate")] +
         [_rate(classifier.get(method, {}).get("recovery21_on_signals", {})),
          _rate(classifier.get(method, {}).get("positive21_on_signals", {}))]
         for method in ("H", "V")))


def _classifier_deltas(group):
    return _table(["Entry comparison V minus H", "Difference [95%]", "H denominator", "V denominator", "Sparse"],
        ([key, _estimate(group, key), _metric(group, key).get("H_denominator"),
          _metric(group, key).get("V_denominator"), _metric(group, key).get("low_coverage")]
         for key in ("entry_precision_delta", "entry_recall_delta", "entry_false_positive_rate_delta",
                     "entry_signal_recovery21_delta", "entry_signal_positive21_delta")))


def _forward_table(group):
    sources = []
    for method, aggregate in group.get("entry", {}).get("signal_outcomes", {}).items():
        sources.append(("Entry veto signals", method, aggregate, ""))
    for method in ("H", "V"):
        sources.append(("Holding triggers", method, group.get("holding", {}).get(method, {}), method + "_"))
    episode = group.get("by_type", {}).get("episode", {})
    for method in ("H", "V", "slow", "fast"):
        sources.append(("Episode response", method, episode, method + "_"))
    rows = []
    for kind, method, aggregate, prefix in sources:
        for h in (5, 21, 63):
            raw, risk = _numeric(aggregate, prefix + f"f{h}"), _numeric(aggregate, prefix + f"risk_f{h}")
            rows.append([kind, method, h, raw.get("n", 0), raw.get("mean"), raw.get("median"),
                         risk.get("n", 0), risk.get("mean"),
                         json.dumps(aggregate.get("status_counts", {}).get(prefix + f"f{h}_status", {}), sort_keys=True)])
    return _table(["Scope", "Signal", "Horizon", "Raw N", "Mean %", "Median %", "Risk N", "Mean risk units", "Status counts where retained"], rows)


def _holding_table(group):
    holding = group.get("holding", {})
    rows = []
    for method in ("H", "V"):
        arm = holding.get(method, {})
        numeric = lambda key: _numeric(arm, method + "_" + key)
        rows.append([method, arm.get("triggered", 0), holding.get("complete", 0),
                     numeric("age").get("mean"), numeric("giveback_pp").get("mean"),
                     numeric("giveback_fraction").get("n", 0), numeric("giveback_fraction").get("median"),
                     _rate(_boolean(arm, method + "_recovery21")),
                     _rate(_boolean(arm, method + "_positive21")),
                     _rate(_boolean(arm, method + "_better_ref")),
                     _rate(_boolean(arm, method + "_worse_ref"))])
    return _table(["Rule", "Triggers", "Complete lots", "Mean signal age", "Mean giveback pp", "Positive-peak N", "Median fraction given back", "Recovery21", "Positive21", "Better than reference", "Worse than reference"], rows)


def _episode_table(group):
    episode = group.get("by_type", {}).get("episode", {})
    return _table(["Response", "Observed N", "Mean latency", "Mean capped latency", "Further decline from onset %", "Decline from fixed onset peak %", "Statuses"],
        ([method, _numeric(episode, method + "_latency").get("n", 0),
          _numeric(episode, method + "_latency").get("mean"),
          _numeric(episode, method + "_capped_latency").get("mean"),
          _numeric(episode, method + "_decline_onset_pct").get("mean"),
          _numeric(episode, method + "_decline_peak_pct").get("mean"),
          json.dumps(episode.get("status_counts", {}).get(method + "_status", {}), sort_keys=True)]
         for method in ("H", "V", "slow", "fast")))


def _group_table(groups):
    rows = []
    for label, group in groups.items():
        holding = group.get("holding", {})
        classifier = group.get("entry", {}).get("classification", {})
        rows.append([label] + _counts(group) +
            [holding.get("complete", 0), f'{holding.get("H", {}).get("triggered", 0)}/{holding.get("V", {}).get("triggered", 0)}',
             _estimate(group, "holding_delta_vh"), _estimate(group, "entry_e21"),
             _estimate(group, "episode_capped_delta"),
             f'{_fmt(classifier.get("H", {}).get("precision"))}/{_fmt(classifier.get("V", {}).get("precision"))}',
             f'{_fmt(classifier.get("H", {}).get("recall"))}/{_fmt(classifier.get("V", {}).get("recall"))}'])
    return _table(["Group", "Entry opportunities", "Scheduled lots", "Episodes", "Complete lots", "H/V triggers", "Holding V−H pp [95%]", "Entry V−H 21 pp [95%]", "Capped V−H sessions [95%]", "H/V precision", "H/V recall"], rows)


def _scopes(result):
    for period, data in result["periods"].items():
        yield period, "overall", "all", data.get("overall", {})
        yield period, "entry_positive_context", "both lagged raw factors positive", data.get("entry_positive_context", {})
        for scope in SCOPES:
            for label, group in data.get(scope, {}).items():
                yield period, scope, label, group
        yield period, "sensitivity", "excluding_nvda_tsla", data.get("excluding_nvda_tsla", {})


def _csv_rows(result):
    """Only selected aggregate fields; never serialize arbitrary input payloads."""
    for period, scope, label, group in _scopes(result):
        common = {"period": period, "scope": scope, "group": label}
        for kind, count in group.get("counts", {}).items():
            yield dict(common, kind=kind, metric="count", n=count)
        for metric, value in group.get("uncertainty", {}).items():
            low, high = value.get("ci95_percentile", [None, None])
            yield dict(common, kind="primary_uncertainty", metric=metric,
                **{key: value.get(key) for key in ("n", "mean", "median", "nonempty_quarters", "valid_replicates", "requested_replicates", "low_coverage", "H", "V", "H_denominator", "V_denominator")},
                ci95_low=low, ci95_high=high)
        for kind, aggregate in group.get("by_type", {}).items():
            for metric, value in aggregate.get("numeric", {}).items():
                yield dict(common, kind=kind, metric=metric, **value)
            for metric, value in aggregate.get("boolean", {}).items():
                yield dict(common, kind=kind, metric=metric, **value)
            for metric, value in aggregate.get("status_counts", {}).items():
                for status, count in value.items():
                    yield dict(common, kind=kind, metric=metric, status=status, n=count)
        conditional = [("entry_signal_" + method, aggregate)
                       for method, aggregate in group.get("entry", {}).get("signal_outcomes", {}).items()]
        conditional += [("holding_trigger_" + method, group.get("holding", {}).get(method, {}))
                        for method in ("H", "V")]
        for kind, aggregate in conditional:
            for metric, value in aggregate.get("numeric", {}).items():
                yield dict(common, kind=kind, metric=metric, **value)
            for metric, value in aggregate.get("boolean", {}).items():
                yield dict(common, kind=kind, metric=metric, **value)
        for method in ("H", "V"):
            for metric, value in group.get("entry", {}).get("classification", {}).get(method, {}).items():
                if isinstance(value, dict):
                    yield dict(common, kind="entry_classification", metric=method + "_" + metric, **value)
                else:
                    yield dict(common, kind="entry_classification", metric=method + "_" + metric, mean=value)
    for period, data in result["periods"].items():
        for metric, value in data.get("equal_security", {}).items():
            low, high = value.get("ci95_percentile", [None, None])
            yield {"period": period, "scope": "equal_security", "group": "all", "kind": "primary_uncertainty", "metric": metric,
                   **{key: value.get(key) for key in ("security_count", "mean", "valid_replicates", "requested_replicates", "low_coverage")},
                   "ci95_low": low, "ci95_high": high}


def _csv_text(rows):
    rows = list(rows)
    fields = list(dict.fromkeys(key for row in rows for key in row)) or ["period", "scope", "group", "metric"]
    stream = io.StringIO(newline="")
    writer = csv.DictWriter(stream, fieldnames=fields)
    writer.writeheader()
    writer.writerows(rows)
    return stream.getvalue()


def render(result):
    """Return permitted private documents; no file output or outcome selection."""
    if result.get("schema_version") != "c1-volnorm-aggregate-v1" or not isinstance(result.get("periods"), dict):
        raise ValueError("Expected c1-volnorm aggregate schema")
    cohort = result.get("cohort", {})
    lines = ["# Owner-private volatility-normalized deterioration research", "",
        "Private personal research. These numerical documents must not be published or distributed.", "",
        "Candidate: " + str(cohort.get("candidate", "See frozen PROTOCOL.md")), "",
        "H is the fixed 7% five-session deterioration control; V is the single frozen causal volatility-normalized candidate. Current C1 lagged slow/fast raw momentum factors are references, not reconstructed C1 ranks or trading actions.", "",
        "Entry vetoes and holding exits use separate opportunity/ownership schedules. Entry effects compare cash at zero return with matched hypothetical purchases; there are no replacement or deferred purchases. Holding comparisons use identical quarterly adjusted-open entries and a scheduled age63 exit, with the same sale cost. Neither is a portfolio return or actual broker fill.", "",
        "The earlier 2020–2024 extension is reused development evidence. Backward historical validation and additional periods were not viewed for candidate tuning in this phase; they are not certified globally untouched history across prior C1 research. Period results remain separate; pooled figures are descriptive only.", "",
        "Forward horizons preserve close[following-open index+h]/following-open price. Adjusted prices are total-return-style research units. Risk units divide by known lagged volatility and square-root horizon; these are not calibrated Gaussian probabilities. Classification uses the prespecified subsequent21-session proxy, not an objective definition of a genuine business breakdown.", "",
        "Intervals are exploratory common-quarter circular two-quarter block bootstrap intervals. Shared draws retain contemporaneous shocks; purposive sampling, overlapping observations, sparse clusters, long-memory dependence and multiple comparisons remain. An asterisk marks low coverage. Sparse or degenerate intervals do not establish precision. Conditional H/V signal cohorts differ; their forward means and recovery rates are not causal paired treatment effects.", ""]
    for period, data in result["periods"].items():
        overall = data.get("overall", {})
        definition = data.get("definition", {})
        lines += ["## " + str(period), "",
            f'Decisions: {definition.get("start", "unknown")} through {definition.get("end", "unknown")}; outcomes through {definition.get("outcome_end", "unknown")}. Common decision quarters: {len(data.get("quarters", []))}.', "",
            "### Primary paired estimates", "", _primary_table(overall), "",
            "### Entry qualification diagnostic", "",
            "Counts compare H and V vetoes on the same weekly opportunities. Nonbreakdowns include recovered corrections and ambiguous cases. Precision and recall use labelled opportunities only.", "",
            _classifier_table(overall), "", _classifier_deltas(overall), "",
            "Entry agreement: " + json.dumps(overall.get("entry", {}).get("agreement", {}), sort_keys=True), "",
            "### Existing-holding diagnostic", "", _holding_table(overall), "",
            "Recovery means the completed-close pre-signal peak was recovered within21 sessions. A median giveback fraction above1 means a former gain became a loss. Giveback fractions use positive-peak cases only; H/V denominators differ.", "",
            "Holding agreement: " + json.dumps(overall.get("holding", {}).get("agreement_complete", {}), sort_keys=True), "",
            "### Response timing and current momentum reference", "",
            _episode_table(overall), "",
            "Episode joint statuses: " + json.dumps(overall.get("episode", {}).get("joint_status_counts", {}), sort_keys=True), "",
            "Earlier/same/later V responses: " + json.dumps(overall.get("episode", {}).get("response_timing_counts", {}), sort_keys=True), "",
            "A 63-session nonresponse is assigned63 only in the explicitly capped timing statistic, not treated as an observed response. Missing/end-censored cases retain separate statuses. Slow/fast are exact lagged raw factors, not C1 rank exits.", "",
            "### Forward outcomes", "", _forward_table(overall), "",
            "### Per-security paired comparison", "", _group_table(data.get("per_security", {})), "",
            "### Positive raw-factor entry context", "",
            "Both lagged factors positive is a descriptive formation stratum, not actual C1 entry qualification or a fitted selection rule.", "",
            _primary_table(data.get("entry_positive_context", {})), "",
            _classifier_table(data.get("entry_positive_context", {})), ""]
        for scope, title in (("sectors", "Design sectors"), ("regimes", "Causal SPY regimes"),
                             ("risk_groups", "Causal volatility groups"), ("years", "Calendar years")):
            lines += ["### " + title, "", _group_table(data.get(scope, {})), ""]
        lines += ["### Influential-security sensitivity", "",
            _group_table(data.get("leave_one_security_out", {})), "",
            _group_table({"Excluding NVDA and TSLA": data.get("excluding_nvda_tsla", {})}), "",
            "Leave-one-out rows are labelled by the security removed. Original causal tags remain fixed; these are sensitivity analyses, not newly selected cohorts.", "",
            "### Equal-security estimates", "",
            _table(["Metric", "Securities", "Mean", "95%", "Valid/requested draws", "Sparse"],
                ([PRIMARY.get(key, key), value.get("security_count", 0), value.get("mean"), _ci(value),
                  f'{value.get("valid_replicates", 0)}/{value.get("requested_replicates", 0)}', value.get("low_coverage")]
                 for key, value in data.get("equal_security", {}).items())), ""]
    lines += ["## Scope and prerequisites for portfolio testing", "",
        "This renderer does not select or recommend a winning rule. Advancing research requires independent review of paired economics, entry tradeoffs, missingness, regimes, uncertainty and security influence. Actual C1 complementarity still requires complete dated eligible pools and historical sectors, exact percentile ranks, genuine Swing ownership and cost bases, hard-stop and portfolio-breaker priorities, replacement/reentry queues, sizing, whole shares, cash and concentration limits, delisting economics and executable price/dividend accounting. Production C1, account records, PR #262 and the frozen48-Challenger program are outside this experiment.", ""]
    return {"report.md": "\n".join(lines), "summary.csv": _csv_text(_csv_rows(result))}


def write_private(documents, outdir):
    """Create a fresh mode0700 directory and exclusive mode0600 files outside Git."""
    target = Path(outdir).expanduser().resolve()
    for ancestor in (target, *target.parents):
        marker = ancestor / ".git"
        # Managed sandboxes can contain empty .git sentinel directories that
        # Git itself rejects; a worktree pointer or repository HEAD is required.
        if marker.is_file() or (marker.is_dir() and (marker / "HEAD").is_file()):
            raise ValueError("Numerical outputs must remain outside Git")
    if set(documents) != {"report.md", "summary.csv"}:
        raise ValueError("Unexpected output filenames")
    target.mkdir(mode=0o700, parents=False, exist_ok=False)
    os.chmod(target, 0o700)
    for name, text in documents.items():
        flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0)
        fd = os.open(target / name, flags, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8", newline="") as handle:
            os.fchmod(handle.fileno(), 0o600)
            handle.write(text)
            handle.flush()
            os.fsync(handle.fileno())
    return target


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("aggregate", type=Path)
    parser.add_argument("outdir", type=Path, help="New private directory outside Git; parent must exist")
    args = parser.parse_args()
    with args.aggregate.open(encoding="utf-8") as handle:
        result = json.load(handle)
    write_private(render(result), args.outdir)
    print("Owner-private aggregate report and CSV preserved; no source rows read or written.")


if __name__ == "__main__":
    main()
