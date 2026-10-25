// Actual production Home/App request flow; localhost synthetic account/evidence only.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {createWorkflowApi}=require('./fixtures/c1-trading-workflow-api.cjs');
const root=process.cwd(),out=path.resolve(process.env.C1_NORMAL_BROWSER_EVIDENCE||'work/normal-refresh-browser');fs.mkdirSync(out,{recursive:true});
const pause=ms=>new Promise(r=>setTimeout(r,ms)),trace={scope:'Actual Home + App → localhost HTTP → real C1 handler / memory fixture; top5/quote bodies supplied synthetic evidence',cases:[],liveWrites:0};
async function main(){
 const w=require('next/dist/compiled/webpack/webpack');w.init();
 await new Promise((resolve,reject)=>w.webpack({mode:'development',target:'web',devtool:false,entry:path.resolve('tools/fixtures/c1-normal-refresh-browser.jsx'),output:{path:out,filename:'client.js'},resolve:{modules:[path.join(root,'node_modules')],alias:{'@babel/runtime':path.join(path.dirname(require.resolve('next/package.json')),'dist/compiled/@babel/runtime')}},module:{rules:[{test:/\.jsx?$/,exclude:/node_modules/,use:{loader:path.join(root,'tools/fixtures/c1-workflow-babel-loader.cjs')}},{test:/\.css$/,type:'asset/source'}]}}).run((error,stats)=>error?reject(error):stats.hasErrors()?reject(Error(stats.toString({all:false,errors:true}))):resolve()));
 const api=createWorkflowApi();api.fixture.setCash(100000);
 const requests=[],state={fail:null,portfolioPuts:0};
 const server=http.createServer(async(req,res)=>{try{
  let raw='';for await(const chunk of req)raw+=chunk;const body=raw?JSON.parse(raw):null,url=new URL(req.url,'http://127.0.0.1');
  const json=(data,status=200)=>{res.writeHead(status,{'content-type':'application/json','x-fixture-clock':api.fixture.now.toISOString()});res.end(JSON.stringify(data));};
  if(url.pathname==='/__control'){state.fail=body.fail;return json({ok:true});}
  if(url.pathname.startsWith('/api'))requests.push({path:url.pathname,method:req.method,operation:body?.operation||null});
  const target=state.fail&&(state.fail==='screen'?url.pathname==='/api/top5':state.fail==='opening'?url.pathname==='/api/c1-account'&&body?.operation==='prepare-execution':url.pathname==='/api/c1-account'&&req.method==='GET');
  if(target){const mode=state.fail;if(mode==='account-body'){res.writeHead(200,{'content-type':'application/json'});res.end('{"decision":');return;}if(mode==='account-transport'){req.socket.destroy();return;}return json({error:'Synthetic verification unavailable',detail:'Synthetic verification unavailable'},503);}
  if(url.pathname==='/api/c1-account'){const result=await api.request(req.method,body,req.headers.authorization==='Bearer offline_workflow_fixture_key_000001');return json(result.body,result.status);}
  if(url.pathname==='/api/top5')return json({stocks:api.fixture.screenRows(),meta:{snapshotAsOf:api.fixture.now.toISOString(),quoteFeedStatus:'live',fundamentalFeedStatus:'healthy',coveragePct:100,fundamentalCoveragePct:100},themeLeadership:[]});
  if(url.pathname==='/api/performance')return json({records:[],persistentStorage:true});
  if(url.pathname==='/api/portfolio-sync'){assert.equal(req.method,'GET','Normal Reload must not write portfolio');return json({portfolio:api.fixture.portfolio,etag:'"fixture-portfolio-1"'});}
  if(url.pathname==='/api')return json({stock:api.fixture.screenRows().find(row=>row.symbol===url.searchParams.get('symbol'))});
  if(url.pathname==='/api/version')return json({commit:'synthetic-only',project:'localhost',release:'fixture'});
  if(url.pathname==='/client.js'){res.setHeader('content-type','text/javascript');res.end(fs.readFileSync(path.join(out,'client.js')));return;}
  if(url.pathname==='/'){
   const portfolio=JSON.stringify(api.fixture.portfolio),css=fs.readFileSync('styles/card-layout.css','utf8');
   res.setHeader('content-type','text/html');res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style><script>window.__C1_TEST_CLOCK='2026-10-15T17:00:00Z';const NativeDate=Date;window.Date=class extends NativeDate{constructor(...a){super(...(a.length?a:[window.__C1_TEST_CLOCK]));}static now(){return NativeDate.parse(window.__C1_TEST_CLOCK);}};localStorage.setItem('stock_screener_portfolio_v1',${JSON.stringify(portfolio)});localStorage.setItem('stock_screener_portfolio_sync_key_v1','offline_workflow_fixture_key_000001');const originalFetch=window.fetch.bind(window);window.fetch=async(...args)=>{const response=await originalFetch(...args);const clock=response.headers.get('x-fixture-clock');if(clock)window.__C1_TEST_CLOCK=clock;return response;};</script></head><body><div id="root"></div><script src="/client.js"></script></body></html>`);return;
  }res.writeHead(404);res.end('Unexpected fixture URL');
 }catch(error){res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({error:error.message}));}});
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
  await cdp('Page.navigate',{url});
  await wait('document.querySelector("header button")?.textContent==="Reload"&&document.querySelector("[aria-label=\\"C1 account opportunities\\"]")','normal signed-in synthetic page');
  await wait('/Buy \\d+ shares/.test(document.body.innerText)','initial checked quantity');
  await wait('document.querySelector("header button")?.textContent==="Reload"','initial reload settled');
  const baseline=JSON.stringify(api.fixture.account),beforeText=await js('document.body.innerText');
  trace.initial={checkedQuantity:/Buy \d+ shares/.test(beforeText),normalAccountReads:requests.filter(r=>r.path==='/api/c1-account'&&r.method==='GET').length,normalOpeningReviews:requests.filter(r=>r.operation==='prepare-execution').length};
  async function settledReload(){
   const cursor=requests.length;await click('Reload');
   for(let i=0;i<200&&!requests.slice(cursor).some(r=>r.path==='/api/c1-account'&&r.method==='GET');i++)await pause(25);
   assert(requests.slice(cursor).some(r=>r.path==='/api/c1-account'&&r.method==='GET'),'Reload reached the real account handler');
   // Wait for rendering after HTTP settlement; fast clocked fixtures can finish
   // before an intermediate React loading state is committed.
   await pause(150);await wait('document.querySelector("header button")?.textContent==="Reload"','Reload settled');
  }
  for(const mode of ['account-transport','account-body','opening','screen']){
   const count=requests.length;
   await js(`fetch('/__control',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({fail:${JSON.stringify(mode)}})})`);
   await settledReload();
   const text=await js('document.body.innerText'),during=requests.slice(count);
   assert(text.includes('Signals based on 2026-10-14 close'),'Prior account/source analysis retained');
   assert(!/Buy \d+ shares/.test(text),'Failed independent verification suppresses purchase quantities');
   assert(during.some(r=>r.path==='/api/c1-account'&&r.method==='GET'),'The normal read occurred; Chromium may retry a safe GET at transport level');
   assert.equal(during.filter(r=>r.operation==='prepare-execution').length,['opening','screen'].includes(mode)?1:0,'No automatic opening POST retry');
   assert.equal(JSON.stringify(api.fixture.account),baseline,'Failed normal refresh cannot rewrite account holdings/cash/history');
   await js("fetch('/__control',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({fail:null})})");
   await settledReload();await wait('/Buy \\d+ shares/.test(document.body.innerText)','normal independent recovery');
   assert.equal(JSON.stringify(api.fixture.account),baseline,'Recovery cannot change account economic history');
   trace.cases.push({failure:mode,retainedAnalysis:true,quantitiesSuppressed:true,normalReloadRecovered:true,automaticMutationRetries:0,accountRecordIdentical:true});
  }
  assert(!requests.some(r=>['record-intraday','record-session','update-brokerage-cash'].includes(r.operation)));assert(!requests.some(r=>r.path==='/api/portfolio-sync'&&r.method==='PUT'));
  trace.status='PASS';trace.browser=(await send('Browser.getVersion')).product;trace.requests=requests;fs.writeFileSync(path.join(out,'normal-journey.json'),JSON.stringify(trace,null,2)+'\n');console.log('PASS: actual Home/App normal Reload retains account and suppresses/recover quantities across four HTTP failures; no mutation retry/account record change/live request.');
 }finally{try{socket?.close();}catch{}await new Promise(resolve=>{if(chrome.exitCode!==null)resolve();else{chrome.once('exit',resolve);chrome.kill('SIGTERM');}});server.closeAllConnections();await new Promise(r=>server.close(r));fs.rmSync(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
