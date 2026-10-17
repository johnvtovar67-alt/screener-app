"""Postprocess completed frozen runs. No signal generation or strategy execution.

Created during execution; only reads the sealed outputs. No parameter selection.
"""
import pathlib,json,hashlib,datetime,math,sys,csv,statistics
D=pathlib.Path(sys.argv[1] if len(sys.argv)>1 else '/workspace/work/c1-exploratory-v1')
O=pathlib.Path(sys.argv[2] if len(sys.argv)>2 else '/workspace/work/c1-program/docs/research/c1-exploratory-v1')
R=json.loads((D/'results.json').read_text());F=json.loads((D/'exploratory-freeze.json').read_text())
completion=json.loads((D/'matrix-completion.json').read_text());assert completion['status']=='PASS' and completion['completed']==69
assert R['freezeHash']==hashlib.sha256((D/'exploratory-freeze.json').read_bytes()).hexdigest()==completion['freezeHash']
for x in completion['receipts']:assert hashlib.sha256(pathlib.Path(x['path']).read_bytes()).hexdigest()==x['sha256']
assert json.loads((D/'control-gate.json').read_text())['status']=='PASS'
reference=json.loads((D/'source-control-reference.json').read_text())
assert hashlib.sha256(pathlib.Path(reference['sourceControlPath']).read_bytes()).hexdigest()==reference['sha256']
assert json.loads((D/'run-C-12.json').read_text())==json.loads(pathlib.Path(reference['sourceControlPath']).read_text())
arms=list(R['metrics']['12']);costs=['12','25','50']
raw=R
# Preserve raw reporting evidence privately. Do not publish uninstrumented zero as a measurement.
R=json.loads(json.dumps(raw))
for group in [*R['metrics'].values(),*R['sensitivity'].values()]:
 for m in group.values():
  m.pop('holdingAge',None);m['screenCapacitySuppressedDays']=None
R['availabilityNotes']={'screenCapacitySuppressedDays':'Not instrumented. Null does not mean zero.', 'holdingAge':'Removed empty legacy field; see independent completed-fill replay.', 'blockedOpportunityDays':'Source-model skipped-buy diagnostic, not complete attainable account opportunities.', 'totalReturn':'Model price-P&L return, not verified historical total investment return: no dividends, interest or taxes.'}
classifications={}
for a in arms[1:]:
 delta={c:R['metrics'][c][a]['cagr']-R['metrics'][c]['C']['cagr'] for c in costs}
 sens={s:R['sensitivity'][s][a]['cagr']-R['sensitivity'][s]['C']['cagr'] for s in ['volume80','currentSector']}
 ci=R['uncertainty']['12'][a]['intervals']['cagr']['ci95'];p=R['uncertainty']['12'][a]['holmAdjustedP']
 checks={'positiveDelta12':delta['12']>0,'nonnegativeDelta25':delta['25']>=0,
  'drawdownWithin2ppAllCosts':all(R['metrics'][c][a]['maxDrawdown']>=R['metrics'][c]['C']['maxDrawdown']-.02 for c in costs),
  'turnoverWithin125pctAllCosts':all(R['metrics'][c][a]['twoSidedAnnualTurnover']<=1.25*R['metrics'][c]['C']['twoSidedAnnualTurnover'] for c in costs),
  'holmP12Below05':p<.05,'positiveDirectionBothInformativeSensitivities':all(v>0 for v in sens.values())}
 reject={'negativeAllCosts':all(v<0 for v in delta.values()),'ciUpperBelowZero':ci[1]<0,'negativeBothInformativeSensitivities':all(v<0 for v in sens.values())}
 verdict='KEEP' if all(checks.values()) else 'REJECT' if all(reject.values()) else 'INVESTIGATE'
 classifications[a]={'decision':verdict,'scope':'Research pilot only; no production recommendation','deltaCagr':delta,'informativeSensitivityDeltaCagr12bps':sens,'deltaCagr95ci12bps':ci,'holmP12bps':p,'keepChecks':checks,'rejectChecks':reject}
R['pilotDecisions']=classifications
R['queueOnlyIdentity']={}
for c in costs:
 a=json.loads((D/f'run-C-{c}.json').read_text());b=json.loads((D/f'run-Q9-cap3-{c}.json').read_text())
 R['queueOnlyIdentity'][c]={k:a[k]==b[k] for k in ['curve','trades','finalBooks']}
