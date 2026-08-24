const fs=require('fs');
const path='pages/index.js';
let s=fs.readFileSync(path,'utf8');
if(s.includes('Portfolio Sync')){console.log('Portfolio sync UI already applied.');process.exit(0);}

const keyMarker='const KEY="stock_screener_portfolio_v1";';
if(!s.includes(keyMarker))throw new Error('portfolio sync: key marker missing');
s=s.replace(keyMarker,keyMarker+'\nconst SYNC_KEY="stock_screener_portfolio_sync_key_v1";');

const stateMarker='  const[marketRadar,setMarketRadar]=useState([]);';
if(!s.includes(stateMarker))throw new Error('portfolio sync: market radar state marker missing');
s=s.replace(stateMarker,stateMarker+'\n  const[syncKey,setSyncKey]=useState(""),[syncInput,setSyncInput]=useState(""),[syncStatus,setSyncStatus]=useState("");');

const effectOld='  useEffect(()=>{try{const x=JSON.parse(localStorage.getItem(KEY)||"[]");if(Array.isArray(x)){const m=x.map(p=>({...p,role:role(p.symbol,p.role),winnerHistory:winnerHistoryFor(p)}));setPortfolio(m);localStorage.setItem(KEY,JSON.stringify(m));}}catch{}load("opportunities");},[]);';
const effectNew='  useEffect(()=>{let local=[];try{const x=JSON.parse(localStorage.getItem(KEY)||"[]");if(Array.isArray(x)){local=x.map(p=>({...p,role:role(p.symbol,p.role),winnerHistory:winnerHistoryFor(p)}));setPortfolio(local);localStorage.setItem(KEY,JSON.stringify(local));}}catch{}const k=localStorage.getItem(SYNC_KEY)||"";if(k){setSyncKey(k);setSyncInput(k);void pullCloudPortfolio(k,local,true);}load("opportunities");},[]);';
if(!s.includes(effectOld))throw new Error('portfolio sync: effect marker missing');
s=s.replace(effectOld,effectNew);

const saveOld='  function save(x){setPortfolio(x);localStorage.setItem(KEY,JSON.stringify(x));}';
const helpers=`  async function pushCloudPortfolio(rows,key=syncKey){if(!key)return false;try{setSyncStatus('Syncing…');const r=await fetch('/api/portfolio-sync',{method:'PUT',headers:{'content-type':'application/json',authorization:\`Bearer \${key}\`},body:JSON.stringify({portfolio:rows})}),d=await r.json();if(!r.ok)throw new Error(d.error||'Sync failed');setSyncStatus('Synced');return true;}catch(e){setSyncStatus(\`Sync error: \${e.message}\`);return false;}}\n  async function pullCloudPortfolio(key,fallback=[],quiet=false){try{if(!quiet)setSyncStatus('Loading cloud portfolio…');const r=await fetch('/api/portfolio-sync',{headers:{authorization:\`Bearer \${key}\`},cache:'no-store'}),d=await r.json();if(r.status===404){if(quiet&&fallback.length){await pushCloudPortfolio(fallback,key);return true;}throw new Error('No portfolio found for this sync key.');}if(!r.ok)throw new Error(d.error||'Sync failed');const rows=Array.isArray(d.portfolio)?d.portfolio:[];setPortfolio(rows);localStorage.setItem(KEY,JSON.stringify(rows));setSyncStatus('Synced');return true;}catch(e){setSyncStatus(\`Sync error: \${e.message}\`);return false;}}\n  function newSyncKey(){const b=new Uint8Array(24);crypto.getRandomValues(b);return Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');}\n  async function enableSync(){const k=newSyncKey();setSyncKey(k);setSyncInput(k);localStorage.setItem(SYNC_KEY,k);const ok=await pushCloudPortfolio(portfolio,k);if(ok)setSyncStatus('Sync enabled — use this key on your other device.');}\n  async function connectSync(){const k=syncInput.trim();if(k.length<32){setSyncStatus('Enter a valid sync key.');return;}const ok=await pullCloudPortfolio(k,[],false);if(ok){setSyncKey(k);localStorage.setItem(SYNC_KEY,k);}}\n  function disconnectSync(){localStorage.removeItem(SYNC_KEY);setSyncKey('');setSyncInput('');setSyncStatus('Sync disconnected on this device.');}\n  async function copySyncKey(){if(!syncKey)return;try{await navigator.clipboard.writeText(syncKey);setSyncStatus('Sync key copied.');}catch{setSyncStatus('Copy failed — select the key manually.');}}\n  function save(x){setPortfolio(x);localStorage.setItem(KEY,JSON.stringify(x));if(syncKey)void pushCloudPortfolio(x,syncKey);}`;
if(!s.includes(saveOld))throw new Error('portfolio sync: save marker missing');
s=s.replace(saveOld,helpers);

const portfolioMarker='<div className="chips">{portfolio.map(p=><span key={p.symbol}><b>{p.symbol}</b> {p.shares} @ {money(p.avgCost)}';
const ix=s.indexOf(portfolioMarker);
if(ix<0)throw new Error('portfolio sync: chips marker missing');
const chipsEnd='</div></section>';
const endIx=s.indexOf(chipsEnd,ix);
if(endIx<0)throw new Error('portfolio sync: portfolio section end missing');
const syncUi='<div className="syncBox"><div><b>☁ Portfolio Sync</b><small>One portfolio across your Mac and phone.</small></div><div className="syncControls"><input value={syncInput} onChange={e=>setSyncInput(e.target.value)} placeholder="Sync key" autoComplete="off" spellCheck="false"/>{syncKey?<><button onClick={copySyncKey}>Copy Key</button><button onClick={disconnectSync}>Disconnect</button></>:<><button onClick={enableSync}>Enable Sync</button><button onClick={connectSync}>Connect</button></>}</div>{syncStatus&&<span className="syncStatus">{syncStatus}</span>}</div>';
s=s.slice(0,endIx)+syncUi+s.slice(endIx);

const cssMarker='.error{background:#fee2e2;padding:10px;border-radius:10px}';
if(!s.includes(cssMarker))throw new Error('portfolio sync: css marker missing');
const syncCss='.syncBox{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:12px;padding:10px 12px;border:1px solid #cbd5e1;border-radius:12px;background:#f8fafc}.syncBox>div:first-child{display:flex;flex-direction:column;min-width:180px}.syncBox small{color:#64748b}.syncControls{display:flex;gap:8px;flex:1;flex-wrap:wrap}.syncControls input{min-width:280px;flex:1}.syncStatus{color:#53657f;font-weight:700;font-size:13px}@media(max-width:700px){.syncControls{width:100%}.syncControls input{min-width:0;width:100%}}';
s=s.replace(cssMarker,syncCss+cssMarker);

fs.writeFileSync(path,s);
console.log('Applied secure cross-device portfolio sync UI.');
