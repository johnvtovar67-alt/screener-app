const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const loader=createResearchModuleLoader(process.cwd());
const {simulatePointInTimePortfolio:simulate}=loader.load('lib/c1FrozenSimulator.js');
const options=loader.load('lib/c1FrozenOptions.js').C1_FROZEN_OPTIONS;
const weights={base:.25,cooldown15:.5,sector40:.25};
const directory=process.argv[2],output=process.argv[3];
if(!directory||!output)throw Error('Usage: node tools/c1-cost-audit.cjs DATA_DIRECTORY OUTPUT');
const manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json')));
const files=fs.readdirSync(directory).filter(x=>x.endsWith('.json.gz')).sort();
const hash=crypto.createHash('sha256');
const sessions=files.flatMap(name=>{const b=fs.readFileSync(path.join(directory,name));hash.update(b);return JSON.parse(zlib.gunzipSync(b)).sessions;});
if(sessions.some((s,i)=>i&&s.date<=sessions[i-1].date))throw Error('Unordered dataset');
const report={purpose:'Previously inspected historical cost sensitivity; not independent validation',generatedAt:new Date().toISOString(),dataSha256:hash.digest('hex'),start:'2023-01-04',end:'2026-09-01',parametersRetuned:false,eligibleForLiveCapital:false,results:[]};
for(const slippageBps of [12,25,50]){
 const runs=Object.entries(weights).map(([id,weight])=>{const run=simulate({metadata:manifest.datasetMetadata,sessions},{...options[id],slippageBps});process.stderr.write(`${slippageBps}bps ${id} complete\n`);return{id,weight,run};});
 const curve=runs[0].run.curve.map((p,i)=>{if(runs.some(r=>r.run.curve[i]?.date!==p.date))throw Error('Curve dates differ');return{date:p.date,equity:runs.reduce((a,r)=>a+r.weight*r.run.curve[i].equity,0)};});
 let peak=100000,drawdown=0;for(const p of curve){peak=Math.max(peak,p.equity);drawdown=Math.min(drawdown,(p.equity/peak-1)*100);}
 const totalReturnPct=(curve.at(-1).equity/100000-1)*100;
 const benchmarks=Object.fromEntries(Object.entries(runs[0].run.metrics.benchmarkComparisons).map(([symbol,b])=>[symbol,{simpleReturnPct:b.simpleReturnPct,simpleDifferencePct:totalReturnPct-b.simpleReturnPct}]));
 report.results.push({slippageBps,totalReturnPct,maxDrawdownPct:drawdown,benchmarks,components:runs.map(({id,run})=>({id,metrics:run.metrics}))});
 fs.writeFileSync(output,JSON.stringify(report,null,2));
}