O.mkdir(parents=True,exist_ok=True)
(O/'comparative-results.json').write_text(json.dumps(R,indent=2)+'\n')
curves={};receipts=[]
for p in sorted(D.glob('run-*.json')):
 r=json.loads(p.read_text());curves[p.stem]={'arm':r['arm'],'cost':r['cost'],'curve':r['curve']}
 suffix=p.stem.removeprefix('run-'+r['arm']+'-'+str(r['cost'])).removeprefix('-')
 m=R['sensitivity'][suffix][r['arm']] if suffix else R['metrics'][str(r['cost'])][r['arm']]
 marks=r['curve'];rets=[b['equity']/a['equity']-1 for a,b in zip(marks,marks[1:])]
 years=(datetime.date.fromisoformat(marks[-1]['date'])-datetime.date.fromisoformat(marks[0]['date'])).days/365.25
 peak=marks[0]['equity'];dd=0
 for x in marks:peak=max(peak,x['equity']);dd=min(dd,x['equity']/peak-1)
 ret=marks[-1]['equity']/marks[0]['equity']-1
 check={'totalReturn':ret,'cagr':(1+ret)**(1/years)-1,'maxDrawdown':dd,'cashUtilization':1-statistics.mean(x['cash']/x['equity'] for x in marks),'twoSidedAnnualTurnover':sum(t['shares']*t['price'] for t in r['trades'])/statistics.mean(x['equity'] for x in marks)/years,'sharpe':math.sqrt(252)*statistics.mean(rets)/statistics.stdev(rets) if statistics.stdev(rets)>0 else None}
 for k,v in check.items():assert (m[k] is None and v is None) or (v is not None and abs(m[k]-v)<1e-10),(p.name,k,m[k],v)
 receipts.append({'name':p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'marks':len(r['curve']),'fills':len(r['trades'])})
assert len(curves)==72
(O/'daily-equity-curves.json').write_text(json.dumps({'label':R['label'],'freezeHash':R['freezeHash'],'runs':curves},indent=2)+'\n')
(O/'result-receipts.json').write_text(json.dumps({'label':R['label'],'freezeHash':R['freezeHash'],'rawReportingSha256':hashlib.sha256((D/'results.json').read_bytes()).hexdigest(),'runs':receipts,'postprocessorSha256':hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest()},indent=2)+'\n')
fmt=lambda x,d=2: 'n/a' if x is None else f'{x:.{d}f}'
pct=lambda x: fmt(100*x)+'%'
rows=['# Exploratory retrospective C1 pilot — not validated historical performance','',
'Current-policy control and 11 frozen challengers, 2024-12-31 through 2025-04-03 (63 returns; first execution 2025-01-02). $100,000 hypothetical C1 equity excluding MSTR, separate $25,000/$50,000/$25,000 books. All 72 prespecified primary/stress runs completed. No live holdings, account history, production policy, or strict qualification gates changed. Draft PR #277 remains research only.','',
'![All fixed challengers: cost grid and shared-input sensitivity](comparison.svg)','',
f"**Pilot decisions:** {sum(d['decision']=='KEEP' for d in classifications.values())} KEEP, {sum(d['decision']=='INVESTIGATE' for d in classifications.values())} INVESTIGATE, {sum(d['decision']=='REJECT' for d in classifications.values())} REJECT under the frozen thresholds. The 10–30%/three-capacity arm leads the base sizing cases but loses its advantage under the volume stress. Nine-capacity sizing covers more candidate-days but trails the control at every primary cost. No strategy adoption is supported by this pilot.",'',
'## Decisions','',
'KEEP retains a research candidate only; INVESTIGATE is inconclusive; REJECT rejects this pilot case only. Momentum labels are **removal ablations**: an ablation doing better is evidence against the removed component in this sample. Current production remains unchanged regardless of label. Strategy parameters, thresholds and comparison assumptions were frozen before returns were inspected. The conservative interpretation requiring drawdown/turnover safety checks at all three costs was documented during execution, after control results, rather than selecting a favorable cost.','',
'| Research change | Pilot decision | ΔCAGR 12 / 25 / 50 bps (pp) | Paired 95% ΔCAGR interval, 12 bps (pp) | Holm p |',
'|---|---|---:|---:|---:|']
for a,d in classifications.items():
 rows.append(f"| {a} | {d['decision']} | {' / '.join(fmt(100*d['deltaCagr'][c]) for c in costs)} | [{fmt(100*d['deltaCagr95ci12bps'][0])}, {fmt(100*d['deltaCagr95ci12bps'][1])}] | {fmt(d['holmP12bps'],4)} |")
