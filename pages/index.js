// pages/index.js
import { useEffect, useMemo, useState } from "react";
import { portfolioDecision } from "../lib/expertDecision";

const PORTFOLIO_KEY="stock_screener_portfolio_v1";
const CASH_SYMBOLS=["CASH","SWVXX","VMFXX","SPAXX","FDRXX","MMF"];
const THEME_OPTIONS=[
  {key:"ai_compute",name:"AI Compute & Platforms"},{key:"ai_networking",name:"AI Networking"},{key:"cybersecurity",name:"Cybersecurity"},
  {key:"power",name:"Power & Electrification"},{key:"digital_infra",name:"Digital Infrastructure"},{key:"nuclear",name:"Nuclear / Baseload"},
  {key:"btc",name:"BTC / Digital Assets"},{key:"defense",name:"Defense & National Security"},{key:"space",name:"Space & Satellites"},
  {key:"drones",name:"Autonomy & Drones"},{key:"robotics",name:"Robotics & Automation"},{key:"industrial_software",name:"Industrial Software"},
  {key:"quantum",name:"Quantum Computing"},{key:"biotech",name:"Platform Biotech"}
];

const money=v=>Number.isFinite(Number(v))?Number(v).toLocaleString("en-US",{style:"currency",currency:"USD",maximumFractionDigits:2}):"—";
const percent=v=>Number.isFinite(Number(v))?`${Number(v)>=0?"+":""}${Number(v).toFixed(2)}%`:"—";
const getSymbol=s=>String(s?.symbol??s?.ticker??"").toUpperCase();
const getName=s=>s?.name??s?.companyName??s?.company??getSymbol(s);
const getPrice=s=>Number(s?.price??s?.currentPrice??s?.quote?.price??s?.lastPrice);
const getChangePct=s=>Number(s?.dayChangePct??s?.changesPercentage??s?.changePercent??s?.percentChange);
const rec=s=>s?.recommendation&&typeof s.recommendation==="object"?s.recommendation:{};
const decision=s=>rec(s)?.expertDecision||{};
const theme=s=>s?.primaryTheme||s?.theme||"Other";
const riskPlan=s=>s?.riskPlan??rec(s)?.riskPlan??{};
const eventRisk=s=>s?.eventRisk||s?.preTradeCheck||rec(s)?.eventRisk||rec(s)?.preTradeCheck||null;
const entry=s=>String(rec(s)?.entryQualityLabel??rec(s)?.gateSummary?.entryQualityLabel??s?.entryQualityLabel??s?.technicalSnapshot?.entryQualityLabel??"Unknown");
const quality=s=>String(riskPlan(s)?.tradeQualityLabel||riskPlan(s)?.tradeQuality||"—");

function normalizeAction(v){
  const x=String(v||"").replace(/[_-]+/g," ").replace(/\s+/g," ").trim().toUpperCase();
  if(x==="STRONG BUY")return"Strong Buy";
  if(["BUY","BUY NOW","BUY IMMEDIATELY"].includes(x))return"Buy";
  if(x.includes("STARTER")||x==="BREAKOUT")return"Starter";
  if(x.includes("WATCH")||x.includes("SETUP")||x==="NEAR MISS")return"Watch";
  return"Avoid";
}
const action=s=>CASH_SYMBOLS.includes(getSymbol(s))?"Cash":normalizeAction(rec(s)?.displayLabel??rec(s)?.label??rec(s)?.recommendation??rec(s)?.tradeAction??s?.action);
const timing=s=>rec(s)?.decisionTiming||decision(s)?.timing||(["Strong Buy","Buy"].includes(action(s))?"Now":action(s)==="Starter"?"This Week":"Wait for Trigger");
const size=s=>rec(s)?.positionSize||decision(s)?.size||(action(s)==="Strong Buy"?"Full":["Buy","Starter"].includes(action(s))?"Partial":"None");
const why=s=>rec(s)?.decisionWhy||decision(s)?.decisionWhy||rec(s)?.expertOverrideReason||rec(s)?.actionSummary||rec(s)?.dominantReason||"Wait for a better setup.";
const tradeScore=s=>Number(rec(s)?.tradeSetupScore??decision(s)?.tradeSetupScore??0);

