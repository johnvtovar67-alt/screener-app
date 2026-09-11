import {C1_FROZEN_OPTIONS} from './c1FrozenOptions';
import {isUsMarketSessionDay,marketSessionDistance} from './marketSession';
import {portfolioCompositionSignature} from './portfolioGovernor';

export const C1_ACCOUNT_SEED_CONTRACT='c1-prospective-account-seed-v1';
const clone=value=>JSON.parse(JSON.stringify(value));
const finite=(value,min=0)=>typeof value==='number'&&Number.isFinite(value)&&value>=min;
const day=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value&&isUsMarketSessionDay(value);

// The actual account is normalized into the original $100,000 model units.
// Existing positions are opening balances, not synthetic C1 purchases.
export function validateC1AccountSeed(seed,config,sessions) {
  if(seed==null)return null;
  const frozen=C1_FROZEN_OPTIONS[seed.sleeve];
  if(seed.contract!==C1_ACCOUNT_SEED_CONTRACT||!frozen||seed.prospectiveAdoptionConfirmed!==true)throw new Error('Explicit prospective account adoption required');
  for(const key of Object.keys(frozen)) {
    if(['startDate','endDate','liquidateAtEnd'].includes(key))continue;
    if(JSON.stringify(config[key])!==JSON.stringify(frozen[key]))throw new Error('Account initialization cannot change frozen C1 options: '+key);
  }
  if(config.liquidateAtEnd!==false||config.startDate!==seed.asOfSession||!day(seed.asOfSession))throw new Error('Account initialization requires its completed-close session and no artificial liquidation');
  const baseline=sessions.find(s=>s.date===seed.asOfSession);
  if(!baseline||!Array.isArray(baseline.prices)||!Array.isArray(baseline.universeSymbols))throw new Error('Dated account opening inputs required');
  if(!finite(seed.cash)||!finite(seed.highWater,100000)||!Number.isInteger(seed.remainingCooldownSessions)||seed.remainingCooldownSessions<0||seed.remainingCooldownSessions>frozen.portfolioDrawdownCooldownSessions)throw new Error('Invalid retained account cash, peak or cooldown');
  if(seed.resumeAtNextOpen!=null&&(typeof seed.resumeAtNextOpen!=='boolean'||(seed.resumeAtNextOpen&&seed.remainingCooldownSessions!==0)))throw new Error('Invalid cooldown resumption state');
  if(!Array.isArray(seed.positions)||seed.positions.length>frozen.maxPositions)throw new Error('Account adoption exceeds the frozen sleeve position count');
  const symbols=new Set(),prices=new Map(baseline.prices.map(p=>[p.symbol,p]));
  let equity=seed.cash;
  for(const p of seed.positions) {
    if(typeof p.symbol!=='string'||!/^[A-Z][A-Z0-9.-]{0,14}$/.test(p.symbol)||symbols.has(p.symbol)||p.symbol==='MSTR'||p.role!=='Swing')throw new Error('Invalid or excluded opening holding');
    symbols.add(p.symbol);
    if(!finite(p.shares,Number.MIN_VALUE)||!finite(p.entryPrice,Number.MIN_VALUE)||!day(p.openedAt)||p.openedAt>seed.asOfSession)throw new Error('Opening shares, cost and original holding date required');
    if(typeof p.sector!=='string'||!p.sector.trim()||typeof p.issuer!=='string'||!p.issuer.trim())throw new Error('Opening holding sector and issuer required');
    if(p.stock&&(p.stock.symbol!==p.symbol||p.stock.sector!==p.sector))throw new Error('Opening holding classification does not match its source signal');
    if(!baseline.universeSymbols.includes(p.symbol))throw new Error('An opening holding is outside the dated C1 universe: '+p.symbol);
    const price=prices.get(p.symbol)?.close;
    if(!finite(price,Number.MIN_VALUE))throw new Error('Opening valuation missing: '+p.symbol);
    equity+=p.shares*price;
  }
  if(Math.abs(equity-config.initialCapital)>.00001)throw new Error('Opening positions and cash do not reconcile to normalized account equity');
  return clone(seed);
}

