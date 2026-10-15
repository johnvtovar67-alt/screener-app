// Existing private Blob SDK; no infrastructure or credential changes.
import {put,get} from '/workspace/screener-app/node_modules/@vercel/blob/dist/index.js';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const [mode,input,pathname,output]=process.argv.slice(2);
if(!['put','verify'].includes(mode)||!input||!pathname||!output)throw new Error('Private storage arguments required');
try {
  const bytes=readFileSync(input);
  const sha256=createHash('sha256').update(bytes).digest('hex');
  let receipt;
  if(mode==='put') {
    if(!pathname.startsWith('research/c1-rotation-2025q1/stages/'))throw new Error('Research path required');
    const saved=await put(pathname,bytes,{access:'private',addRandomSuffix:false,allowOverwrite:false,contentType:'application/gzip',abortSignal:AbortSignal.timeout(20000)});
    receipt={passed:true,mode,url:saved.url,pathname:saved.pathname,sha256,bytes:bytes.length,utc:new Date().toISOString()};
  } else {
    const response=await get(pathname,{access:'private',useCache:false,abortSignal:AbortSignal.timeout(20000)});
    if(!response||response.statusCode!==200)throw new Error('Private read failed');
    const received=Buffer.from(await new Response(response.stream).arrayBuffer());
    const receivedSha256=createHash('sha256').update(received).digest('hex');
    if(receivedSha256!==sha256)throw new Error('Private byte mismatch');
    receipt={passed:true,mode,sha256,bytes:received.length,utc:new Date().toISOString(),separate_read_process:true};
  }
  writeFileSync(output,JSON.stringify(receipt,null,2)+'\n',{mode:0o600,flag:'wx'});
  console.log(JSON.stringify({passed:true,mode,bytes:receipt.bytes}));
} catch(error) {
  console.log(JSON.stringify({passed:false,mode,error_class:error.name}));
  process.exitCode=2;
}
