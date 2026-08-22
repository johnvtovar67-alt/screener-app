const GROUPS={
  financials:{name:'Financials',proxy:'XLF',members:['JPM','BAC','GS','MS','WFC','C','AXP','SCHW']},
  banks:{name:'Regional Banks',proxy:'KRE',members:['CFG','KEY','HBAN','RF','ZION','CMA','MTB','FITB']},
  insurance:{name:'Insurance',proxy:'KIE',members:['PGR','CB','AIG','MET','PRU','ALL','TRV','BRO']},
  energy:{name:'Energy',proxy:'XLE',members:['XOM','CVX','COP','EOG','SLB','MPC','VLO','OKE']},
  oil_services:{name:'Oil Services',proxy:'OIH',members:['SLB','HAL','BKR','NOV','FTI','CHX']},
  materials:{name:'Materials',proxy:'XLB',members:['LIN','SHW','FCX','NEM','NUE','DOW','DD','APD']},
  metals_miners:{name:'Metals & Miners',proxy:'XME',members:['FCX','NEM','SCCO','NUE','STLD','CLF','AA','CMC']},
  homebuilders:{name:'Homebuilders',proxy:'XHB',members:['DHI','LEN','PHM','TOL','NVR','KBH','MTH','TMHC']},
  transports:{name:'Transports',proxy:'IYT',members:['UNP','CSX','NSC','UPS','FDX','DAL','UAL','JBHT']},
  healthcare:{name:'Healthcare',proxy:'XLV',members:['LLY','UNH','JNJ','ABBV','MRK','TMO','ABT','BSX']},
  medtech:{name:'Medical Devices',proxy:'IHI',members:['BSX','SYK','MDT','EW','DXCM','PODD','RMD','ALGN']},
  staples:{name:'Consumer Staples',proxy:'XLP',members:['WMT','COST','PG','KO','PEP','PM','MO','CL']},
  discretionary:{name:'Consumer Discretionary',proxy:'XLY',members:['TSLA','HD','LOW','MCD','BKNG','TJX','ROST','NKE']},
  retail:{name:'Retail',proxy:'XRT',members:['WMT','COST','TGT','TJX','ROST','BBY','DKS','ULTA']},
  real_estate:{name:'Real Estate',proxy:'XLRE',members:['PLD','AMT','EQIX','WELL','SPG','PSA','O','DLR']},
  utilities:{name:'Utilities',proxy:'XLU',members:['NEE','SO','DUK','AEP','SRE','EXC','XEL','ED']},
  industrials:{name:'Industrials',proxy:'XLI',members:['GE','CAT','HON','RTX','UNP','DE','UPS','LMT']}
};
const n=(v,f=0)=>{const x=Number(v);return Number.isFinite(x)?x:f};
export const marketCycleProxySymbols=()=>Object.values(GROUPS).map(g=>g.proxy);
export function scoreMarketCycleProxy(q={}){
  const p=n(q.price),ma50=n(q.priceAvg50??q.fiftyDayAverage),ma200=n(q.priceAvg200??q.twoHundredDayAverage),day=n(q.dayChangePct??q.changesPercentage);
  const above50=p>0&&ma50>0?(p/ma50-1)*100:0,above200=p>0&&ma200>0?(p/ma200-1)*100:0;
  let score=50+Math.max(-12,Math.min(12,above50))*1.4+Math.max(-20,Math.min(20,above200))*.7+Math.max(-4,Math.min(4,day))*1.5;
  score=Math.max(0,Math.min(100,score));
  const state=score>=70&&above50>1&&above200>3?'Leading':score>=60&&above50>0?'Emerging':score>=48?'Neutral':score>=38?'Fading':'Broken';
  return{score:Math.round(score),state,above50Pct:above50,above200Pct:above200};
}
export function discoverMarketCycles(quotes=[]){
  const by=new Map((quotes||[]).map(q=>[String(q.symbol||'').toUpperCase(),q]));
  const groups=Object.entries(GROUPS).map(([key,g])=>{const q=by.get(g.proxy)||{},s=scoreMarketCycleProxy(q);return{key,name:g.name,proxy:g.proxy,members:g.members,...s};}).sort((a,b)=>b.score-a.score);
  const selected=groups.filter(g=>['Leading','Emerging'].includes(g.state)).slice(0,4);
  return{groups,selected,dynamicSymbols:[...new Set(selected.flatMap(g=>g.members))]};
}
