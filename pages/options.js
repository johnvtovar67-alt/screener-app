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

export default function OptionsScreen(){
  const[symbol,setSymbol]=useState('');
  const[portfolio,setPortfolio]=useState([]);
  const[result,setResult]=useState(null);
  const[loading,setLoading]=useState(false);
  const[error,setError]=useState('');

  useEffect(()=>{try{const rows=JSON.parse(localStorage.getItem(PORTFOLIO_KEY)||'[]');if(Array.isArray(rows))setPortfolio(rows);}catch{}},[]);

  const ownedShares=useMemo(()=>{const key=clean(symbol),p=portfolio.find(x=>clean(x.symbol)===key);return +p?.shares||0;},[portfolio,symbol]);
  const modeledCash=useMemo(()=>portfolio.filter(x=>CASH.includes(clean(x.symbol))).reduce((a,x)=>a+(+x.shares||0)*(+x.avgCost||1),0),[portfolio]);

  async function getStock(key){
    let broad=[];
    try{const r=await fetch('/api/top5?theme=opportunities',{cache:'no-store'}),d=await r.json();if(r.ok&&Array.isArray(d.stocks))broad=d.stocks;}catch{}
    const authoritative=broad.find(s=>sym(s)===key);
    if(authoritative)return{stock:authoritative,source:'Authoritative Opportunities screen'};
    const r=await fetch(`/api?symbol=${encodeURIComponent(key)}`,{cache:'no-store'}),d=await r.json();
    if(!r.ok)throw new Error(d.detail||d.error||`Unable to analyze ${key}`);
    const x=extract(d);if(!x)throw new Error(`No usable stock analysis for ${key}`);
    return{stock:x,source:'Standalone stock analysis'};
  }

  async function analyze(e){
    e?.preventDefault();const key=clean(symbol);if(!key)return;
    setLoading(true);setError('');setResult(null);
    try{
      const {stock,source}=await getStock(key),action=stockAction(stock),er=event(stock);
      const params=new URLSearchParams({symbol:key,type:'put',limit:'250',stockAction:action,ownedShares:String(ownedShares)});
      optionalParam(params,'cashAvailable',modeledCash>0?modeledCash:null);
      if(er){
        if(typeof er.blockNewCapital==='boolean')params.set('eventBlockNewCapital',String(er.blockNewCapital));
        if(typeof er.manualCheckRequired==='boolean')params.set('eventManualCheckRequired',String(er.manualCheckRequired));
        optionalParam(params,'eventLabel',er.label);
      }
      const r=await fetch(`/api/options?${params.toString()}`,{cache:'no-store'}),puts=await r.json();
      if(!r.ok)throw new Error(puts.message||puts.error||'Options screen failed');
      setResult({stock,source,action,eventRisk:er,puts,ownedShares,modeledCash});
    }catch(err){setError(err.message||String(err));}finally{setLoading(false);}
  }

  const bullish=BULLISH_ACTIONS.includes(result?.action);
  const eventKnown=typeof result?.eventRisk?.blockNewCapital==='boolean'&&typeof result?.eventRisk?.manualCheckRequired==='boolean';
  const eventBlocked=Boolean(result?.eventRisk?.blockNewCapital||result?.eventRisk?.manualCheckRequired);
  const structuralSpreads=result?.puts?.putCreditSpreads||[];
  const structuralCsp=result?.puts?.structuralCandidates?.filter(x=>x.cashSecuredPutCandidate)||[];
  const liquidPutCount=(result?.puts?.contracts||[]).filter(x=>{
    const a=x?.analysis?.absDelta,oi=x?.openInterest,dte=x?.analysis?.dte;
    return Number.isFinite(+a)&&+a>=.15&&+a<=.35&&Number.isFinite(+oi)&&+oi>=100&&Number.isFinite(+dte)&&+dte>=21&&+dte<=60;
  }).length;

  let verdict='Enter a stock to screen its options market';
  let detail='This page will not select an option trade without live bid/ask pricing.';
  let tone='gray';
  if(result){
    if(!bullish){verdict=`No bullish options review — stock is ${result.action}`;detail='The underlying stock signal blocks new bullish option structures.';tone='red';}
    else if(!eventKnown){verdict='Stop — event-risk context is not verified';detail='No bullish options trade should be considered until the event gate is known.';tone='red';}
    else if(eventBlocked){verdict='Stop — event-risk gate is active';detail='The stock qualifies, but new-capital option structures are blocked for now.';tone='red';}
    else if(liquidPutCount>0){verdict='Worth opening the option chain in Schwab';detail='The stock thesis and structural option data justify a closer look, but no strike, spread, or premium is recommended until live bid/ask is visible.';tone='green';}
    else{verdict='No useful option-chain setup found';detail='The stock qualifies, but the sampled chain does not currently have enough contracts in our DTE, delta and open-interest window to justify further review.';tone='yellow';}
  }

  const capitalFit=result?price(result.stock)*100:null;
  const spreadLikely=result&&capitalFit>3000;

  return <main>
    <header><div><a href="/" className="back">← Investment Operating System</a><h1>Options Screen</h1><p>Decide whether an option chain is worth opening. Live premium still decides the trade.</p></div><Status tone="gray">SCREEN ONLY</Status></header>

    <section className="rules"><span><b>$750</b> max spread loss</span><span><b>$1,500</b> total open spread risk</span><span><b>21–60</b> DTE</span><span><b>0.15–0.35</b> short delta</span><span><b>100+</b> OI</span></section>

    <section className="card searchCard">
      <form onSubmit={analyze} className="form"><label><span>Stock symbol</span><input value={symbol} onChange={e=>setSymbol(e.target.value)} placeholder="MU" autoCapitalize="characters"/></label><button disabled={loading}>{loading?'Screening…':'Screen Options'}</button></form>
      <p className="hint">Portfolio match: <b>{ownedShares}</b> shares{modeledCash>0?` • modeled cash ${money(modeledCash)}`:' • no cash position modeled'}.</p>{error&&<p className="error">{error}</p>}
    </section>

    <section className={`verdict ${tone}`}><div><small>OPTIONS SCREEN</small><h2>{verdict}</h2><p>{detail}</p></div>{result&&<Status tone={bullish?'green':result.action==='Watch'?'yellow':'red'}>{result.action}</Status>}</section>

    {result&&<>
      <section className="context">
        <div><small>Stock</small><b>{sym(result.stock)} · {money(price(result.stock))}</b></div>
        <div><small>Event gate</small><b>{result.eventRisk?.label||'Not verified'}</b></div>
        <div><small>Qualifying put contracts</small><b>{liquidPutCount}</b></div>
        <div><small>100-share stock value</small><b>{money(capitalFit)}</b></div>
      </section>

      {bullish&&eventKnown&&!eventBlocked&&liquidPutCount>0&&<section className="card focus">
        <h2>What to inspect in Schwab</h2>
        <div className="focusGrid">
          <div><small>Expiration</small><b>21–60 DTE</b><p>Start around 30–45 DTE.</p></div>
          <div><small>Short-put delta</small><b>0.15–0.35</b><p>Use this only to narrow the chain—not to pick the trade.</p></div>
          <div><small>Liquidity</small><b>OI ≥ 100</b><p>{liquidPutCount} sampled contracts currently clear the basic structural window.</p></div>
          <div><small>Capital fit</small><b>{spreadLikely?'Spread more practical':'CSP may fit'}</b><p>{spreadLikely?`100 shares are roughly ${money(capitalFit)}, so a defined-risk put spread is more compatible with the small-position framework.`:`100 shares are roughly ${money(capitalFit)}; a CSP may be worth pricing if assignment is genuinely desired.`}</p></div>
        </div>
        <div className="pricingBox"><b>Premium is the decision point.</b><span>In Schwab, compare the actual bid/ask and net credit. Only then can we know breakeven, effective entry, return on risk, and whether a specific strike or spread is attractive.</span></div>
      </section>}

      <section className="card compact">
        <h2>What Massive is contributing</h2>
        <p className="sub">Chain structure, expiration, delta, IV, open interest and volume help us decide whether the option market deserves a look. We deliberately do <b>not</b> display the {structuralSpreads.length} unpriced spread pair{structuralSpreads.length===1?'':'s'} or {structuralCsp.length} unpriced CSP structure{structuralCsp.length===1?'':'s'} the backend can identify, because without premium they are not trade candidates.</p>
      </section>

      <section className="stopBox"><b>No bid/ask = no option trade recommendation.</b><span>That rule is now explicit in the UI.</span></section>
    </>}

    <style jsx global>{`*{box-sizing:border-box}body{margin:0;background:#f4f7fb;color:#111827;font-family:Inter,Arial,sans-serif}main{max-width:1200px;margin:auto;padding:18px}h1,h2,p{margin-top:0}h1{margin-bottom:5px}.back{display:inline-block;margin-bottom:9px;color:#1d4ed8;font-weight:800;text-decoration:none}header{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}.card{background:#fff;border:1px solid #cbd5e1;border-radius:16px;padding:18px;margin:14px 0}.form{display:flex;gap:10px;align-items:flex-end}.form label{display:flex;flex-direction:column;gap:6px;font-weight:800}.form label span{font-size:13px}.form input{border:1px solid #cbd5e1;border-radius:10px;padding:11px 12px;font:inherit;min-width:220px}.form button{border:0;border-radius:10px;background:#111827;color:#fff;padding:12px 18px;font:inherit;font-weight:900;cursor:pointer}.form button:disabled{opacity:.6}.hint,.sub{color:#53657f}.hint{font-size:13px;margin:10px 0 0}.error{background:#fee2e2;color:#991b1b;border-radius:10px;padding:10px;margin:12px 0 0}.status{display:inline-block;border-radius:999px;padding:6px 10px;font-size:12px;font-weight:900;border:1px solid;white-space:nowrap}.status.green{background:#dcfce7;color:#166534;border-color:#86efac}.status.yellow{background:#fef9c3;color:#854d0e;border-color:#fde047}.status.red{background:#fee2e2;color:#991b1b;border-color:#fecaca}.status.gray{background:#e5e7eb;color:#374151;border-color:#cbd5e1}.rules{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}.rules span{background:#fff;border:1px solid #cbd5e1;border-radius:999px;padding:8px 12px;color:#53657f}.rules b{color:#111827}.verdict{display:flex;justify-content:space-between;align-items:flex-start;gap:15px;border:1px solid;border-radius:16px;padding:18px;margin:14px 0;background:#fff}.verdict small{font-weight:900;letter-spacing:.06em}.verdict h2{margin:4px 0 6px}.verdict p{margin:0;color:#53657f;max-width:820px}.verdict.green{border-color:#4ade80;background:#f6fff8}.verdict.yellow{border-color:#fde047;background:#fffef1}.verdict.red{border-color:#fca5a5;background:#fff8f8}.verdict.gray{border-color:#cbd5e1}.context{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.context>div,.focusGrid>div{background:#fff;border:1px solid #cbd5e1;border-radius:12px;padding:12px}.context small,.focusGrid small{display:block;color:#64748b;font-weight:800;margin-bottom:5px}.focusGrid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.focusGrid b{font-size:18px}.focusGrid p{color:#53657f;font-size:13px;margin:5px 0 0;line-height:1.4}.pricingBox,.stopBox{display:flex;gap:10px;align-items:flex-start;border-radius:12px;padding:13px;margin-top:12px}.pricingBox{background:#fff7ed;border:1px solid #fb923c;color:#9a3412}.pricingBox span{color:#7c2d12}.stopBox{background:#111827;color:#fff;margin:14px 0}.stopBox span{color:#dbe3ee}.compact p{margin-bottom:0;line-height:1.5}@media(max-width:900px){.context,.focusGrid{grid-template-columns:repeat(2,1fr)}}@media(max-width:650px){main{padding:10px}header,.verdict,.form,.pricingBox,.stopBox{flex-direction:column}.form label,.form input,.form button{width:100%}.context,.focusGrid{grid-template-columns:1fr}}`}</style>
  </main>;
}
