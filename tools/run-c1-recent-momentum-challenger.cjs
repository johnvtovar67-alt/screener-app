// Local inputs and stdout only: no provider, account, Blob, job, or platform calls.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const args=process.argv.slice(2);
if(args.length!==1||args[0].startsWith('-')) {
  console.error('Usage: node tools/run-c1-recent-momentum-challenger.cjs <existing-local-input.json>');
  console.error('Input: {dataset:{sessions:[...]},startDate?,endDate?,openingAccounts?,completionRules?}');
  process.exitCode=1;
}else{
  try {
    const bytes=fs.readFileSync(path.resolve(args[0]));
    const input=JSON.parse(bytes.toString('utf8'));
    const {runC1RecentMomentumComparison}=createResearchModuleLoader(path.resolve(__dirname,'..')).load('lib/c1RecentMomentumChallenger.js');
    const result=runC1RecentMomentumComparison(input);
    result.inputSha256=crypto.createHash('sha256').update(bytes).digest('hex');
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
  }catch(error){console.error(error.stack||String(error));process.exitCode=1;}
}
