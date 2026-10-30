// Deterministic operational examples only. No network, live account, or
// historical performance inputs. Quotes stand for explicitly supplied evidence.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createResearchModuleLoader}=require('../research-module-loader.cjs');
const root=path.resolve(__dirname,'../..'),clone=x=>JSON.parse(JSON.stringify(x));
// Explicit offline provider evidence for operational fixtures. Historical
// source signals alone never establish a current event conclusion.
function currentEventEvidenceFor(symbols,now,overrides={}){
 const at=new Date(now),observedAt=at.toISOString();
 return [...new Set(symbols)].map(symbol=>{
  const override=overrides[symbol]||{},state=override.state||'VERIFIED_CLEAR',complete=state!=='UNVERIFIED',blocked=state!=='VERIFIED_CLEAR';
  const {state:ignored,...fields}=override;
  return {symbol,status:blocked?'Blocked':'Clear',blockNewCapital:blocked,manualCheckRequired:!complete,
   checkComplete:complete,earningsCheckComplete:complete,mergerCheckComplete:complete,newsCheckComplete:complete,eventRiskVerified:complete,
   eventVerification:{contract:'c1-current-event-evidence-v1',provider:'FMP',state,observedAt,expiresAt:new Date(at.getTime()+5*60000).toISOString(),
    sources:[['EARNINGS','earnings-calendar',15],['MERGERS','mergers-acquisitions-latest',60],['NEWS','news/stock',5]].map(([kind,endpoint,minutes])=>({kind,endpoint,complete,reason:complete?'OK':'UNAVAILABLE',fetchedAt:observedAt,expiresAt:new Date(at.getTime()+minutes*60000).toISOString()}))},...fields};
 });
}
function createWorkflowFixture(kind='buy',options={}){
 const loader=createResearchModuleLoader(root),service=loader.load('lib/c1AccountService.js');
 const market=loader.load('lib/marketSession.js'),{analyzeEntryTiming}=loader.load('lib/entryTiming.js');
 const symbols=['MRNA','BBB','CCC','DDD','EEE','FFF','GGG','HHH','III','JJJ','KKK','LLL','DELL'];
 const baselineDate=options.baselineDate||'2026-10-14',dates=[baselineDate];for(let i=0;i<220;i++)dates.unshift(market.previousMarketSessionDay(dates[0]));
 const nextSession=day=>{let at=new Date(day+'T12:00:00Z');do{at.setUTCDate(at.getUTCDate()+1);}while(!market.marketExecutionState(at).clock.isSessionDay);return at.toISOString().slice(0,10);};
 dates.push(nextSession(baselineDate),nextSession(nextSession(baselineDate)));
 const series=Object.fromEntries([...symbols,'SPY','QQQ'].map(s=>[s,[]]));
 const sessions=dates.map((date,index)=>{
  const prices=[...symbols,'SPY','QQQ'].map((symbol,i)=>{
   const close=symbol==='DELL'?500:100+(index-220)*.025;
   const p={symbol,date,open:close,high:close*1.001,low:close*.999,close,volume:10000000,adjusted:true};series[symbol].push(p);return p;
  });
  const signals=symbols.map((symbol,i)=>({symbol,sector:symbol==='MRNA'?'Healthcare':symbol==='DELL'?'Technology':'Sector'+i,
   issuer:symbol,price:prices[i].close,eventRisk:{status:'Clear',blockNewCapital:false,checkComplete:true},
   researchFactors:{momentumPercentile:100-i,volatility60Pct:20,coverage:1,return60Ex5:30-i,return120Ex5:45-i,return252Ex21:60-i},
   entryTiming:{...analyzeEntryTiming(symbol,series[symbol]),available:true,liquidityPass:true,averageDollarVolume20:500000000},
   expertDecision:{metrics:{quoteFreshnessPass:true}}}));
  return {date,decisionAt:date+'T21:00:00Z',prices,signals,positionSignals:signals,universeSymbols:symbols,corporateActions:[]};
 });
 const book={universe:'sp500',model:{sessions:sessions.slice(0,221)},captures:sessions.slice(0,221).map(s=>({sessionDate:s.date,hash:'synthetic-workflow:'+s.date,observedAt:s.decisionAt}))};
 const portfolio=options.portfolio?clone(options.portfolio):kind==='sell'?[{symbol:'DELL',role:'Swing',shares:20,avgCost:545.17,openedAt:baselineDate},{symbol:'CASH',role:'Swing',shares:0,avgCost:1}]:
  [{symbol:'LLL',role:'Swing',shares:800,avgCost:100,openedAt:baselineDate},{symbol:'CASH',role:'Swing',shares:1000,avgCost:1}];
 const equity=portfolio.reduce((sum,p)=>sum+p.shares*(p.symbol==='DELL'?500:p.symbol==='CASH'?1:100),0);
 const signature=loader.load('lib/portfolioGovernor.js').portfolioCompositionSignature(portfolio);
 let account=service.adoptC1Account({portfolio,capitalRecord:{version:2,highWater:equity,portfolioSignature:signature,reconciliationRequired:false},book,now:new Date(baselineDate+'T22:00:00Z')});
 let now=new Date(options.now||dates[221]+'T17:00:00Z'),openingFailure=kind==='missing',writes=0;const quotes={};
 const opening=()=>({currentEventEvidence:currentEventEvidenceFor(symbols,now),date:now.toISOString().slice(0,10),decisionAt:now.toISOString(),universeSymbols:symbols,corporateActions:[],
  prices:sessions[221].prices.map(p=>({...p,open:p.symbol==='DELL'?500:100,observedPrice:quotes[p.symbol]??(p.symbol==='DELL'?460:100),observedAt:now.toISOString()})),
  receipt:{observedAt:now.toISOString(),membershipCheckedTwice:true,previousAdjustedClosesUnchanged:true}});
 const collectOpening=async()=>{if(openingFailure)throw Error('MRNA entry verification incomplete: current opening quote unavailable');return opening();};
 async function prepare(ticket){return loader.load('lib/c1AccountExecutionView.js').prepareC1AccountExecution({account,book,now,collectOpening,recordTicket:ticket,expectedRevision:account.revision});}
 function screenRows(){return symbols.map((symbol,i)=>({symbol,sector:symbol==='MRNA'?'Healthcare':symbol==='DELL'?'Technology':'Sector'+i,price:quotes[symbol]??(symbol==='DELL'?460:100),timestamp:now.getTime()/1000,
  _fmpQuoteCache:'live',_fmpQuoteProvider:'FMP',_fmpQuoteEndpoint:'quote',_fmpQuoteFetchedAt:now.toISOString(),
  _fmpQuoteObservation:{provider:'FMP',endpoint:'stable/quote',symbol,price:quotes[symbol]??(symbol==='DELL'?460:100),timestamp:now.getTime()/1000,fetchedAt:now.toISOString()},
  eventRisk:{status:'Clear'},entryTiming:{available:true,liquidityPass:true,averageDollarVolume20:500000000},recommendation:{expertDecision:{strongBuyPass:symbol==='MRNA',metrics:{quoteFreshnessPass:true}}}}));}
 return {root,loader,service,book,sessions,portfolio,prepare,opening,collectOpening,screenRows,
  get account(){return account;},set account(value){account=value;},get now(){return now;},set now(value){now=new Date(value);},
  setQuote(symbol,price){quotes[symbol]=price;},get writes(){return writes;},persist(value){account=value;writes++;},setOpeningFailure(value){openingFailure=value;},
  setCash(balance){account=service.updateC1BrokerageCash({account,brokerageCash:balance,expectedRevision:account.revision,now});},
  advance(){now=new Date(now.getTime()+60000);},clone};
}
module.exports={createWorkflowFixture,currentEventEvidenceFor};
