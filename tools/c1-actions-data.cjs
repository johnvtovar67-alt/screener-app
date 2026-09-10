const fs=require('node:fs'),path=require('node:path');
async function main(){
 const universe=process.argv[2];if(!['nasdaq','sp500'].includes(universe))throw Error('Invalid universe');
 if(!process.env.BLOB_READ_WRITE_TOKEN)throw Error('GitHub Actions secret BLOB_READ_WRITE_TOKEN is missing; private frozen data cannot be read');
 const {get}=require('@vercel/blob');
 const root=path.join('audit-data',universe);fs.mkdirSync(root,{recursive:true});
 const manifest=fs.readFileSync(`docs/research/c1-actions/${universe}-manifest.json`);
 fs.writeFileSync(path.join(root,'manifest.json'),manifest);
 for(const chunk of JSON.parse(manifest).chunks){
  const result=await get(chunk.pathname,{access:'private',useCache:false});
  if(!result||result.statusCode!==200)throw Error('Frozen data download failed');
  const bytes=Buffer.from(await new Response(result.stream).arrayBuffer());
  if(bytes.length!==chunk.compressedBytes)throw Error('Frozen data size mismatch');
  fs.writeFileSync(path.join(root,path.basename(chunk.pathname)),bytes);
 }
 console.log('Frozen dataset downloaded; audit runner will verify original hash and contract');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
