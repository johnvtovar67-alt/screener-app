// Exact inverse of the authorized merger-pagination cache/recovery repair.
// Historical provider oracles and their original hashes remain unchanged.
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const seams=[
  {
    "from": "async function readCurrentFeed(kind,params,options,symbols,retryPagination=true){\n",
    "to": "async function readCurrentFeed(kind,params,options,symbols){\n"
  },
  {
    "from": " const finish=reason=>{if(malformedIssuers.size||['MALFORMED_RESPONSE','STALE_RESPONSE','CONTRADICTORY_RESPONSE'].includes(reason)||kind==='MERGERS'&&['PAGINATION_OVERLAP','REPEATED_PAGE'].includes(reason))forgetCachedEventResponses(responseUrls);return{rows,receipt:{...receipt,complete:reason==='OK',reason},...(malformedIssuers.size?{malformedIssuers:[...malformedIssuers]}:{})};};\n async function paginationFailure(reason,body,page,fetched){\n  const failed=finish(reason);\n  if(kind!=='MERGERS')return failed;\n  const overlaps=body.flatMap((row,index)=>seenRows.has(fingerprint(row))?[index]:[]),first=overlaps[0];\n  try{console.info('C1_EVENT_PAGINATION',JSON.stringify({kind,reason,page,pageRows:body.length,previousRows:rows.length,\n   overlapRows:overlaps.length,firstPageIndex:first??null,firstPriorIndex:first===undefined?null:rows.findIndex(row=>fingerprint(row)===fingerprint(body[first])),\n   fetchedAt:Number.isFinite(fetched)?new Date(fetched).toISOString():null,earliestFetchedAt:receipt.fetchedAt,retry:retryPagination&&Date.now()<options.deadlineMs}));}catch{}\n  if(!retryPagination||Date.now()>=options.deadlineMs)return failed;\n  // A cached page can be individually fresh yet belong to an older offset\n  // snapshot. Reacquire the entire feed once, under the original deadline.\n  // Never skip a page, drop the overlap check, or reuse the failed cache set.\n  const retried=await readCurrentFeed(kind,params,options,symbols,false);\n  // An observed acquisition target cannot disappear merely because the\n  // replacement snapshot differs. These already validated rows only add risk.\n  const observed=new Map([...rows,...body,...retried.rows].map(row=>[fingerprint(row),row]));\n  return {...retried,rows:[...observed.values()],receipt:{...retried.receipt,paginationRecovery:{\n   method:'fresh-full-pagination',initialReason:reason,recovered:retried.receipt.complete}}};\n }\n",
    "to": " const finish=reason=>{if(malformedIssuers.size||['MALFORMED_RESPONSE','STALE_RESPONSE','CONTRADICTORY_RESPONSE'].includes(reason))forgetCachedEventResponses(responseUrls);return{rows,receipt:{...receipt,complete:reason==='OK',reason},...(malformedIssuers.size?{malformedIssuers:[...malformedIssuers]}:{})};};\n"
  },
  {
    "from": "  if(body.length&&pages.has(signature))return paginationFailure('REPEATED_PAGE',body,page,fetched);\n  if(page&&body.some(row=>seenRows.has(fingerprint(row))))return paginationFailure('PAGINATION_OVERLAP',body,page,fetched);\n",
    "to": "  if(body.length&&pages.has(signature))return finish('REPEATED_PAGE');\n  if(page&&body.some(row=>seenRows.has(fingerprint(row))))return finish('PAGINATION_OVERLAP');\n"
  }
];
exports.restore=source=>{for(const seam of [...seams].reverse()){assert.equal(source.split(seam.from).length-1,1,'Exact merger recovery seam');source=source.replace(seam.from,seam.to);}assert.equal(createHash('sha256').update(source).digest('hex'),'75153a55fdb5532583ec61ab72a62b9ac873dbf62b5dd211b5599634710ef48d','Complete pre-repair event module');return source;};