rows+=['','Only one short, selected market interval is available under the declared proxy profile. Annualized CAGR magnifies short-period changes. Paired stationary block bootstrap (20-session expected blocks, 10,000 replicates, shared indices, seed 20261016) and 11-comparison Holm adjustment do not capture unknown events, membership/classification error, vendor revisions, development hindsight, or ex-post cohort exclusions. CAGR intervals are nominal paired percentile 95% intervals; Holm-adjusted p-values test one-sided mean daily-return superiority across the 11 arms at 12 bps. The 25/50-bps grids are cost stresses, not additional primary discovery tests. Roughly three effective blocks provide weak long-horizon evidence. No validated superiority or historical production replay is claimed.','',
'## Primary investment results','',
'Returns below are **portfolio price P&L after modeled per-side execution costs**, not verified total investment returns: dividends, cash interest and tax are omitted. No end-of-window forced liquidation; liquidation sensitivity is in comparative-results.json. Sharpe uses zero risk-free rate and √252; drawdown is negative; turnover is annualized gross buy-plus-sell notional/mean equity; utilization is one minus mean daily closing cash weight.','',
'| Arm | Cost/side bps | Return | CAGR | Sharpe | Max drawdown | Annual turnover | Cash utilized | Modeled cost $ | Fills |',
'|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|']
for a in arms:
 for c in costs:
  m=R['metrics'][c][a]
  rows.append(f"| {a} | {c} | {pct(m['totalReturn'])} | {pct(m['cagr'])} | {fmt(m['sharpe'])} | {pct(m['maxDrawdown'])} | {fmt(m['twoSidedAnnualTurnover'])}× | {pct(m['cashUtilization'])} | {fmt(m['estimatedCostFromFillAssumptions'])} | {m['transactionCount']} |")
rows+=['','The queue-only Q9-cap3 arm has exactly identical trades, daily curves and final books to C at every primary cost. Broader screen eligibility alone did not change investments under preserved projection-before-screen sequencing and three-per-book capacity in this pilot. This does not prove it will always be inert.\n\nThe 50-bps control has a better ending return than lower-cost controls because costs alter discrete rule paths. On 2025-02-26 the base sleeve crosses the unchanged 12% breaker at 50 bps (-12.0761% versus -11.7387% at 12 bps and -11.7442% at 25 bps), sells LULU/DXCM, and enters cooldown. This is not evidence that fees help; it demonstrates threshold sensitivity. Independent control replay reconciles every daily mark and final sleeve book to <$0.000001, with actual maximum difference $2.91e-11.','',
'## Data-assumption sensitivity','',
'All arms share each changed assumption. Values are challenger minus same-scenario control CAGR in percentage points at 12 bps. The sector stress substitutes current-provider labels for 456/498 names, changing 292 labels; 42 retain the dated labels, so this is a deliberately imperfect mixed-taxonomy/date stress, not historical reclassification evidence. The event-blocked scenario is an all-cash omission bound from a cash seed, not a realistic event calendar or superiority test.','',
f"**Absolute control returns at 12 bps:** base {pct(R['metrics']['12']['C']['totalReturn'])}; volume80 {pct(R['sensitivity']['volume80']['C']['totalReturn'])}; current-sector stress {pct(R['sensitivity']['currentSector']['C']['totalReturn'])}; events-blocked {pct(R['sensitivity']['eventsBlocked']['C']['totalReturn'])}. The leading base-case sizing arm S-C-cap3 returns {pct(R['sensitivity']['volume80']['S-C-cap3']['totalReturn'])} under volume80, versus that scenario's control {pct(R['sensitivity']['volume80']['C']['totalReturn'])}; its apparent lead reverses. The first volume-driven trade divergence is January 2: WBD's calculated average dollar volume falls from $326.545m to $261.236m under the prespecified stress, crossing the unchanged $300m gate. This does not prove the vendor figure is wrong, and the 80% scale must not be selected as a strategy improvement.",'',
'| Arm | Base ΔCAGR | 80% volume ΔCAGR | Current sector proxy ΔCAGR | Events blocked return |',
'|---|---:|---:|---:|---:|']
for a in arms:
 vals=[R['metrics']['12'][a]['cagr']-R['metrics']['12']['C']['cagr']]+[R['sensitivity'][s][a]['cagr']-R['sensitivity'][s]['C']['cagr'] for s in ['volume80','currentSector']]
 rows.append(f"| {a} | {' | '.join(fmt(100*x) for x in vals)} | {pct(R['sensitivity']['eventsBlocked'][a]['totalReturn'])} |")
