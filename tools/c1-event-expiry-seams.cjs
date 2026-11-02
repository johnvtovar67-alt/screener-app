// Exact inverse of the November 2 cache-validity repair; historical hashes remain pinned.
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const seams=[
  [
    "async function fetchJsonDiagnosticTask(url,{fetcher=top5Fetch,deadlineMs=Infinity,cacheValidUntilMs=0}={}){\n",
    "async function fetchJsonDiagnosticTask(url,{fetcher=top5Fetch,deadlineMs=Infinity}={}){\n"
  ],
  [
    " // Required feeds must remain fresh through their existing acquisition budget.\n // Reacquire near-expiry cache entries; never extend receipt timestamps or TTLs.\n const validUntil=Number.isFinite(cacheValidUntilMs)?Math.max(now,cacheValidUntilMs):now;\n if(prior&&prior.ts+policy.fresh>validUntil){top5Count('events.fresh-hit');return markFeed(prior.data,'fresh-cache',prior.ts);}\n",
    " if(prior&&now-prior.ts<policy.fresh){top5Count('events.fresh-hit');return markFeed(prior.data,'fresh-cache',prior.ts);}\n"
  ],
  [
    "  try{const query=new URLSearchParams({...params,...(kind==='EARNINGS'?{}:{page:String(page),limit:String(limit)}),apikey:options.apiKey}),url='https://financialmodelingprep.com/stable/'+spec.endpoint+'?'+query;responseUrls.push(url);body=await fetchJson(url,{...options,cacheValidUntilMs:options.deadlineMs});assertTop5Active();}\n",
    "  try{const query=new URLSearchParams({...params,...(kind==='EARNINGS'?{}:{page:String(page),limit:String(limit)}),apikey:options.apiKey}),url='https://financialmodelingprep.com/stable/'+spec.endpoint+'?'+query;responseUrls.push(url);body=await fetchJson(url,options);assertTop5Active();}\n"
  ]
];
exports.restore=source=>{for(const [after,before]of seams){assert.equal(source.split(after).length,2,'Unique cache-validity seam');source=source.replace(after,before);}assert.equal(createHash('sha1').update('blob '+Buffer.byteLength(source)+'\0').update(source).digest('hex'),'bd4b1d962b2575c2f4c0f1ffece47edaa926260f','Complete October 30 event source');return source;};
