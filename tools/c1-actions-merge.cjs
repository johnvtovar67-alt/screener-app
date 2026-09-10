const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(p,'utf8').trim().split('\n').map(JSON.parse);
fs.mkdirSync('audit-results',{recursive:true});
for(const u of ['nasdaq','sp500']){
 const prior=read(`docs/research/c1-actions/${u}-checkpoint.jsonl`),contract=prior[0],candidate=prior.find(r=>r.type==='candidate');
 if(!candidate)throw Error('Missing candidate');
 const controls=new Map();
 const add=r=>{if(!Number.isInteger(r.seed)||r.seed<0||r.seed>999||controls.has(r.seed)||!Number.isFinite(r.totalReturnPct))throw Error('Invalid or duplicate control');controls.set(r.seed,r);};
 prior.filter(r=>r.type==='control').forEach(add);
 for(let batch=0;batch<20;batch++){
  const rows=read(path.join('artifacts',`c1-${u}-${batch}`,`${u}-${batch}.jsonl`));
  for(const key of ['weights','options','dataSha256','statistic','rankRandomization'])if(JSON.stringify(rows[0][key])!==JSON.stringify(contract[key]))throw Error('Changed contract');
  if(JSON.stringify(rows.find(r=>r.type==='candidate'))!==JSON.stringify(candidate))throw Error('Changed candidate');
  const done=rows.find(r=>r.type==='shard-complete');
  if(!done||done.start!==batch*50||done.end!==(batch+1)*50)throw Error('Incomplete batch');
  for(const r of rows.filter(r=>r.type==='control')){if(r.seed<done.start||r.seed>=done.end)throw Error('Seed outside batch');add(r);}
 }
 if(controls.size!==1000)throw Error('Not all 1000 seeds present');
 const sorted=[...controls.values()].sort((a,b)=>a.seed-b.seed),exceedances=sorted.filter(r=>r.totalReturnPct>=candidate.totalReturnPct).length;
 const complete={type:'complete',completedAt:new Date().toISOString(),seeds:1000,exceedances,fixedCandidatePValue:(exceedances+1)/1001,eligibleForLiveCapital:false};
 fs.writeFileSync(`audit-results/c1-placebo-${u}-1000.jsonl`,[contract,candidate,...sorted,complete].map(JSON.stringify).join('\n')+'\n');
 console.log(JSON.stringify({universe:u,...complete}));
}