rows+=['','## Capital efficiency and opportunity diagnostics','',
'These diagnostics are not attainable foregone alpha. Candidate-day forward returns overlap and do not establish sleeve/cash/sector/risk permission. Each arm’s own eligible screen differs; cross-arm inference must use the independent common-queue supplemental analysis, rather than compare changing denominators. Cash×SPY is lagged idle cash multiplied by the next daily SPY **price** return; a negative number means that alternative exposure lost money, not that the strategy earned that amount.','',
'| Arm (12 bps) | Mean idle cash | Own-screen unfilled name-days | With 5-session observations | Mean net forward price return | Lagged cash×SPY $ |',
'|---|---:|---:|---:|---:|---:|']
for a in arms:
 m=R['metrics']['12'][a];o=m['opportunity'];v=o['meanForwardFiveSessionNetPriceReturn']
 rows.append(f"| {a} | {pct(m['meanCashWeight'])} | {o['eligibleNotPurchasedNameDays']} | {o['forwardFiveSessionObservableNameDays']} | {'n/a' if v is None else pct(v)} | {fmt(o['descriptiveCashTimesSpyPriceReturnDollars'])} |")
supp=json.loads((O/'independent-matrix-accounting.json').read_text())
rows+=['','### Independent common-queue and holding-age attribution','',
'Same denominator: 233 source-screen-eligible Q9 name-days at each cost. A name-day is covered if already held anywhere or newly bought that opening. This remains a screen-level diagnostic, not an executable counterfactual. Table is 12 bps; all-cost details are in independent-matrix-accounting.json. Max names is the account union after any fill, while capacity constraints apply to each book. Realized P&L is actual hypothetical average-cost accounting, and excludes remaining unrealized P&L.','',
'| Arm | Common uncovered name-days | Newly bought common name-days | Max account names | Sales <30 sessions / all sales | Realized P&L <30 sessions $ |',
'|---|---:|---:|---:|---:|---:|']
for a in arms:
 k=a+'-12';q=supp['commonOpportunity'][k];t=supp['runs'][k];ages=t['holdingAgeExternal'];early=[ages[x] for x in ['0-4','5-29'] if x in ages]
 rows.append(f"| {a} | {q['referenceUncoveredNameDays']} | {q['referenceNewBuyNameDays']} | {t['maxAccountDistinctNames']} | {sum(x['sales'] for x in early)} / {t['sellFills']} | {fmt(sum(x['realizedPnl'] for x in early))} |")
