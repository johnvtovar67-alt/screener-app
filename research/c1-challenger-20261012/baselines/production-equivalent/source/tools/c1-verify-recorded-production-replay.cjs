const fs=require('node:fs'),zlib=require('node:zlib');
const {loadDataset,verifyRecordedReplay,parseAudit}=require('./c1-production-policy-replay.cjs');
const [dataRoot,runPath,output]=process.argv.slice(2);
if(!dataRoot||!runPath||!output)throw new Error('Usage: node tools/c1-verify-recorded-production-replay.cjs VERIFIED_DATA_ROOT RUN.json.gz OUTPUT.json [--conditional-inputs]');
const bytes=fs.readFileSync(runPath),run=parseAudit(runPath.endsWith('.gz')?zlib.gunzipSync(bytes).toString():bytes.toString());
const receipt=verifyRecordedReplay({run,dataset:loadDataset(dataRoot,{requireCurrent:true,allowConditional:process.argv.includes('--conditional-inputs')})});
fs.writeFileSync(output,JSON.stringify(receipt,null,2));
console.log(JSON.stringify(receipt));if(!receipt.passed)process.exitCode=1;
