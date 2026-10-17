"""Offline inventory/qualification accounting. Never computes strategy performance."""
import pathlib,json,hashlib,gzip,collections,math,decimal,argparse
parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('evidence_root',type=pathlib.Path);args=parser.parse_args();base=args.evidence_root;cal=json.loads((base/'research-calendar-v1.json').read_text());expected=set(cal['dates']);rows=[];fail=[];series=[];metadata=[]
dirs=['remaining-cohort-v1','full-window-and-membership-candidates-v1','metadata-20261016-v1','event-calendars-20261016-v1','event-partitions-v1','transitions-20261016-v1','delist-continuation-v1','targeted-identity-v1','next-tranche-20261016','alias-evidence-20261016','symbol-change-limit-review-v1','transition-price-candidates-v1']
for directory in dirs:
 p=base/directory
 for receipt in sorted(p.glob('request-*.receipt.json' if directory in ['next-tranche-20261016','alias-evidence-20261016'] else 'request-*.json')):
  r=json.loads(receipt.read_text())
  if 'path' in r and 'bodyPath' not in r:r['bodyPath']=r['path']
  if 'symbol' not in r and r.get('params',{}).get('symbol'):r['symbol']=r['params']['symbol']
  if 'bodyPath' not in r:fail.append({'receipt':str(receipt),'failure':r});continue
  b=(p/r['bodyPath']).read_bytes();assert len(b)==r['bytes'] and hashlib.sha256(b).hexdigest()==r['sha256'];a=json.loads(b)
  r={**r,'directory':directory,'receiptPath':str(receipt),'receiptSha256':hashlib.sha256(receipt.read_bytes()).hexdigest()};rows.append(r)
  if r['endpoint'].startswith('historical-price-eod/'):
   dates=[x.get('date') for x in a];validDates={d for d in dates if isinstance(d,str)}
   numeric=[]
   for x in a:
    fields=['open','high','low','close'] if r['endpoint'].endswith('/full') else ['adjOpen','adjHigh','adjLow','adjClose']
    if not all(isinstance(x.get(k),(float,int)) and math.isfinite(x[k]) and x[k]>0 for k in fields) or not isinstance(x.get('volume'),(float,int)) or not math.isfinite(x['volume']) or x['volume']<0:numeric.append(x.get('date'))
    elif not (x[fields[2]]<=min(x[fields[0]],x[fields[3]])<=max(x[fields[0]],x[fields[3]])<=x[fields[1]]):numeric.append(x.get('date'))
   missing=sorted(expected-validDates);series.append({'symbol':r['symbol'],'endpoint':r['endpoint'],'rows':len(a),'firstDate':min(validDates) if validDates else None,'lastDate':max(validDates) if validDates else None,'duplicateDates':len(dates)-len(validDates),'outOfSourceCalendar':sorted(validDates-expected),'invalidNumericDates':numeric,'missingCalendarRows':len(missing),'leadingGapCount':sum(d<min(validDates) for d in missing) if validDates else len(missing),'trailingGapCount':sum(d>max(validDates) for d in missing) if validDates else len(missing),'missingDates':missing,'sha256':r['sha256'],'receiptPath':str(receipt),'allQualificationStandards':False})
  else:
   ds=[str(x.get('date') or x.get('delistedDate') or '') for x in a if isinstance(x,dict)];params=r.get('params',{})
   metadata.append({'endpoint':r['endpoint'],'params':params,'rows':len(a),'distinctSymbolDates':len({(x.get('symbol'),x.get('date')) for x in a if isinstance(x,dict)}),'firstDate':min((d for d in ds if d),default=None),'lastDate':max(ds,default=None),'saturated4000':len(a)>=4000 if 'calendar' in r['endpoint'] and not r['endpoint'].startswith('splits') else None,'afterStudyDateRows':sum(d>'2026-10-15' for d in ds),'sha256':r['sha256']})
counts=collections.Counter(r['directory'] for r in rows)
receiptRoots={}
for directory in counts:
 entries=sorted([{'path':str(pathlib.Path(r['receiptPath']).relative_to(base)),'receiptSha256':r['receiptSha256'],'bodySha256':r['sha256']} for r in rows if r['directory']==directory],key=lambda r:r['path'])
 receiptRoots[directory]={'receipts':len(entries),'rawBytes':sum(r['bytes'] for r in rows if r['directory']==directory),'receiptIndexSha256':hashlib.sha256(json.dumps(entries,sort_keys=True,separators=(',',':')).encode()).hexdigest()}

# Whole-universe decision packets have a fixed, source-calendar denominator.
# A per-security denominator is unknown until historical membership is qualified.
qualified={'unit':'universe-decision-session packet','universes':['sp500','nasdaq100'],'start':'2023-01-04','end':'2026-10-15','sourceExpectedSessionsPerUniverse':len(cal['target']),'requiredPackets':2*len(cal['target']),'allStandardQualifiedPackets':0,'allStandardQualifiedPercent':0.0,'securitySessionPercent':None,'securitySessionPercentReason':'Historical membership/security-action denominator is not certified; no pseudo-percentage based on provisional ticker lists.','whyZero':['No complete dated historical sector/action continuity proof covers either universe over the frozen interval.','Complete publication-vintage membership, issuer/corporate-action/event coverage and independent source corroboration remain unresolved.'],'notDownloadCompletionPercent':True}
report={'schema':'c1-acquisition-audit-v3','status':'BLOCKED_FOR_HISTORICAL_CONTROL','requiredQualification':qualified,'newVerifiedResponses':len(rows),'newResponseBytes':sum(r['bytes'] for r in rows),'responseCountsByTranche':dict(counts),'receiptRoots':receiptRoots,'hashFailures':0,'requestFailures':fail,'newPriceSeries':len(series),'newPriceSymbols':len({x['symbol'] for x in series}),'completeSourceCalendarSeries':sum(x['missingCalendarRows']==0 and not x['duplicateDates'] and not x['invalidNumericDates'] and not x['outOfSourceCalendar'] for x in series),'seriesWithLeadingGaps':sum(x['leadingGapCount']>0 for x in series),'seriesWithTrailingGaps':sum(x['trailingGapCount']>0 for x in series),'priceSeries':series,'metadataSources':metadata,'receiptIndex':[{k:v for k,v in r.items() if k not in ['bodyPath']} for r in rows],'historicalPerformanceExecutions':0,'sourceCalendarIsNotIndependentExchangeCertification':True}
serialized=(json.dumps(report,indent=2)+'\n').encode();out=base/('audit-v3-'+hashlib.sha256(serialized).hexdigest()+'.json');
if not out.exists():
 with out.open('xb') as f:f.write(serialized)
print(json.dumps({k:v for k,v in report.items() if k not in ['priceSeries','metadataSources','receiptIndex']}))
