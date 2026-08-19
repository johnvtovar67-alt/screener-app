import {useEffect,useMemo,useState} from "react";
import {portfolioDecision} from "../lib/expertDecision";

const KEY="stock_screener_portfolio_v1";
const CASH=["CASH","SWVXX","VMFXX","SPAXX","FDRXX","MMF"];
const ROLES=["Core","Swing"];
const THEMES=[
  {key:"ai_compute",name:"AI Compute & Platforms"},{key:"ai_networking",name:"AI Networking"},
  {key:"cybersecurity",name:"Cybersecurity"},{key:"power",name:"Power & Electrification"},
  {key:"digital_infra",name:"Digital Infrastructure"},{key:"nuclear",name:"Nuclear / Baseload"},
  {key:"btc",name:"BTC / Digital Assets"},{key:"defense",name:"Defense & National Security"},
  {key:"space",name:"Space & Satellites"},{key:"drones",name:"Autonomy & Drones"},
  {key:"robotics",name:"Robotics & Automation"},{key:"industrial_software",name:"Industrial Software"},
  {key:"quantum",name:"Quantum Computing"},{key:"biotech",name:"Platform Biotech"}
];

const money=v=>Number.isFinite(+v)?(+v).toLocaleString("en-US",{style:"currency",currency:"USD",maximumFractionDigits:2}):"—";
const pct=v=>Number.isFinite(+v)?`${+v>=0?"+":""}${(+v).toFixed(2)}%`:"—";
const sym=s=>String(s?.symbol??s?.ticker??"").toUpperCase();
const name=s=>s?.name??s?.companyName??sym(s);
const price=s=>+(s?.price??s?.currentPrice??s?.lastPrice);
const chg=s=>+(s?.dayChangePct??s?.changesPercentage??s?.changePercent);
const rec=s=>s?.recommendation&&typeof s.recommendation==="object"?s.recommendation:{};
const theme=s=>s?.primaryTheme||s?.theme||"Other";
const plan=s=>s?.riskPlan??rec(s)?.riskPlan??{};
const event=s=>s?.eventRisk||s?.preTradeCheck||rec(s)?.eventRisk||rec(s)?.preTradeCheck||null;
const entry=s=>String(rec(s)?.entryQualityLabel??rec(s)?.gateSummary?.entryQualityLabel??s?.entryQualityLabel??s?.technicalSnapshot?.entryQualityLabel??"Unknown");
const role=(s,r)=>r==="Core"?"Core":"Swing";

function fallbackDecision(s){
  const r=rec(s),a=String(r.displayLabel||r.label||s?.action||"Avoid");
  const action=a==="Strong Buy"?"Strong Buy":a==="Buy"?"Buy":a==="Watch"?"Watch":"Avoid";
  return {action,timing:r.decisionTiming||(["Strong Buy","Buy"].includes(action)?"Now":"Wait"),size:r.positionSize||(action==="Strong Buy"?"Full":action==="Buy"?"Partial":"None"),reason:r.decisionWhy||"Wait for a better setup.",priority:action==="Strong Buy"?"Top Tier":action==="Buy"?"Actionable":action==="Watch"?"Watch":"Avoid",planText:"",nextTrigger:"",relativeCapitalScore:0};
}
const fd=s=>s?.finalDecision||fallbackDecision(s);
const act=s=>CASH.includes(sym(s))?"Cash":fd(s).action;
const cls=a=>["Strong Buy","Buy","Add"].includes(a)?"green":["Trim","Rotate"].includes(a)?"orange":["Watch","Hold"].includes(a)?"yellow":a==="Cash"?"gray":"red";

function riskText(s){
  const d=fd(s);if(d.planText)return d.planText;
  const p=plan(s),inv=+p.invalidationPrice,trim=+p.firstTrimPrice,add=+p.addAbovePrice;
  if(["Strong Buy","Buy"].includes(d.action))return `${Number.isFinite(inv)?`Review below ${money(inv)}`:"Manage risk"}${Number.isFinite(trim)?` • Profit review ${money(trim)}`:""}`;
  return Number.isFinite(add)?`Trigger above ${money(add)}`:"Wait for confirmation";
}
function rank(a,b){
  const t={"Strong Buy":3,Buy:2,Watch:1,Avoid:0,Cash:0},d1=fd(a),d2=fd(b),ar=t[d2.action]-t[d1.action];
  if(ar)return ar;return (+d2.relativeCapitalScore||0)-(+d1.relativeCapitalScore||0);
}
function capitalScore(s){return +(fd(s)?.relativeCapitalScore??rec(s)?.capitalScore??s?.capitalScore??rec(s)?.expertDecision?.capitalScore??s?.expertDecision?.capitalScore??0)||0;}
function targetWeight(action,size){if(action==="Strong Buy")return .12;if(action==="Buy")return .075;if(!action&&size==="Full")return .12;if(!action&&size==="Partial")return .075;return 0;}
function rotationStrength(gap){const g=+gap||0;if(g>=40)return{label:"Very Strong Rotation Edge",tone:"veryStrong"};if(g>=30)return{label:"Strong Rotation Edge",tone:"strong"};return{label:"Meaningful Rotation Edge",tone:"meaningful"};}

