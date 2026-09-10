// Resume a stopped audit without changing seeds, simulator, options, or statistic.
const fs=require('node:fs'),{fork}=require('node:child_process');
const [directory,output]=process.argv.slice(2);
const rows=fs.readFileSync(output,'utf8').trim().split('\n').map(JSON.parse);
const candidate=rows.find(r=>r.type==='candidate');
const seen=new Map(rows.filter(r=>r.type==='control').map(r=>[r.seed,r]));
if(!candidate||rows.some(r=>r.type==='complete')||seen.size!==rows.filter(r=>r.type==='control').length)throw Error('Invalid resume checkpoint');
const ranges=[];
for(let seed=0;seed<1000;){if(seen.has(seed)){seed++;continue;}const start=seed;while(seed<1000&&!seen.has(seed))seed++;ranges.push({start,end:seed});}
while(ranges.length<6){ranges.sort((a,b)=>(b.end-b.start)-(a.end-a.start));const r=ranges.shift();if(!r||r.end-r.start<2)throw Error('Insufficient work for six workers');const mid=Math.floor((r.start+r.end)/2);ranges.push({start:r.start,end:mid},{start:mid,end:r.end});}
if(ranges.length!==6)throw Error('Unexpected fragmented checkpoint');
const assigned=new Set(seen.keys());for(const r of ranges)for(let s=r.start;s<r.end;s++){if(assigned.has(s))throw Error('Overlapping assignment');assigned.add(s);}if(assigned.size!==1000||[...assigned].some(s=>!Number.isInteger(s)||s<0||s>=1000))throw Error('Invalid seed coverage');
const checkpoint=output+'.parallel-prefix-'+Date.now();
fs.copyFileSync(output,checkpoint,fs.constants.COPYFILE_EXCL);
const fd=fs.openSync(output,'a');
const append=r=>{fs.writeSync(fd,JSON.stringify(r)+'\n');fs.fsyncSync(fd);};
const children=[];let finished=0,failed=false;
function fail(error){if(failed)return;failed=true;console.error(error);for(const child of children)child.kill();process.exitCode=1;}
for(const {start,end} of ranges){
 const child=fork('./tools/c1-placebo-audit.cjs',[directory,checkpoint+'.shard-'+start+'-'+end,JSON.stringify({start,end}),checkpoint],{execArgv:['--max-old-space-size=2560'],stdio:['ignore','ignore','inherit','ipc']});
 children.push(child);
 child.on('message',r=>{try{if(r.type!=='control'||!Number.isInteger(r.seed)||r.seed<start||r.seed>=end||seen.has(r.seed)||!Number.isFinite(r.totalReturnPct))throw Error('Invalid or duplicate control');append(r);seen.set(r.seed,r);if(seen.size%10===0)console.log(seen.size+'/1000');}catch(e){fail(e);}});
 child.on('error',fail);
 child.on('exit',code=>{if(code!==0)return fail('Worker failed: '+code);if(++finished!==ranges.length||failed)return;
  if(seen.size!==1000)return fail('Incomplete control count');
  for(let seed=0;seed<1000;seed++)if(!seen.has(seed))return fail('Missing seed');
  const exceedances=[...seen.values()].filter(r=>r.totalReturnPct>=candidate.totalReturnPct).length;
  append({type:'complete',completedAt:new Date().toISOString(),seeds:1000,exceedances,fixedCandidatePValue:(exceedances+1)/1001,eligibleForLiveCapital:false});fs.closeSync(fd);console.log('Complete');
 });
}
