const CASH=new Set(['CASH','SWVXX','VMFXX','SPAXX','FDRXX','MMF']);
const FACTORS={
  'AI Capex & Data Center':['NVDA','AMD','AVGO','ARM','MU','SMCI','DELL','HPE','ANET','MRVL','COHR','DLR','NVT','VRT','ETN','FIX','EME','TER','GEV','PWR'],
  'Digital Assets':['MSTR','COIN','HOOD','MARA','RIOT','CLSK','IREN','WULF','HUT','BTDR','CIFR','BITF'],
  'Space & Satellites':['RKLB','ASTS','RDW','BKSY','IRDM'],
  'Biotech':['IOVA','MRNA','RXRX','SDGR','CRSP','BEAM','VKTX','ALMS','HIMS'],
  'Automation & Robotics':['CGNX','ROK','SYM','ISRG'],
  'Cybersecurity':['CRWD','PANW','NET','ZS','DDOG','SNOW','MDB'],
  'Nuclear & Baseload':['CCJ','UEC','UUUU','LEU','BWXT','SMR','OKLO','NNE','NXE','DNN','CEG','VST','NRG','TLN']
};
const SYMBOL_FACTOR=Object.fromEntries(Object.entries(FACTORS).flatMap(([factor,symbols])=>symbols.map(s=>[s,factor])));
const n=(v,f=0)=>{const x=Number(v);return Number.isFinite(x)?x:f};
const symbol=s=>String(s?.symbol||s?.ticker||'').toUpperCase();
const value=s=>n(s?.value,n(s?.shares)*n(s?.price||s?.currentPrice||s?.avgCost));
const isCash=s=>CASH.has(symbol(s));
const isCore=s=>String(s?.role||'Swing').toLowerCase()==='core';

export function factorFor(s={}){return SYMBOL_FACTOR[symbol(s)]||s?.primaryTheme||s?.theme||'Other';}
export function daysSince(date){if(!date)return null;const t=new Date(date).getTime();if(!Number.isFinite(t))return null;return Math.max(0,Math.floor((Date.now()-t)/86400000));}
export function swingTargetPct(action){return action==='Strong Buy'?.09:action==='Buy'?.06:0;}

export function signalPersistence(records=[],ticker='',lookbackDays=10){
  const key=String(ticker||'').toUpperCase(),cutoff=Date.now()-lookbackDays*86400000;
  const rows=(records||[]).filter(r=>String(r?.symbol||'').toUpperCase()===key&&['Buy','Strong Buy'].includes(r?.action)&&new Date(r?.timestamp||r?.day||0).getTime()>=cutoff);
  const days=[...new Set(rows.map(r=>String(r.day||r.timestamp||'').slice(0,10)).filter(Boolean))];
  const strongDays=[...new Set(rows.filter(r=>r.action==='Strong Buy').map(r=>String(r.day||r.timestamp||'').slice(0,10)).filter(Boolean))];
  return{actionableDays:days.length,strongDays:strongDays.length,persistent:strongDays.length>=1||days.length>=2};
}

export function portfolioRiskSnapshot(rows=[]){
  const swingRows=rows.filter(r=>!isCash(r)&&!isCore(r)),coreRows=rows.filter(r=>!isCash(r)&&isCore(r));
  const swingCapital=swingRows.reduce((a,r)=>a+value(r),0),coreCapital=coreRows.reduce((a,r)=>a+value(r),0),cash=rows.filter(isCash).reduce((a,r)=>a+value(r),0);
  const factors={};
  for(const r of swingRows){const f=factorFor(r);factors[f]=(factors[f]||0)+value(r);}
  const factorPct=Object.fromEntries(Object.entries(factors).map(([k,v])=>[k,swingCapital?v/swingCapital:0]));
  const positions=Object.fromEntries(swingRows.map(r=>[symbol(r),{value:value(r),pctSwing:swingCapital?value(r)/swingCapital:0,factor:factorFor(r)}]));
  const concentrations=Object.entries(factorPct).filter(([,p])=>p>.35).sort((a,b)=>b[1]-a[1]);
  return{swingCapital,coreCapital,cash,factors,factorPct,positions,concentrations};
}

