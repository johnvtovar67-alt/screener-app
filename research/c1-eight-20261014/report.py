#!/usr/bin/env python3
"""Render owner-private aggregate JSON into Markdown/CSV; never ingest price bars.

No network access. Source contains no observed market statistics. Input must be
an output of analysis.py. Numerical outputs, including low-N cells, remain in an
existing mode0700 private directory outside Git. Exclusive file creation prevents
silently overwriting any previous output. All created files have mode0600.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import math
import os
import stat
from pathlib import Path


def _fmt(value, digits=2):
    if value is None:
        return "—"
    if isinstance(value, bool):
        return "yes" if value else "no"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ValueError("Nonfinite aggregate")
        return f"{value:.{digits}f}"
    return str(value)


def _ci(metric, digits=2):
    low, high = metric.get("ci95_percentile", [None, None])
    if low is None or high is None:
        return "—"
    return f"[{low:.{digits}f}, {high:.{digits}f}]"


def _table(headers, rows):
    def cell(value):
        return str(value).replace("|", "/").replace("\n", " ")
    return "\n".join(["| " + " | ".join(map(cell, headers)) + " |",
                      "| " + " | ".join("---" for _ in headers) + " |"] +
                     ["| " + " | ".join(cell(v) for v in row) + " |" for row in rows])


def _scopes(result):
    yield "overall", "all", result["overall"]
    for key in ("by_security", "by_calendar_year", "by_causal_spy_regime", "by_frozen2019_volatility", "leave_one_security_out"):
        for label, group in result[key].items():
            yield key, label, group
    yield "sensitivity", "excluding_nvda_tsla", result["excluding_nvda_tsla"]


def _metric_columns(metric, prefix=""):
    low, high = metric.get("ci95_percentile", [None, None])
    return {prefix + "n": metric.get("n"), prefix + "mean": metric.get("mean"),
            prefix + "median": metric.get("median"), prefix + "ci95_low": low,
            prefix + "ci95_high": high, prefix + "nonempty_quarters": metric.get("nonempty_quarters"),
            prefix + "valid_replicates": metric.get("valid_replicates"),
            prefix + "low_coverage": metric.get("low_coverage")}


def _response_rows(result):
    for scope, label, group in _scopes(result):
        deterioration = group["deterioration"]
        for speed in ("slow", "fast"):
            pair = deterioration["pairs"][speed]
            c, f = [deterioration["factors"][prefix + speed] for prefix in ("champion_", "F_")]
            row = {"scope": scope, "label": label, "factor_speed": speed, "onsets": deterioration["onsets"],
                   "both_responded": pair["both_responded"], "F_only_responded": pair["F_only_responded"],
                   "champion_only_responded": pair["champion_only_responded"], "neither_responded": pair["neither_responded"],
                   "both_observed63": pair["both_observed63"], "F_earlier": pair["F_earlier"],
                   "same_session": pair["same_session"], "F_later": pair["F_later"],
                   "champion_already_nonpositive": c["already_nonpositive_at_onset"],
                   "F_already_nonpositive": f["already_nonpositive_at_onset"],
                   "champion_response_probability": c["response_probability"], "F_response_probability": f["response_probability"],
                   "champion_restricted_latency_mean": c["restricted_latency63_sessions"]["mean"],
                   "F_restricted_latency_mean": f["restricted_latency63_sessions"]["mean"],
                   "champion_responder_decline_from_onset_pct_mean": c["metrics_responders"]["decline_from_onset_pct"]["mean"],
                   "F_responder_decline_from_onset_pct_mean": f["metrics_responders"]["decline_from_onset_pct"]["mean"],
                   "joint_status_counts_json": json.dumps(pair["joint_status_counts"], sort_keys=True),
                   "champion_status_counts_json": json.dumps(c["status_counts"], sort_keys=True),
                   "F_status_counts_json": json.dumps(f["status_counts"], sort_keys=True)}
            for suffix, prefix in (("matched_F_minus_champion_latency", "matched_delta_"),
                                   ("all_observed_F_minus_champion_restricted_latency", "restricted_delta_"),
                                   ("F_minus_champion_response_probability", "response_probability_delta_")):
                row.update(_metric_columns(group["uncertainty"][speed + "_" + suffix], prefix))
            yield row


def _forward_row(scope, label, source, horizon, summary, raw_ci=None, risk_ci=None):
    status = summary["status_counts"]
    row = {"scope": scope, "label": label, "source": source, "horizon_sessions": horizon,
           "observed": status.get("observed", 0), "censored_end": status.get("censored_end", 0),
           "censored_missing": status.get("censored_missing", 0), "unavailable": status.get("unavailable", 0)}
    row.update(_metric_columns(raw_ci or summary["return_pct"], "return_pct_"))
    row.update(_metric_columns(risk_ci or summary["risk_normalized_return"], "risk_normalized_"))
    return row


def _forward_rows(result):
    for scope, label, group in _scopes(result):
        det = group["deterioration"]
        sources = [("onset", det["onset_forward_next_open"], "onset_forward")]
        sources += [(name, factor["forward_after_response_next_open"], name + "_response_forward") for name, factor in det["factors"].items()]
        sources += [(method, group["lots_entry_classification"][method]["forward_after_triggered_next_open_exit_risk"], method + "_trigger_forward") for method in ("H", "P")]
        for source, forwards, metric_prefix in sources:
            for horizon, summary in forwards.items():
                yield _forward_row(scope, label, source, horizon, summary,
                    group["uncertainty"][metric_prefix + horizon + "_pct"],
                    group["uncertainty"][metric_prefix + horizon + "_risk_normalized"])
    # These groups classify each trigger at its signal, unlike the entry-based
    # all-lot groups above. No bootstrap interval was computed for these groups.
    for scope in ("trigger_outcomes_by_signal_calendar_year", "trigger_outcomes_by_signal_spy_regime"):
        for label, methods in result[scope].items():
            for method, group in methods.items():
                for horizon, summary in group["forward_next_open"].items():
                    yield _forward_row(scope, label, method, horizon, summary)


def _lot_rows(result):
    for scope, label, group in _scopes(result):
        for method, lots in group["lots_entry_classification"].items():
            proxy = lots["recovery_preexit_peak"]
            row = {"scope": scope, "label": label, "method": method,
                   "scheduled_lots": lots["scheduled_lots"], "complete_lots": lots["complete_lots"],
                   "triggered_lots": lots["triggered_lots"], "trigger_frequency": lots["trigger_frequency_of_complete_lots"],
                   "recovery_observations": proxy["recovery_observations"], "recovered_count": proxy["recovered_count"],
                   "recovered_rate": proxy["recovered_rate"], "positive21_count": proxy["positive21_count"],
                   "positive21_rate": proxy["positive21_rate"], "both_recovered_and_positive21": proxy["both_count"],
                   "positive_preexit_close_peak_lots": lots["positive_preexit_close_peak_lots"],
                   "higher_proceeds_than_reference": lots["higher_net_proceeds_than_scheduled_reference"],
                   "lower_proceeds_than_reference": lots["lower_net_proceeds_than_scheduled_reference"],
                   "status_counts_json": json.dumps(lots["status_counts"], sort_keys=True)}
            for name, summary in lots["metrics_on_triggered_lots"].items():
                row.update({name + "_" + key: value for key, value in summary.items()})
            row.update(_metric_columns(group["uncertainty"][method + "_all_lot_difference_pp"], "all_lot_difference_pp_"))
            row.update(_metric_columns(group["uncertainty"][method + "_trigger_recovery_rate"], "recovery_rate_"))
            yield row


def _uncertainty_rows(result):
    for scope, label, group in _scopes(result):
        for metric, summary in group["uncertainty"].items():
            yield {"scope": scope, "label": label, "metric": metric, **_metric_columns(summary)}


def _csv_text(rows):
    rows = list(rows)
    fields = list(dict.fromkeys(key for row in rows for key in row))
    stream = io.StringIO(newline="")
    writer = csv.DictWriter(stream, fieldnames=fields)
    writer.writeheader()
    writer.writerows(rows)
    return stream.getvalue()


def _response_table(result, groups):
    rows = []
    for label, group in groups:
        for speed in ("slow", "fast"):
            det, pair = group["deterioration"], group["deterioration"]["pairs"][speed]
            c, f = [det["factors"][prefix + speed] for prefix in ("champion_", "F_")]
            matched = group["uncertainty"][speed + "_matched_F_minus_champion_latency"]
            restricted = group["uncertainty"][speed + "_all_observed_F_minus_champion_restricted_latency"]
            rows.append([label, speed, det["onsets"], pair["both_responded"], pair["F_only_responded"],
                         pair["champion_only_responded"], pair["neither_responded"],
                         f'{pair["F_earlier"]}/{pair["same_session"]}/{pair["F_later"]}',
                         f'{c["already_nonpositive_at_onset"]}/{f["already_nonpositive_at_onset"]}',
                         _fmt(matched["mean"]) + " " + _ci(matched),
                         _fmt(restricted["mean"]) + " " + _ci(restricted)])
    return _table(["Group", "Factor", "Events", "Both", "F only", "C only", "Neither", "F earlier/same/later", "Already≤0 C/F", "Matched Δsessions [95%]", "All observed capped Δsessions [95%]"], rows)


def _lots_table(groups):
    rows = []
    for label, group in groups:
        for method in ("H", "P"):
            lots = group["lots_entry_classification"][method]
            proxy = lots["recovery_preexit_peak"]
            metrics = lots["metrics_on_triggered_lots"]
            difference = group["uncertainty"][method + "_all_lot_difference_pp"]
            giveback = metrics["signal_giveback_fraction"]["median"]
            rows.append([label, method, f'{lots["triggered_lots"]}/{lots["complete_lots"]}',
                         f'{proxy["recovered_count"]}/{proxy["recovery_observations"]}',
                         f'{proxy["positive21_count"]}/{proxy["observed21"]}',
                         _fmt(giveback * 100 if giveback is not None else None), metrics["signal_giveback_fraction"]["n"],
                         _fmt(metrics["signal_giveback_pp"]["mean"]),
                         _fmt(difference["mean"]) + " " + _ci(difference),
                         f'{lots["higher_net_proceeds_than_scheduled_reference"]}/{lots["lower_net_proceeds_than_scheduled_reference"]}'])
    return _table(["Group", "Rule", "Triggered/complete", "Peak recovered/observed21", "Positive21/observed", "Median gain given back %", "Positive-peak N", "Mean signal giveback pp", "All-lot Δreturn pp [95%]", "Better/worse triggered sale proxy"], rows)


def _forward_table(groups):
    rows = []
    for label, group in groups:
        det = group["deterioration"]
        sources = [("onset", det["onset_forward_next_open"], "onset_forward")]
        sources += [(name, factor["forward_after_response_next_open"], name + "_response_forward") for name, factor in det["factors"].items()]
        sources += [(m, group["lots_entry_classification"][m]["forward_after_triggered_next_open_exit_risk"], m + "_trigger_forward") for m in ("H", "P")]
        for source, forwards, prefix in sources:
            for horizon, summary in forwards.items():
                raw = group["uncertainty"][prefix + horizon + "_pct"]
                risk = group["uncertainty"][prefix + horizon + "_risk_normalized"]
                status = summary["status_counts"]
                rows.append([label, source, horizon, raw["n"],
                    f'{status.get("censored_end", 0)}/{status.get("censored_missing", 0)}',
                    _fmt(raw["mean"]) + " / " + _fmt(raw["median"]), _ci(raw),
                    risk["n"], _fmt(risk["mean"]) + " / " + _fmt(risk["median"]), _ci(risk),
                    f'{raw["nonempty_quarters"]}/{raw["valid_replicates"]}', _fmt(raw["low_coverage"])])
    return _table(["Group", "Signal", "h", "Raw N", "Censored end/missing", "Raw mean/median %", "Raw95%", "Risk N", "Risk mean/median", "Risk95%", "Quarters/valid draws", "Low coverage"], rows)


def _persistence_table(result, section):
    rows = []
    for label, group in result[section].items():
        display_label = "Excluding " + label if section == "leave_one_security_out" else label
        row = [display_label, group["deterioration"]["onsets"]]
        for speed in ("slow", "fast"):
            metric = group["uncertainty"][speed + "_all_observed_F_minus_champion_restricted_latency"]
            row.append(_fmt(metric["mean"]) + " " + _ci(metric))
        for method in ("H", "P"):
            metric = group["uncertainty"][method + "_all_lot_difference_pp"]
            row.append(_fmt(metric["mean"]) + " " + _ci(metric))
        rows.append(row)
    group_header = "Excluded security" if section == "leave_one_security_out" else "Group"
    return _table([group_header, "Events", "Slow capped Δsessions [95%]", "Fast capped Δsessions [95%]", "H all-lot Δpp [95%]", "P all-lot Δpp [95%]"], rows)


def _sparsity_note(result):
    counts = result["by_security"]
    single_triggers = [f"{security}/{method}" for security, group in counts.items()
                       for method, lots in group["lots_entry_classification"].items()
                       if lots["triggered_lots"] == 1]
    note = (f'JNJ contributes {counts["JNJ"]["deterioration"]["onsets"]} deterioration onset(s) and '
            f'PG contributes {counts["PG"]["deterioration"]["onsets"]}. Their sparse event intervals, '
            'including degenerate intervals that repeat one observed value, do not establish statistical precision. ')
    if single_triggers:
        note += ('Single-trigger cohorts (' + ', '.join(single_triggers) + ') have the same limitation: '
                 'their trigger-conditioned forward/recovery/giveback summaries describe one observed lot, '
                 'and a narrow or degenerate resampling interval does not supply independent evidence. ')
    return note + 'Use the explicit counts, low-coverage flags, nonempty-quarter counts and valid-replicate counts together.'


def render_markdown(result):
    overall = result["overall"]
    securities = [(s, result["by_security"][s]) for s in result["securities"]]
    lines = ["# Owner-private eight-security developmental signal study", "",
        "Licensed-data-derived aggregate research: private personal use only. Do not publish this report, its CSVs, or small-cell outcomes. No raw bars or event-by-date paths are included.", "",
        "**Partial research; no portfolio returns, alpha claim, implemented volatility-adjusted signal, production rule change or winner selection.**", "",
        f'Evaluation: {result["evaluation_start"]} through {result["evaluation_end"]}; warmup starts {result["warmup_start"]}; observations end {result["observation_end"]}. Securities: {", ".join(result["securities"])}. Calendar sessions: {result["coverage"]["calendar_sessions"]}; evaluation sessions: {result["coverage"]["evaluation_sessions"]}; scheduled quarters: {result["coverage"]["scheduled_quarters"]}.', "",
        "## Reading the evidence", "",
        "Champion/F are raw momentum-factor zero crossings, not full-universe C1 ranks, entries or trading exits. Slow: R(100,20) versus R(100,0). Fast: R(55,5) versus R(55,0). Onsets are fixed five-session declines of at least 7%, separated by at least 21 sessions. Earlier F response can follow mechanically from removing the lag. A factor already nonpositive at onset has latency zero; this is not a newly observed trading action.", "",
        "Negative F-minus-Champion latency favors earlier F response. The matched comparison includes only both responders; the all-observed comparison assigns 63 to complete nonresponses and keeps censoring separate. Actual response status remains visible. Response probability differences are in probability units, not percentage points.", "",
        "H/P have identical hypothetical quarterly first-session adjusted-open entries. H is the unchanged fixed 7% five-session decline trigger. P requires a latched completed-close peak gain of at least 12%, then a loss of at least half that peak gain. Decisions at lot ages 5–62 execute at the next adjusted open; the age63 close is the scheduled reference. Both sales incur 12 bps. Nontriggered lots retain the reference, so all-lot return differences include zeros. Earlier exit gains omit cash returns, replacement trades and all other production controls.", "",
        "Forward returns start at the following adjusted open and end at the close h sessions after that open. Sigma uses 20 daily simple returns ending five sessions before the event/signal; normalization divides forward return by sigma×sqrt(h), without clipping. It is a descriptive risk-unit measure; the original fixed-percent triggers remain unchanged. Future prices enter outcomes only.", "",
        "Recovery to a prior peak and a positive 21-session return are separate false-exit proxies. H/P use each triggered lot's pre-exit close peak; onset/factor proxies use the fixed onset trailing20-close peak. Giveback fractions divide only by positive prior gains; values above 100% mean a prior gain became a loss. Signal and reference peaks have different observation paths.", "",
        "## Champion versus fresh-factor responsiveness", "", _response_table(result, [("ALL", overall)] + securities), "",
        "Joint status matrices, response probabilities and responder price-damage means are in responsiveness.csv. No right/missing censor is silently assigned a nonresponse.", "",
        "## Hypothetical exits, profit giveback and recovery", "", _lots_table([("ALL", overall)] + securities), "",
        "The all-lot difference is early-rule net adjusted return minus scheduled-reference net adjusted return, in percentage points. Better/worse sale counts include triggered lots only; these are neither portfolio returns nor a full exit-policy comparison.", "",
        "## Volatility and risk-scale heterogeneity", "",
        "Frozen 2019 classifications: " + "; ".join(f'{s}: {g}' for s, g in result["volatility_strata"]["security_classification"].items()) + ".", ""]
    risk_rows = []
    for label, group in [("ALL", overall)] + securities:
        det = group["deterioration"]
        shock = det["onset_shock_risk_normalized"]
        risk_rows.append([label, det["onsets"], shock["n"], _fmt(shock["mean"]), _fmt(shock["median"]),
                         _fmt(group["uncertainty"]["onset_forward21_risk_normalized"]["mean"]),
                         _ci(group["uncertainty"]["onset_forward21_risk_normalized"])])
    lines += [_table(["Security", "Onsets", "Risk denominator N", "Mean shock risk units", "Median shock risk units", "Mean forward21 risk units", "95%"], risk_rows), "",
        _persistence_table(result, "by_frozen2019_volatility"), "",
        "## Distinct calendar blocks and causal SPY regimes", "",
        "Calendar labels use onset dates for factor comparisons and entry dates for whole-schedule lot effects. Causal SPY regimes use only the prior close: trailing63 return sign crossed with trailing20 volatility above/below the fixed 2019 rolling-volatility median. A regime can change during a forward horizon. These blocks are descriptive developmental slices, not independent validation periods.", "",
        _persistence_table(result, "by_calendar_year"), "", _persistence_table(result, "by_causal_spy_regime"), "",
        "Triggered outcomes grouped at their actual signal year/regime, rather than entry, are supplied separately in signal_regimes.csv; no interval is invented for those additional groups.", "",
        "## Influence, equal-security weighting and high-volatility-name exclusions", "",
        _persistence_table(result, "leave_one_security_out"), "",
        _response_table(result, [("Excluding NVDA and TSLA", result["excluding_nvda_tsla"])]), "",
        _lots_table([("Excluding NVDA and TSLA", result["excluding_nvda_tsla"])]), ""]
    influence_names = [f'{speed}_all_observed_F_minus_champion_restricted_latency' for speed in ("slow", "fast")]
    influence_names += ["onset_forward21_pct", "onset_forward21_risk_normalized", "H_all_lot_difference_pp", "P_all_lot_difference_pp"]
    influence_rows = []
    for name in influence_names:
        metric = result["equal_security_and_influence"][name]
        low, high = metric["leave_one_security_out_pooled_mean_range"]
        influence_rows.append([name, _fmt(metric["pooled_observation_weighted_mean"]), _fmt(metric["equal_security_mean"]),
            metric["securities_with_observations"], f'{metric["security_mean_positive_count"]}/{metric["security_mean_zero_count"]}/{metric["security_mean_negative_count"]}',
            f'{_fmt(low)} to {_fmt(high)}', metric["leave_one_security_out_sign_change_count"]])
    lines += [_table(["Metric", "Pooled mean", "Equal-security mean", "Names", "Name means +/0/−", "Leave-one-out range", "Leave-one-out sign changes"], influence_rows), "",
        "Equal-security means give every security with an observed metric one vote. They are not capital-weighted portfolios. No interval was estimated for the macro-average; pooled and per-security intervals are supplied separately. Exclusions retain the original full-eight volatility groups and original common bootstrap draws.", "",
        "## All forward horizons: aggregate and every security", "",
        "Each horizon has its own observed and censored count. Factor response cohorts and response dates differ; their forward means cannot identify a causal winner. A late response can have an observed response time and a censored 63-session forward outcome. Raw and normalized counts can differ when a risk denominator is unavailable. A horizon has no imputed return.", "",
        _forward_table([("ALL", overall)] + securities), "",
        "## Uncertainty and sample limits", "",
        f'The descriptive 95% intervals use {result["bootstrap"]["replicates"]} circular moving-block resamples of common quarters, blocks of {result["bootstrap"]["block_quarters"]} quarters, seed {result["bootstrap"]["seed"]}, retaining {result["bootstrap"]["calendar_quarters"]} evaluation quarters including empty ones. The same draw sequence is applied across securities and metrics. Sparse groups can have fewer valid replicates. Low coverage means fewer than 20 observations or eight nonempty quarters. Each CSV reports the relevant denominator, quarter count and valid-replicate count.', "",
        _sparsity_note(result), "",
        "Intervals preserve contemporaneous shocks and adjacent-quarter dependence but do not eliminate longer dependence, overlapping outcomes, survivor selection, multiple-comparison effects or adjusted-price-vintage uncertainty. Eight purposively selected surviving names do not establish a general cross-sectional result. Existing historical data are developmental, not a fresh untouched holdout. Different raw-factor forward cohorts cannot be treated as paired trading policies.", ""]
    lines += ["- " + limit for limit in result["limitations"]]
    lines += ["", "## Requirements before a larger test", "",
        "Any next study must freeze a volatility-adjusted trigger independently of this sample, retain the unchanged fixed7% H and raw lagged/fresh factors as controls, preserve close/next-open timing and production protections, and add securities plus genuinely additional periods. It must disclose recoveries, opportunity cost, high-volatility-name exclusions and equal-security results. This report measures risk-scale heterogeneity; it does not test an adaptive threshold or authorize a production change.", "",
        "A complete portfolio replay additionally requires dated eligible full ranking cross-sections and historical classifications; membership/removal/delisting economics; executable prices and corporate-action/share/dividend accounting; original account seeds and no-op parity; replacement/reentry, whole-share/cash/position rules and costs; and appropriately authorized private processing/retention. Production C1, PR #262 and the frozen 48-Challenger protocol remain outside this study.", "",
        "## Private artifact index", "",
        "- responsiveness.csv: matched/unmatched response status, already-nonpositive counts, probabilities, timing, damage and intervals for every group.",
        "- forwards.csv: every 5/21/63 raw/normalized forward mean, median, interval, denominator and censor count across security/regime/influence groups.",
        "- lots.csv: hypothetical H/P triggers, giveback, recovery, sale comparison and all-lot effects.",
        "- uncertainty.csv: complete interval/coverage metadata for every prespecified statistic and group.",
        "- influence.csv: pooled/equal-security means, name-level signs and leave-one-out ranges.",
        "- signal_regimes.csv: trigger-only outcomes grouped at actual signal year/regime.",
        "- rendering-audit.json: input/source hashes and artifact filenames; no raw prices.", ""]
    return "\n".join(lines)


def _signal_rows(result):
    for scope in ("trigger_outcomes_by_signal_calendar_year", "trigger_outcomes_by_signal_spy_regime"):
        for label, methods in result[scope].items():
            for method, group in methods.items():
                proxy = group["recovery_preexit_peak"]
                for horizon, summary in group["forward_next_open"].items():
                    row = _forward_row(scope, label, method, horizon, summary)
                    row.update({"triggered_lots": group["triggered_lots"],
                                "recovery_observations": proxy["recovery_observations"],
                                "recovered_count": proxy["recovered_count"], "positive21_count": proxy["positive21_count"],
                                "signal_giveback_fraction_median": group["signal_giveback_fraction"]["median"]})
                    yield row


def build_artifacts(result, input_sha256):
    if result.get("contract") != "c1-eight-fresh-signal-diagnostic-v1" or not result.get("full_eight_security_panel"):
        raise ValueError("Expected the complete authorized eight-security aggregate contract")
    if result.get("bootstrap", {}).get("replicates") != 2000:
        raise ValueError("Owner numerical report requires the frozen 2,000 bootstrap replicates")
    artifacts = {"report.md": render_markdown(result),
                 "responsiveness.csv": _csv_text(_response_rows(result)),
                 "forwards.csv": _csv_text(_forward_rows(result)),
                 "lots.csv": _csv_text(_lot_rows(result)),
                 "uncertainty.csv": _csv_text(_uncertainty_rows(result)),
                 "influence.csv": _csv_text({"metric": name, **metric} for name, metric in result["equal_security_and_influence"].items()),
                 "signal_regimes.csv": _csv_text(_signal_rows(result))}
    audit = {"contract": "c1-eight-private-render-v1", "input_aggregate_sha256": input_sha256,
             "renderer_source_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
             "input_kind": "aggregate JSON only; no source bar files or network",
             "permissions": "owner-private directory mode0700; files0600; exclusive creation; no overwrite",
             "artifacts": {name: {"sha256": hashlib.sha256(content.encode()).hexdigest(), "bytes": len(content.encode())} for name, content in artifacts.items()}}
    artifacts["rendering-audit.json"] = json.dumps(audit, indent=2, sort_keys=True) + "\n"
    return artifacts


def write_private(artifacts, directory):
    directory = Path(directory)
    info = directory.stat()
    if not stat.S_ISDIR(info.st_mode) or stat.S_IMODE(info.st_mode) != 0o700 or info.st_uid != os.getuid():
        raise ValueError("Output must be an existing current-owner directory with exactly mode0700")
    if any((directory / name).exists() or (directory / name).is_symlink() for name in artifacts):
        raise FileExistsError("An artifact already exists; choose a new private run/output directory")
    for name, content in artifacts.items():
        fd = os.open(directory / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8", newline="") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(directory / name, 0o600)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("aggregate_json", type=Path)
    parser.add_argument("output_dir", type=Path)
    args = parser.parse_args()
    payload = args.aggregate_json.read_bytes()
    result = json.loads(payload)
    artifacts = build_artifacts(result, hashlib.sha256(payload).hexdigest())
    write_private(artifacts, args.output_dir)
    print(json.dumps({"status": "private report rendered", "artifact_count": len(artifacts), "file_mode": "0600", "overwritten": False}))


if __name__ == "__main__":
    main()
