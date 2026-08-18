import {useEffect,useMemo,useState} from 'react';

const PORTFOLIO_KEY='stock_screener_portfolio_v1';
const CASH=['CASH','SWVXX','VMFXX','SPAXX','FDRXX','MMF'];

const money=v=>Number.isFinite(+v)?(+v).toLocaleString('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}):'—';
const pct=v=>Number.isFinite(+v)?`${((+v)*100).toFixed(1)}%`:'—';
const sym=s=>String(s?.symbol??s?.ticker??'').toUpperCase();
const price=s=>+(s?.price??s?.currentPrice??s?.lastPrice);
const rec=s=>s?.recommendation&&typeof s.recommendation==='object'?s.recommendation:{};
const stockAction=s=>String(s?.finalDecision?.action??rec(s)?.displayLabel??rec(s)?.label??s?.action??'Unknown');
const event=s=>s?.eventRisk||s?.preTradeCheck||rec(s)?.eventRisk||rec(s)?.preTradeCheck||null;
const clean=s=>String(s||'').trim().toUpperCase().replace(/[^A-Z.\-]/g,'');

function extract(d){for(const x of[d?.stock,d?.result,d?.data,d])if(x&&typeof x==='object'&&!Array.isArray(x)&&(sym(x)||Number.isFinite(price(x))))return x;return null;}
function optionalParam(params,key,value){if(value!==null&&value!==undefined&&value!=='')params.set(key,String(value));}

function blockerSummary(data,strategyKey){
  const counts=new Map();
  for(const c of data?.contracts||[]){
    const blockers=c?.analysis?.strategies?.[strategyKey]?.blockers||[];
    for(const b of blockers){
      if(String(b).startsWith('Execution pricing is unavailable'))continue;
      counts.set(b,(counts.get(b)||0)+1);
    }
  }
  return [...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,4);
}

function Status({children,tone='gray'}){return <span className={`status ${tone}`}>{children}</span>}

export default function OptionsLab(){
  const[symbol,setSymbol]=useState('');
  const[portfolio,setPortfolio]=useState([]);
  const[cashInput,setCashInput]=useState('');
  const[result,setResult]=useState(null);
  const[loading,setLoading]=useState(false);
  const[error,setError]=useState('');

  useEffect(()=>{
    try{
      const rows=JSON.parse(localStorage.getItem(PORTFOLIO_KEY)||'[]');
      if(Array.isArray(rows)){
        setPortfolio(rows);
        const modeledCash=rows.filter(x=>CASH.includes(clean(x.symbol))).reduce((a,x)=>a+(+x.shares||0)*(+x.avgCost||1),0);
        if(modeledCash>0)setCashInput(String(Math.round(modeledCash*100)/100));
      }
    }catch{}
  },[]);

  const ownedShares=useMemo(()=>{
    const key=clean(symbol),p=portfolio.find(x=>clean(x.symbol)===key);
    return +p?.shares||0;
  },[portfolio,symbol]);

  async function getStock(key){
    let broad=[];
    try{
      const r=await fetch('/api/top5?theme=opportunities',{cache:'no-store'}),d=await r.json();
      if(r.ok&&Array.isArray(d.stocks))broad=d.stocks;
    }catch{}
    const authoritative=broad.find(s=>sym(s)===key);
    if(authoritative)return{stock:authoritative,source:'Authoritative broad screen'};
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
      const params=new URLSearchParams({symbol:key,limit:'250',stockAction:action,ownedShares:String(ownedShares)});
      optionalParam(params,'cashAvailable',cashInput===''?null:+cashInput);
      if(er){
        if(typeof er.blockNewCapital==='boolean')params.set('eventBlockNewCapital',String(er.blockNewCapital));
        if(typeof er.manualCheckRequired==='boolean')params.set('eventManualCheckRequired',String(er.manualCheckRequired));
        optionalParam(params,'eventLabel',er.label);
      }
      const putParams=new URLSearchParams(params);putParams.set('type','put');
      const callParams=new URLSearchParams(params);callParams.set('type','call');
      const [pr,cr]=await Promise.all([
        fetch(`/api/options?${putParams.toString()}`,{cache:'no-store'}),
        fetch(`/api/options?${callParams.toString()}`,{cache:'no-store'}),
      ]);
      const [puts,calls]=await Promise.all([pr.json(),cr.json()]);
      if(!pr.ok)throw new Error(puts.message||puts.error||'Put-chain analysis failed');
      if(!cr.ok)throw new Error(calls.message||calls.error||'Call-chain analysis failed');
      setResult({stock,source,action,eventRisk:er,puts,calls,cashAvailable:cashInput===''?null:+cashInput,ownedShares});
    }catch(err){setError(err.message||String(err));}
    finally{setLoading(false);}
  }

  const csp=result?.puts?.structuralCandidates?.filter(x=>x.cashSecuredPutCandidate)||[];
  const cc=result?.calls?.structuralCandidates?.filter(x=>x.coveredCallCandidate)||[];
  const spreads=result?.puts?.putCreditSpreads||[];
  const cspBlockers=blockerSummary(result?.puts,'cashSecuredPut');
  const ccBlockers=blockerSummary(result?.calls,'coveredCall');
  const quotes=(result?.puts?.coverage?.quotes||0)+(result?.calls?.coverage?.quotes||0);

  return <main>
    <header><div><a href="/" className="back">← Investment Operating System</a><h1>Options Lab</h1><p>Round 1 audit: covered calls, cash-secured puts, and defined-risk put credit spreads.</p></div><Status tone="yellow">ANALYSIS ONLY</Status></header>

    <section className="guardrails">
      <div><small>Put spread max loss</small><b>$750</b></div>
      <div><small>Total open spread risk</small><b>$1,500</b></div>
      <div><small>CSP assignment cap</small><b>$3,000</b></div>
      <div><small>Short premium window</small><b>21–60 DTE</b></div>
      <div><small>Minimum open interest</small><b>100</b></div>
    </section>

    <section className="card">
      <h2>Analyze a symbol</h2>
      <p className="sub">The stock engine remains authoritative. This page cannot place a trade and will fail closed when required context or execution pricing is unavailable.</p>
      <form onSubmit={analyze} className="form">
        <label><span>Symbol</span><input value={symbol} onChange={e=>setSymbol(e.target.value)} placeholder="MU" autoCapitalize="characters"/></label>
        <label><span>CSP cash available <em>analysis input</em></span><input value={cashInput} onChange={e=>setCashInput(e.target.value)} inputMode="decimal" placeholder="0"/></label>
        <button disabled={loading}>{loading?'Analyzing…':'Analyze Options'}</button>
      </form>
      <p className="hint">Owned shares are read from My Portfolio automatically. Current match: <b>{ownedShares}</b> shares.</p>
      {error&&<p className="error">{error}</p>}
    </section>

    {result&&<>
      <section className="card context">
        <div className="sectionHead"><div><h2>{sym(result.stock)} context</h2><p className="sub">{result.source}</p></div><Status tone={['Strong Buy','Buy'].includes(result.action)?'green':result.action==='Watch'?'yellow':'red'}>{result.action}</Status></div>
        <div className="contextGrid">
          <div><small>Stock price</small><b>{money(price(result.stock))}</b></div>
          <div><small>Owned shares</small><b>{result.ownedShares}</b></div>
          <div><small>CSP cash modeled</small><b>{result.cashAvailable===null?'Unknown':money(result.cashAvailable)}</b></div>
          <div><small>Event gate</small><b>{result.eventRisk?.label||'Context unavailable'}</b></div>
        </div>
        {quotes===0&&<div className="warning"><b>Execution pricing unavailable.</b> Your current Massive plan is not returning bid/ask quotes, so premium, actual max loss, return on risk, and executable recommendations remain blocked.</div>}
      </section>

      <section className="strategyGrid">
        <article className="card strategy">
          <div className="sectionHead"><div><h2>Put Credit Spreads</h2><p className="sub">Primary capital-efficient bullish structure for higher-priced Buy / Strong Buy names.</p></div><Status tone="yellow">STRUCTURAL</Status></div>
          {spreads.length?<div className="scroll"><table><thead><tr><th>Expiry</th><th>Short / Long</th><th>Delta</th><th>OI short / long</th><th>Width</th><th>Worst-case width risk</th><th>Status</th></tr></thead><tbody>{spreads.slice(0,8).map((x,i)=><tr key={`${x.expirationDate}-${x.shortStrike}-${x.longStrike}-${i}`}><td>{x.expirationDate}<small>{x.dte} DTE</small></td><td><b>{money(x.shortStrike)} / {money(x.longStrike)}</b></td><td>{Number.isFinite(+x.shortDelta)?Math.abs(+x.shortDelta).toFixed(3):'—'}</td><td>{x.shortOpenInterest??'—'} / {x.longOpenInterest??'—'}</td><td>{money(x.width)}</td><td>{money(x.conservativeMaxRisk)}</td><td><Status tone="yellow">Pricing blocked</Status></td></tr>)}</tbody></table></div>:<Empty text="No put-spread pair cleared the current stock-authority, event, delta, open-interest and ≤$750 width-risk gates in the sampled chain."/>}
          <p className="foot">“Worst-case width risk” is width × 100 before premium. Actual max loss is lower by the credit received, but we refuse to calculate it without real bid/ask pricing.</p>
        </article>

        <article className="card strategy">
          <div className="sectionHead"><div><h2>Cash-Secured Puts</h2><p className="sub">Only when assignment would create a position we actually want and the capital commitment stays small.</p></div><Status tone="gray">SINGLE LEG</Status></div>
          {csp.length?<div className="scroll"><table><thead><tr><th>Expiry</th><th>Strike</th><th>Delta</th><th>OI</th><th>Assignment cash</th></tr></thead><tbody>{csp.slice(0,8).map((x,i)=><tr key={`${x.ticker}-${i}`}><td>{x.expirationDate}<small>{x.dte} DTE</small></td><td>{money(x.strike)}</td><td>{Number.isFinite(+x.delta)?Math.abs(+x.delta).toFixed(3):'—'}</td><td>{x.openInterest??'—'}</td><td>{money((+x.strike||0)*100)}</td></tr>)}</tbody></table></div>:<Empty text="No CSP currently clears every structural gate." details={cspBlockers}/>} 
        </article>

        <article className="card strategy">
          <div className="sectionHead"><div><h2>Covered Calls</h2><p className="sub">Requires 100 owned shares and a portfolio state where capping upside is actually appropriate.</p></div><Status tone="gray">SINGLE LEG</Status></div>
          {cc.length?<div className="scroll"><table><thead><tr><th>Expiry</th><th>Strike</th><th>Delta</th><th>OI</th></tr></thead><tbody>{cc.slice(0,8).map((x,i)=><tr key={`${x.ticker}-${i}`}><td>{x.expirationDate}<small>{x.dte} DTE</small></td><td>{money(x.strike)}</td><td>{Number.isFinite(+x.delta)?Math.abs(+x.delta).toFixed(3):'—'}</td><td>{x.openInterest??'—'}</td></tr>)}</tbody></table></div>:<Empty text="No covered-call contract currently clears every structural gate. The standalone lab intentionally does not guess a Portfolio Intelligence action." details={ccBlockers}/>} 
        </article>
      </section>

      <section className="card audit">
        <h2>Data audit</h2>
        <div className="auditGrid">
          <div><small>Put contracts analyzed</small><b>{result.puts.returnedContracts}</b></div>
          <div><small>Call contracts analyzed</small><b>{result.calls.returnedContracts}</b></div>
          <div><small>Put contracts with Greeks</small><b>{result.puts.coverage?.greeks||0}</b></div>
          <div><small>Call contracts with Greeks</small><b>{result.calls.coverage?.greeks||0}</b></div>
          <div><small>Contracts with quotes</small><b>{quotes}</b></div>
          <div><small>More chain data exists</small><b>{result.puts.hasMore||result.calls.hasMore?'Yes — sampled':'No'}</b></div>
        </div>
      </section>
    </>}

    <style jsx global>{`*{box-sizing:border-box}body{margin:0;background:#f4f7fb;color:#111827;font-family:Inter,Arial,sans-serif}main{max-width:1440px;margin:auto;padding:18px}h1,h2,p{margin-top:0}h1{margin-bottom:6px}.back{display:inline-block;margin-bottom:10px;color:#1d4ed8;font-weight:800;text-decoration:none}header,.sectionHead{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.card{background:white;border:1px solid #cbd5e1;border-radius:16px;padding:18px;margin:14px 0}.sub,.hint,.foot{color:#53657f}.guardrails{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin:16px 0}.guardrails>div,.contextGrid>div,.auditGrid>div{background:white;border:1px solid #cbd5e1;border-radius:14px;padding:13px}.guardrails small,.contextGrid small,.auditGrid small,td small{display:block;color:#64748b;font-weight:800;margin-bottom:4px}.guardrails b{font-size:20px}.form{display:flex;align-items:flex-end;gap:10px;flex-wrap:wrap}.form label{display:flex;flex-direction:column;gap:6px;font-weight:800}.form label span{font-size:13px}.form em{font-style:normal;color:#64748b;font-weight:600}.form input{border:1px solid #cbd5e1;border-radius:10px;background:white;padding:10px 12px;font:inherit;min-width:180px}.form button{border:0;border-radius:10px;background:#111827;color:white;padding:11px 16px;font:inherit;font-weight:900;cursor:pointer}.form button:disabled{opacity:.6}.error{background:#fee2e2;color:#991b1b;border-radius:10px;padding:10px;margin-top:12px}.status{display:inline-block;border-radius:999px;padding:6px 10px;font-size:12px;font-weight:900;border:1px solid}.status.green{background:#dcfce7;color:#166534;border-color:#86efac}.status.yellow{background:#fef9c3;color:#854d0e;border-color:#fde047}.status.red{background:#fee2e2;color:#991b1b;border-color:#fecaca}.status.gray{background:#e5e7eb;color:#374151;border-color:#cbd5e1}.contextGrid,.auditGrid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.warning{margin-top:12px;background:#fff7ed;border:1px solid #fb923c;border-radius:12px;padding:12px;color:#9a3412}.strategyGrid{display:grid;grid-template-columns:1fr;gap:0}.strategy h2{margin-bottom:5px}.scroll{overflow:auto}table{width:100%;border-collapse:collapse;margin-top:8px}th,td{text-align:left;padding:10px;border-bottom:1px solid #dbe3ee;vertical-align:top;white-space:nowrap}th{font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.03em}.empty{background:#f8fafc;border:1px solid #dbe3ee;border-radius:12px;padding:13px;margin-top:10px}.empty p{margin-bottom:6px}.empty ul{margin:6px 0 0;padding-left:18px;color:#53657f}.foot{font-size:13px;margin:10px 0 0}.auditGrid{grid-template-columns:repeat(6,1fr)}@media(max-width:1000px){.guardrails{grid-template-columns:repeat(2,1fr)}.contextGrid{grid-template-columns:repeat(2,1fr)}.auditGrid{grid-template-columns:repeat(3,1fr)}}@media(max-width:650px){main{padding:10px}header{flex-direction:column}.guardrails,.contextGrid,.auditGrid{grid-template-columns:1fr}.form label,.form input,.form button{width:100%}.sectionHead{gap:8px}th,td{padding:9px}}`}</style>
  </main>;
}

function Empty({text,details=[]}){
  return <div className="empty"><p>{text}</p>{details.length>0&&<ul>{details.map(([label,count])=><li key={label}>{label} <b>({count} contracts)</b></li>)}</ul>}</div>;
}
