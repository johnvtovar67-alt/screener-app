import {useEffect,useMemo,useState} from 'react';

const PORTFOLIO_KEY='stock_screener_portfolio_v1';
const CASH=['CASH','SWVXX','VMFXX','SPAXX','FDRXX','MMF'];
const BULLISH_ACTIONS=['Strong Buy','Buy'];

const money=v=>Number.isFinite(+v)?(+v).toLocaleString('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}):'—';
const sym=s=>String(s?.symbol??s?.ticker??'').toUpperCase();
const price=s=>+(s?.price??s?.currentPrice??s?.lastPrice);
const rec=s=>s?.recommendation&&typeof s.recommendation==='object'?s.recommendation:{};
const stockAction=s=>String(s?.finalDecision?.action??rec(s)?.displayLabel??rec(s)?.label??s?.action??'Unknown');
const event=s=>s?.eventRisk||s?.preTradeCheck||rec(s)?.eventRisk||rec(s)?.preTradeCheck||null;
const clean=s=>String(s||'').trim().toUpperCase().replace(/[^A-Z.\-]/g,'');

function extract(d){for(const x of[d?.stock,d?.result,d?.data,d])if(x&&typeof x==='object'&&!Array.isArray(x)&&(sym(x)||Number.isFinite(price(x))))return x;return null;}
function optionalParam(params,key,value){if(value!==null&&value!==undefined&&value!=='')params.set(key,String(value));}
function Status({children,tone='gray'}){return <span className={`status ${tone}`}>{children}</span>}

function blockerSummary(data,strategyKey){
  const counts=new Map();
  for(const c of data?.contracts||[]){
    for(const b of c?.analysis?.strategies?.[strategyKey]?.blockers||[]){
      if(String(b).startsWith('Execution pricing is unavailable'))continue;
      counts.set(b,(counts.get(b)||0)+1);
    }
  }
  return [...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,3);
}

export default function OptionsCandidates(){
  const[symbol,setSymbol]=useState('');
  const[portfolio,setPortfolio]=useState([]);
  const[result,setResult]=useState(null);
  const[loading,setLoading]=useState(false);
  const[error,setError]=useState('');

  useEffect(()=>{
    try{
      const rows=JSON.parse(localStorage.getItem(PORTFOLIO_KEY)||'[]');
      if(Array.isArray(rows))setPortfolio(rows);
    }catch{}
  },[]);

  const ownedShares=useMemo(()=>{
    const key=clean(symbol),p=portfolio.find(x=>clean(x.symbol)===key);
    return +p?.shares||0;
  },[portfolio,symbol]);

  const modeledCash=useMemo(()=>portfolio.filter(x=>CASH.includes(clean(x.symbol))).reduce((a,x)=>a+(+x.shares||0)*(+x.avgCost||1),0),[portfolio]);

  async function getStock(key){
    let broad=[];
    try{
      const r=await fetch('/api/top5?theme=opportunities',{cache:'no-store'}),d=await r.json();
      if(r.ok&&Array.isArray(d.stocks))broad=d.stocks;
    }catch{}
    const authoritative=broad.find(s=>sym(s)===key);
    if(authoritative)return{stock:authoritative,source:'Authoritative Opportunities screen'};
    const r=await fetch(`/api?symbol=${encodeURIComponent(key)}`,{cache:'no-store'}),d=await r.json();
    if(!r.ok)throw new Error(d.detail||d.error||`Unable to analyze ${key}`);
    const x=extract(d);if(!x)throw new Error(`No usable stock analysis for ${key}`);
    return{stock:x,source:'Standalone stock analysis'};
  }

  async function analyze(e){
    e?.preventDefault();
    const key=clean(symbol);if(!key)return;
    setLoading(true);setError('');setResult(null);
    try{
      const {stock,source}=await getStock(key);
      const action=stockAction(stock),er=event(stock);
      const params=new URLSearchParams({symbol:key,type:'put',limit:'250',stockAction:action,ownedShares:String(ownedShares)});
      optionalParam(params,'cashAvailable',modeledCash>0?modeledCash:null);
      if(er){
        if(typeof er.blockNewCapital==='boolean')params.set('eventBlockNewCapital',String(er.blockNewCapital));
        if(typeof er.manualCheckRequired==='boolean')params.set('eventManualCheckRequired',String(er.manualCheckRequired));
        optionalParam(params,'eventLabel',er.label);
      }
      const r=await fetch(`/api/options?${params.toString()}`,{cache:'no-store'}),puts=await r.json();
      if(!r.ok)throw new Error(puts.message||puts.error||'Options candidate analysis failed');
      setResult({stock,source,action,eventRisk:er,puts,ownedShares,modeledCash});
    }catch(err){setError(err.message||String(err));}
    finally{setLoading(false);}
  }

  const spreads=result?.puts?.putCreditSpreads||[];
  const csp=result?.puts?.structuralCandidates?.filter(x=>x.cashSecuredPutCandidate)||[];
  const cspBlockers=blockerSummary(result?.puts,'cashSecuredPut');
  const bullish=BULLISH_ACTIONS.includes(result?.action);
  const eventBlocked=Boolean(result?.eventRisk?.blockNewCapital||result?.eventRisk?.manualCheckRequired);
  const primary=spreads[0]||csp[0]||null;

  let headline='Enter a stock to check its options setup';
  let headlineText='The stock screener stays authoritative. This page only narrows the option chain to structures worth inspecting.';
  let headlineTone='gray';
  if(result){
    if(!bullish){headline=`No bullish options setup — ${result.action}`;headlineText='The stock signal does not support using a cash-secured put or bullish put spread for new capital right now.';headlineTone='red';}
    else if(eventBlocked){headline='No new options setup — event risk';headlineText='The stock qualifies, but the event-risk gate blocks new capital or requires a manual event check.';headlineTone='red';}
    else if(primary){headline=spreads.length?'Check a put credit spread in Schwab':'Check a cash-secured put in Schwab';headlineText='The structure clears the screener’s stock, event, DTE, delta, open-interest and sizing filters. Live bid/ask in Schwab still decides whether the trade economics are acceptable.';headlineTone='green';}
    else{headline='No options candidate clears the current filters';headlineText='The stock may qualify, but the sampled option chain did not produce a structure that clears the current liquidity, delta, event and sizing guardrails.';headlineTone='yellow';}
  }

  return <main>
    <header>
      <div><a href="/" className="back">← Investment Operating System</a><h1>Options Candidates</h1><p>Find the structure. Check the live price in Schwab.</p></div>
      <Status tone="gray">CANDIDATE FINDER</Status>
    </header>

    <section className="miniRules">
      <span><b>$750</b> max spread risk</span>
      <span><b>$1,500</b> total open spread risk</span>
      <span><b>21–60</b> DTE</span>
      <span><b>100+</b> open interest</span>
    </section>

    <section className="card searchCard">
      <form onSubmit={analyze} className="form">
        <label><span>Stock symbol</span><input value={symbol} onChange={e=>setSymbol(e.target.value)} placeholder="MU" autoCapitalize="characters"/></label>
        <button disabled={loading}>{loading?'Checking…':'Check Options'}</button>
      </form>
      <p className="hint">Portfolio match: <b>{ownedShares}</b> shares{modeledCash>0?` • modeled cash ${money(modeledCash)}`:' • no cash position modeled'}.</p>
      {error&&<p className="error">{error}</p>}
    </section>

    <section className={`answer ${headlineTone}`}>
      <div><small>CURRENT ANSWER</small><h2>{headline}</h2><p>{headlineText}</p></div>
      {result&&<Status tone={BULLISH_ACTIONS.includes(result.action)?'green':result.action==='Watch'?'yellow':'red'}>{result.action}</Status>}
    </section>

    {result&&<>
      <section className="contextRow">
        <div><small>Stock</small><b>{sym(result.stock)} · {money(price(result.stock))}</b></div>
        <div><small>Stock authority</small><b>{result.action}</b></div>
        <div><small>Event gate</small><b>{result.eventRisk?.label||'Not verified'}</b></div>
        <div><small>Owned shares</small><b>{result.ownedShares}</b></div>
      </section>

      {spreads.length>0&&<section className="card">
        <div className="sectionHead"><div><h2>Put credit spreads to inspect</h2><p className="sub">These are chain-navigation targets, not trade recommendations.</p></div><Status tone="green">CHECK IN SCHWAB</Status></div>
        <div className="candidateGrid">{spreads.slice(0,3).map((x,i)=><article className="candidate" key={`${x.expirationDate}-${x.shortStrike}-${x.longStrike}-${i}`}>
          <div className="candidateTop"><b>{x.expirationDate}</b><span>{x.dte} DTE</span></div>
          <div className="leg"><small>Sell put</small><b>{money(x.shortStrike)}</b><span>Δ {Number.isFinite(+x.shortDelta)?Math.abs(+x.shortDelta).toFixed(3):'—'} · OI {x.shortOpenInterest??'—'}</span></div>
          <div className="leg"><small>Buy put</small><b>{money(x.longStrike)}</b><span>OI {x.longOpenInterest??'—'}</span></div>
          <div className="riskLine"><span>Width</span><b>{money(x.width)}</b><span>Conservative width exposure</span><b>{money(x.conservativeMaxRisk)}</b></div>
          <p className="next"><b>In Schwab:</b> check the live net credit and bid/ask width. Do not use it if pricing is poor or the resulting max loss exceeds the risk guardrail.</p>
        </article>)}</div>
      </section>}

      {csp.length>0&&<section className="card">
        <div className="sectionHead"><div><h2>Cash-secured puts to inspect</h2><p className="sub">Only where 100-share assignment fits the current small-position framework.</p></div><Status tone="green">CHECK IN SCHWAB</Status></div>
        <div className="candidateGrid">{csp.slice(0,3).map((x,i)=><article className="candidate" key={`${x.ticker}-${i}`}>
          <div className="candidateTop"><b>{x.expirationDate}</b><span>{x.dte} DTE</span></div>
          <div className="leg"><small>Put strike</small><b>{money(x.strike)}</b><span>Δ {Number.isFinite(+x.delta)?Math.abs(+x.delta).toFixed(3):'—'} · OI {x.openInterest??'—'}</span></div>
          <div className="riskLine"><span>100-share assignment</span><b>{money((+x.strike||0)*100)}</b></div>
          <p className="next"><b>In Schwab:</b> check the live premium. Only consider it if you would genuinely want 100 shares at this strike.</p>
        </article>)}</div>
      </section>}

      {!csp.length&&bullish&&<section className="card compact">
        <h2>Cash-secured put</h2>
        <p className="sub">No CSP clears the current assignment/cash/liquidity gates.</p>
        {cspBlockers.length>0&&<ul>{cspBlockers.map(([label,count])=><li key={label}>{label} <b>({count})</b></li>)}</ul>}
      </section>}

      <section className="card compact">
        <h2>Covered call</h2>
        {result.ownedShares<100?<p className="sub"><b>Not applicable right now.</b> You own {result.ownedShares} shares in the screener; a covered call requires at least 100 shares.</p>:<p className="sub"><b>Portfolio-context check required.</b> You have enough shares, but we should only surface a covered call when Portfolio Intelligence says capping upside is appropriate—not merely because a call premium exists.</p>}
      </section>

      <section className="finalCheck">
        <b>What the screener does not know</b>
        <span>Live option bid/ask, net credit, and execution quality. Those remain the final Schwab check before any trade.</span>
      </section>
    </>}

    <style jsx global>{`*{box-sizing:border-box}body{margin:0;background:#f4f7fb;color:#111827;font-family:Inter,Arial,sans-serif}main{max-width:1200px;margin:auto;padding:18px}h1,h2,p{margin-top:0}h1{margin-bottom:5px}.back{display:inline-block;margin-bottom:9px;color:#1d4ed8;font-weight:800;text-decoration:none}header,.sectionHead,.candidateTop{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}.card{background:#fff;border:1px solid #cbd5e1;border-radius:16px;padding:18px;margin:14px 0}.searchCard{padding:16px}.form{display:flex;gap:10px;align-items:flex-end}.form label{display:flex;flex-direction:column;gap:6px;font-weight:800}.form label span{font-size:13px}.form input{border:1px solid #cbd5e1;border-radius:10px;padding:11px 12px;font:inherit;min-width:220px}.form button{border:0;border-radius:10px;background:#111827;color:#fff;padding:12px 18px;font:inherit;font-weight:900;cursor:pointer}.form button:disabled{opacity:.6}.hint,.sub{color:#53657f}.hint{font-size:13px;margin:10px 0 0}.error{background:#fee2e2;color:#991b1b;border-radius:10px;padding:10px;margin:12px 0 0}.status{display:inline-block;border-radius:999px;padding:6px 10px;font-size:12px;font-weight:900;border:1px solid;white-space:nowrap}.status.green{background:#dcfce7;color:#166534;border-color:#86efac}.status.yellow{background:#fef9c3;color:#854d0e;border-color:#fde047}.status.red{background:#fee2e2;color:#991b1b;border-color:#fecaca}.status.gray{background:#e5e7eb;color:#374151;border-color:#cbd5e1}.miniRules{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}.miniRules span{background:#fff;border:1px solid #cbd5e1;border-radius:999px;padding:8px 12px;color:#53657f}.miniRules b{color:#111827}.answer{display:flex;justify-content:space-between;align-items:flex-start;gap:15px;border:1px solid;border-radius:16px;padding:18px;margin:14px 0;background:#fff}.answer small{font-weight:900;letter-spacing:.06em}.answer h2{margin:4px 0 6px}.answer p{margin:0;color:#53657f;max-width:820px}.answer.green{border-color:#4ade80;background:#f6fff8}.answer.yellow{border-color:#fde047;background:#fffef1}.answer.red{border-color:#fca5a5;background:#fff8f8}.answer.gray{border-color:#cbd5e1}.contextRow{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.contextRow>div{background:#fff;border:1px solid #cbd5e1;border-radius:12px;padding:12px}.contextRow small,.leg small{display:block;color:#64748b;font-weight:800;margin-bottom:4px}.candidateGrid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:12px}.candidate{border:1px solid #dbe3ee;border-radius:14px;padding:14px;background:#fafcff}.candidateTop{border-bottom:1px solid #dbe3ee;padding-bottom:9px;margin-bottom:10px}.candidateTop span{color:#64748b;font-weight:800}.leg{padding:8px 0}.leg b{font-size:21px;display:block}.leg span{color:#53657f;font-size:13px}.riskLine{display:grid;grid-template-columns:1fr auto;gap:5px 12px;border-top:1px solid #dbe3ee;padding-top:10px;margin-top:6px}.riskLine span{color:#64748b}.next{font-size:13px;line-height:1.45;background:#eef2f7;border-radius:10px;padding:10px;margin:11px 0 0}.compact ul{margin-bottom:0;color:#53657f}.finalCheck{display:flex;gap:10px;align-items:flex-start;background:#111827;color:#fff;border-radius:14px;padding:14px 16px;margin:14px 0}.finalCheck span{color:#dbe3ee}.sectionHead h2{margin-bottom:5px}@media(max-width:900px){.candidateGrid{grid-template-columns:1fr}.contextRow{grid-template-columns:repeat(2,1fr)}}@media(max-width:650px){main{padding:10px}header,.answer,.sectionHead,.form,.finalCheck{flex-direction:column}.form label,.form input,.form button{width:100%}.contextRow{grid-template-columns:1fr}}`}</style>
  </main>;
}
