// Recover this fresh research stage only; never list or read original archives.
import {get} from '/workspace/screener-app/node_modules/@vercel/blob/dist/index.js';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import path from 'node:path';
const [run,output,expectedJournalHash]=process.argv.slice(2);
if(!/^stage1-[a-zA-Z0-9-]+$/.test(run??'')||!output||!expectedJournalHash)throw new Error('Fresh stage ID, new private output and journal hash required');
mkdirSync(output,{mode:0o700});
const digest=b=>createHash('sha256').update(b).digest('hex');
async function fetchPrivate(reference) {
  const r=await get(reference,{access:'private',useCache:false,abortSignal:AbortSignal.timeout(20000)});
  if(!r||r.statusCode!==200)throw new Error('Fresh private retrieval failed');
  return Buffer.from(await new Response(r.stream).arrayBuffer());
}
const receipt={run,private:true,original_archive_accessed:false,restored_responses:0,restored_bytes:0,passed:false};
try {
  const prefix='research/c1-rotation-2025q1/stages/'+run+'/';
  const zipped=await fetchPrivate(prefix+'journal.json.gz');
  const raw=gunzipSync(zipped);
  if(digest(raw)!==expectedJournalHash)throw new Error('Journal integrity mismatch');
  const journal=JSON.parse(raw);
  if(journal.private_prefix!==prefix||journal.calls.length>25||journal.response_bytes>8388608||!journal.sealed)throw new Error('Stage contract mismatch');
  writeFileSync(path.join(output,'journal.json'),raw,{mode:0o600,flag:'wx'});
  for(const item of journal.calls) {
    if(!item.private_saved||!/^https:\/\/[^/]+\.private\.blob\.vercel-storage\.com\//.test(item.private_url))throw new Error('Missing private response receipt');
    const data=gunzipSync(await fetchPrivate(item.private_url));
    if(digest(data)!==item.sha256||data.length!==item.bytes)throw new Error('Response integrity mismatch');
    writeFileSync(path.join(output,`response-${String(item.index).padStart(2,'0')}.json`),data,{mode:0o600,flag:'wx'});
    receipt.restored_responses++;receipt.restored_bytes+=data.length;
  }
  receipt.passed=true;
} catch(error) {receipt.error_class=error.name;}
writeFileSync(path.join(output,'recovery-receipt.json'),JSON.stringify(receipt,null,2)+'\n',{mode:0o600,flag:'wx'});
console.log(JSON.stringify(receipt));
if(!receipt.passed)process.exitCode=2;