export function capitalAllowance({target={},action='Buy',requested=0,risk={}}={}){
  const ask=Math.max(0,n(requested)),swingCapital=n(risk.swingCapital),current=n(risk.positions?.[symbol(target)]?.value),factor=factorFor(target),factorValue=n(risk.factors?.[factor]);
  if(!(ask>0&&swingCapital>0))return{amount:0,blocked:true,reason:'No active Swing capital is available for sizing.'};
  const maxPositionPct=action==='Strong Buy'?.12:.08,maxFactorPct=action==='Strong Buy'?.35:.30;
  const positionRoom=Math.max(0,swingCapital*maxPositionPct-current),factorRoom=Math.max(0,swingCapital*maxFactorPct-factorValue),amount=Math.min(ask,positionRoom,factorRoom);
  const blocked=amount<Math.min(ask,750);
  let reason='Within portfolio risk budget.';
  if(positionRoom<=0)reason=`${symbol(target)} is already at or above its Swing position-risk ceiling.`;
  else if(factorRoom<=0)reason=`${factor} exposure is already at or above the portfolio factor ceiling.`;
  else if(amount<ask)reason='Capital was reduced by the portfolio position/factor risk budget.';
  return{amount,blocked,reason,maxPositionPct,maxFactorPct,factor,projectedPositionPct:(current+amount)/swingCapital,projectedFactorPct:(factorValue+amount)/swingCapital};
}

export function capitalSignalEligible({target={},action='Buy',persistence={}}={}){
  if(action==='Strong Buy')return{pass:true,reason:'Strong Buy may deploy immediately after hard qualification.'};
  if(action!=='Buy')return{pass:false,reason:'Not an actionable Buy.'};
  if(persistence?.persistent)return{pass:true,reason:'Buy has persisted across independent daily observations.'};
  return{pass:false,reason:'Hold cash — Buy quality is not yet persistent enough to fund.'};
}

export function rotationGate({source={},target={},gap=0,persistence={},risk={},requested=0}={}){
  const action=String(target?.finalDecision?.action||target?.recommendation?.displayLabel||''),signal=capitalSignalEligible({target,action,persistence});
  if(!signal.pass)return{pass:false,reason:signal.reason};
  const daysHeld=daysSince(source?.openedAt),daysFromTrade=daysSince(source?.lastTradeAt||source?.openedAt),sameFactor=factorFor(source)===factorFor(target);
  const hurdle=daysFromTrade!==null&&daysFromTrade<10?55:daysHeld!==null&&daysHeld<25?50:45;
  if(n(gap)<hurdle)return{pass:false,reason:`Rotation edge ${Math.round(n(gap))} is below the ${hurdle}-point turnover-adjusted hurdle.`};
  if(sameFactor&&n(gap)<55)return{pass:false,reason:'Same-factor rotation requires an exceptional edge; do not churn between highly correlated exposures.'};
  const allowance=capitalAllowance({target,action,requested,risk});
  if(allowance.blocked)return{pass:false,reason:allowance.reason,allowance};
  return{pass:true,reason:'Rotation clears persistence, turnover, and concentration hurdles.',allowance,hurdle,sameFactor};
}

export function swingTimeReview(s={}){
  const held=daysSince(s?.openedAt),sinceTrade=daysSince(s?.lastTradeAt||s?.openedAt),pnl=n(s?.gainLossPct),e=s?.recommendation?.expertDecision||s?.expertDecision||{},m=e?.metrics||{},trade=n(e?.tradeSetupScore??s?.tradeSetupScore,50),technical=n(m?.technical??s?.technicalScore,50),momentum=n(m?.momentum??s?.momentumScore,50),leadership=n(m?.leadership??s?.relativeStrengthScore,50);
  if(held===null)return{stage:'Unknown',held:null,sinceTrade,review:false,reason:'Holding-period clock is not available for this legacy position.'};
  if(held<10)return{stage:'Setup',held,sinceTrade,review:false,reason:'Initial setup window; avoid judging normal volatility too quickly.'};
  if(held<25)return{stage:'Proof',held,sinceTrade,review:pnl<0&&trade<55,reason:'The swing should begin proving relative strength and setup quality.'};
  if(held<45)return{stage:'Re-underwrite',held,sinceTrade,review:pnl<=0&&(trade<58||technical<55||momentum<52),reason:'Flat/losing capital must re-earn its place as the holding period matures.'};
  if(held<60)return{stage:'Opportunity Cost',held,sinceTrade,review:pnl<=5&&(trade<60||leadership<55),reason:'Opportunity cost is now material; continuation requires affirmative evidence.'};
  return{stage:'Long Swing Review',held,sinceTrade,review:pnl<=8||trade<60,reason:'A 60+ day Swing must be explicitly re-underwritten rather than held by inertia.'};
}
