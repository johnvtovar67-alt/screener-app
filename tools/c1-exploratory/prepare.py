"""Offline exploratory panel only. Never certifies historical point-in-time inputs."""
import pathlib,json,hashlib,tarfile,sys,collections
B=pathlib.Path(sys.argv[1]);O=pathlib.Path(sys.argv[2]);O.mkdir(parents=True,exist_ok=True)
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
receipts=[]; series={}; refs={}
for d in ['remaining-cohort-v1','full-window-and-membership-candidates-v1','transition-price-candidates-v1','metadata-20261016-v1','event-calendars-20261016-v1','next-tranche-20261016','alias-evidence-20261016']:
 for p in sorted((B/d).glob('request-*.json')):
  r=json.loads(p.read_text()); name=r.get('bodyPath') or r.get('path')
  if not name:continue
  q=p.parent/name
  if not q.exists():q=pathlib.Path(name)
  assert digest(q)==r['sha256'],str(p)
  rows=json.loads(q.read_text());rec={'receipt':str(p),'sha256':r['sha256'],'endpoint':r['endpoint'],'rows':len(rows)};receipts.append(rec)
  ep=r['endpoint']
  if ep.startswith('historical-price-eod/'):
   sym=r.get('symbol') or r['params']['symbol'];key=(sym,ep.split('/')[-1])
   if key not in series or len(rows)>len(series[key][0]):series[key]=(rows,rec)
  else:refs.setdefault(ep,[]).extend(rows)
cal=json.loads((B/'research-calendar-v1.json').read_text())['dates']; start='2024-12-31';end='2025-04-03';warm='2023-12-29';dates=[d for d in cal if warm<=d<=end];target=[d for d in dates if d>=start]
tar=next((B/'recovered').glob('*stage1*tar.gz'))
with tarfile.open(tar) as t: meta=json.load(t.extractfile('metadata-qualification/incomplete-candidate-v2.json'))
sec={r['security_id']:r['gics_sector'] for r in meta['sectors']}; ident={r['security_id']:r for r in meta['identities']};mem={r['security_id']:r for r in meta['membership']}
# Fixed baseline dated public snapshot; deliberately omit subsequent additions.
base=[(k,r) for k,r in ident.items() if mem[k]['valid_from']==start]
action={r['symbol'] for r in refs.get('splits-calendar',[]) if start<=r.get('date','')<=end}|{'BDX','LEN','WDC','MRP','SNDK','SNDKV'}
excluded={};securities=[];bars={};used=[]
for k,r in base:
 sym=r['ticker']; vendor={'BRK.B':'BRK-B','BF.B':'BF-B'}.get(sym,sym)
 if vendor in action or sym in action:excluded[sym]='target-window split/distribution or unresolved action';continue
 if (vendor,'full') not in series:excluded[sym]='missing full price response';continue
 rows,rec=series[vendor,'full'];by={v['date']:v for v in rows}
 if any(d not in by for d in dates):excluded[sym]='incomplete common warmup/evaluation prices';continue
 if (vendor,'non-split-adjusted') not in series:excluded[sym]='missing independent price-basis view';continue
 non,nrec=series[vendor,'non-split-adjusted'];nb={v['date']:v for v in non}
 if any(d not in nb for d in target):excluded[sym]='missing baseline nominal-basis anchor';continue
 factor=nb[start]['adjClose']/by[start]['close']
 # Baseline rebase removes subsequent constant split adjustment from price levels.
 # No target-window action permitted. All future revisions remain a limitation.
 out=[];bad=False
 for d in dates:
  v=by[d];p={f:float(v[f])*factor for f in ['open','high','low','close']}
  if d>=start and d in nb and abs(p['close']-nb[d]['adjClose'])>max(.03,.0003*nb[d]['adjClose']):bad=True
  if not all(p[f]>0 for f in p) or p['low']>min(p['open'],p['close'])+1e-8 or p['high']<max(p['open'],p['close'])-1e-8:bad=True
  out.append({'symbol':sym,'date':d,**p,'volume':float(v['volume']),'adjusted':True})
 if bad:excluded[sym]='inconsistent target price basis or invalid OHLC';continue
 bars[sym]=out;used.extend([rec,nrec]);securities.append({'symbol':sym,'name':sym,'sector':sec[k],'cik':r['issuer_id'],'listedAt':warm,'isEtf':False,'isFund':False})
for sym in ['SPY','QQQ']:
 rows,rec=series[sym,'full'];by={r['date']:r for r in rows};assert all(d in by for d in dates)
 bars[sym]=[{'symbol':sym,'date':d,**{f:by[d][f] for f in ['open','high','low','close','volume']},'adjusted':True} for d in dates];used.append(rec)
raw={'metadata':{'pointInTime':False,'survivorshipBiasFree':False,'track':'exploratory-retrospective-v1'},'securities':securities,'fundamentals':[],'events':[],'sessions':[{'date':d,'decisionAt':d+'T22:00:00Z','universeSymbols':[s['symbol'] for s in securities],'corporateActions':[],'prices':[bars[s][i] for s in bars]} for i,d in enumerate(dates)]}
(O/'raw.json').write_text(json.dumps(raw,separators=(',',':')))
coverage=[]
for (s,e),(rows,rec) in series.items():
 if e!='full':continue
 have={r['date'] for r in rows};coverage.append({'symbol':s,'rows':len(have),'first':min(have) if have else None,'last':max(have) if have else None,'fullCalendar':all(d in have for d in cal),'target949':sum(d in have for d in cal if '2023-01-04'<=d<= '2026-10-15')})
manifest={'track':'EXPLORATORY RETROSPECTIVE — NOT VALIDATED PERFORMANCE','start':start,'end':end,'warmup':warm,'baselineLines':len(base),'included':len(securities),'evaluationCloseDates':len(target),'exclusions':excluded,'symbols':[s['symbol'] for s in securities],'pricesHash':digest(O/'raw.json'),'archiveHash':digest(tar),'usedReceipts':used,'allFullPriceCoverage':coverage,'hashVerifiedReceipts':len(receipts),'strictQualifiedSessions':0,'strictRequiredSessions':1898,'limitations':['Conditional public baseline roster held fixed; additions/removals and temporary lines not modeled. Ex-post price availability/action exclusions bias sample.','Dated December-2024 GICS snapshot carried forward; no claim of classification continuity.','Events unavailable: unknown treated clear only as explicit exploratory omission.','Full vendor split-adjusted OHLC rebased at baseline with non-split view; no independently verified original-vintage prices or volume units. No target splits allowed; BDX/LEN/WDC excluded.','Dividends, interest, tax and original intraday quote/event authority omitted. Portfolio return is price P&L net of modeled costs, not verified historical total investment return.','No fundamentals invented: production price-only rank path uses source position signals.','Warmup volume retains provider full view; split-era dollar-volume uncertainty is a sensitivity limitation.']}
(O/'dataset-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');print(json.dumps({k:manifest[k] for k in ['included','baselineLines','evaluationCloseDates','hashVerifiedReceipts','pricesHash']}))