function rotationTargetEligible(s){
  const d=fd(s),a=d.action,e=rec(s)?.expertDecision||s?.expertDecision||{},m=e?.metrics||{};
  const er=event(s);if(er?.blockNewCapital||er?.manualCheckRequired)return false;
  if(a==="Strong Buy")return true;
  if(a!=="Buy")return false;
  const peer=+d.relativeCapitalScore||capitalScore(s),cutoff=+d.relativeCapitalCutoff||0;
  return peer>=cutoff+1.5&&(+e.capitalScore||0)>=74&&(+e.tradeSetupScore||0)>=78&&(+m.technical||0)>=62&&(+m.leadership||0)>=65&&(+m.momentum||0)>=56&&(+m.entry||0)>=56&&(+m.risk||100)<=72;
}

function Card({s,decision=null}){
  const d=decision||fd(s),a=d.action,e=event(s);
  return <article className={`idea ${cls(a)}`}>
    <div className="top"><div><h3>{sym(s)}</h3><p>{name(s)}</p></div><b className={`pill ${cls(a)}`}>{a}</b></div>
    <div className="badges"><span className="themeTag">{theme(s)}</span><span className="entryTag">Entry: {entry(s)}</span>{e&&<span className="eventTag">{e.label}</span>}</div>
    <div className="price"><b>{money(price(s))}</b><b className={chg(s)>=0?"pos":"neg"}>{pct(chg(s))}</b></div>
    <p className="why">{d.reason}</p>
    <div className="decision"><div><small>Timing</small><b>{d.timing}</b></div><div><small>Size</small><b>{d.size}</b></div><div><small>Priority</small><b>{d.priority}</b></div></div>
    <div className="plan"><small>Plan</small><b>{riskText(s)}</b></div>
  </article>;
}
function OnDeck({rows}){return <section className="card"><h2>🟡 On Deck</h2><p className="sub">Top 10 highest-priority near-Buy candidates. Qualified Watches rank first; the broader research universe remains behind the scenes.</p><div className="scroll"><table><thead><tr><th>Symbol</th><th>Theme</th><th>Price</th><th>Why Wait</th><th>Next Trigger</th></tr></thead><tbody>{rows.map(s=><tr key={sym(s)}><td><b>{sym(s)}</b></td><td>{theme(s)}</td><td>{money(price(s))}</td><td>{fd(s).reason}</td><td>{fd(s).nextTrigger||riskText(s)}</td></tr>)}</tbody></table></div></section>}
function calc(p,live){const sh=+p.shares||0,c=+p.avgCost||0,pr=+live||0,v=sh*pr,cb=sh*c,g=v-cb;return{shares:sh,avgCost:c,price:pr,value:v,costBasis:cb,gainLoss:g,gainLossPct:cb?g/cb*100:0};}
function extract(d){for(const x of[d?.stock,d?.result,d?.data,d])if(x&&typeof x==="object"&&!Array.isArray(x)&&(sym(x)||Number.isFinite(price(x))))return x;return null;}

