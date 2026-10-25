// Offline provider/cache/normalization evidence checks; no network or accounts.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const RealDate=Date,realFetch=global.fetch,previousTestKey=process.env.FMP_API_KEY;
let milliseconds=RealDate.parse('2026-10-15T15:00:00.000Z'),calls=0,failing=false;
const requestedSymbols=[];
let response={symbol:'DELL',price:460,timestamp:milliseconds/1000,exchange:'NYSE'};
class ClockDate extends RealDate{constructor(...args){super(...(args.length?args:[milliseconds]));}static now(){return milliseconds;}}
let assertions=0;
const eq=(actual,expected,message)=>{assertions++;assert.equal(actual,expected,message);};
const ok=(actual,message)=>{assertions++;assert.ok(actual,message);};
const quote=(price=460,time=milliseconds)=>({symbol:'DELL',price,timestamp:time/1000,
 _fmpQuoteProvider:'FMP',_fmpQuoteEndpoint:'quote',_fmpQuoteCache:'live',_fmpQuoteFetchedAt:new ClockDate(milliseconds).toISOString(),
 _fmpQuoteObservation:{provider:'FMP',endpoint:'stable/quote',symbol:'DELL',price,timestamp:time/1000,fetchedAt:new ClockDate(milliseconds).toISOString()}});

