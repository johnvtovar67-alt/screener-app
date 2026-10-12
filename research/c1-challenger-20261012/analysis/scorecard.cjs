'use strict';
// Offline diagnostics only. Source replay, allocation, and trading rules are untouched.
const {createHash}=require('node:crypto');
const {calculateMetrics,stringifyAudit}=require('../imported/tools/c1-production-policy-replay.cjs');
const DAY=86400000, YEAR=365.2425*DAY;
const mean=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
const median=xs=>{if(!xs.length)return null;const s=[...xs].sort((a,b)=>a-b),i=Math.floor(s.length/2);return s.length%2?s[i]:(s[i-1]+s[i])/2;};
const sd=xs=>xs.length>1?Math.sqrt(xs.reduce((a,x)=>a+(x-mean(xs))**2,0)/(xs.length-1)):null;
const hash=value=>createHash('sha256').update(stringifyAudit(value)).digest('hex');
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const ratio=(a,b)=>finite(a)&&finite(b)&&b>0?a/b:null;
const pct=x=>finite(x)?x*100:null;
const dateMs=d=>Date.parse(d+'T00:00:00Z');
const closed=t=>t.side==='sell'&&t.positionClosed===true;
const tradePnl=t=>t.roundTripPnl??t.realizedPnl;
function assert(condition,message){if(!condition)throw new Error(message);}
function checkRun(run){
 assert(Array.isArray(run.curve)&&run.curve.length>0,'A complete source curve is required');
 assert(Array.isArray(run.trades),'Source ledger trades are required');
 assert(run.initialCapital>0,'Positive initial capital required');
 for(let i=0;i<run.curve.length;i++){const p=run.curve[i];assert(finite(p.equity)&&finite(p.cash),'Finite source curve marks required');assert(!i||p.date>run.curve[i-1].date,'Ordered unique source sessions required');}
 assert(run.curve[0].date===run.startDate&&run.curve.at(-1).date===run.endDate,'Run endpoints do not match complete curve');
 return run;
}
function verifySnapshotGraph(run,baselineRole){
 const expected=baselineRole==='production-equivalent'?'b1a5d79c017cb96ff55037029dd343d75d4826a8fd7ba341ad2d183dc8d1c5bf':'ac7355c070966f6ce34fcbd5d930f93280c8d271dedb469146a5c27afa262fdb';
 assert(run.sourcePin?.sourceGraphSha256===expected,'Actual source snapshot graph differs from the named baseline');
 if(run.sourcePin.sources)assert(createHash('sha256').update(JSON.stringify(Object.entries(run.sourcePin.sources).sort())).digest('hex')===expected,'Source snapshot file map fails graph reconciliation');
 return true;
}
function growth(final,initial,start,end){const years=(dateMs(end)-dateMs(start))/YEAR;return years>0&&final>0&&initial>0?(Math.pow(final/initial,1/years)-1)*100:null;}
function riskFromReturns(returns){
 const m=mean(returns),v=sd(returns),down=returns.length?Math.sqrt(mean(returns.map(x=>Math.min(x,0)**2))):null;
 return {returnCount:returns.length,sharpe:finite(v)&&v>0?m/v*Math.sqrt(252):null,sortino:finite(down)&&down>0?m/down*Math.sqrt(252):null,
  undefinedReasons:{sharpe:!returns.length?'no returns':v===0?'zero daily deviation':v===null?'fewer than two returns':null,sortino:!returns.length?'no returns':down===0?'no downside observations':null}};
}
function timeUnderWater(curve,base){let peak=base,longest=0,active=0,days=0;for(const p of curve){peak=Math.max(peak,p.equity);if(p.equity<peak){days++;active++;longest=Math.max(longest,active);}else active=0;}return {sessions:days,pct:curve.length?days/curve.length*100:null,longestEpisodeSessions:longest,terminalEpisodeSessions:active};}
function benchmarkAlphaDiagnostics(curve,symbol='QQQ'){
 if(curve.length<2||curve.some(p=>!(p.equity>0&&p.benchmarks?.[symbol]>0)))return {available:false,reason:'Positive aligned equity/benchmark closes and at least one return required',benchmark:symbol};
 const rp=curve.slice(1).map((p,i)=>p.equity/curve[i].equity-1),rb=curve.slice(1).map((p,i)=>p.benchmarks[symbol]/curve[i].benchmarks[symbol]-1),active=rp.map((r,i)=>r-rb[i]),vol=sd(active),vp=sd(rp),vb=sd(rb),cov=rp.length>1?rp.reduce((s,r,i)=>s+(r-mean(rp))*(rb[i]-mean(rb)),0)/(rp.length-1):null,beta=finite(cov)&&vb>0?cov/(vb*vb):null;
 const relative=curve.map(p=>({date:p.date,relativeWealth:(p.equity/curve[0].equity)/(p.benchmarks[symbol]/curve[0].benchmarks[symbol])}));let peak=1,dd=0;for(const p of relative){peak=Math.max(peak,p.relativeWealth);dd=Math.min(dd,p.relativeWealth/peak-1);}
 const cagr=growth(curve.at(-1).equity,curve[0].equity,curve[0].date,curve.at(-1).date),benchmarkCagr=growth(curve.at(-1).benchmarks[symbol],curve[0].benchmarks[symbol],curve[0].date,curve.at(-1).date);
 return {available:true,benchmark:symbol,returnCount:rp.length,endingRelativeWealth:relative.at(-1).relativeWealth,relativeWealthGrowthPct:(relative.at(-1).relativeWealth-1)*100,relativeWealthMaxDrawdownPct:dd*100,relativeWealthCagrPct:growth(relative.at(-1).relativeWealth,1,curve[0].date,curve.at(-1).date),cagrDifferencePct:finite(cagr)&&finite(benchmarkCagr)?cagr-benchmarkCagr:null,annualizedArithmeticActiveReturnPct:pct(mean(active)*252),annualizedTrackingErrorPct:finite(vol)?vol*Math.sqrt(252)*100:null,informationRatio:vol>0?mean(active)/vol*Math.sqrt(252):null,fullWindowDescriptiveBeta:beta,fullWindowCorrelation:finite(cov)&&vp>0&&vb>0?cov/(vp*vb):null,annualizedMeanBetaResidualPct:finite(beta)?pct((mean(rp)-beta*mean(rb))*252):null,interpretation:'Supplemental close-to-close diagnostics. Relative wealth divides strategy wealth by benchmark wealth. Active return is daily strategy minus benchmark return. Beta and mean residual use a descriptive full-window zero-risk-free linear fit; they are never strategy inputs, forward estimates, or certified alpha.',_relativeWealthPath:relative};
}
// The extra anchor carries the prior close into the return and benchmark path. It is
// excluded from utilization and turnover's period observation denominator.
function periodMetrics(run,from,through){
 const indices=run.curve.map((p,i)=>p.date>=from&&p.date<=through?i:-1).filter(i=>i>=0);
 if(!indices.length)return {available:false,requestedFrom:from,requestedThrough:through};
 const first=indices[0],last=indices.at(-1),anchor=first>0?first-1:first,rows=run.curve.slice(first,last+1),path=run.curve.slice(anchor,last+1);
 const trades=run.trades.filter(t=>t.date>=rows[0].date&&t.date<=rows.at(-1).date),base=path[0].equity;
 const inherited=calculateMetrics(path,trades,base),values=rows.map(p=>p.equity),notional=trades.reduce((s,t)=>s+t.shares*t.price,0);
 // Inherited period trade P&L is a close-date attribution; an entry may precede
 // this period. It is never presented as a fresh-cash or liquidated-boundary run.
 inherited.turnoverPct=pct(ratio(notional,mean(values)));
 inherited.annualizedTurnoverPct=pct(ratio(notional,mean(values))===null?null:ratio(notional,mean(values))*252/rows.length);
 inherited.capitalUtilizationPct=pct(mean(rows.map(p=>1-p.cash/p.equity)));
 const cagr=growth(rows.at(-1).equity,base,path[0].date,rows.at(-1).date);
 const benchmarks={};for(const symbol of ['SPY','QQQ']){const a=path[0].benchmarks?.[symbol],b=rows.at(-1).benchmarks?.[symbol];const benchmarkCagr=growth(b,a,path[0].date,rows.at(-1).date);benchmarks[symbol]={cagrPct:benchmarkCagr,excessCagrPct:finite(cagr)&&finite(benchmarkCagr)?cagr-benchmarkCagr:null};}
 return {available:true,requestedFrom:from,requestedThrough:through,actualFirstSession:rows[0].date,actualLastSession:rows.at(-1).date,baseSession:path[0].date,baseEquity:base,observations:rows.length,carriedState:true,firstReturnIncluded:first>0,metrics:inherited,cagrPct:cagr,calmar:ratio(cagr,Math.abs(inherited.maxDrawdownPct)),benchmarks,qqqRelativeDiagnostics:benchmarkAlphaDiagnostics(path),timeUnderWater:timeUnderWater(rows,base),statisticalAvailability:riskFromReturns(inherited.dailyReturns),tradeAttribution:'Source completed sleeve trades attributed by exit date; carried entries remain intact.',_path:path};
}
function metadataFromTrace(run){
 const meta=new Map();for(const row of run.accountTrace||[])for(const [sleeve,book] of Object.entries(row.sleeves||{}))for(const p of book.state||[]){if(p.positionId!==undefined)meta.set(sleeve+':'+p.positionId,{issuer:p.issuer||p.symbol,sector:p.sector||'unknown',symbol:p.symbol});}
 return meta;
}
function sleeveEpisodes(run){
 const meta=metadataFromTrace(run),groups=new Map(),dateIndex=new Map(run.curve.map((p,i)=>[p.date,i]));
 for(const t of run.trades){assert(t.positionId!==undefined&&t.sleeve,'Ledger needs sleeve and positionId for tail attribution');const id=t.sleeve+':'+t.positionId;
  if(!groups.has(id))groups.set(id,{id,sleeve:t.sleeve,positionId:t.positionId,symbol:t.symbol,issuer:meta.get(id)?.issuer||t.symbol,sector:meta.get(id)?.sector||'unknown',entryDate:null,exitDate:null,investedCost:0,realizedPnl:0,trades:[],closed:false});
  const g=groups.get(id);g.trades.push(t);if(t.side==='buy'){g.entryDate=g.entryDate||t.date;g.investedCost+=t.shares*t.price+(t.fee||0);}else{g.realizedPnl+=t.realizedPnl||0;if(closed(t)){assert(!g.closed,'Repeated close in sleeve episode');g.closed=true;g.exitDate=t.date;g.netPnl=tradePnl(t);g.holdingSessions=t.holdingSessions;g.mfePct=t.mfePct??null;g.maePct=t.maePct??null;}}
 }
 for(const g of groups.values()){
  assert(g.entryDate&&dateIndex.has(g.entryDate),'Missing source entry session');let cashflow=0;g.pnlPath=[];
  const byDate=new Map();for(const t of g.trades){const flow=(t.side==='buy'?-1:1)*t.shares*t.price-(t.fee||0);byDate.set(t.date,(byDate.get(t.date)||0)+flow);}
  for(let i=0;i<run.curve.length;i++){
   const p=run.curve[i];cashflow+=byDate.get(p.date)||0;let value=0;
   const trace=run.accountTrace?.[i];assert(trace?.date===p.date,'Complete aligned accountTrace required for P&L stream');
   const states=trace.sleeves?.[g.sleeve]?.state||[],state=states.find(s=>s.positionId===g.positionId),book=trace.books?.[g.sleeve]||trace.sleeves?.[g.sleeve];
   if(state){const actual=book?.positions?.[g.symbol];assert(actual&&finite(state.lastPrice)&&state.lastPrice>0,'Exact actual shares and held close mark required');value=actual.shares*state.lastPrice;}
   g.pnlPath.push(cashflow+value);
  }
  const finalPnl=g.pnlPath.at(-1);if(g.closed){assert(finite(g.netPnl)&&Math.abs(finalPnl-g.netPnl)<=Math.max(1e-6,Math.abs(g.netPnl)*1e-8),'Closed sleeve P&L stream fails source reconciliation: '+g.id);}else g.netPnl=finalPnl;
  g.netReturnPct=pct(ratio(g.netPnl,g.investedCost));
 }
 return [...groups.values()];
}
// Daily ownership intervals that meet on a session are deliberately consolidated:
// source ledger ordering cannot prove intraday separation of sell/reentry fills.
function issuerEpisodes(episodes,finalDate){
 const byIssuer=new Map();for(const g of episodes){if(!byIssuer.has(g.issuer))byIssuer.set(g.issuer,[]);byIssuer.get(g.issuer).push(g);}
 const out=[];for(const [issuer,groups] of byIssuer){groups.sort((a,b)=>a.entryDate.localeCompare(b.entryDate)||a.id.localeCompare(b.id));let current=null,count=0;
  for(const g of groups){const end=g.exitDate||finalDate;if(!current||g.entryDate>current.intervalEnd){current={id:issuer+':episode:'+ ++count,issuer,entryDate:g.entryDate,intervalEnd:end,members:[],closed:true};out.push(current);}current.members.push(g);current.intervalEnd=current.intervalEnd>end?current.intervalEnd:end;current.closed=current.closed&&g.closed;}
 }
 return out.map(g=>({...g,exitDate:g.closed?g.intervalEnd:null,investedCost:g.members.reduce((s,m)=>s+m.investedCost,0),netPnl:g.members.reduce((s,m)=>s+m.netPnl,0),netReturnPct:pct(ratio(g.members.reduce((s,m)=>s+m.netPnl,0),g.members.reduce((s,m)=>s+m.investedCost,0))),pnlPath:g.members[0].pnlPath.map((_,i)=>g.members.reduce((s,m)=>s+m.pnlPath[i],0)),memberIds:g.members.map(m=>m.id)}));
}
function contributionRatio(numerator,denominator){return {pct:denominator>0&&Math.abs(denominator)>1e-8?numerator/denominator*100:null,denominator,denominatorStatus:denominator<=0?'nonpositive':Math.abs(denominator)<=1e-8?'near_zero':'positive'};}
function tailDiagnostics(episodes,run){
 const completed=episodes.filter(g=>g.closed),winners=completed.filter(g=>g.netPnl>0).sort((a,b)=>b.netPnl-a.netPnl||a.id.localeCompare(b.id));
 const gross=winners.reduce((s,g)=>s+g.netPnl,0),net=completed.reduce((s,g)=>s+g.netPnl,0),totalNet=run.curve.at(-1).equity-run.initialCapital;
 const removal=[1,5,10].map(k=>{const selected=winners.slice(0,k),pnl=selected.reduce((s,g)=>s+g.netPnl,0),curve=run.curve.map((p,i)=>({...p,equity:p.equity-selected.reduce((s,g)=>s+g.pnlPath[i],0)}));
  let peak=run.initialCapital,dd=0;for(const p of curve){peak=Math.max(peak,p.equity);dd=Math.min(dd,p.equity/peak-1);}const positive=curve.every(p=>p.equity>0),returns=positive?curve.slice(1).map((p,i)=>p.equity/curve[i].equity-1):[];
  return {requestedWinners:k,availableWinners:selected.length,selectedIds:selected.map(g=>g.id),removedNetPnl:pnl,grossPositiveContribution:contributionRatio(pnl,gross),closedNetContribution:contributionRatio(pnl,net),totalPortfolioNetContribution:contributionRatio(pnl,totalNet),finalResidualNetPnl:totalNet-pnl,endingResidualEquity:curve.at(-1).equity,finalSubtractionCheckPassed:Math.abs(curve.at(-1).equity-(run.curve.at(-1).equity-pnl))<1e-6,maxDrawdownPct:dd*100,cagrPct:positive?growth(curve.at(-1).equity,run.initialCapital,curve[0].date,curve.at(-1).date):null,risk:positive?riskFromReturns(returns):{sharpe:null,sortino:null,undefinedReason:'Residual path has nonpositive equity'},_residualCurve:curve};
 });
 const thresholds=[25,50,100].map(pct=>{const selected=winners.filter(g=>g.netReturnPct>pct),pnl=selected.reduce((s,g)=>s+g.netPnl,0);return {greaterThanNetReturnPct:pct,count:selected.length,grossPositiveShare:contributionRatio(pnl,gross),totalPortfolioNetShare:contributionRatio(pnl,totalNet)};});
 return {completedCount:completed.length,openCount:episodes.length-completed.length,grossPositivePnl:gross,closedNetPnl:net,totalPortfolioNetPnl:totalNet,removal,thresholds,methodology:'Ex-post contribution removal subtracts each selected completed winner\'s cumulative net cashflow plus marked ownership value at every source close; subsequent source fills, decisions and quantities remain fixed. This explanatory stress is not an investable counterfactual. Entry-cost return denominator sums all entry/completion purchases; overlapping issuer sleeves and same-session reentries are consolidated.',_episodes:episodes};
}
function concentrations(run){
 const rows=[];for(let i=0;i<run.curve.length;i++){const p=run.curve[i],trace=run.accountTrace?.[i];if(!trace||trace.date!==p.date)return {available:false,reason:'Complete aligned accountTrace is absent'};const issuers={},sectors={};let invested=0;
  for(const [sleeve,book] of Object.entries(trace.sleeves||{})){for(const state of book.state||[]){const position=(trace.books?.[sleeve]||book).positions?.[state.symbol];assert(position&&state.lastPrice>0,'Unpriced source holding');const value=position.shares*state.lastPrice;invested+=value;issuers[state.issuer||state.symbol]=(issuers[state.issuer||state.symbol]||0)+value;sectors[state.sector||'unknown']=(sectors[state.sector||'unknown']||0)+value;}}
  assert(Math.abs(invested+p.cash-p.equity)<=Math.max(1e-6,p.equity*1e-8),'Combined invested value does not reconcile to source equity');
  const hhi=invested>0?Object.values(issuers).reduce((s,x)=>s+(x/invested)**2,0):null;
  rows.push({date:p.date,investedFraction:ratio(invested,p.equity),issuerCount:Object.keys(issuers).length,maxIssuerWeight:Object.values(issuers).length?Math.max(...Object.values(issuers))/p.equity:0,issuerWeights:Object.fromEntries(Object.entries(issuers).map(([key,v])=>[key,v/p.equity])),sectorWeights:Object.fromEntries(Object.entries(sectors).map(([key,v])=>[key,v/p.equity])),investedNormalizedHerfindahl:hhi,effectiveIssuers:hhi?1/hhi:null});
 }
 const collect=key=>rows.map(r=>r[key]).filter(finite);return {available:true,averageInvestedFraction:mean(collect('investedFraction')),minimumInvestedFraction:Math.min(...collect('investedFraction')),averageIssuerCount:mean(collect('issuerCount')),maxIssuerWeight:Math.max(...collect('maxIssuerWeight')),averageMaxIssuerWeight:mean(collect('maxIssuerWeight')),averageEffectiveIssuersWhileInvested:mean(collect('effectiveIssuers')),minimumEffectiveIssuersWhileInvested:collect('effectiveIssuers').length?Math.min(...collect('effectiveIssuers')):null,averageInvestedNormalizedHerfindahl:mean(collect('investedNormalizedHerfindahl')),_rows:rows};
}
function regimeLabels(history){
 const ordered=[...history].sort((a,b)=>a.date.localeCompare(b.date));for(let i=0;i<ordered.length;i++)assert(!i||ordered[i].date>ordered[i-1].date,'Unique benchmark history required');const labels=new Map();
 for(let i=0;i<ordered.length;i++){const prior=ordered.slice(0,i),closes=prior.map(p=>p.close),last=closes.at(-1),flags={correction:null,highVolatility:null,lowVolatility:null,strongTrend:null,recovery:null,sideways:null};
  const validWindow=size=>closes.length>=size&&closes.slice(-size).every(x=>finite(x)&&x>0),availability={volatility20:validWindow(21),return63:validWindow(64),sma50:validWindow(50),sma200:validWindow(200),drawdown252:validWindow(252)};
  const ret63=availability.return63?last/closes.at(-64)-1:null,drawdown=availability.drawdown252?last/Math.max(...closes.slice(-252))-1:null;
  if(availability.drawdown252)flags.correction=drawdown<=-.1;
  let vol=null;if(availability.volatility20){const recent=closes.slice(-21),rs=recent.slice(1).map((v,j)=>v/recent[j]-1);vol=sd(rs)*Math.sqrt(252);if(finite(vol)){flags.highVolatility=vol>=.25;flags.lowVolatility=vol<=.15;}else vol=null;}
  if(availability.sma200&&availability.return63)flags.strongTrend=last>mean(closes.slice(-200))&&ret63>=.1;
  if(availability.sma50&&availability.return63&&availability.drawdown252)flags.recovery=last>mean(closes.slice(-50))&&ret63>0&&drawdown<=-.05;
  if(availability.return63)flags.sideways=Math.abs(ret63)<.05;
  labels.set(ordered[i].date,{date:ordered[i].date,observedThrough:prior.at(-1)?.date||null,flags,volatility:vol,return63:ret63,drawdown252:drawdown,windowAvailability:availability});
 }return labels;
}
function regimes(run,history){
 if(!history)return {available:false,reason:'Exact original SPY warmup/history is required; no substituted benchmark data used'};
 const historyPrices=new Map(history.map(p=>[p.date,p.close]));for(const p of run.curve)assert(historyPrices.get(p.date)===p.benchmarks?.SPY,'SPY explanatory history is not aligned with the exact source benchmark closes');
 const labels=regimeLabels(history),rows=[];for(let i=1;i<run.curve.length;i++){const a=run.curve[i-1],p=run.curve[i],label=labels.get(p.date);assert(label,'Missing exact SPY session for regime label');assert(label.observedThrough<p.date,'Regime label must use prior completed session');rows.push({date:p.date,index:i,return:p.equity/a.equity-1,benchmarkReturns:Object.fromEntries(['SPY','QQQ'].map(s=>[s,p.benchmarks[s]/a.benchmarks[s]-1])),utilization:1-p.cash/p.equity,flags:label.flags});}
 const names=['correction','highVolatility','lowVolatility','strongTrend','recovery','sideways'],summary={};for(const name of names){const selected=rows.filter(r=>r.flags[name]===true),episodes=[];let episode=null;for(const r of selected){if(!episode||r.index!==episode.at(-1).index+1){episode=[];episodes.push(episode);}episode.push(r);}
  const compound=rs=>rs.reduce((s,r)=>s*(1+r),1)-1;const ret=compound(selected.map(r=>r.return)),benchmark={};for(const s of ['SPY','QQQ']){const b=compound(selected.map(r=>r.benchmarkReturns[s]));benchmark[s]={returnPct:b*100,excessReturnPct:(ret-b)*100};}
  const ep=episodes.map(e=>{let level=1,peak=1,dd=0;for(const r of e){level*=1+r.return;peak=Math.max(peak,level);dd=Math.min(dd,level/peak-1);}return {from:e[0].date,through:e.at(-1).date,days:e.length,returnPct:(level-1)*100,maxDrawdownPct:dd*100};});const dates=new Set(selected.map(r=>r.date)),trades=run.trades.filter(t=>dates.has(t.date)),notional=trades.reduce((s,t)=>s+t.shares*t.price,0);
  summary[name]={days:selected.length,unknownLabelDays:rows.filter(r=>r.flags[name]===null).length,returnPct:selected.length?ret*100:null,...riskFromReturns(selected.map(r=>r.return)),benchmarks:benchmark,worstContiguousEpisodeDrawdownPct:ep.length?Math.min(...ep.map(e=>e.maxDrawdownPct)):null,capitalUtilizationPct:pct(mean(selected.map(r=>r.utilization))),fillCount:trades.length,closedSleeveTradeCount:trades.filter(closed).length,twoWayTradedNotional:notional,turnoverPct:selected.length?pct(ratio(notional,mean(selected.map(r=>run.curve[r.index].equity)))):null,episodeCount:ep.length,_episodes:ep};
 }
 const overlap={};for(let i=0;i<names.length;i++)for(let j=i+1;j<names.length;j++)overlap[names[i]+' & '+names[j]]=rows.filter(r=>r.flags[names[i]]===true&&r.flags[names[j]]===true).length;
 return {available:true,observations:rows.length,labelsUsePriorSessionOnly:true,overlapping:true,overlapCounts:overlap,summary,_labels:[...labels.values()]};
}
function periodRegimes(run,history,from,through){
 const first=run.curve.findIndex(p=>p.date>=from&&p.date<=through),last=run.curve.findLastIndex(p=>p.date>=from&&p.date<=through);if(first<0)return {available:false,reason:'No source sessions within requested regime period'};
 const anchor=Math.max(0,first-1),dates=new Set(run.curve.slice(first,last+1).map(p=>p.date)),scoped={...run,curve:run.curve.slice(anchor,last+1),trades:run.trades.filter(t=>dates.has(t.date))};
 return {...regimes(scoped,history),requestedFrom:from,requestedThrough:through,baseSession:run.curve[anchor].date,firstReturnIncluded:first>0};
}
function opportunities(episodes,run,marks){
 const giveback=episodes.filter(g=>g.closed).map(g=>({id:g.id,mfePct:g.mfePct,netExitReturnPct:g.netReturnPct,peakToNetExitGivebackPct:finite(g.mfePct)&&finite(g.netReturnPct)?g.mfePct-g.netReturnPct:null}));
 if(!marks)return {giveback,postExit:{available:false,reason:'Exact original unheld-symbol history absent; no post-exit prices inferred'}};
 const byDate=new Map(marks.map(s=>[s.date,new Map(s.prices.map(p=>[p.symbol,p.close]))])),dateIndex=new Map(run.curve.map((p,i)=>[p.date,i])),rows=[];
 for(const g of episodes.filter(g=>g.closed)){const sells=g.trades.filter(t=>t.side==='sell'),last=sells.at(-1),i=dateIndex.get(last.date);for(const horizon of [20,60,120]){const future=run.curve[i+horizon],price=future&&byDate.get(future.date)?.get(g.symbol);rows.push({id:g.id,horizonSessions:horizon,exitDate:last.date,futureDate:future?.date||null,available:finite(price)&&price>0,postExitReturnPct:finite(price)&&price>0?(price/last.price-1)*100:null,constantLastSaleProceedsOpportunityPnl:finite(price)&&price>0?last.shares*(price-last.price):null});}}
 return {giveback,postExit:{available:true,fixedHorizonsSessions:[20,60,120],methodology:'Ex-post constant final-sale proceeds at exact future close, with no financing, replacement return, additional costs or reinvestment. Missing/delisted prices remain unavailable.',_rows:rows,byHorizon:Object.fromEntries([20,60,120].map(h=>{const r=rows.filter(x=>x.horizonSessions===h&&x.available);return [h,{availableCount:r.length,unavailableCount:rows.filter(x=>x.horizonSessions===h&&!x.available).length,meanPostExitReturnPct:mean(r.map(x=>x.postExitReturnPct)),medianPostExitReturnPct:median(r.map(x=>x.postExitReturnPct)),constantLastSaleProceedsOpportunityPnl:r.reduce((s,x)=>s+x.constantLastSaleProceedsOpportunityPnl,0)}];}))}};
}
function calendarAndRolling(run){
 const years=[];for(let y=Number(run.startDate.slice(0,4));y<=Number(run.endDate.slice(0,4));y++)years.push(periodMetrics(run,y+'-01-01',y+'-12-31'));
 const rolling=[];for(let y=Number(run.startDate.slice(0,4));y<=Number(run.endDate.slice(0,4));y++)for(const month of [1,4,7,10]){const from=`${y}-${String(month).padStart(2,'0')}-01`,end=new Date(Date.UTC(y+1,month-1,0)).toISOString().slice(0,10);if(from>=run.startDate&&end<=run.endDate)rolling.push(periodMetrics(run,from,end));}
 return {calendarYears:years,rolling12MonthsQuarterly:rolling,rollingDefinition:'Fixed calendar 12-month periods starting January/April/July/October; previous available source close anchors each period. Incomplete terminal windows excluded.'};
}
function scorecard(run,{baselineRole,experimentId='champion',spyHistory,opportunityMarks,periods=true}={}){
 checkRun(run);assert(['historical-audit','production-equivalent'].includes(baselineRole),'Explicit historical-audit or production-equivalent baseline role required');
 verifySnapshotGraph(run,baselineRole);
 const inherited=calculateMetrics(run.curve,run.trades,run.initialCapital),episodes=sleeveEpisodes(run),completed=episodes.filter(g=>g.closed),wins=completed.filter(g=>g.netPnl>0),losses=completed.filter(g=>g.netPnl<0),net=run.curve.at(-1).equity-run.initialCapital,cagr=growth(run.curve.at(-1).equity,run.initialCapital,run.startDate,run.endDate);
 const benchmarks={};for(const s of ['SPY','QQQ']){const b=growth(run.curve.at(-1).benchmarks?.[s],run.curve[0].benchmarks?.[s],run.startDate,run.endDate);benchmarks[s]={cagrPct:b,excessCagrPct:finite(cagr)&&finite(b)?cagr-b:null};}
 return {contract:'c1-research-offline-scorecard-v1',baselineRole,experimentId,sourceGraphSha256:run.sourcePin?.sourceGraphSha256||null,baseSourceGraphSha256:run.researchIdentity?.baseSourceGraphSha256||null,sourceCommit:run.researchIdentity?.sourceCommit||run.sourcePin?.sourceCommit||run.sourcePin?.auditCommit||null,inputContentSha256:run.inputContentSha256||null,baseInputContentSha256:run.researchIdentity?.baseInputContentSha256||run.inputContentSha256||null,inputTransform:run.researchIdentity?.inputTransform||null,costBps:run.slippageBps,runClass:run.runClass,eligibleForAlphaClaim:false,actualLiveInputAccepted:run.actualLiveInputAccepted??null,literalLiveInputGuardFailures:run.literalLiveInputGuardFailures||{},conditional:true,inheritedMetrics:inherited,supplemental:{qqqRelativeDiagnostics:benchmarkAlphaDiagnostics(run.curve),cagrPct:cagr,calmar:ratio(cagr,Math.abs(inherited.maxDrawdownPct)),benchmarks,expectancyDollars:mean(completed.map(g=>g.netPnl)),expectancyEntryCapitalPct:mean(completed.map(g=>g.netReturnPct).filter(finite)),meanWinnerDollars:mean(wins.map(g=>g.netPnl)),medianWinnerDollars:median(wins.map(g=>g.netPnl)),meanLoserDollars:mean(losses.map(g=>g.netPnl)),medianLoserDollars:median(losses.map(g=>g.netPnl)),netPnlPerSourceTwoWayDollar:ratio(net,inherited.twoWayTradedNotional),netPnlPerAverageInvestedDollar:ratio(net,mean(run.curve.map(p=>p.equity-p.cash))),minimumCapitalUtilizationPct:Math.min(...run.curve.map(p=>(1-p.cash/p.equity)*100)),timeUnderWater:timeUnderWater(run.curve,run.initialCapital),statisticalAvailability:riskFromReturns(inherited.dailyReturns),modeledFillNotional:(run.fills||[]).reduce((s,t)=>s+t.shares*t.price,0),modeledFillCount:(run.fills||[]).length,sourceLedgerFillNotionalDifference:(run.fills||[]).reduce((s,t)=>s+t.shares*t.price,0)-inherited.twoWayTradedNotional,concentration:concentrations(run),rightTail:{sleeveRoundTrips:tailDiagnostics(episodes,run),consolidatedIssuerEpisodes:tailDiagnostics(issuerEpisodes(episodes,run.endDate),run)},opportunityCost:opportunities(episodes,run,opportunityMarks)},regimes:regimes(run,spyHistory),...(periods?{validationRegimes:periodRegimes(run,spyHistory,'2025-01-01','2026-09-01'),developmentRegimes:periodRegimes(run,spyHistory,'2023-01-04','2024-12-31'),development:periodMetrics(run,'2023-01-04','2024-12-31'),validation:periodMetrics(run,'2025-01-01','2026-09-01'),...calendarAndRolling(run)}:{}),periodScope:periods?'full':'development',periodStart:run.startDate,periodEnd:run.endDate,economicPathSha256:hash({curve:run.curve,trades:run.trades,fills:run.fills}),fullPathSha256:hash({curve:run.curve,trades:run.trades,fills:run.fills,accountTrace:run.accountTrace})};
}
// This helper returns only permitted development observations. Calling scorecard
// on a whole run before lock would expose validation; the development CLI instead
// truncates all sensitive source arrays before any supplemental calculation.
function developmentRun(run){
 checkRun(run);const end=run.curve.filter(p=>p.date<='2024-12-31').at(-1)?.date;assert(end,'No development observations');const prefix=xs=>(xs||[]).filter(x=>(x.date||x.executedAt?.slice(0,10))<=end);
 return {...run,endDate:end,observations:prefix(run.curve).length,curve:prefix(run.curve),trades:prefix(run.trades),fills:prefix(run.fills),accountTrace:prefix(run.accountTrace),plans:prefix(run.plans),metrics:undefined,final:undefined,simulatorTrace:undefined};
}
function developmentCard(run,options){const r=developmentRun(run);return scorecard(r,{...options,periods:false,spyHistory:options?.spyHistory?.filter(p=>p.date<=r.endDate),opportunityMarks:options?.opportunityMarks?.filter(p=>p.date<=r.endDate)});}
function baselineSummary(run){
 checkRun(run);const identity=run.researchIdentity;assert(identity?.experimentId==='champion'&&['production-equivalent','historical-audit'].includes(identity.baselineRole),'Baseline-only diagnostics require an explicitly identified Champion baseline');
 const expected=identity.baselineRole==='production-equivalent'?{commit:'e2b98471311fb702113baf0ca64473b92ccfd142',graph:'b1a5d79c017cb96ff55037029dd343d75d4826a8fd7ba341ad2d183dc8d1c5bf'}:{commit:'006e067697385143684c7417b18bc7909c2d217e',graph:'ac7355c070966f6ce34fcbd5d930f93280c8d271dedb469146a5c27afa262fdb'};
 assert(identity.sourceCommit===expected.commit&&identity.baseSourceGraphSha256===expected.graph,'Named baseline source identity mismatch');
 assert((identity.baseInputContentSha256||run.inputContentSha256)===run.inputContentSha256,'Baseline input may not contain Challenger transformations');
 assert(run.eligibleForAlphaClaim===false&&run.actualLiveInputAccepted===false,'Conditional baseline must retain non-alpha and rejected live-input status');
 assert(run.sourcePin?.sourceGraphSha256===identity.baseSourceGraphSha256,'Baseline source graph does not match its pinned base');verifySnapshotGraph(run,identity.baselineRole);
 const chronological=identity.privateChronologicalVerificationPassed??run.privateChronologicalVerificationPassed??identity.privateChronologicalVerification?.passed??run.privateChronologicalVerification?.passed;
 assert(chronological===true,'Baseline requires passing private complete chronological verification');
 if(identity.baselineRole==='historical-audit'){const audit=identity.historicalAuditMatch??run.historicalAuditMatch;assert(audit===true||audit?.passed===true,'Historical audit baseline must match its exact saved source/cost receipt');}
 const inherited={...calculateMetrics(run.curve,run.trades,run.initialCapital)};delete inherited.dailyReturns;
 const qqq=Object.fromEntries(Object.entries(benchmarkAlphaDiagnostics(run.curve)).filter(([k])=>!k.startsWith('_')));
 return {contract:'c1-separated-baseline-only-aggregate-v1',baselineRole:identity.baselineRole,experimentId:'champion',sourceCommit:identity.sourceCommit,baseSourceGraphSha256:identity.baseSourceGraphSha256,inputContentSha256:run.inputContentSha256,baseInputContentSha256:identity.baseInputContentSha256||run.inputContentSha256,costBps:run.slippageBps,startDate:run.startDate,endDate:run.endDate,runClass:run.runClass,conditional:true,eligibleForAlphaClaim:false,actualLiveInputAccepted:false,literalLiveInputGuardFailures:run.literalLiveInputGuardFailures||{},privateChronologicalVerificationPassed:true,historicalAuditMatch:identity.baselineRole==='historical-audit'?true:null,inheritedMetrics:inherited,qqqRelativeDiagnostics:qqq,validationSlicesExposed:false,interpretation:'Separate whole-period source-specific baseline audit. Historical-audit and production-equivalent policy results must never be equated. No validation/calendar/year/regime slice or Challenger result is exposed.'};
}
// Allowlist public export: no source row, prices, holdings, symbols, ordered daily
// returns, issuer identities, trades or contribution/residual paths are emitted.
function publicSummary(card){
 const metrics={...card.inheritedMetrics};delete metrics.dailyReturns;
 const s=card.supplemental,tail=t=>({...Object.fromEntries(['completedCount','openCount','grossPositivePnl','closedNetPnl','totalPortfolioNetPnl','methodology'].map(k=>[k,t[k]])),thresholds:t.thresholds,removal:t.removal.map(r=>Object.fromEntries(Object.entries(r).filter(([k])=>!k.startsWith('_')&&k!=='selectedIds')))});
 const period=p=>{if(!p)return p;const {_path,...rest}=p;if(rest.metrics){rest.metrics={...rest.metrics};delete rest.metrics.dailyReturns;}if(rest.qqqRelativeDiagnostics)rest.qqqRelativeDiagnostics=Object.fromEntries(Object.entries(rest.qqqRelativeDiagnostics).filter(([k])=>!k.startsWith('_')));return rest;};
 const publicRegimes=r=>{const copy=r.available?{...r,summary:Object.fromEntries(Object.entries(r.summary).map(([k,v])=>[k,Object.fromEntries(Object.entries(v).filter(([field])=>!field.startsWith('_')))]))}:{...r};delete copy._labels;return copy;};const regime=publicRegimes(card.regimes);
 return {contract:card.contract,baselineRole:card.baselineRole,experimentId:card.experimentId,sourceGraphSha256:card.sourceGraphSha256,baseSourceGraphSha256:card.baseSourceGraphSha256,sourceCommit:card.sourceCommit,inputContentSha256:card.inputContentSha256,baseInputContentSha256:card.baseInputContentSha256,inputTransform:card.inputTransform?Object.fromEntries(['family','baseInputContentSha256','derivedInputContentSha256','preservedOriginalPriceUniverseVerified','receiptSha256','receiptSHA'].map(k=>[k,card.inputTransform[k]]).filter(([,v])=>v!==undefined)):null,costBps:card.costBps,runClass:card.runClass,eligibleForAlphaClaim:false,actualLiveInputAccepted:card.actualLiveInputAccepted,literalLiveInputGuardFailures:card.literalLiveInputGuardFailures,conditional:true,inheritedMetrics:metrics,supplemental:{...Object.fromEntries(Object.entries(s).filter(([k])=>!['qqqRelativeDiagnostics','concentration','rightTail','opportunityCost'].includes(k))),qqqRelativeDiagnostics:Object.fromEntries(Object.entries(s.qqqRelativeDiagnostics).filter(([k])=>!k.startsWith('_'))),concentration:Object.fromEntries(Object.entries(s.concentration).filter(([k])=>!k.startsWith('_'))),rightTail:{sleeveRoundTrips:tail(s.rightTail.sleeveRoundTrips),consolidatedIssuerEpisodes:tail(s.rightTail.consolidatedIssuerEpisodes)},opportunityCost:{peakToExitGivebackCount:s.opportunityCost.giveback.length,meanPeakToExitGivebackPct:mean(s.opportunityCost.giveback.map(g=>g.peakToNetExitGivebackPct).filter(finite)),postExit:Object.fromEntries(Object.entries(s.opportunityCost.postExit).filter(([k])=>!k.startsWith('_')))}},regimes:regime,...(card.development?{developmentRegimes:publicRegimes(card.developmentRegimes),validationRegimes:publicRegimes(card.validationRegimes),development:period(card.development),validation:period(card.validation),calendarYears:card.calendarYears.map(period),rolling12MonthsQuarterly:card.rolling12MonthsQuarterly.map(period),rollingDefinition:card.rollingDefinition}:{}),periodScope:card.periodScope,periodStart:card.periodStart,periodEnd:card.periodEnd,economicPathSha256:card.economicPathSha256,fullPathSha256:card.fullPathSha256};
}
module.exports={scorecard,developmentCard,developmentRun,baselineSummary,publicSummary,periodMetrics,benchmarkAlphaDiagnostics,regimeLabels,periodRegimes,verifySnapshotGraph,sleeveEpisodes,issuerEpisodes,tailDiagnostics,concentrations,riskFromReturns,hash};
