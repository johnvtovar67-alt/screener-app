// Fixed-candidate historical diagnostic. Does not authorize capital or erase selection bias.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const loader=createResearchModuleLoader(process.cwd());
const {simulatePointInTimePortfolio:simulate}=loader.load('lib/c1FrozenSimulator.js');
const options=loader.load('lib/c1FrozenOptions.js').C1_FROZEN_OPTIONS;
const weights={base:.25,cooldown15:.5,sector40:.25};
const directory=process.argv[2],output=process.argv[3];
if(!directory||!output)throw Error('Expected dataset directory and new output JSONL path');
const manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json')));
const hash=crypto.createHash('sha256');let checksums=0;
const sessions=manifest.chunks.flatMap(chunk=>{const b=fs.readFileSync(path.join(directory,path.basename(chunk.pathname))),raw=zlib.gunzipSync(b),s=JSON.parse(raw).sessions;hash.update(b);if(b.length!==chunk.compressedBytes||s.length!==chunk.end-chunk.start||s[0].date!==chunk.firstDate||s.at(-1).date!==chunk.lastDate)throw Error('Dataset integrity failure');if(chunk.contentSha256){if(crypto.createHash('sha256').update(raw).digest('hex')!==chunk.contentSha256)throw Error('Checksum failure');checksums++;}return s;});
if(sessions.some((s,i)=>i&&s.date<=sessions[i-1].date))throw Error('Unordered sessions');
const fd=fs.openSync(output,'wx');
const append=x=>{fs.writeSync(fd,JSON.stringify(x)+'\n');fs.fsyncSync(fd);};
append({type:'contract',startedAt:new Date().toISOString(),seeds:1000,seedRange:[0,999],weights,options,dataSha256:hash.digest('hex'),checksumCoverage:checksums+'/'+manifest.chunks.length,statistic:'Cumulative blended return; same-universe benchmarks identical for candidate and controls',rankRandomization:'Frozen simulator stable seed-and-symbol rank, unchanged across dates',limitations:['Previously inspected data and post-selection candidate','Fixed-candidate p-value, not family-wise correction across previous research searches','Does not complete all promotion gates'],eligibleForLiveCapital:false});
function evaluate(seed){
 let curve=null;const returns={};
 for(const [id,weight] of Object.entries(weights)){
  const run=simulate({metadata:manifest.datasetMetadata,sessions},{...options[id],...(seed===null?{}:{researchRankMode:'random-placebo',researchRandomSeed:seed})});
  if(!curve)curve=run.curve.map(p=>({date:p.date,equity:0}));
  run.curve.forEach((p,i)=>{if(curve[i]?.date!==p.date)throw Error('Curve alignment failure');curve[i].equity+=weight*p.equity;});
  returns[id]=run.metrics.totalReturnPct;
 }
 let peak=100000,maxDrawdownPct=0;for(const p of curve){peak=Math.max(peak,p.equity);maxDrawdownPct=Math.min(maxDrawdownPct,100*(p.equity/peak-1));}
 return{seed,totalReturnPct:100*(curve.at(-1).equity/100000-1),maxDrawdownPct,componentReturns:returns};
}
const candidate=evaluate(null);append({type:'candidate',...candidate});process.stdout.write('Candidate complete\n');
let exceedances=0;
for(let seed=0;seed<1000;seed++){const r=evaluate(seed);if(r.totalReturnPct>=candidate.totalReturnPct)exceedances++;append({type:'control',...r});if(seed%10===0)process.stdout.write(`${seed+1}/1000 complete; ${exceedances} exceedances\n`);}
append({type:'complete',completedAt:new Date().toISOString(),seeds:1000,exceedances,fixedCandidatePValue:(exceedances+1)/1001,eligibleForLiveCapital:false});fs.closeSync(fd);