function actionClass(a){
  if(["Strong Buy","Buy","Add"].includes(a))return"green";
  if(["Starter","Trim"].includes(a))return"orange";
  if(["Watch","Hold"].includes(a))return"yellow";
  if(a==="Cash")return"gray";
  return"red";
}
function netChange(s){
  const d=Number(s?.change??s?.dayChange??s?.priceChange??s?.regularMarketChange??s?.quote?.change);
  if(Number.isFinite(d))return d;
  const p=getPrice(s),pct=getChangePct(s);
  if(Number.isFinite(p)&&Number.isFinite(pct)&&pct!==-100){const prev=p/(1+pct/100);return p-prev}
  return null;
}
function changeText(s){
  const d=netChange(s),p=getChangePct(s);
  if(Number.isFinite(d)&&Number.isFinite(p))return `${d>=0?"+":""}${d.toFixed(2)} (${percent(p)})`;
  return Number.isFinite(p)?percent(p):"—";
}
function planText(s){
  const p=riskPlan(s),a=action(s),add=Number(p.addAbovePrice),inv=Number(p.invalidationPrice),trim=Number(p.firstTrimPrice);
  if(["Strong Buy","Buy"].includes(a))return `${Number.isFinite(inv)?`Review below ${money(inv)}`:"Manage risk"}${Number.isFinite(trim)?` • Profit review ${money(trim)}`:""}`;
  if(a==="Starter")return `${Number.isFinite(add)?`Upgrade above ${money(add)}`:"Upgrade only after confirmation"}${Number.isFinite(inv)?` • Review below ${money(inv)}`:""}`;
  if(a==="Watch")return Number.isFinite(add)?`Trigger above ${money(add)}`:"Wait for confirmation";
  return"No new capital.";
}
function rank(a,b){const r={"Strong Buy":4,Buy:3,Starter:2,Watch:1,Avoid:0,Cash:0};return(r[action(b)]-r[action(a)])||(tradeScore(b)-tradeScore(a));}
function calculatePosition(p,live){const shares=Number(p.shares||0),avgCost=Number(p.avgCost||0),price=Number(live||0),value=shares*price,costBasis=shares*avgCost,gainLoss=value-costBasis;return{shares,avgCost,price,value,costBasis,gainLoss,gainLossPct:costBasis?gainLoss/costBasis*100:0};}
function extractStock(data){for(const c of[data?.stock,data?.result,data?.data,data?.quote,data])if(c&&typeof c==="object"&&!Array.isArray(c)&&(getSymbol(c)||Number.isFinite(getPrice(c))))return c;return null;}
async function mapConcurrency(items,limit,mapper){const out=new Array(items.length);let i=0;async function worker(){while(i<items.length){const x=i++;try{out[x]={ok:true,value:await mapper(items[x])};}catch(e){out[x]={ok:false,symbol:getSymbol(items[x]),error:e.message||String(e)};}}}await Promise.all(Array.from({length:Math.min(limit,Math.max(items.length,1))},worker));return out;}

function OpportunityCard({stock}){
  const a=action(stock),er=eventRisk(stock);
  return <article className={`ideaCard ${actionClass(a)}`}>
    <div className="ideaTop"><div><h3>{getSymbol(stock)}</h3><p>{getName(stock)}</p></div><span className={`actionPill ${actionClass(a)}`}>{a}</span></div>
    <div className="badgeRow"><span className="themeBadge">{theme(stock)}</span><span className="convictionBadge">Conviction {stock.convictionGrade||"B"}</span><span className="entryBadge">Entry: {entry(stock)}</span>{er&&<span className="eventBadge">{er.label}</span>}</div>
    <div className="priceRow"><strong>{money(getPrice(stock))}</strong><span className={Number(getChangePct(stock))>=0?"positive":"negative"}>{changeText(stock)}</span></div>
    <p className="reasonBox">{why(stock)}</p>
    {rec(stock)?.expertOverride&&<p className="expertNote"><strong>Why not Buy:</strong> {rec(stock).expertOverrideReason}</p>}
    <div className="decisionStrip"><div><span>Timing</span><strong>{timing(stock)}</strong></div><div><span>Size</span><strong>{size(stock)}</strong></div><div><span>Quality</span><strong>{quality(stock)}</strong></div></div>
    <div className="riskPlanBox"><span>Plan</span><strong>{planText(stock)}</strong></div>
  </article>;
}
function OnDeck({rows}){
  return <section className="card"><h2>🟡 On Deck</h2><p className="sub">Closest candidates, but no capital yet.</p><div className="tableWrap"><table><thead><tr><th>Symbol</th><th>Theme</th><th>Price</th><th>Why Wait</th><th>Next Trigger</th></tr></thead><tbody>{rows.map(s=><tr key={getSymbol(s)}><td><strong>{getSymbol(s)}</strong></td><td>{theme(s)}</td><td>{money(getPrice(s))}</td><td>{why(s)}</td><td>{planText(s)}</td></tr>)}</tbody></table></div></section>;
}

