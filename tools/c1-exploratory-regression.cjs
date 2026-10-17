// Canonical CI discovers root regression commands. Synthetic only; no data/API.
const path=require('node:path'),fs=require('node:fs'),os=require('node:os'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=fs.mkdtempSync(path.join(os.tmpdir(),'c1-exploratory-gates-'));
for(const name of ['independent-gates','challenger-actual-v2-gates','ablation-gates','memo-actual-v2-gates','pure-memo-gates','calculator-gates']){
 const r=spawnSync(process.execPath,[path.join(root,'tools/c1-exploratory',name+'.cjs'),out],{cwd:root,env:{...process.env,C1_RESEARCH_ROOT:root},encoding:'utf8'});
 if(r.error||r.status!==0){console.error(r.error||r.stderr||r.stdout);process.exit(1);}console.log(name+' PASS');
}
console.log('C1 exploratory synthetic gates PASS; no historical execution or qualification');
