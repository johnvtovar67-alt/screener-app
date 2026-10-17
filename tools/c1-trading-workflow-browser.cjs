// Automated real Chromium/HTTP workflow. Actual production components and API
// handler; isolated synthetic account/store/provider evidence. Never deploy.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {createWorkflowApi}=require('./fixtures/c1-trading-workflow-api.cjs');
const root=process.cwd(),out=path.resolve(process.env.C1_WORKFLOW_EVIDENCE||'work/operational-evidence/browser');fs.mkdirSync(out,{recursive:true});
const pause=ms=>new Promise(r=>setTimeout(r,ms)),trace={scope:'Real Chromium → production React components → HTTP → production API → isolated memory account',cases:[],liveWrites:0};
async function main(){
 const w=require('next/dist/compiled/webpack/webpack');w.init();
 await new Promise((resolve,reject)=>w.webpack({mode:'development',target:'web',devtool:false,entry:path.join(root,'tools/fixtures/c1-trading-workflow-browser.jsx'),
  output:{path:out,filename:'client.js'},resolve:{modules:[path.join(root,'node_modules'),'node_modules'],alias:{'@babel/runtime':path.join(path.dirname(require.resolve('next/package.json')),'dist/compiled/@babel/runtime')}},
  module:{rules:[{test:/\.jsx?$/,exclude:/node_modules/,use:{loader:path.join(root,'tools/fixtures/c1-workflow-babel-loader.cjs')}}]}}).run((error,stats)=>error?reject(error):stats.hasErrors()?reject(Error(stats.toString({all:false,errors:true}))):resolve()));
 let api=createWorkflowApi();
 const server=http.createServer(async(req,res)=>{
  try{
   let body='';for await(const data of req)body+=data;
   if(req.url==='/fixture-adoption-stop'){api.fixture.now='2026-10-15T17:00:00Z';api.fixture.setQuote('MRNA',75);res.end('synthetic next session');return;}
   if(req.url==='/fixture-quote'){const q=JSON.parse(body);api.fixture.setQuote(q.symbol,q.price);res.end('updated fixture quote');return;}
   if(req.url==='/fixture-reset'){api=createWorkflowApi(body);res.end('reset');return;}
   if(req.url==='/api/c1-account'){
    const result=await api.request(req.method,body?JSON.parse(body):undefined,req.headers.authorization==='Bearer offline_workflow_fixture_key_000001');
    res.writeHead(result.status,{'content-type':'application/json'});res.end(JSON.stringify(result.body));return;
   }
   if(req.url==='/client.js'){res.setHeader('content-type','text/javascript; charset=utf-8');res.end(fs.readFileSync(path.join(out,'client.js')));return;}
   if(req.url==='/'){
    res.setHeader('content-type','text/html; charset=utf-8');res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{font:16px system-ui;margin:20px;background:#f1f5f9;color:#172033}main{max-width:1200px;margin:auto}.card,section{background:white;padding:16px;margin:12px 0;border:1px solid #cbd5e1;border-radius:8px}.inputs,nav,.brokerageCashSummary{display:flex;gap:12px;flex-wrap:wrap;align-items:center}label{display:block;margin:8px 0}input,select,button{font:inherit;padding:8px}button{cursor:pointer}.scroll{overflow:auto}table{border-collapse:collapse}td,th{padding:8px;text-align:left}.red{color:#a31515}.green{color:#08783a}.grid{display:grid;gap:12px}.plan{padding:10px;background:#f8fafc}</style><script>window.__C1_TEST_CLOCK='2026-10-15T17:00:00Z';const RealDate=Date;window.Date=class extends RealDate{constructor(...a){super(...(a.length?a:[window.__C1_TEST_CLOCK]));}static now(){return RealDate.parse(window.__C1_TEST_CLOCK);}};</script></head><body><div id="root"></div><script src="/client.js"></script></body></html>`);return;
   }res.writeHead(404);res.end('not found');
  }catch(error){res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({error:error.message}));}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
 const binary=process.env.C1_BROWSER_BIN||['/usr/bin/chromium','/usr/bin/google-chrome','/opt/google/chrome/chrome'].find(p=>fs.existsSync(p));assert(binary,'Set C1_BROWSER_BIN to an installed Chromium/Chrome executable');
 const profile=fs.mkdtempSync(path.join(out,'profile-')),chrome=spawn(binary,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-background-networking','--disable-component-update','--disable-sync','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:['ignore','ignore',fs.openSync(path.join(out,'chromium.log'),'w')]});
 let socket;
 try{
  const portFile=path.join(profile,'DevToolsActivePort');for(let i=0;!fs.existsSync(portFile)&&i<200;i++)await pause(50);assert(fs.existsSync(portFile),'Chromium did not start');
  const [port,endpoint]=fs.readFileSync(portFile,'utf8').trim().split('\n');socket=new WebSocket('ws://127.0.0.1:'+port+endpoint);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  let serial=0;const pending=new Map();socket.addEventListener('message',event=>{const r=JSON.parse(event.data);if(r.id&&pending.has(r.id)){const {resolve,reject}=pending.get(r.id);pending.delete(r.id);r.error?reject(Error(JSON.stringify(r.error))):resolve(r.result);}});
  const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});
  const target=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId:target.targetId,flatten:true});
  const cdp=(m,p)=>send(m,p,sessionId);await cdp('Page.enable');await cdp('Runtime.enable');await cdp('Emulation.setTimezoneOverride',{timezoneId:'UTC'});await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  async function js(expression){const r=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
  async function wait(expression,description){for(let i=0;i<200;i++){if(await js(`Boolean(${expression})`))return;await pause(50);}throw Error('Browser timeout: '+description+'\n'+await js('document.body.innerText'));}
  const click=label=>js(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent===${JSON.stringify(label)}&&!b.disabled);if(!b)throw Error('Button unavailable: '+${JSON.stringify(label)});b.click();})()`);
  async function input(label,value){await js(`(()=>{const e=document.querySelector('[aria-label='+JSON.stringify(${JSON.stringify(label)})+']');if(!e)throw Error('Missing input');const proto=e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);}
  async function shot(name){const {cssContentSize:s}=await cdp('Page.getLayoutMetrics');const r=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:Math.min(s.width,1440),height:s.height,scale:1}});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(r.data,'base64'));}
  async function cash(value){await wait("document.querySelector('nav button')?.disabled===false&&[...document.querySelectorAll('button')].some(b=>b.textContent==='Update'&&!b.disabled)",'cash editor ready');await click('Update');await input('Actual brokerage cash',String(value));await click('Update Brokerage Cash');await wait(`window.__C1_LAST_VIEW?.decision?.brokerageCash===${value}&&window.__C1_LAST_VIEW?.openingError!==undefined&&document.querySelector('nav button')?.disabled===false`,'cash update');await pause(150);}
  await cdp('Page.navigate',{url});await wait('window.__C1_LAST_VIEW?.decision&&document.querySelector("[aria-label=\\"Brokerage cash\\"]")','initial account');await pause(200);
  await cash(50);await wait('window.__C1_LAST_VIEW?.openingPlan?.cashBlockedOrders?.length>0','insufficient funds');
  assert(!(await js('document.body.innerText')).match(/Buy \d+ shares/));assert((await js('document.body.innerText')).includes('MRNA'));await shot('buy-insufficient');trace.cases.push({case:'MRNA-qualified-insufficient-cash',brokerCash:50,buyInstruction:false});
  await cash(100000);await wait('document.body.innerText.includes("Buy 265 shares")','verified Buy quantity');assert(!(await js('document.body.innerText')).includes('C1 strategy cash'));await shot('buy-ready');
  await input('Completed trade','planned:buy:MRNA');await input('Shares filled','265');await input('Execution price','100.12');await input('Fee','0');
  const when=await js('new Date(Date.now()).toISOString().slice(0,16)');await input('Execution time',when);await js('document.querySelector("input[type=checkbox]").click()');await click('Save trade and update C1');
  await wait('document.body.innerText.includes("Saved in C1:")&&window.__C1_LAST_VIEW?.decision?.positions.some(p=>p.symbol==="MRNA"&&p.shares===265)','actual Buy receipt');
  assert.equal(await js('window.__C1_LAST_VIEW.decision.brokerageCash'),73468.2);await shot('buy-recorded');
  await cdp('Page.reload');await wait('window.__C1_LAST_VIEW?.intradaySession?.tickets?.length===1&&document.body.innerText.includes("MRNA: 265 recorded shares")','reload actual Buy');
  assert.equal(await js('window.__C1_LAST_VIEW.decision.brokerageCash'),73468.2);await cash(73468.2);assert.equal(await js('window.__C1_LAST_VIEW.decision.brokerageCash'),73468.2);await shot('buy-reloaded');
  trace.cases.push({case:'verified-Buy-actual-fill-reload-cash-resnapshot',shares:265,actualPrice:100.12,cashAfter:73468.2,doubleCount:false});
  await click('Load MRNA verification example');await wait('window.__C1_LAST_VIEW?.openingError?.includes("verification incomplete")','missing entry verification');await cash(100000);
  const blocked=await js('document.body.innerText');assert(/Strong Buy rating/.test(blocked));assert(!/Buy \d+ shares/.test(blocked));assert(/current opening quote unavailable/.test(blocked));await shot('mrna-verification-blocked');trace.cases.push({case:'MRNA-rating-not-purchase-authority',cash:100000,buyInstruction:false});
  await click('Load DELL stop example');await wait('document.body.innerText.includes("Sell 20 shares in Schwab")','DELL stop quantity');await cash(0);
  const sell=await js('document.body.innerText');assert(/SELL — STOP TRIGGERED/.test(sell),sell);assert(/Recorded holding: 20 shares/.test(sell));assert(!/sale remains pending|sale completed/.test(sell));await shot('dell-stop-zero-cash');
  await input('Completed trade','stop:sell:DELL');await input('Shares filled','20');await input('Execution price','460');await input('Fee','0.25');
  await input('Execution time',await js('new Date(Date.now()).toISOString().slice(0,16)'));await js('document.querySelector("input[type=checkbox]").click()');await click('Save trade and update C1');
  await wait('window.__C1_LAST_VIEW?.intradaySession?.tickets?.length===1&&!window.__C1_LAST_VIEW.decision.positions.some(p=>p.symbol==="DELL")','confirmed DELL fill');assert.equal(await js('window.__C1_LAST_VIEW.decision.brokerageCash'),9199.75);await shot('dell-sale-recorded');
  await cdp('Page.reload');await wait('window.__C1_LAST_VIEW?.decision?.brokerageCash===9199.75','reload sale proceeds');assert(!await js('window.__C1_LAST_VIEW.decision.positions.some(p=>p.symbol==="DELL")'));
  trace.cases.push({case:'DELL-20-stop-sale-zero-cash-Buy-verification-unavailable',shares:20,actualPrice:460,fee:.25,cashAfter:9199.75,reload:'PASS'});
  await click('Load fourth-position example');await wait('window.__C1_LAST_VIEW?.decision?.positions.length===3&&document.querySelector("nav button")?.disabled===false','three existing Swing positions');await cash(5000);
  await wait('document.body.innerText.includes("Buy 49 shares")','qualified fourth-position instruction');
  assert(!/All three C1 position slots are currently allocated/.test(await js('document.body.innerText')));
  await input('Completed trade','planned:buy:MRNA');await input('Shares filled','49');await input('Execution price','100.12');await input('Fee','0');await input('Execution time',await js('new Date(Date.now()).toISOString().slice(0,16)'));await js('document.querySelector("input[type=checkbox]").click()');await click('Save trade and update C1');
  await wait('window.__C1_LAST_VIEW?.decision?.positions.length===4&&window.__C1_LAST_VIEW?.intradaySession?.tickets.length===1','fourth position recorded');assert.equal(await js('window.__C1_LAST_VIEW.decision.brokerageCash'),94.12);await shot('fourth-swing-recorded');
  await cdp('Page.reload');await wait('window.__C1_LAST_VIEW?.decision?.positions.length===4&&document.querySelector("nav button")?.disabled===false','fourth position reload');
  assert.equal(await js('window.__C1_LAST_VIEW.decision.positions.find(p=>p.symbol==="MRNA").shares'),49);await cash(0);await click('Verify fourth-position stop');
  await wait('document.body.innerText.includes("Sell 49 shares in Schwab")&&document.querySelector("nav button")?.disabled===false','fourth position existing stop signal');await shot('fourth-swing-stop');
  await input('Completed trade','stop:sell:MRNA');await input('Shares filled','49');await input('Execution price','75');await input('Fee','0.25');await input('Execution time',await js('new Date(Date.now()).toISOString().slice(0,16)'));await js('document.querySelector("input[type=checkbox]").click()');await click('Save trade and update C1');
  await wait('window.__C1_LAST_VIEW?.decision?.positions.length===3&&window.__C1_LAST_VIEW?.intradaySession?.tickets.length===2','fourth position actual stop fill');assert.equal(await js('window.__C1_LAST_VIEW.decision.brokerageCash'),3674.75);
  await cdp('Page.reload');await wait('window.__C1_LAST_VIEW?.decision?.brokerageCash===3674.75&&window.__C1_LAST_VIEW?.decision?.positions.length===3','additional-position exit reload');
  trace.cases.push({case:'three-held-5000-cash-fourth-Swing-then-stop-sale',shares:49,buyPrice:100.12,cashAfterBuy:94.12,positionsAfterBuy:4,sellPrice:75,sellFee:.25,cashBeforeSale:0,cashAfterSale:3674.75,positionsAfterSale:3,reload:'PASS'});
  await wait('document.querySelector("nav button")?.disabled===false','previous workflow settled');
  await click('Load Core MRNA adoption example');await wait('window.__C1_LAST_VIEW?.decision?.positions.length===3&&document.querySelector("nav button")?.disabled===false','Core adoption fixture');
  assert.equal(await js('window.__C1_LAST_VIEW.decision.brokerageCash'),5000);
  await click('Review MRNA adoption');await wait('document.body.innerText.includes("MRNA: Core → Swing")','adoption review');
  assert(await js('[...document.querySelectorAll("button")].find(b=>b.textContent==="Confirm MRNA adoption").disabled'));
  assert.equal(await js('window.__C1_LAST_VIEW.decision.positions.some(p=>p.symbol==="MRNA")'),false);
  await js('[...document.querySelectorAll("section")].find(s=>s.getAttribute("aria-label")==="Adopt existing MRNA").querySelector("input[type=checkbox]").click()');await click('Confirm MRNA adoption');
  await wait('window.__C1_LAST_VIEW?.decision?.nonCashAdoptions?.length===1&&window.__C1_LAST_VIEW?.decision?.positions.length===4','confirmed non-cash adoption');
  assert.equal(await js('window.__C1_LAST_VIEW.decision.brokerageCash'),5000);assert.equal(await js('window.__C1_LAST_VIEW.decision.positions.find(p=>p.symbol==="MRNA").totalCost'),1760);assert.equal(await js('window.__C1_LAST_VIEW.intradaySession'),null);
  await cdp('Page.reload');await wait('window.__C1_LAST_VIEW?.decision?.positions.length===4&&document.querySelector("nav button")?.disabled===false','adoption reload');
  assert.equal(await js('window.__C1_LAST_VIEW.decision.positions.find(p=>p.symbol==="MRNA").openedAt'),'2026-10-01');
  await click('Verify adopted MRNA stop');await wait('document.body.innerText.includes("Sell 20 shares in Schwab")&&document.querySelector("nav button")?.disabled===false','adopted stop');await cash(0);
  await input('Completed trade','stop:sell:MRNA');await input('Shares filled','20');await input('Execution price','75');await input('Fee','0.25');await input('Execution time',await js('new Date(Date.now()).toISOString().slice(0,16)'));await js('document.querySelector("input[type=checkbox]").click()');await click('Save trade and update C1');
  await wait('window.__C1_LAST_VIEW?.decision?.positions.length===3&&window.__C1_LAST_VIEW?.decision?.brokerageCash===1499.75','adopted actual sale');
  await cdp('Page.reload');await wait('window.__C1_LAST_VIEW?.decision?.brokerageCash===1499.75&&window.__C1_LAST_VIEW?.decision?.positions.length===3','adopted sale reload');
  trace.cases.push({case:'confirmed-Core-adoption-without-trade-then-existing-stop-sale',shares:20,averageCost:88,totalCost:1760,purchaseDate:'2026-10-01',adoptionCashChange:0,cashAfterAdoption:5000,adoptionCreatedOrdersOrFills:false,sellPrice:75,sellFee:.25,cashBeforeSale:0,cashAfterSale:1499.75,oldCoreRowResurrection:false,reload:'PASS'});
  trace.status='PASS';trace.browser=(await send('Browser.getVersion')).product;fs.writeFileSync(path.join(out,'browser-workflow.json'),JSON.stringify(trace,null,2)+'\n');console.log('PASS: real Chromium operational workflow; '+out);
 }finally{try{socket?.close();}catch{}chrome.kill('SIGTERM');server.closeAllConnections();await new Promise(r=>server.close(r));fs.rmSync(profile,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
