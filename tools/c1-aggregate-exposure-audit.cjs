// Audit stored historical holdings; no simulation, selection, or new holdout.
const fs=require('node:fs'),assert=require('node:assert/strict'),z=require('node:zlib'),crypto=require('node:crypto');
const weights={base:.25,cooldown15:.5,sector40:.25};
const result={scope:'historical aggregate exposure audit',newBacktest:false,eligibleForLiveCapital:false,results:{}};
for(const universe of ['nasdaq','sp500']) {
 const bytes=fs.readFileSync(`tools/fixtures/c1-${universe}-accounting.json.gz.base64`);
 const books=JSON.parse(z.gunzipSync(Buffer.from(bytes.toString(),'base64')));
 assert.deepEqual(books.map(b=>b.id).sort(),Object.keys(weights).sort());
 const states=books.map(b=>({b,positions:{},next:0}));
 let maxNames=0,overThreeSessions=0,checkpoints=0,largestWeight=0;const examples=[];
 for(let i=0;i<books[0].curve.length;i++) {
  const date=books[0].curve[i].date,aggregate={};let equity=0;
  for(const s of states) {
   const point=s.b.curve[i];assert.equal(point.date,date);
   while(s.next<s.b.trades.length&&s.b.trades[s.next].date<=date) {
    const t=s.b.trades[s.next++];assert.ok(['buy','sell'].includes(t.side));
    s.positions[t.symbol]=(s.positions[t.symbol]||0)+(t.side==='buy'?t.shares:-t.shares);
    assert.ok(s.positions[t.symbol]>=0);if(s.positions[t.symbol]===0)delete s.positions[t.symbol];
   }
   assert.equal(Object.keys(s.positions).length,point.positions);let marked=point.cash;
   for(const [symbol,n] of Object.entries(s.positions)) {
    const price=point.marks[symbol];assert.ok(Number.isFinite(price)&&price>=0);
    marked+=n*price;aggregate[symbol]=(aggregate[symbol]||0)+n*price*weights[s.b.id];
   }
   assert.ok(Math.abs(marked-point.equity)<.03,`Equity reconciliation ${s.b.id} ${date}`);
   equity+=point.equity*weights[s.b.id];checkpoints++;
  }
  const count=Object.keys(aggregate).length;
  if(count>maxNames){maxNames=count;examples.push({date,distinctNames:count,weightsPct:Object.fromEntries(Object.entries(aggregate).map(([s,v])=>[s,v/equity*100]))});}
  if(count>3)overThreeSessions++;
  largestWeight=Math.max(largestWeight,...Object.values(aggregate).map(v=>v/equity*100));
 }
 for(const s of states){assert.equal(s.next,s.b.trades.length);assert.equal(Object.keys(s.positions).length,0);}
 result.results[universe]={fixtureSha256:crypto.createHash('sha256').update(bytes).digest('hex'),reconciledBookCheckpoints:checkpoints,sessions:books[0].curve.length,maxDistinctNames:maxNames,sessionsAboveThreeNames:overThreeSessions,largestClosingSymbolWeightPct:largestWeight,recordCountExamples:examples};
}
result.conclusion='The frozen strategy uses three independent books. A single top-three list with equal aggregate allocations is not established as equivalent. Closing weights include market drift; they are not entry target limits.';
const out=JSON.stringify(result,null,2)+'\n';if(process.argv[2])fs.writeFileSync(process.argv[2],out);else console.log(out);
