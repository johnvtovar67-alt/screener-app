// Resume a stopped audit without changing seeds, simulator, options, or statistic.
const fs=require('node:fs'),{fork}=require('node:child_process');
const [directory,output]=process.argv.slice(2);
const rows=fs.readFileSync(output,'utf8').trim().split('\n').map(JSON.parse);
const candidate=rows.find(r=>r.type==='candidate');
const seen=new Map(rows.filter(r=>r.type==='control').map(r=>[r.seed,r]));
if(!candidate||rows.some(r=>r.type==='complete')||seen.size!==rows.filter(r=>r.type==='control').length)throw Error('Invalid resume checkpoint');
const first=seen.size;
for(let i=0;i<first;i++)if(!seen.has(i))throw Error('Expected contiguous prefix');
const checkpoint=output+'.parallel-prefix';
fs.copyFileSync(output,checkpoint,fs.constants.COPYFILE_EXCL);
const fd=fs.openSync(output,'a');
const append=r=>{fs.writeSync(fd,JSON.stringify(r)+'\n');fs.fsyncSync(fd);};
const children=[];let finished=0,failed=false;
function fail(error){if(failed)return;failed=true;console.error(error);for(const child of children)child.kill();process.exitCode=1;}
for(let i=0;i<3;i++){
 const start=first+Math.floor((1000-first)*i/3),end=first+Math.floor((1000-first)*(i+1)/3);
 const child=fork('./tools/c1-placebo-audit.cjs',[directory,output+'.shard-'+start+'-'+end,JSON.stringify({start,end}),checkpoint],{execArgv:['--max-old-space-size=4096'],stdio:['ignore','ignore','inherit','ipc']});
 children.push(child);
 child.on('message',r=>{try{if(r.type!=='control'||!Number.isInteger(r.seed)||r.seed<start||r.seed>=end||seen.has(r.seed)||!Number.isFinite(r.totalReturnPct))throw Error('Invalid or duplicate control');append(r);seen.set(r.seed,r);if(seen.size%10===0)console.log(seen.size+'/1000');}catch(e){fail(e);}});
 child.on('error',fail);
 child.on('exit',code=>{if(code!==0)return fail('Worker failed: '+code);if(++finished!==3||failed)return;
  if(seen.size!==1000)return fail('Incomplete control count');
  for(let seed=0;seed<1000;seed++)if(!seen.has(seed))return fail('Missing seed');
  const exceedances=[...seen.values()].filter(r=>r.totalReturnPct>=candidate.totalReturnPct).length;
  append({type:'complete',completedAt:new Date().toISOString(),seeds:1000,exceedances,fixedCandidatePValue:(exceedances+1)/1001,eligibleForLiveCapital:false});fs.closeSync(fd);console.log('Complete');
 });
}