async function main(){
 global.Date=ClockDate;
 process.env.FMP_API_KEY='offline-fixture-key';
 global.fetch=async url=>{const params=new URL(url).searchParams;assert.ok(params.get('apikey')==='offline-fixture-key','Offline checks must use only the fixture credential');requestedSymbols.push(params.get('symbol'));calls++;if(failing)throw new Error('Synthetic provider unavailable');return{ok:true,json:async()=>[{...response}]};};
 const loader=createResearchModuleLoader(process.cwd());
 const {fetchFmpQuote}=loader.load('lib/fmpQuotes.js');
 const {verifyC1Quote:verify}=loader.load('lib/c1QuoteVerification.js');
 const {quoteFreshness}=loader.load('lib/expertDecision.js');
 const source=fs.readFileSync('pages/api/index.js','utf8');
 const normalizer=source.slice(source.indexOf('const normalizeSymbol='),source.indexOf('async function fetchQuote('));
 const normalize=new Function(normalizer+'\nreturn normalizeQuote;')();
 let raw=await fetchFmpQuote('DELL',{forceRefresh:true}),normalized=normalize(raw,'DELL'),verified=verify(normalized,new ClockDate());
 eq(calls,1,'The initial explicit refresh attempts the provider');
 eq(raw._fmpQuoteCache,'live','Successful provider response carries its origin');
 eq(verified.verifiedRegularSession,true,'Actual provider annotations survive the real API normalizer');
 eq(verified.quoteAt,'2026-10-15T15:00:00.000Z','Provider quote timestamp is distinct from application time');
 eq(verified.validUntil,'2026-10-15T15:02:00.000Z','Existing account 120-second validity is explicit');
 eq(verified.providerAttempted,true,'Provider attempt is disclosed');
 eq(verified.newDataAccepted,true,'First provider observation is accepted');
 eq(normalized._fmpQuoteObservation.price,460,'Normalization retains the bound observation');
 eq(verify({...normalized,price:459}).verifiedRegularSession,false,'A changed price cannot borrow saved provenance');
 eq(verify({...normalized,symbol:'MPC'}).verifiedRegularSession,false,'A different symbol cannot borrow saved provenance');
 eq(verify({...normalized,timestamp:normalized.timestamp-1}).verifiedRegularSession,false,'A changed timestamp cannot borrow saved provenance');
 eq(verify({...normalized,_fmpQuoteFetchedAt:'2026-10-15T14:59:00Z'}).verifiedRegularSession,false,'A changed retrieval timestamp cannot borrow saved provenance');
 eq(verify({symbol:'DELL',price:460,timestamp:milliseconds/1000,quoteVerification:verified}).verifiedRegularSession,false,'A saved verified boolean does not grant current authority');
 raw=await fetchFmpQuote('DELL',{forceRefresh:true});
 eq(calls,1,'Repeated explicit refresh is reasonably rate limited');
 eq(raw._fmpQuoteRequest.refreshStatus,'rate-limited','The reason for no provider call is explicit');
 eq(raw._fmpQuoteRequest.providerAttempted,false,'Rate limiting never claims a provider attempt');
 eq(raw._fmpQuoteRequest.newDataAccepted,false,'Rate limiting never claims new provider data');
 milliseconds+=21000;
 raw=await fetchFmpQuote('DELL',{forceRefresh:true});
 eq(calls,2,'User refresh bypasses the ordinary sixty-second cache after the bounded limit');
 eq(raw._fmpQuoteRequest.refreshStatus,'provider-unchanged','An unchanged provider payload is explicitly disclosed');
 eq(raw._fmpQuoteRequest.newDataAccepted,false,'Unchanged data are never represented as new');
 eq(verify(normalize(raw)).verifiedRegularSession,true,'A still-current unchanged quote may remain valid');
 milliseconds+=21000;response={...response,price:459,timestamp:milliseconds/1000};
 raw=await fetchFmpQuote('DELL',{forceRefresh:true});
 eq(raw._fmpQuoteRequest.newDataAccepted,true,'A newer provider observation is disclosed');
 eq(verify(normalize(raw)).price,459,'The accepted observation reaches account-facing price evidence');
 milliseconds+=21000;failing=true;
 raw=await fetchFmpQuote('DELL',{forceRefresh:true});
 eq(raw._fmpQuoteCache,'stale-fallback','Provider failure preserves the existing fallback display');
 eq(raw._fmpQuoteRequest.providerAttempted,true,'Provider failure is reported as an attempt');
 eq(verify(normalize(raw)).verifiedRegularSession,false,'Fallback data cannot authorize a current stop');
 raw=await fetchFmpQuote('DELL');
 eq(raw._fmpQuoteCache,'stale-cooldown','Failure cooldown cannot become a fresh-memory verified quote');
 eq(verify(normalize(raw)).verifiedRegularSession,false,'Cooldown fallback remains unverified');
 milliseconds+=21000;failing=false;
 const before=calls;await Promise.all([fetchFmpQuote('DELL',{forceRefresh:true}),fetchFmpQuote('DELL',{forceRefresh:true})]);
 eq(calls,before+1,'Concurrent explicit refreshes share one provider request');
 milliseconds+=21000;response={...response,price:500,timestamp:response.timestamp-1};
 raw=await fetchFmpQuote('DELL',{forceRefresh:true});
 eq(raw.price,459,'An older provider observation cannot overwrite the newer accepted price');
 eq(raw._fmpQuoteCache,'stale-fallback','A regressing provider observation is retained only as unverified fallback');
 eq(verify(normalize(raw)).verifiedRegularSession,false,'Provider inconsistency cannot create current trading authority');
 milliseconds=RealDate.parse('2026-10-15T15:00:00Z');
 for(const [name,patch] of Object.entries({missingTimestamp:{timestamp:null},futureTimestamp:{timestamp:milliseconds/1000+1},
  missingProvenance:{_fmpQuoteObservation:null},futureRetrieval:{_fmpQuoteFetchedAt:'2026-10-15T15:00:01Z'},
  fallback:{_fmpQuoteCache:'stale-fallback'},cooldown:{_fmpQuoteCache:'stale-cooldown'},clientFallback:{clientSnapshotFallback:true},
  feedStale:{dataFeedSnapshotStale:true},error:{error:'Unavailable'},missingPrice:{price:null},invalidDate:{timestamp:1e30}}))
  eq(verify({...quote(),...patch}).verifiedRegularSession,false,`${name} cannot authorize a current stop`);
 eq(verify(quote(460,milliseconds-120000)).verifiedRegularSession,true,'Exact existing account freshness boundary is preserved');
 eq(verify(quote(460,milliseconds-120001)).verifiedRegularSession,false,'A quote expires after the existing boundary');
 const futureAtReceipt=quote(460,milliseconds+1000);
 eq(verify(futureAtReceipt,new ClockDate(milliseconds+2000)).verifiedRegularSession,false,'A quote future-dated at retrieval cannot mature into verified cache authority');
 eq(quoteFreshness({timestamp:(milliseconds-14*60000)/1000}).pass,true,'Expert screening fifteen-minute threshold is unchanged');
 milliseconds=RealDate.parse('2026-10-15T12:00:00Z');
 eq(verify(quote()).status,'premarket','Premarket is identified separately');
 eq(verify(quote()).verifiedRegularSession,false,'Premarket cannot trigger a regular-session stop');
 eq(verify(quote(460,RealDate.parse('2026-10-14T19:59:00Z'))).status,'previous-close','Prior regular-session quote is identified as previous close');
 milliseconds=RealDate.parse('2026-10-15T21:00:00Z');
 eq(verify(quote()).status,'after-hours','After-hours is identified separately');
 eq(verify(quote()).verifiedRegularSession,false,'After-hours cannot trigger a regular-session stop');
 milliseconds=RealDate.parse('2026-10-15T19:59:00Z');
 eq(verify(quote()).validUntil,'2026-10-15T20:00:00.000Z','Current-quote validity stops at regular-session close');
 ok(source.includes('String(req.query.refresh||"")==="1"'),'The public endpoint accepts an explicit user refresh');
 ok(source.includes('quoteVerification:verifyC1Quote(analyzed)'),'The public endpoint returns recomputed provider verification');
 for(const [input,expected] of [[' brk.b ','BRK-B'],['bf.b','BF-B']]){
  response={...response,symbol:expected,price:100,timestamp:milliseconds/1000};
  const before=calls,first=await fetchFmpQuote(input);
  eq(calls,before+1,'A distinct alias makes exactly one fixture request');
  eq(requestedSymbols.at(-1),expected,'Actual provider query preserves the legacy spelling');
  eq(first.symbol,expected,'The raw provider symbol remains unchanged');
  const cached=await fetchFmpQuote(expected);
  eq(calls,before+1,'Equivalent canonical/provider spelling shares the existing cache key');
  eq(cached._fmpQuoteCache,'fresh-memory','Alias cache behavior is unchanged');
 }
 response={...response,symbol:'A-B.C'};
 await assert.rejects(fetchFmpQuote('a.b.c'),/No matching usable stable quote/,'Multi-dot input retains the original non-idempotent rejection, not a newly broadened alias');
 eq(requestedSymbols.at(-1),'A-B.C','Only the first dot is replaced in the actual request');
 console.log(`PASS: ${assertions} FMP provider/cache/normalization/current-quote verification assertions; no network or account changes.`);
}
main().finally(()=>{global.Date=RealDate;global.fetch=realFetch;if(previousTestKey===undefined)delete process.env.FMP_API_KEY;else process.env.FMP_API_KEY=previousTestKey;}).catch(error=>{console.error(error);process.exitCode=1;});