export default function Home(){
  const[tab,setTab]=useState("opportunities"),[stocks,setStocks]=useState([]),[themeStocks,setThemeStocks]=useState([]),[selectedTheme,setSelectedTheme]=useState("ai_compute"),[themeMeta,setThemeMeta]=useState(null),[loading,setLoading]=useState(false),[error,setError]=useState("");
  const[portfolio,setPortfolio]=useState([]),[portfolioResults,setPortfolioResults]=useState([]),[portfolioLoading,setPortfolioLoading]=useState(false),[newSymbol,setNewSymbol]=useState(""),[newShares,setNewShares]=useState(""),[newCost,setNewCost]=useState(""),[newRole,setNewRole]=useState("Swing");
  const[symbol,setSymbol]=useState(""),[snap,setSnap]=useState(null),[snapLoading,setSnapLoading]=useState(false);

  useEffect(()=>{try{const p=JSON.parse(localStorage.getItem(PORTFOLIO_KEY)||"[]");if(Array.isArray(p))setPortfolio(p);}catch{}loadTop("opportunities");},[]);

  async function loadTop(t="opportunities"){
    setLoading(true);setError("");
    try{const r=await fetch(`/api/top5?theme=${encodeURIComponent(t)}`,{cache:"no-store"}),d=await r.json();if(!r.ok)throw new Error(d.detail||d.error);if(t==="opportunities")setStocks(d.stocks||[]);else setThemeStocks(d.stocks||[]);setThemeMeta(d.selectedTheme||null);}catch(e){setError(e.message||"Failed to load trade screen.");}finally{setLoading(false);}
  }
  async function fetchStock(s){const r=await fetch(`/api?symbol=${encodeURIComponent(s)}`,{cache:"no-store"}),d=await r.json();if(!r.ok)throw new Error(d.detail||d.error);const stock=extractStock(d);if(!stock)throw new Error(`No usable data for ${s}`);return stock;}
  function savePortfolio(x){setPortfolio(x);localStorage.setItem(PORTFOLIO_KEY,JSON.stringify(x));}
  function addPosition(){const p={symbol:newSymbol.trim().toUpperCase(),shares:Number(newShares),avgCost:Number(newCost),role:newRole};if(!p.symbol||p.shares<=0||p.avgCost<0)return alert("Enter symbol, shares and cost.");savePortfolio([...portfolio.filter(x=>x.symbol!==p.symbol),p]);setNewSymbol("");setNewShares("");setNewCost("");}
  async function analyzePortfolio(){setPortfolioLoading(true);const rows=await mapConcurrency(portfolio,4,async p=>{if(CASH_SYMBOLS.includes(p.symbol)){const c=calculatePosition(p,p.avgCost||1);return{...p,...c,name:"Cash / Money Market",primaryTheme:"Cash"};}const s=await fetchStock(p.symbol),c=calculatePosition(p,getPrice(s));return{...s,...c,role:p.role||"Swing"};});const clean=rows.map(r=>r.ok?r.value:{symbol:r.symbol,error:r.error});const total=clean.reduce((x,r)=>x+(Number(r.value)||0),0);setPortfolioResults(clean.map(r=>({...r,weightPct:total?Number(r.value||0)/total*100:0})));setPortfolioLoading(false);}
  async function analyzeSymbol(e){e.preventDefault();setSnapLoading(true);try{setSnap(await fetchStock(symbol.trim().toUpperCase()));}catch(e){setError(e.message);}finally{setSnapLoading(false);}}

  const strongBuys=useMemo(()=>stocks.filter(s=>action(s)==="Strong Buy").sort(rank),[stocks]);
  const buys=useMemo(()=>stocks.filter(s=>action(s)==="Buy").sort(rank),[stocks]);
  const starters=useMemo(()=>stocks.filter(s=>action(s)==="Starter").sort(rank).slice(0,8),[stocks]);
  const deck=useMemo(()=>stocks.filter(s=>action(s)==="Watch").sort(rank).slice(0,8),[stocks]);
  const themeActionable=useMemo(()=>themeStocks.filter(s=>["Strong Buy","Buy","Starter"].includes(action(s))).sort(rank),[themeStocks]);
  const themeDeck=useMemo(()=>themeStocks.filter(s=>action(s)==="Watch").sort(rank).slice(0,8),[themeStocks]);
  const bestOpportunity=useMemo(()=>[...stocks].sort((a,b)=>tradeScore(b)-tradeScore(a))[0]||null,[stocks]);
  const totals=useMemo(()=>portfolioResults.reduce((a,p)=>({value:a.value+(Number(p.value)||0),cost:a.cost+(Number(p.costBasis)||0),gain:a.gain+(Number(p.gainLoss)||0)}),{value:0,cost:0,gain:0}),[portfolioResults]);

  function ownedDecision(s){if(s.error)return{action:"Review",reason:s.error,capitalPriority:"Data unavailable",replacementAdvantage:0};if(CASH_SYMBOLS.includes(getSymbol(s)))return{action:"Cash",reason:"Dry powder for stronger opportunities.",capitalPriority:"Available",replacementAdvantage:0};return portfolioDecision({stock:s,recommendation:rec(s),position:{role:s.role||"Swing",gainLossPct:s.gainLossPct,weightPct:s.weightPct},bestOpportunity:{tradeSetupScore:tradeScore(bestOpportunity)}});}
  function ownedNext(s,d){const p=riskPlan(s),inv=Number(p.invalidationPrice),trim=Number(p.firstTrimPrice);if(d.action==="Add")return `${size(s)} add; ${Number.isFinite(inv)?`review below ${money(inv)}`:"manage risk"}.`;if(d.action==="Exit")return"Redeploy into a materially stronger setup.";if(d.action==="Trim")return Number.isFinite(trim)?`Trim/review around ${money(trim)} or if momentum fails.`:"Reduce exposure if momentum weakens.";return Number.isFinite(trim)?`Hold; next profit review ${money(trim)}.`:"Hold; no new capital.";}

  return <main className="page">
    <header className="header"><div><h1>🧠 Investment Operating System</h1><p>Expert analysis underneath. Clear decisions on top.</p></div><button className="button secondary" onClick={()=>loadTop(tab==="themes"?selectedTheme:"opportunities")}>{loading?"Refreshing...":"Reload"}</button></header>
    <nav className="tabs"><button className={tab==="opportunities"?"active":""} onClick={()=>setTab("opportunities")}>Opportunities</button><button className={tab==="portfolio"?"active":""} onClick={()=>setTab("portfolio")}>My Portfolio</button><button className={tab==="themes"?"active":""} onClick={()=>{setTab("themes");if(!themeStocks.length)loadTop(selectedTheme);}}>Themes</button><button className={tab==="single"?"active":""} onClick={()=>setTab("single")}>Single Symbol</button></nav>
    {error&&<p className="error">{error}</p>}

    {tab==="opportunities"&&<><section className="card"><h2>🔥 Opportunities</h2><p className="sub">What deserves fresh capital now.</p>{strongBuys.length>0&&<><h3 className="bucket">Strong Buy</h3><div className="ideaGrid">{strongBuys.map(s=><OpportunityCard key={getSymbol(s)} stock={s}/>)}</div></>}{buys.length>0&&<><h3 className="bucket divider">Buy</h3><div className="ideaGrid">{buys.map(s=><OpportunityCard key={getSymbol(s)} stock={s}/>)}</div></>}{starters.length>0&&<><h3 className="bucket divider">Starter</h3><div className="ideaGrid">{starters.map(s=><OpportunityCard key={getSymbol(s)} stock={s}/>)}</div></>}{!loading&&!strongBuys.length&&!buys.length&&!starters.length&&<p>No actionable fresh-capital ideas right now.</p>}</section><OnDeck rows={deck}/></>}

    {tab==="portfolio"&&<><section className="card"><div className="sectionTitle"><div><h2>💼 My Portfolio</h2><p className="sub">The answer should be simple: add, hold, trim, or exit.</p></div><button className="button" onClick={analyzePortfolio}>{portfolioLoading?"Analyzing...":"Analyze Portfolio"}</button></div><div className="inputGrid"><input value={newSymbol} onChange={e=>setNewSymbol(e.target.value)} placeholder="Symbol"/><input value={newShares} onChange={e=>setNewShares(e.target.value)} placeholder="Shares"/><input value={newCost} onChange={e=>setNewCost(e.target.value)} placeholder="Avg cost"/><select value={newRole} onChange={e=>setNewRole(e.target.value)}><option>Core</option><option>Swing</option><option>Tactical</option><option>Starter</option></select><button className="button" onClick={addPosition}>Add / Update</button></div><div className="positionChips">{portfolio.map(p=><span className="positionChip" key={p.symbol}><strong>{p.symbol}</strong> {p.shares} @ {money(p.avgCost)} · {p.role||"Swing"}<button onClick={()=>savePortfolio(portfolio.filter(x=>x.symbol!==p.symbol))}>×</button></span>)}</div></section>{portfolioResults.length>0&&<section className="card"><div className="sectionTitle"><div><h2>Portfolio Intelligence</h2><p className="sub">Forward setup quality and opportunity cost drive the decision.</p></div><div className="totals"><span>Total Value</span><strong>{money(totals.value)}</strong><span className={totals.gain>=0?"positive":"negative"}>{money(totals.gain)} / {percent(totals.cost?totals.gain/totals.cost*100:0)}</span></div></div><div className="tableWrap"><table><thead><tr><th>Position</th><th>Decision</th><th>Why</th><th>Next Move</th><th>Price</th><th>Gain / Loss</th></tr></thead><tbody>{portfolioResults.map(s=>{const d=ownedDecision(s);return <tr key={getSymbol(s)}><td><strong>{getSymbol(s)}</strong><div className="mutedSmall">{s.role||"Swing"} · {Number(s.weightPct||0).toFixed(1)}%</div></td><td><span className={`pill ${actionClass(d.action)}`}>{d.action}</span></td><td>{d.reason}</td><td>{ownedNext(s,d)}</td><td><strong>{money(getPrice(s))}</strong></td><td className={Number(s.gainLoss)>=0?"positive":"negative"}>{money(s.gainLoss)} / {percent(s.gainLossPct)}</td></tr>;})}</tbody></table></div></section>}</>}

    {tab==="themes"&&<><section className="card"><div className="sectionTitle"><div><h2>🔎 Thesis Research</h2><p className="sub">Same decision engine, filtered by theme.</p></div><select value={selectedTheme} onChange={e=>{setSelectedTheme(e.target.value);loadTop(e.target.value);}}>{THEME_OPTIONS.map(t=><option key={t.key} value={t.key}>{t.name}</option>)}</select></div></section><section className="card"><h2>{themeMeta?.name||"Theme"}</h2><div className="ideaGrid">{themeActionable.map(s=><OpportunityCard key={getSymbol(s)} stock={s}/>)}</div></section><OnDeck rows={themeDeck}/></>}

    {tab==="single"&&<section className="card"><h2>🎯 Single Symbol</h2><p className="sub">Fast answer using the same expert engine.</p><form className="singleForm" onSubmit={analyzeSymbol}><input value={symbol} onChange={e=>setSymbol(e.target.value)} placeholder="MSTR, ANET, DDOG..."/><button className="button">{snapLoading?"Checking...":"Check"}</button></form>{snap&&<div className="singleCard"><OpportunityCard stock={snap}/></div>}</section>}

    <style jsx global>{`
      *{box-sizing:border-box}body{margin:0}.page{min-height:100vh;background:#f8fafc;color:#0f172a;padding:28px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.header,.sectionTitle{display:flex;justify-content:space-between;align-items:flex-start;gap:18px}.header{margin-bottom:22px}h1,h2,h3,p{margin-top:0}h1{font-size:34px;letter-spacing:-.04em}.header p,.sub{color:#53657f}.button{border:0;border-radius:12px;background:#0f172a;color:#fff;font-weight:800;padding:12px 18px;cursor:pointer}.button.secondary{background:#fff;color:#0f172a;border:1px solid #cbd5e1}.tabs{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:22px}.tabs button{border:1px solid #cbd5e1;background:#fff;border-radius:16px;padding:16px;font-weight:900;color:#0f172a;cursor:pointer}.tabs button.active{background:#0f172a;color:#fff;border-color:#0ea5e9;box-shadow:0 0 0 2px #0ea5e9 inset}.card{background:#fff;border:1px solid #cbd5e1;border-radius:18px;padding:18px;margin-bottom:18px;box-shadow:0 10px 30px rgba(15,23,42,.04)}.bucket{margin:16px 0 12px}.bucket.divider{border-top:1px solid #e2e8f0;padding-top:18px}.ideaGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:14px}.ideaCard{display:flex;flex-direction:column;gap:11px;border:1px solid #dbe5f1;border-radius:16px;padding:16px;background:#fff}.ideaCard.green{border-color:#86efac;background:linear-gradient(180deg,#fff 0%,#f7fffa 100%)}.ideaCard.orange{border-color:#fdba74;background:linear-gradient(180deg,#fff 0%,#fffaf3 100%)}.ideaTop,.priceRow{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.ideaTop{border-bottom:1px solid #e2e8f0;padding-bottom:10px}.ideaTop h3{font-size:24px;margin-bottom:4px}.ideaTop p{color:#64748b}.actionPill,.pill{display:inline-flex;align-items:center;justify-content:center;border-radius:999px;padding:8px 13px;font-weight:900;white-space:nowrap}.green{background:#dcfce7;color:#166534}.orange{background:#ffedd5;color:#9a3412}.yellow{background:#fef9c3;color:#854d0e}.red{background:#fee2e2;color:#991b1b}.gray{background:#e5e7eb;color:#374151}.badgeRow{display:flex;flex-wrap:wrap;gap:7px}.themeBadge,.convictionBadge,.entryBadge,.eventBadge{display:inline-flex;border-radius:999px;padding:6px 9px;font-size:12px;font-weight:900}.themeBadge{background:#eff6ff;color:#1d4ed8}.convictionBadge,.eventBadge{background:#f8fafc;border:1px solid #dbe5f1}.entryBadge{background:#dcfce7;color:#166534}.priceRow{font-size:18px}.positive{color:#15803d;font-weight:900}.negative{color:#b91c1c;font-weight:900}.reasonBox,.expertNote{border:1px solid #dbe5f1;background:#f8fafc;border-radius:12px;padding:11px;color:#334155;line-height:1.4}.expertNote{background:#fff7ed;border-color:#fdba74;color:#9a3412}.decisionStrip{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.decisionStrip div,.riskPlanBox{background:#f8fafc;border:1px solid #e2e8f0;border-radius:11px;padding:10px}.decisionStrip span,.riskPlanBox span,.totals span{display:block;color:#64748b;font-size:12px;font-weight:800}.decisionStrip strong,.riskPlanBox strong{display:block;margin-top:3px}.tableWrap{overflow-x:auto}table{width:100%;border-collapse:collapse;min-width:900px}th,td{text-align:left;padding:13px;border-bottom:1px solid #e2e8f0;vertical-align:top}th{color:#64748b;font-size:13px}.inputGrid{display:grid;grid-template-columns:1fr 1fr 1fr 160px auto;gap:10px;margin:14px 0}input,select{border:1px solid #cbd5e1;border-radius:12px;padding:12px 14px;font-size:15px;background:#fff}.positionChips{display:flex;gap:8px;flex-wrap:wrap}.positionChip{background:#f8fafc;border:1px solid #dbe5f1;border-radius:999px;padding:8px 10px}.positionChip button{margin-left:8px;border:0;background:#e2e8f0;border-radius:999px}.totals{text-align:right;background:#f8fafc;border:1px solid #dbe5f1;border-radius:14px;padding:10px 12px}.mutedSmall{font-size:12px;color:#64748b;margin-top:4px}.singleForm{display:grid;grid-template-columns:1fr auto;gap:10px;margin-top:14px}.singleCard{max-width:720px;margin-top:16px}.error{background:#fee2e2;color:#991b1b;padding:12px;border-radius:12px;margin-bottom:16px}@media(max-width:850px){.page{padding:16px}.header,.sectionTitle{flex-direction:column}.tabs{grid-template-columns:1fr 1fr}.inputGrid{grid-template-columns:1fr}.decisionStrip{grid-template-columns:1fr}.ideaGrid{grid-template-columns:1fr}}
    `}</style>
  </main>;
}
