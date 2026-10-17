"""Post-result display only. Draw every prespecified challenger, without selection."""
import os
os.environ.setdefault('MPLCONFIGDIR','/tmp/c1-mpl-cache')
import pathlib,json,sys
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
P=pathlib.Path(sys.argv[1]);r=json.loads((P/'comparative-results.json').read_text());arms=list(r['pilotDecisions']);y=np.arange(len(arms))
fig,(a,b)=plt.subplots(1,2,figsize=(13,7),gridspec_kw={'width_ratios':[2.1,1]},sharey=True)
for k,(c,color) in enumerate([('12','#2171b5'),('25','#f28e2b'),('50','#756bb1')]):
 v=[100*(r['metrics'][c][x]['totalReturn']-r['metrics'][c]['C']['totalReturn']) for x in arms]
 a.barh(y+(k-1)*.23,v,height=.21,color=color,label=f'{c} bps per side')
a.set_yticks(y,arms);a.invert_yaxis();a.axvline(0,color='#333',linewidth=.8);a.grid(axis='x',alpha=.2);a.set_axisbelow(True)
a.set_xlabel('Challenger minus control: 63-session return (percentage points)')
for k,(s,color,label) in enumerate([('volume80','#2a9d8f','80% volume stress'),('currentSector','#999999','Current-sector stress')]):
 v=[100*(r['sensitivity'][s][x]['totalReturn']-r['sensitivity'][s]['C']['totalReturn']) for x in arms]
 b.barh(y+(k-.5)*.30,v,height=.28,color=color,label=label)
b.axvline(0,color='#333',linewidth=.8);b.grid(axis='x',alpha=.2);b.set_axisbelow(True)
b.set_xlabel('Shared-input stresses at 12 bps: return difference (pp)')
fig.suptitle('C1 exploratory retrospective pilot — NOT validated historical performance',fontsize=13,fontweight='bold')
ha,la=a.get_legend_handles_labels();hb,lb=b.get_legend_handles_labels();fig.legend(ha+hb,la+lb,loc='upper center',bbox_to_anchor=(.5,.95),ncol=5,fontsize=8)
fig.text(.5,.02,'2024-12-31–2025-04-03 | 498-name conditional fixed cohort | Price P&L only; no dividends/interest\nMomentum arms REMOVE components. Stress inputs are not proposed corrections. See REPORT.md for uncertainty and proxies.',ha='center',fontsize=9)
fig.tight_layout(rect=[0,.075,1,.89]);fig.savefig(P/'comparison.svg',metadata={'Date':None});fig.savefig(sys.argv[2],dpi=120) if len(sys.argv)>2 else None;print(P/'comparison.svg')