rows+=['','The nine-capacity arms can cover more of the common queue while earning less: reducing uncovered name-days does not establish improved investment selection. Additional arm-only eligibility from removal ablations is recorded separately in the JSON rather than forced into this baseline denominator.','',
'Minimum holding periods were **not tuned or removed**. Valid priority stops, breakers, momentum and other exits can occur before the 30-session rank-holding minimum. Completed-fill holding-age/P&L attribution and per-book/account position counts are separate supplemental evidence. A causal holding-period effect would require a newly approved frozen ablation; these runs cannot estimate it. The uninstrumented screenCapacitySuppressedDays counter is null, not a proven zero.','',
'## Coverage and explicit omissions','',
'- Recovered price pool: 681 vendor labels, 669 nonempty; 571 have complete 1,244-session vendor-calendar coverage (2021-11-01–2026-10-15), 575 complete the 949-session strict target window. These are not 681 historically verified unique issuers/universes. Long price series alone do not establish a usable historical index. The selected 63-return pilot is a prespecified exploratory boundary, not a proven longest possible research interval; no longer action/event-coherent panel was established for this run.','- Pilot: 498 security lines / 495 issuer CIKs, 99.006% of a dated 503-name baseline; 64 common close dates plus 252 prior-close warmup, 158,000 raw OHLCV bars including SPY/QQQ. 2,083 accessible price/reference receipts hash-verified; 998 price receipts are selected for the panel. Full strict qualification remains **0/1,898 universe-session packets**.','- Dated roster/GICS/CIK anchor: public S&P baseline snapshot commit f455575f4e89aebf51dab5c91a470b41b68a4234, published 2024-12-27T00:38:18Z, preserved in the recovered archive. Fixed baseline membership and dated classifications are carried forward as proxies, not verified continuity. No index additions/removals; no Nasdaq study.','- Excluded before outcomes: BDX (unresolved volume/action discrepancy), LEN/WDC (target-period distributions/spins), GEV/SOLV (incomplete common warmup). Selection using later action/coverage availability creates bias; no fabricated transitions or prices.','- Unknown events treated clear in the base case, explicitly optimistic. No invented original publication timestamps, earnings calendar or historical fundamentals. Current provider sector labels appear only in their named sensitivity; dated baseline labels otherwise retained.','- FMP current-vintage split-adjusted full-view OHLC rebased to baseline nominal close; every target close checked against non-split reference within max($0.03, 3 bps). No target split/distribution for included panel under accessible action evidence. Vendor revisions and volume units remain unverified historical facts; 80% volume sensitivity does not prove accuracy.','- Source adjusted/quote-freshness/listedAt inputs are declared simulation proxies, not observed historical verification or actual listing dates. Dataset remains pointInTime=false/executable=false.','',
'## Execution, policy and reproducibility','',
'Control binds production commit 0a65e20964ae080b8718332e5f6f16daa6def452, including current October momentum semantics retrospectively active for the whole pilot—not claimed historically deployed in 2025. Production ranking and candidate projection occur before subsequent screening; rejected screened buys do not release model cash for unplanned replacements. Exact full 63-session C12 serialized identity versus the pre-calculator-cache source control passed. Synthetic source differentials at all three costs, two-session compiler-prefix identity tests, first-opening decision invariance tests, and each historical run’s daily independent ledger checks passed. These are exploratory software/causal boundaries, not strict provenance approval.','',
'All arms use the same previous-close ranking, next-open execution and close valuation, whole shares, per-side modeled impact, explicit hypothetical fills and separate books. Standing stop: daily low touches a known stop, sell at min(open, stop) less one sell impact, clipped to actual owned shares. Intraday fill time/order is deterministic bookkeeping, not observed market tape. No same-opening unposted-sale financing. Current safeguards remain unless explicitly nominated by a momentum-removal ablation.','',
'A/B/C are entry targets, not continual rebalance: p(rank)=low+(high-low)×(9-rank)/8 for original snapshot ranks 1–9, with A 5–20%, B 7.5–25%, C 10–30% **of each independent sleeve’s C1 equity excluding MSTR**, without inter-sleeve transfers. Capacity 3/9 is per book, not a total-account unique-name cap; account union can differ. Original sector/issuer/liquidity/risk restrictions and rank-6 holding retention remain. Unsupported outside-nine shadow entries are explicitly rejected without reranking.','',
'Frozen inputs/code/spec SHA256: `'+R['freezeHash']+'`. Primary and sensitivity run SHA256 receipts and daily equity curves are committed beside this report. Raw vendor payloads and full decision/account traces stay in the research workspace with receipt hashes; they are not substituted with accounting fixtures or represented as production account records.','',
'Reproduce with the exact recovered raw/compiled inputs and freeze manifest: explicit `control` first, `matrix` only after control PASS, then `report` (tools/c1-exploratory/run.cjs). The executed two-worker fixed job scheduler/execution plan are recorded separately. Regenerate this report with `python3 docs/research/c1-exploratory-v1/publish-results.py DATA_DIR OUTPUT_DIR`. Missing private inputs must stop execution; repository code alone does not manufacture the dataset.','',
'No research label authorizes production adoption. The next useful evidence is a distinct predeclared regime with a separately frozen dated cohort and better event/classification evidence, not optimization on these 63 returns.']
(O/'REPORT.md').write_text('\n'.join(rows)+'\n')
print(json.dumps({'runs':len(curves),'decisions':{a:d['decision'] for a,d in classifications.items()},'output':str(O)},indent=2))
