"""Independent paired reporting arithmetic from completed curves; no strategy simulation."""
import pathlib,sys,json,math,datetime,hashlib,os,numpy as np
B=pathlib.Path(sys.argv[1]);O=pathlib.Path(sys.argv[2]);costs=[int(x) for x in sys.argv[3:]] or [12,25,50];O.mkdir(parents=True,exist_ok=True)
N=10000;block=20;seed=20261016;root=pathlib.Path(os.environ.get('C1_RESEARCH_ROOT',str(pathlib.Path(__file__).resolve().parents[2])));specFile=root/'tools/c1-research/research-spec-v1.json';spec=json.loads(specFile.read_text());names=[a['id'] for a in spec['arms'] if a['id']!='C'];report={'author':'independent_control_review agent','scope':'Independent reporting bootstrap arithmetic on existing completed curves only','seed':seed,'block':block,'replicates':N,'costs':{},'historicalSimulations':0,'sourceHashes':{},'numpyVersion':np.__version__,'specSha256':hashlib.sha256(specFile.read_bytes()).hexdigest()}
for cost in costs:
 arms=['C']+names;runs=[]
 for arm in arms:
  p=B/f'run-{arm}-{cost}.json';report['sourceHashes'][p.name]=hashlib.sha256(p.read_bytes()).hexdigest();runs.append(json.loads(p.read_text()))
 dates=[[x['date'] for x in r['curve']] for r in runs];assert all(x==dates[0] for x in dates);years=(datetime.date.fromisoformat(dates[0][-1])-datetime.date.fromisoformat(dates[0][0])).days/365.25
 returns=np.array([[b['equity']/a['equity']-1 for a,b in zip(r['curve'],r['curve'][1:])] for r in runs]);n=returns.shape[1];state=seed
 def random():
  global state
  state=(1664525*state+1013904223)&0xffffffff;return state/4294967296
 indices=np.empty((N,n),dtype=np.int64)
 for rep in range(N):
  j=math.floor(random()*n)
  for i in range(n):
   if i and random()<1/block:j=math.floor(random()*n)
   indices[rep,i]=j;j=(j+1)%n
 total=np.zeros((len(arms),N));sq=total.copy();logs=total.copy();wealth=np.ones_like(total);peak=wealth.copy();drawdown=total.copy()
 for i in range(n):
  value=returns[:,indices[:,i]];total+=value;sq+=value*value;logs+=np.log1p(value);wealth*=1+value;peak=np.maximum(peak,wealth);drawdown=np.minimum(drawdown,wealth/peak-1)
 variance=np.maximum(0,(sq-total*total/n)/(n-1));sharpe=np.divide(math.sqrt(252)*total/n,np.sqrt(variance),out=np.full_like(total,np.nan),where=variance>0)
 fields={'mean':total/n,'cagr':np.exp(logs/years)-1,'sharpe':sharpe,'drawdown':drawdown};out={}
 for j,name in enumerate(names,1):
  intervals={};meanvalues=None
  for field,v in fields.items():
   diff=v[j]-v[0];diff=diff[np.isfinite(diff)];diff.sort();size=len(diff);intervals[field]={'ci95':[float(diff[math.floor(.025*size)]),float(diff[min(size-1,math.floor(.975*size))])] if size else None,'finiteReplicates':size}
   if field=='mean':meanvalues=diff
  observed=sum(float(x) for x in returns[j]-returns[0])/n;p=(1+int(np.count_nonzero(meanvalues-observed>=observed)))/(N+1)
  out[name]={'meanDailyReturnDifference':observed,'ci95':intervals['mean']['ci95'],'intervals':intervals,'pValue':p}
 adjusted=0
 for i,name in enumerate(sorted(names,key=lambda x:out[x]['pValue'])):adjusted=max(adjusted,min(1,out[name]['pValue']*(len(names)-i)));out[name]['holmAdjustedP']=adjusted
 report['costs'][cost]=out
report['indicesSha256']=hashlib.sha256(indices.tobytes()).hexdigest()
with (O/'bootstrap-independent.json').open('x') as f:json.dump(report,f,indent=2)
print(json.dumps({'status':'COMPLETE independent arithmetic','costs':costs,'comparisons':len(names)*len(costs),'indicesSha256':report['indicesSha256']}))
