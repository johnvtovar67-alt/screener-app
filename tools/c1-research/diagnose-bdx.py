"""Reproduce the BDX provider-unit discrepancy. No tolerance relaxation or qualification."""
import pathlib,json,gzip,decimal,hashlib,argparse
parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('evidence_root',type=pathlib.Path);a=parser.parse_args();base=a.evidence_root;recovered=base/'recovered';D=decimal.Decimal
journal=json.loads(gzip.decompress(next(recovered.glob('*stage2*journal.json.gz')).read_bytes()));views={};sources=[]
for c in journal['calls']:
 if c.get('params',{}).get('symbol')!='BDX':continue
 file=next(recovered.glob('*stage2*response-'+str(c['index']).zfill(2)+'.json.gz'));body=gzip.decompress(file.read_bytes());assert hashlib.sha256(body).hexdigest()==c['sha256'] and len(body)==c['bytes'];sources.append({'endpoint':c['endpoint'],'sha256':c['sha256']});views[c['endpoint'].split('/')[-1]]={r['date']:r for r in json.loads(body,parse_float=D,parse_int=D)}
p=base/'metadata-20261016-v1';receipt=json.loads((p/'request-07.json').read_text());body=(p/receipt['bodyPath']).read_bytes();assert hashlib.sha256(body).hexdigest()==receipt['sha256'];splits=json.loads(body,parse_float=D,parse_int=D)
action=next(x for x in splits if x['date']=='2026-02-10');factor=action['numerator']/action['denominator'];full=views['full'];nominal=views['non-split-adjusted'];dates=sorted(set(full)&set(nominal));errors=[];identities=[]
for day in dates:
 exact=full[day]['volume']/factor;reported=nominal[day]['volume'];errors.append(abs(exact-reported));identities.append(exact.quantize(D('.01'),rounding=decimal.ROUND_HALF_UP)==reported)
report={'status':'ROOT_CAUSE_REPRODUCED_BUT_QUALIFICATION_FAIL','sourceReceipts':sources,'newAdjustmentReceiptSha256':hashlib.sha256((p/'request-07.json').read_bytes()).hexdigest(),'providerAdjustment':{'date':action['date'],'numerator':str(action['numerator']),'denominator':str(action['denominator']),'factor':str(factor),'providerType':action.get('splitType'),'notAnApprovedEconomicShareSplit':True},'observations':len(dates),'reportedTwoDecimalIdentityMatches':sum(identities),'identity':'non_split_volume = ROUND_HALF_UP(full_volume / (159/125), 2)','fullIntegerVolumes':sum(full[d]['volume']%1==0 for d in dates),'nominalFractionalVolumes':sum(nominal[d]['volume']%1!=0 for d in dates),'frozenAbsoluteShareTolerance':'0.00001','unroundedResidualFailuresAtUnchangedTolerance':sum(x>D('.00001') for x in errors),'maximumResidualShares':str(max(errors)),'earlierPriceRatioInferenceFailures':316,'cleared':False,'performanceRuns':0,'interpretation':'Later vendor adjustment plus two-decimal volume rounding explains all316 observed relationships. This does not independently certify the original exchange share-volume field. Reconstructing one reported field from the other still violates the frozen tolerance on257 dates.','requiredResolution':'Provider or exchange documentation/corroboration of native traded-share volume and non-stock-split distribution semantics; do not apply a1.272 ownership multiplier or use a2026 action as2025 original decision evidence.'}
assert len(dates)==316 and sum(identities)==316
serialized=(json.dumps(report,indent=2)+'\n').encode();out=base/('bdx-diagnosis-'+hashlib.sha256(serialized).hexdigest()+'.json')
if not out.exists():
 with out.open('xb') as f:f.write(serialized)
print(serialized.decode(),end='')