export default function Home(){
  const[tab,setTab]=useState("opportunities"),[stocks,setStocks]=useState([]),[themeStocks,setThemeStocks]=useState([]),[selectedTheme,setSelectedTheme]=useState("ai_compute");
  const[portfolio,setPortfolio]=useState([]),[results,setResults]=useState([]),[buyQueue,setBuyQueue]=useState([]);
  const[loading,setLoading]=useState(false),[reloading,setReloading]=useState(false),[err,setErr]=useState("");
  const[ns,setNs]=useState(""),[nsh,setNsh]=useState(""),[nc,setNc]=useState(""),[nr,setNr]=useState("Swing"),[symbol,setSymbol]=useState(""),[snap,setSnap]=useState(null),[lastUpdated,setLastUpdated]=useState(null);

  useEffect(()=>{try{const x=JSON.parse(localStorage.getItem(KEY)||"[]");if(Array.isArray(x)){const m=x.map(p=>({...p,role:role(p.symbol,p.role)}));setPortfolio(m);localStorage.setItem(KEY,JSON.stringify(m));}}catch{}load("opportunities");},[]);

  async function load(t){
    setReloading(true);setErr("");
    try{const r=await fetch(`/api/top5?theme=${encodeURIComponent(t)}`,{cache:"no-store"}),d=await r.json();if(!r.ok)throw new Error(d.detail||d.error);if(t==="opportunities"){setStocks(d.stocks||[]);}else setThemeStocks(d.stocks||[]);setLastUpdated(new Date());}
    catch(e){setErr(e.message);}finally{setReloading(false);}
  }
  async function fetchStock(s){const r=await fetch(`/api?symbol=${encodeURIComponent(s)}`,{cache:"no-store"}),d=await r.json();if(!r.ok)throw new Error(d.detail||d.error);const x=extract(d);if(!x)throw new Error(`No usable data for ${s}`);return x;}
  function save(x){setPortfolio(x);localStorage.setItem(KEY,JSON.stringify(x));}
  function add(){const p={symbol:ns.trim().toUpperCase(),shares:+nsh,avgCost:+nc,role:nr};if(!p.symbol||p.shares<=0)return;save([...portfolio.filter(x=>x.symbol!==p.symbol),p]);setNs("");setNsh("");setNc("");}
  function setRole(s,r){save(portfolio.map(p=>p.symbol===s?{...p,role:r}:p));}

  async function analyze(){
    setLoading(true);setErr("");const rows=[];let snapshot=[];
    try{
      try{const r=await fetch(`/api/top5?theme=opportunities`,{cache:"no-store"}),d=await r.json();if(r.ok&&Array.isArray(d.stocks)){snapshot=d.stocks;setStocks(snapshot);}}catch{}
      const bySymbol=new Map(snapshot.map(s=>[sym(s),s]));
      for(const p of portfolio){
        try{
          if(CASH.includes(p.symbol)){rows.push({...p,...calc(p,p.avgCost||1),role:role(p.symbol,p.role)});continue;}
          let s=bySymbol.get(p.symbol);if(!s)s=await fetchStock(p.symbol);
          rows.push({...s,...calc(p,price(s)),role:role(p.symbol,p.role)});
        }catch(e){rows.push({...p,error:e.message});}
      }
      const actionable=snapshot.filter(s=>["Strong Buy","Buy"].includes(act(s))).sort(rank);
      setBuyQueue(actionable);
      const rotationTargets=actionable.filter(rotationTargetEligible).sort(rank),best=rotationTargets[0]||null,bestScore=best?capitalScore(best):0,bestSymbol=best?sym(best):"";
      const total=rows.reduce((a,r)=>a+(+r.value||0),0);
      setResults(rows.map(r=>{const own=capitalScore(r),same=bestSymbol&&sym(r)===bestSymbol;return{...r,weightPct:total?(+r.value||0)/total*100:0,rotateTarget:same?"":bestSymbol,opportunityGap:same?0:Math.max(0,bestScore-own),rotationTargetEligible:Boolean(best&&!same)};}));
      setLastUpdated(new Date());
    }finally{setLoading(false);}
  }
  async function check(e){
    e.preventDefault();setErr("");const key=symbol.trim().toUpperCase();if(!key)return;
    try{
      let broad=[];try{const r=await fetch(`/api/top5?theme=opportunities`,{cache:"no-store"}),d=await r.json();if(r.ok&&Array.isArray(d.stocks)){broad=d.stocks;setStocks(broad);}}catch{}
      const authoritative=broad.find(s=>sym(s)===key);setSnap(authoritative||await fetchStock(key));setLastUpdated(new Date());
    }catch(e){setErr(e.message);}
  }
  async function handleReload(){if(tab==="portfolio")return analyze();return load(tab==="themes"?selectedTheme:"opportunities");}

  const portfolioValueForCards=useMemo(()=>results.length?results.reduce((a,r)=>a+(+r.value||0),0):portfolio.reduce((a,p)=>a+(+p.shares||0)*(+p.avgCost||0),0),[results,portfolio]);
  const resultForCards=useMemo(()=>new Map(results.map(r=>[sym(r),r])),[results]);
  function opportunityDecision(s){
    const d=fd(s);if(!["Strong Buy","Buy"].includes(d.action))return d;
    const owned=portfolio.find(p=>p.symbol===sym(s));if(!owned)return d;
    const targetPct=targetWeight(d.action,d.size),targetValue=portfolioValueForCards*targetPct,currentResult=resultForCards.get(sym(s)),currentValue=currentResult?+currentResult.value||0:(+owned.shares||0)*price(s),gap=Math.max(0,targetValue-currentValue),tolerance=Math.max(750,portfolioValueForCards*.005);
    if(gap<=tolerance)return{...d,action:"Hold",timing:"Hold",size:"At Target",priority:"At Target",reason:`${d.action}-quality setup, but your existing position is already within the target-allocation tolerance. No additional purchase is needed.`};
    return{...d,action:"Add",timing:"Now",priority:"Add to Position",reason:`${d.action}-quality setup and your existing position remains materially below its ${Math.round(targetPct*1000)/10}% target allocation.`};
  }

  const strong=useMemo(()=>stocks.filter(s=>act(s)==="Strong Buy").sort(rank),[stocks]);
  const buys=useMemo(()=>stocks.filter(s=>act(s)==="Buy").sort(rank),[stocks]);
  const deck=useMemo(()=>stocks.filter(s=>act(s)==="Watch").sort(rank).slice(0,10),[stocks]);
  const ta=useMemo(()=>themeStocks.filter(s=>["Strong Buy","Buy"].includes(act(s))).sort(rank),[themeStocks]);
  const td=useMemo(()=>themeStocks.filter(s=>act(s)==="Watch").sort(rank).slice(0,10),[themeStocks]);

  function rawPd(s){
    if(s.error)return{action:"Review",reason:s.error};if(CASH.includes(sym(s)))return{action:"Cash",reason:"Dry powder."};
    return portfolioDecision({stock:s,recommendation:rec(s),position:{role:s.role,gainLossPct:s.gainLossPct,weightPct:s.weightPct,opportunityGap:s.opportunityGap,rotateTarget:s.rotateTarget,rotationTargetEligible:s.rotationTargetEligible}});
  }

  const rawDecisions=results.map(s=>({s,d:rawPd(s)}));
  const portfolioValue=results.reduce((a,s)=>a+(+s.value||0),0);
  const portfolioCostBasis=results.reduce((a,s)=>a+(+s.costBasis||0),0);
  const portfolioGainLoss=portfolioValue-portfolioCostBasis;
  const portfolioGainLossPct=portfolioCostBasis?portfolioGainLoss/portfolioCostBasis*100:0;
  const minResidual=Math.max(1500,portfolioValue*.05),minFundingAction=Math.max(750,portfolioValue*.005);
  const resultBySymbol=new Map(results.map(s=>[sym(s),s]));
  const buyPlans=buyQueue.map((b,index)=>{const action=act(b),size=fd(b).size,targetPct=targetWeight(action,size),targetValue=portfolioValue*targetPct,existingValue=+resultBySymbol.get(sym(b))?.value||0;return{stock:b,symbol:sym(b),rank:index+1,score:capitalScore(b),action,size,targetPct,targetValue,existingValue,need:Math.max(0,targetValue-existingValue),funded:0,remainingNeed:0};}).filter(x=>x.targetValue>0);

  function executableBuy(bp,amount){const pr=price(bp?.stock);if(!(pr>0)||!(amount>0))return{shares:0,amount:0};const shares=Math.floor((amount+1e-6)/pr);return{shares,amount:shares*pr};}
  function wholeShareTrade(target,amount){const bp=buyPlans.find(x=>x.symbol===target);return executableBuy(bp,amount);}
  function tradeLabel(target,amount){const x=wholeShareTrade(target,amount);return x.shares>0?`${x.shares} ${x.shares===1?"share":"shares"} (${money(x.amount)}) → ${target}`:`${money(amount)} → ${target}`;}
  function makeTrimPlan(s){const v=+s.value||0,pr=price(s),shares=Math.floor(+s.shares||0);if(!(v>0&&pr>0&&shares>1))return null;const desired=Math.max(minFundingAction,v*.30),maxSell=Math.floor(Math.max(0,v-minResidual)/pr),sellShares=Math.min(shares-1,maxSell,Math.ceil(desired/pr));if(sellShares<=0)return null;const amount=sellShares*pr,residual=v-amount;if(amount<minFundingAction||residual<minResidual)return null;return{shares:sellShares,amount,residual,remainingShares:shares-sellShares};}

  const fundingPlan=[],usedRotationSymbols=new Set();
  const exitPools=rawDecisions.filter(x=>x.d.action==="Exit").map(x=>({symbol:sym(x.s),remaining:+x.s.value||0,sourceValue:+x.s.value||0}));
  const cashPools=rawDecisions.filter(x=>CASH.includes(sym(x.s))).map(x=>({symbol:sym(x.s),remaining:+x.s.value||0,sourceValue:+x.s.value||0}));

  for(const bp of buyPlans){
    let need=bp.need;
    if(need<=minFundingAction){bp.toleranceGap=need;bp.remainingNeed=0;bp.funded=0;continue;}
    for(const pool of exitPools){if(need<=minFundingAction)break;if(pool.remaining<=0)continue;const exec=executableBuy(bp,Math.min(pool.remaining,need));if(exec.amount<minFundingAction)continue;fundingPlan.push({symbol:pool.symbol,target:bp.symbol,kind:"Exit",amount:exec.amount,targetShares:exec.shares,sourceValue:pool.sourceValue,buyRank:bp.rank});pool.remaining-=exec.amount;need-=exec.amount;}
    for(const pool of cashPools){if(need<=minFundingAction)break;if(pool.remaining<=0)continue;const exec=executableBuy(bp,Math.min(pool.remaining,need));if(exec.amount<minFundingAction)continue;fundingPlan.push({symbol:pool.symbol,target:bp.symbol,kind:"Cash",amount:exec.amount,targetShares:exec.shares,sourceValue:pool.sourceValue,buyRank:bp.rank});pool.remaining-=exec.amount;need-=exec.amount;}
    if(need>minFundingAction&&rotationTargetEligible(bp.stock)){
      const candidates=rawDecisions.filter(x=>x.s.role==="Swing"&&!CASH.includes(sym(x.s))&&x.d.action!=="Exit"&&!usedRotationSymbols.has(sym(x.s))&&sym(x.s)!==bp.symbol).map(x=>{const gap=Math.max(0,bp.score-capitalScore(x.s));const decision=portfolioDecision({stock:x.s,recommendation:rec(x.s),position:{role:x.s.role,gainLossPct:x.s.gainLossPct,weightPct:x.s.weightPct,opportunityGap:gap,rotateTarget:bp.symbol,rotationTargetEligible:true}});return{...x,gap,decision};}).filter(x=>x.gap>=30&&x.decision.action==="Rotate").sort((a,b)=>b.gap-a.gap);
      for(const x of candidates){if(need<=minFundingAction)break;const srcPrice=price(x.s),srcShares=Math.floor(+x.s.shares||0),v=srcShares*srcPrice;if(!(srcPrice>0&&srcShares>0&&v>0))continue;let targetExec=executableBuy(bp,Math.min(v,need));if(targetExec.amount<minFundingAction)continue;let sellShares=Math.min(srcShares,Math.ceil((targetExec.amount-1e-6)/srcPrice)),saleProceeds=sellShares*srcPrice,residualShares=srcShares-sellShares,residualValue=residualShares*srcPrice,fullRotation=sellShares>=srcShares||(residualValue>0&&residualValue<minResidual);if(fullRotation){sellShares=srcShares;saleProceeds=v;residualShares=0;residualValue=0;targetExec=executableBuy(bp,Math.min(saleProceeds,need));if(targetExec.amount<minFundingAction)continue;}const residualCash=Math.max(0,saleProceeds-targetExec.amount);fundingPlan.push({symbol:sym(x.s),target:bp.symbol,kind:"Rotate",amount:targetExec.amount,targetShares:targetExec.shares,sourceValue:v,sourceSellShares:sellShares,sourceSaleProceeds:saleProceeds,sourceRemainingShares:residualShares,gap:x.gap,fullRotation,residualCash,buyRank:bp.rank});usedRotationSymbols.add(sym(x.s));need-=targetExec.amount;if(residualCash>0)cashPools.push({symbol:`${sym(x.s)} proceeds`,remaining:residualCash,sourceValue:residualCash});}
    }
    if(need<=minFundingAction){bp.toleranceGap=Math.max(0,need);need=0;}bp.remainingNeed=Math.max(0,need);bp.funded=Math.max(0,bp.need-bp.remainingNeed);
  }
  for(const pool of exitPools.filter(x=>x.remaining>1))fundingPlan.push({symbol:pool.symbol,target:"Cash",kind:"Exit Cash",amount:pool.remaining,sourceValue:pool.sourceValue,buyRank:999});
  const fundedRotationSymbols=new Set(fundingPlan.filter(x=>x.kind==="Rotate").map(x=>x.symbol));
  const fundingBySymbol=new Map(),fundingByTarget=new Map();
  for(const f of fundingPlan){if(!fundingBySymbol.has(f.symbol))fundingBySymbol.set(f.symbol,[]);fundingBySymbol.get(f.symbol).push(f);if(f.target!=="Cash"){if(!fundingByTarget.has(f.target))fundingByTarget.set(f.target,[]);fundingByTarget.get(f.target).push(f);}}
  const trimPlans=new Map();for(const x of rawDecisions.filter(x=>x.d.action==="Trim")){const t=makeTrimPlan(x.s);if(t)trimPlans.set(sym(x.s),t);}
  const actionGroups=[];
  for(const[source,items]of fundingBySymbol.entries()){const exitItems=items.filter(x=>x.kind==="Exit"),exitCash=items.filter(x=>x.kind==="Exit Cash").reduce((a,x)=>a+x.amount,0),cashItems=items.filter(x=>x.kind==="Cash"),rotateItems=items.filter(x=>x.kind==="Rotate");if(exitItems.length||exitCash>0)actionGroups.push({source,type:"Exit",items:exitItems,cash:exitCash});if(cashItems.length)actionGroups.push({source,type:"Cash",items:cashItems,cash:0});for(const r of rotateItems)actionGroups.push({source,type:"Rotate",items:[r],cash:r.residualCash||0,gap:r.gap,fullRotation:r.fullRotation,sourceSellShares:r.sourceSellShares,sourceSaleProceeds:r.sourceSaleProceeds,sourceRemainingShares:r.sourceRemainingShares});}
  for(const[source,trim]of trimPlans.entries())actionGroups.push({source,type:"Trim",items:[],trim});
  function fundedFor(target){return(fundingByTarget.get(target)||[]).reduce((a,x)=>a+x.amount,0);}
  function pd(s){const base=rawPd(s),bp=buyPlans.find(x=>x.symbol===sym(s));if(base.action==="Add"){if(!bp)return{...base,action:"Hold",reason:"The authoritative broad screen does not currently include this holding as an actionable fresh-capital Buy."};if(bp.need<=minFundingAction)return{...base,action:"Hold",reason:"The setup remains attractive, but the existing position is already within the target-allocation tolerance, so no additional trade is needed."};if(fundedFor(sym(s))<minFundingAction)return{...base,action:"Hold",reason:"The setup qualifies for additional capital, but there is no meaningful executable funding action available now. Hold rather than create an unfunded recommendation."};}if(base.action==="Trim"&&!trimPlans.has(sym(s)))return{...base,action:"Hold",reason:"This winner is stretched, but a partial sale would be too small to matter or would leave an immaterial residual position. Hold rather than create a nuisance trim."};if(base.action==="Rotate"&&!fundedRotationSymbols.has(sym(s)))return{...base,action:"Hold",reason:"This holding can be a rotation candidate, but no sale is required in the current executable funding plan."};return base;}
  function next(s,d){if(CASH.includes(sym(s)))return"Available for deployment.";const p=plan(s),inv=+p.invalidationPrice,fs=fundingBySymbol.get(sym(s))||[];if(d.action==="Add"){const amt=fundedFor(sym(s));return `Add ${tradeLabel(sym(s),amt)}${Number.isFinite(inv)?`; review below ${money(inv)}`:""}.`;}if(d.action==="Rotate"&&fs.length){const f=fs.find(x=>x.kind==="Rotate")||fs[0];if(f.fullRotation)return`Sell the full position; ${tradeLabel(f.target,f.amount)}${f.residualCash>1?`; keep ${money(f.residualCash)} in cash`:""}.`;return`Sell ${f.sourceSellShares} shares (${money(f.sourceSaleProceeds)}); ${tradeLabel(f.target,f.amount)}; keep ${f.sourceRemainingShares} shares${f.residualCash>1?` and ${money(f.residualCash)} cash`:""}.`;}if(d.action==="Exit"){const alloc=fs.filter(x=>x.kind==="Exit"),toCash=fs.filter(x=>x.kind==="Exit Cash").reduce((a,x)=>a+x.amount,0);if(alloc.length){const parts=alloc.map(x=>tradeLabel(x.target,x.amount)).join(", ");return`Exit; redeploy ${parts}${toCash>1?`; leave ${money(toCash)} in cash`:""}.`;}return"Exit to cash; no qualifying Buy needs the proceeds.";}if(d.action==="Trim"){const t=trimPlans.get(sym(s));return t?`Bank profits: sell ${t.shares} shares (${money(t.amount)}); keep ${t.remainingShares} shares (${money(t.residual)}).`:"Hold; no nuisance trim is warranted.";}if(d.action==="Hold"&&String(d.reason||"").includes("no meaningful executable funding action available"))return"Hold for now; add if meaningful cash becomes available or a clearly superior rotation funds the position.";return"Hold; no new capital unless the authoritative setup strengthens.";}

  function PortfolioRow({s,mobile=false}){const d=pd(s),label=`${s.role} · ${(+s.weightPct||0).toFixed(1)}% of portfolio · ${theme(s)}`;if(mobile)return <article className="portfolioItem"><div className="portfolioHead"><div><h3>{sym(s)}</h3><span>{label}</span></div><b className={`pill ${cls(d.action)}`}>{d.action}</b></div><div className="mobileField"><small>Why</small><p>{d.reason}</p></div><div className="mobileField"><small>Next Move</small><p>{next(s,d)}</p></div><div className="mobileNumbers"><div><small>Price</small><b>{money(price(s))}</b></div><div><small>Gain / Loss</small><b className={s.gainLoss>=0?"pos":"neg"}>{money(s.gainLoss)} / {pct(s.gainLossPct)}</b></div></div></article>;return <tr><td><b>{sym(s)}</b><div>{label}</div></td><td><b className={`pill ${cls(d.action)}`}>{d.action}</b></td><td>{d.reason}</td><td>{next(s,d)}</td><td>{money(price(s))}</td><td className={s.gainLoss>=0?"pos":"neg"}>{money(s.gainLoss)} / {pct(s.gainLossPct)}</td></tr>;}

  const busy=reloading||loading;
  return <main>
    <header><div><h1>🧠 Investment Operating System</h1><p>Expert analysis underneath. One authoritative decision on top.</p>{lastUpdated&&<small className="updated">Last refreshed {lastUpdated.toLocaleTimeString([], {hour:"numeric",minute:"2-digit",second:"2-digit"})}</small>}</div><button disabled={busy} onClick={handleReload}>{busy?"Reloading...":"Reload"}</button></header>
    <nav>{["opportunities","portfolio","themes","single"].map(x=><button className={tab==x?"active":""} onClick={()=>setTab(x)} key={x}>{x==="portfolio"?"My Portfolio":x[0].toUpperCase()+x.slice(1)}</button>)}</nav>
    {err&&<p className="error">{err}</p>}
    {tab==="opportunities"&&<><section className="card"><h2>🔥 Opportunities</h2><p className="sub">Absolute qualification determines eligibility. Relative capital ranking determines which qualified setups deserve money now. Owned positions are reconciled to your portfolio target before the card tells you to Buy, Add, or Hold.</p>{[["Strong Buy",strong],["Buy",buys]].map(([h,rows])=>rows.length?<div key={h}><h3>{h}</h3><div className="grid">{rows.map(s=><Card key={sym(s)} s={s} decision={opportunityDecision(s)}/>)}</div></div>:null)}</section><OnDeck rows={deck}/></>}
    {tab==="portfolio"&&<><section className="card"><div className="section"><div><h2>💼 My Portfolio</h2><p className="sub">Swing is the trading-account default. Use Core only when you intentionally want long-term holding tolerance.</p></div><button disabled={loading} onClick={analyze}>{loading?"Analyzing...":"Analyze Portfolio"}</button></div><div className="inputs"><input value={ns} onChange={e=>setNs(e.target.value)} placeholder="Symbol"/><input value={nsh} onChange={e=>setNsh(e.target.value)} placeholder="Shares"/><input value={nc} onChange={e=>setNc(e.target.value)} placeholder="Avg cost"/><select value={nr} onChange={e=>setNr(e.target.value)}>{ROLES.map(r=><option key={r}>{r}</option>)}</select><button onClick={add}>Add / Update</button></div><div className="chips">{portfolio.map(p=><span key={p.symbol}><b>{p.symbol}</b> {p.shares} @ {money(p.avgCost)} <select value={role(p.symbol,p.role)} onChange={e=>setRole(p.symbol,e.target.value)}>{ROLES.map(r=><option key={r}>{r}</option>)}</select><button onClick={()=>save(portfolio.filter(x=>x.symbol!==p.symbol))}>×</button></span>)}</div></section>
      {results.length>0&&<section className="card"><h2>Portfolio Intelligence</h2><div className="portfolioSummary"><div><small>Total Value</small><b>{money(portfolioValue)}</b></div><div><small>Net Gain / Loss</small><b className={portfolioGainLoss>=0?"pos":"neg"}>{money(portfolioGainLoss)}</b></div><div><small>Net Gain / Loss %</small><b className={portfolioGainLoss>=0?"pos":"neg"}>{pct(portfolioGainLossPct)}</b></div></div>{actionGroups.length>0&&<div className="rotationBox"><b>🔄 Recommended Capital Actions</b>{actionGroups.map((g,i)=>{const rs=rotationStrength(g.gap),alloc=g.items.map(x=>tradeLabel(x.target,x.amount)).join("; ");const label=g.type==="Exit"?`EXIT ${g.source}`:g.type==="Cash"?"USE CASH":g.type==="Trim"?`BANK PROFITS ${g.source}`:g.fullRotation?`ROTATE ${g.source}`:`REDUCE ${g.source}`;const detail=g.type==="Exit"?`${alloc}${g.cash>1?`; ${money(g.cash)} → cash`:""}`:g.type==="Cash"?alloc:g.type==="Trim"?`Sell ${g.trim.shares} shares (${money(g.trim.amount)}) • keep ${g.trim.remainingShares} shares (${money(g.trim.residual)})`:g.fullRotation?`Sell full position • ${alloc}${g.cash>1?`; ${money(g.cash)} → cash`:""}`:`Sell ${g.sourceSellShares} shares (${money(g.sourceSaleProceeds)}) • ${alloc}${g.cash>1?`; ${money(g.cash)} → cash`:""} • keep ${g.sourceRemainingShares} shares`;return <div className="actionInstruction" key={`${g.type}-${g.source}-${i}`}><div><b>{label}</b>{g.type==="Rotate"&&<span className={`rotationBadge ${rs.tone}`}>{rs.label}</span>}</div><span className="fundingAmount">{detail}</span></div>;})}</div>}<div className="desktopTable"><div className="scroll"><table><thead><tr><th>Position</th><th>Decision</th><th>Why</th><th>Next Move</th><th>Price</th><th>Gain/Loss</th></tr></thead><tbody>{results.map(s=><PortfolioRow key={sym(s)} s={s}/>)}</tbody></table></div></div><div className="mobilePortfolio">{results.map(s=><PortfolioRow mobile key={sym(s)} s={s}/>)}</div></section>}
    </>}
    {tab==="themes"&&<><section className="card"><div className="section"><div><h2>🎯 Themes</h2><p className="sub">Same authoritative decision engine, filtered by theme.</p></div><select value={selectedTheme} onChange={e=>{setSelectedTheme(e.target.value);load(e.target.value);}}>{THEMES.map(t=><option value={t.key} key={t.key}>{t.name}</option>)}</select></div>{ta.length?<div className="grid">{ta.map(s=><Card key={sym(s)} s={s} decision={opportunityDecision(s)}/>)}</div>:null}</section><OnDeck rows={td}/></>}
    {tab==="single"&&<section className="card"><h2>🔎 Single Symbol</h2><p className="sub">Symbols in the broad universe use the same authoritative broad decision shown on Opportunities; out-of-universe symbols use the standalone expert decision.</p><form className="single" onSubmit={check}><input value={symbol} onChange={e=>setSymbol(e.target.value)} placeholder="Ticker"/><button>Analyze</button></form>{snap&&<div className="grid"><Card s={snap}/></div>}</section>}
    <style jsx global>{`*{box-sizing:border-box}body{margin:0;background:#f4f7fb;color:#111827;font-family:Inter,Arial,sans-serif}main{max-width:1440px;margin:auto;padding:18px}header,.section,.top,.price{display:flex;justify-content:space-between;align-items:center}h1,h2,h3,p{margin-top:0}.updated{display:block;color:#64748b;margin-top:-8px}button,select,input{border:1px solid #cbd5e1;border-radius:10px;background:white;padding:10px 12px;font:inherit}button{cursor:pointer;font-weight:800}button:disabled{cursor:default;opacity:.65}nav{display:flex;gap:8px;margin:16px 0}nav .active{background:#111827;color:white}.card{background:white;border:1px solid #cbd5e1;border-radius:16px;padding:18px;margin:14px 0}.sub{color:#53657f}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.idea{border:1px solid #cbd5e1;border-radius:16px;padding:16px}.idea.green{border-color:#4ade80;background:#f6fff8}.top h3{font-size:24px;margin-bottom:3px}.top p{color:#64748b}.badges{display:flex;gap:6px;flex-wrap:wrap;border-top:1px solid #dbe3ee;padding-top:12px}.themeTag,.entryTag,.eventTag,.pill{display:inline-block;border:1px solid #d8e1ed;border-radius:999px;padding:5px 9px;font-weight:800}.themeTag{color:#1d4ed8;background:#eff6ff}.entryTag{color:#166534;background:#dcfce7}.eventTag{color:#166534;background:#f0fdf4}.pill.green{background:#dcfce7;color:#166534}.pill.orange{background:#ffedd5;color:#9a3412}.pill.yellow{background:#fef9c3;color:#854d0e}.pill.red{background:#fee2e2;color:#991b1b}.pill.gray{background:#e5e7eb;color:#374151}.price{font-size:19px;margin:12px 0}.pos{color:#15803d;font-weight:800}.neg{color:#b91c1c;font-weight:800}.why,.plan,.decision>div{background:#f8fafc;border:1px solid #dbe3ee;border-radius:10px;padding:10px}.decision{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.decision small,.plan small,.mobileField small,.mobileNumbers small,.portfolioSummary small{display:block;color:#64748b;font-weight:800}.decision b,.plan b{display:block;margin-top:4px}.plan{margin-top:8px}.scroll{overflow:auto}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:12px;border-bottom:1px solid #dbe3ee;vertical-align:top}.inputs,.chips,.single{display:flex;gap:8px;flex-wrap:wrap}.chips{margin-top:12px}.chips>span{background:#eef2f7;border-radius:10px;padding:6px}.error{background:#fee2e2;padding:10px;border-radius:10px}.portfolioSummary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:10px 0 14px}.portfolioSummary>div{background:#f8fafc;border:1px solid #dbe3ee;border-radius:12px;padding:12px}.portfolioSummary b{display:block;font-size:20px;margin-top:4px}.rotationBox{border:1px solid #fb923c;background:#fff7ed;border-radius:12px;padding:12px;margin:12px 0 14px}.actionInstruction{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:9px 0;border-bottom:1px solid #fed7aa}.actionInstruction:last-child{border-bottom:0}.actionInstruction>div{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.rotationBadge{display:inline-block;border-radius:999px;padding:4px 9px;font-size:12px;font-weight:900;border:1px solid}.rotationBadge.meaningful{background:#fef9c3;color:#854d0e;border-color:#fde047}.rotationBadge.strong{background:#ffedd5;color:#9a3412;border-color:#fb923c}.rotationBadge.veryStrong{background:#dcfce7;color:#166534;border-color:#4ade80}.fundingAmount{color:#53657f;font-weight:700;text-align:right}.mobilePortfolio{display:none}.portfolioItem{border-top:1px solid #dbe3ee;padding:14px 0}.portfolioHead,.mobileNumbers{display:flex;justify-content:space-between;gap:12px}.portfolioHead{align-items:flex-start}.portfolioHead h3{margin-bottom:2px}.portfolioHead span{color:#64748b}.portfolioHead>.pill{flex-shrink:0}.mobileField{margin-top:10px}.mobileField p{margin:3px 0}.mobileNumbers{margin-top:10px}.desktopTable{display:block}@media(max-width:1050px){.grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:700px){main{padding:10px}.grid{grid-template-columns:1fr}header{align-items:flex-start;gap:8px}.desktopTable{display:none}.mobilePortfolio{display:block}.inputs input{width:100%}.decision{grid-template-columns:1fr 1fr 1fr}.portfolioSummary{grid-template-columns:1fr}.actionInstruction{align-items:flex-start;flex-direction:column;gap:4px}.fundingAmount{text-align:left}}`}</style>
  </main>;
}