export function createC1ProspectiveSeeds({portfolio,baseline,capitalRecord,adoptionConfirmed=false}={}) {
  if(adoptionConfirmed!==true||!Array.isArray(portfolio)||!portfolio.length||!baseline||!day(baseline.date))throw new Error('Confirmed current account and completed market session required');
  const cashSymbols=new Set(['CASH','SWVXX','VMFXX','SPAXX','FDRXX','MMF']);
  const seen=new Set();let cash=0,cashDeclared=false;
  for(const p of portfolio){
    if(typeof p.symbol!=='string'||seen.has(p.symbol)||!finite(p.shares)||!['Core','Swing'].includes(p.role))throw new Error('Invalid or duplicate account balance');
    seen.add(p.symbol);
    if(p.symbol==='MSTR'&&p.role!=='Core')throw new Error('MSTR must remain Core');
    if(cashSymbols.has(p.symbol)&&p.role==='Swing'){if(Number(p.avgCost||1)!==1)throw new Error('Cash balance must use dollar units');cash+=p.shares;cashDeclared=true;}
  }
  if(!cashDeclared)throw new Error('Explicit current cash balance required');
  if(capitalRecord?.version!==2||capitalRecord.reconciliationRequired===true||capitalRecord.portfolioSignature!==portfolioCompositionSignature(portfolio)||!finite(capitalRecord.highWater))throw new Error('Reconcile the retained capital record to these account balances first');
  if(capitalRecord.triggerDay!=null&&(!day(capitalRecord.triggerDay)||capitalRecord.triggerDay>baseline.date))throw new Error('Invalid retained breaker date');
  const prices=new Map((baseline.prices||[]).map(p=>[p.symbol,p]));
  const signals=new Map([...(baseline.positionSignals||[]),...(baseline.signals||[])].map(p=>[p.symbol,p]));
  const active=portfolio.filter(p=>p.role==='Swing'&&!cashSymbols.has(p.symbol)&&p.shares>0);
  let equity=cash;
  for(const p of active){const row=prices.get(p.symbol);if(row?.adjusted!==true||!finite(row.close,Number.MIN_VALUE))throw new Error('Current adjusted account valuation required: '+p.symbol);equity+=p.shares*row.close;}
  if(!finite(equity,Number.MIN_VALUE))throw new Error('Positive Swing account equity required');
  const weights={base:.25,cooldown15:.5,sector40:.25},ids=Object.keys(weights),seeds={};
  const allocations=Object.fromEntries(ids.map(id=>[id,[]]));
  for(const p of active){
    if(!Number.isSafeInteger(p.shares))throw new Error('Whole-share account positions are required for this execution adapter');
    const signal=signals.get(p.symbol),openedAt=String(p.openedAt||'').slice(0,10);
    if(!signal||typeof signal.sector!=='string'||!signal.sector.trim()||!finite(p.avgCost,Number.MIN_VALUE)||!day(openedAt))throw new Error('Original entry date, basis and current classification required: '+p.symbol);
    const quantities=ids.map(id=>Math.floor(p.shares*weights[id]));
    const remainder=ids.map((id,index)=>({index,fraction:p.shares*weights[id]-quantities[index]})).sort((a,b)=>b.fraction-a.fraction||a.index-b.index);
    for(let n=0,left=p.shares-quantities.reduce((a,b)=>a+b,0);n<left;n++)quantities[remainder[n].index]++;
    ids.forEach((id,index)=>{if(quantities[index])allocations[id].push({symbol:p.symbol,role:'Swing',shares:quantities[index],entryPrice:p.avgCost,openedAt,
      sector:signal.sector,issuer:signal.issuer||String(signal.cik||signal.cikNumber||p.symbol),stock:clone(signal)});});
  }
  for(const [sleeve,weight] of Object.entries(weights)) {
    const actualDollarsPerModelDollar=equity*weight/100000;
    const invested=allocations[sleeve].reduce((sum,p)=>sum+p.shares*prices.get(p.symbol).close,0);
    const sleeveCash=equity*weight-invested;
    if(sleeveCash<-.000001)throw new Error('Existing whole shares cannot fit the weighted sleeve budgets without a separate migration trade');
    const positions=allocations[sleeve].map(p=>({...p,shares:p.shares/actualDollarsPerModelDollar}));
    const elapsed=capitalRecord.triggerDay?marketSessionDistance(capitalRecord.triggerDay,baseline.date):null;
    const remaining=elapsed==null?0:Math.max(0,C1_FROZEN_OPTIONS[sleeve].portfolioDrawdownCooldownSessions-elapsed);
    const seed={contract:C1_ACCOUNT_SEED_CONTRACT,sleeve,asOfSession:baseline.date,prospectiveAdoptionConfirmed:true,
      cash:Math.max(0,sleeveCash)/actualDollarsPerModelDollar,highWater:Math.max(100000,capitalRecord.highWater*weight/actualDollarsPerModelDollar),
      remainingCooldownSessions:remaining,resumeAtNextOpen:elapsed!=null&&elapsed>=C1_FROZEN_OPTIONS[sleeve].portfolioDrawdownCooldownSessions,positions};
    seeds[sleeve]=validateC1AccountSeed(seed,{...C1_FROZEN_OPTIONS[sleeve],startDate:baseline.date,endDate:baseline.date,liquidateAtEnd:false},[baseline]);
    seeds[sleeve].actualDollarsPerModelDollar=actualDollarsPerModelDollar;
  }
  return {contract:'c1-prospective-account-adoption-v1',sourceSessionDate:baseline.date,
    actualSwingEquity:equity,actualCash:cash,capitalSignature:capitalRecord.portfolioSignature,seeds,
    allocationPolicy:'Prospectively assign current Swing holdings in whole shares by largest remainder and balance sleeve capital to 25%/50%/25% with cash; retain original holding dates, cost basis and existing capital-loss limits.',
    historicalSleeveOwnershipInferred:false,executable:false,orders:[]};
}

export function c1SeedPosition(position,sessionIndex,asOfSession,close) {
  const held=marketSessionDistance(position.openedAt,asOfSession);
  if(!Number.isInteger(held)||held<0)throw new Error('Original holding period unavailable');
  const stop=position.entryPrice*.86;
  return {...clone(position),initialShares:position.shares,entryCommission:0,realizedPnl:0,
    positionId:'adopted:'+position.symbol,enteredAt:position.openedAt,
    enteredSessionIndex:sessionIndex-held,lastSessionIndex:sessionIndex,lastPrice:close,
    highWatermark:Math.max(position.entryPrice,close),stopPrice:stop,initialStopPrice:stop,
    stopKind:'initial-stop',factor:position.factor||position.sector,stock:position.stock||null,
    maxPrice:Math.max(position.entryPrice,close),minPrice:Math.min(position.entryPrice,close),
    winnerHistory:{originalShares:position.shares,trimCount:0,trimmedShares:0},
    ownershipSource:'prospective-opening-balance'};
}
