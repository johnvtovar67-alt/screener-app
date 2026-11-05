// Actual production Home/App request flow; localhost synthetic account/evidence only.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {createWorkflowApi}=require('./fixtures/c1-trading-workflow-api.cjs');
const root=process.cwd(),out=path.resolve(process.env.C1_NORMAL_BROWSER_EVIDENCE||'work/normal-refresh-browser');fs.mkdirSync(out,{recursive:true});
const pause=ms=>new Promise(r=>setTimeout(r,ms)),trace={scope:'Actual Home + App → localhost HTTP → real C1 handler / memory fixture; top5/quote bodies supplied synthetic evidence',cases:[],liveWrites:0};
async function main(){
 const binary=process.env.C1_BROWSER_BIN||['/usr/bin/google-chrome','/opt/google/chrome/chrome','/usr/bin/chromium'].find(p=>fs.existsSync(p));assert(binary,'Set C1_BROWSER_BIN to an installed Chromium/Chrome executable');
 const reliability=process.env.C1_NORMAL_BROWSER_RELIABILITY==='1',clientCommit='a'.repeat(40),observationSecret='offline-browser-observation-secret';
 const w=require('next/dist/compiled/webpack/webpack');w.init();
 await new Promise((resolve,reject)=>w.webpack({mode:'development',target:'web',devtool:false,plugins:reliability?[new w.webpack.DefinePlugin({'process.env.NEXT_PUBLIC_C1_CLIENT_COMMIT':JSON.stringify(clientCommit),'process.env.NEXT_PUBLIC_C1_CLIENT_ENVIRONMENT':JSON.stringify('production')})]:[],entry:path.resolve('tools/fixtures/c1-normal-refresh-browser.jsx'),output:{path:out,filename:'client.js'},resolve:{modules:[path.join(root,'node_modules')],alias:{'@babel/runtime':path.join(path.dirname(require.resolve('next/package.json')),'dist/compiled/@babel/runtime')}},module:{rules:[{test:/\.jsx?$/,exclude:/node_modules/,use:{loader:path.join(root,'tools/fixtures/c1-normal-refresh-babel-loader.cjs')}},{test:/\.css$/,type:'asset/source'}]}}).run((error,stats)=>error?reject(error):stats.hasErrors()?reject(Error(stats.toString({all:false,errors:true}))):resolve()));
 const api=createWorkflowApi('buy',reliability?{baselineDate:'2026-10-29',now:'2026-10-30T19:00:00Z',commit:clientCommit,observationSecret}:{});api.fixture.setCash(100000);
 const actualScreen=process.env.C1_NORMAL_BROWSER_ACTUAL_SCREEN==='1'?require('./fixtures/c1-normal-refresh-screen.cjs').createNormalRefreshScreen(api.fixture):null;
 if(actualScreen)trace.scope='Actual Home/App → localhost HTTP → current top5 handler + real quote/fundamental/event/timing/decision/performance modules + real C1 handler; provider fetch, accepted book/snapshot reads and Blob are isolated synthetic boundaries';
 const observations=[];
 const observation= require('./fixtures/c1-operational-modules.cjs').createOperationalModuleLoader(process.cwd()).load('pages/api/c1-journey-observation.js');
 const verify=require('./fixtures/c1-operational-modules.cjs').createOperationalModuleLoader(process.cwd()).load('lib/c1JourneyObservation.js').verifyC1JourneyObservation;
 const observationHandler=observation.createC1JourneyObservationHandler({clock:()=>api.fixture.now,verify:token=>verify(token,{now:api.fixture.now,secret:observationSecret,commit:clientCommit}),emit:(...args)=>observations.push(args)});
 const stopQuoteHandler=require('./fixtures/c1-operational-modules.cjs').createOperationalModuleLoader(root,{'../../lib/fmpQuotes':{fetchFmpQuote:()=>{throw Error('Real provider forbidden');}}}).load('pages/api/c1-stop-quote.js').createC1StopQuoteHandler({clock:()=>api.fixture.now,fetchQuote:async symbol=>api.fixture.screenRows().find(row=>row.symbol===symbol)});
 const requests=[],state={fail:null,shadowOwnership:false,portfolioPuts:0,held:[],versionCommit:clientCommit,documentLoads:0};trace.requests=requests;
 const screenPayload=()=>({stocks:api.fixture.screenRows(),meta:{snapshotAsOf:api.fixture.now.toISOString(),quoteFeedStatus:'live',fundamentalFeedStatus:'healthy',coveragePct:100,fundamentalCoveragePct:100},themeLeadership:[]});
 const versionPayload=()=>reliability?{commit:state.versionCommit.slice(0,7),buildCommit:state.versionCommit,clientProtocol:1,environment:'production',project:'screener-app-cq5t',release:'fixture'}:{commit:'synthetic-only',project:'localhost',release:'fixture'};
 const readScreen=async query=>actualScreen?actualScreen.request(query):{status:200,body:screenPayload(),headers:{}};
 const server=http.createServer(async(req,res)=>{try{
  let raw='';for await(const chunk of req)raw+=chunk;const body=raw?JSON.parse(raw):null,url=new URL(req.url,'http://127.0.0.1');
  const json=(data,status=200)=>{res.writeHead(status,{'content-type':'application/json','x-fixture-clock':api.fixture.now.toISOString()});res.end(JSON.stringify(data));};
  if(url.pathname==='/__control'){state.fail=body.fail;if(Object.hasOwn(body,'shadowOwnership'))state.shadowOwnership=body.shadowOwnership;if(body.now)api.fixture.now=new Date(body.now);if(body.publishNext){const session=api.fixture.sessions[221];assert.equal(session.date,'2026-10-30');api.fixture.book.model.sessions.push(session);api.fixture.book.captures.push({sessionDate:session.date,hash:'synthetic-workflow:'+session.date,observedAt:session.decisionAt});}if(body.versionCommit)state.versionCommit=body.versionCommit;if(body.advanceMs)api.fixture.now=new Date(api.fixture.now.getTime()+body.advanceMs);if(actualScreen){actualScreen.state.mode=['provider-outage','provider-invalid-json','quote-malformed'].includes(body.fail)?body.fail:null;if(body.resetScreen||body.expireScreen)actualScreen.expire();if(body.resetScreen)actualScreen.resetRuntime();}if(body.prices)for(const [symbol,value]of Object.entries(body.prices))api.fixture.setQuote(symbol,value);if(body.release)state.held.splice(0).forEach(release=>release());return json({ok:true});}
  if(url.pathname.startsWith('/api')){const record={path:url.pathname,method:req.method,operation:body?.operation||null,symbol:url.searchParams.get('symbol'),finished:false};requests.push(record);res.on('finish',()=>{record.finished=true;});}
  const target=state.fail&&!state.fail.startsWith('stop-quote-')&&(state.fail.startsWith('provider-')||state.fail==='quote-malformed'?false:['version-body-hold','version-unavailable'].includes(state.fail)?url.pathname==='/api/version':state.fail==='cash-response-lost'?url.pathname==='/api/c1-account'&&body?.operation==='update-brokerage-cash':state.fail.startsWith('screen')?url.pathname==='/api/top5':state.fail.startsWith('quote')?url.pathname==='/api':state.fail==='cloud-hold'?url.pathname==='/api/portfolio-sync'&&req.method==='GET':state.fail.startsWith('opening')?url.pathname==='/api/c1-account'&&body?.operation==='prepare-execution':state.fail.startsWith('account-inputs')?url.pathname==='/api/c1-account'&&body?.operation==='refresh-account-inputs':state.fail==='performance-body'?url.pathname==='/api/performance':url.pathname==='/api/c1-account'&&req.method==='GET');
  if(target){
   const mode=state.fail;
   if(mode==='version-body-hold'){const serialized=JSON.stringify(versionPayload());res.writeHead(200,{'content-type':'application/json','content-length':Buffer.byteLength(serialized)});res.write(serialized.slice(0,12));await new Promise(resolve=>state.held.push(resolve));res.end(serialized.slice(12));return;}
   if(mode==='screen-hold'){const captured=await readScreen(Object.fromEntries(url.searchParams));await new Promise(resolve=>state.held.push(resolve));return json(captured.body,captured.status);}
   if(mode==='cash-response-lost'){const captured=await api.request(req.method,body,true);assert.equal(captured.status,200,'Synthetic cash mutation genuinely committed through the real handler');for(const[name,value]of Object.entries(captured.headers))res.setHeader(name,value);res.writeHead(200,{'content-type':'application/json','content-length':100000});res.write('{"decision":');await pause(100);res.destroy();return;}
   if(['screen-body-after-handler','screen-interrupted-after-handler'].includes(mode)){const captured=await readScreen(Object.fromEntries(url.searchParams));assert.equal(captured.status,200);for(const[name,value]of Object.entries(captured.headers))res.setHeader(name,value);res.writeHead(200,{'content-type':'application/json',...(mode==='screen-interrupted-after-handler'?{'content-length':100000}:{})});res.write('{"stocks":');if(mode==='screen-interrupted-after-handler'){await pause(100);res.destroy();}else res.end();return;}
   if(mode==='opening-hold'){const captured=await api.request(req.method,body,true);await new Promise(resolve=>state.held.push(resolve));return json(captured.body,captured.status);}
   if(mode==='opening-body-hold'){const captured=await api.request(req.method,body,true),serialized=JSON.stringify(captured.body);res.writeHead(captured.status,{'content-type':'application/json','content-length':Buffer.byteLength(serialized),'x-fixture-clock':api.fixture.now.toISOString()});res.write(serialized.slice(0,12));await new Promise(resolve=>state.held.push(resolve));res.end(serialized.slice(12));return;}
   if(mode==='quote-body-hold'){res.writeHead(200,{'content-type':'application/json','content-length':100000});res.write('{"stock":');await new Promise(resolve=>state.held.push(resolve));res.end();return;}
   if(mode==='cloud-hold'){const captured={portfolio:api.fixture.portfolio,etag:'"fixture-portfolio-1"'};await new Promise(resolve=>state.held.push(resolve));return json(captured);}
   if(mode==='account-inputs-hold'){const captured=await api.request(req.method,body,true);await new Promise(resolve=>state.held.push(resolve));return json(captured.body,captured.status);}
   if(mode==='quote-hold-failure'){await new Promise(resolve=>state.held.push(resolve));return json({error:'Synthetic quote provider outage'},503);}
   if(['account-body','screen-body','opening-body','performance-body'].includes(mode)){res.writeHead(200,{'content-type':'application/json'});res.end('{"decision":');return;}
   if(mode==='account-transport'){req.socket.destroy();return;}
   if(mode==='account-interrupted'){res.writeHead(200,{'content-type':'application/json','content-length':10000});res.write('{"decision":');await pause(100);res.destroy();return;}
   if(mode==='account-shape'){
    const result=await api.request(req.method,body,true);return json({...result.body,decision:{...result.body.decision,positions:null}});
   }
   if(mode==='screen-shape')return json({stocks:{malformed:true},meta:{quoteFeedStatus:'live'}});
   if(mode==='screen-row-shape')return json({stocks:[null],meta:{snapshotAsOf:api.fixture.now.toISOString(),quoteFeedStatus:'live',fundamentalFeedStatus:'healthy'}});
   if(mode==='screen-provider-malformed')return json({stocks:api.fixture.screenRows().map(row=>({...row,price:null,recommendation:{expertDecision:{metrics:{quoteFreshnessPass:false}}}})),meta:{snapshotAsOf:api.fixture.now.toISOString(),quoteFeedStatus:'incomplete',fundamentalFeedStatus:'unavailable'}});
   if(mode.endsWith('-slow'))await pause(900);
   else return json({error:'Synthetic verification unavailable',detail:'Synthetic verification unavailable'},mode==='account-inputs-conflict'?409:503);
  }
  if(url.pathname==='/api/c1-journey-observation'){let status=200,value;await observationHandler({method:req.method,headers:req.headers,body},{setHeader(){},status(code){status=code;return this;},json(data){value=data;return this;}});return json(value,status);}
  if(url.pathname==='/api/c1-account'){const result=await api.request(req.method,body,req.headers.authorization==='Bearer offline_workflow_fixture_key_000001');if(state.shadowOwnership&&req.method==='GET'&&result.status===200)result.body={...result.body,decision:{...result.body.decision,revision:result.body.decision.revision+1,positions:result.body.decision.positions.map(position=>position.symbol==='LLL'?{...position,shares:5,stops:position.stops.map(stop=>({...stop,shares:5}))}:position)}};for(const[name,value]of Object.entries(result.headers))res.setHeader(name,value);return json(result.body,result.status);}
  if(url.pathname==='/api/top5'){const result=await readScreen(Object.fromEntries(url.searchParams));for(const[name,value]of Object.entries(result.headers))res.setHeader(name,value);return json(result.body,result.status);}
  if(url.pathname==='/api/performance')return json({records:actualScreen?.ledger()?.records||[],persistentStorage:true});
  if(url.pathname==='/api/entry-timing')return json({timing:Object.fromEntries(api.fixture.screenRows().map(row=>[row.symbol,row.entryTiming]))});
  if(url.pathname==='/api/portfolio-sync'){assert.equal(req.method,'GET','Normal Reload must not write portfolio');return json({portfolio:api.fixture.portfolio,etag:'"fixture-portfolio-1"'});}
  if(url.pathname==='/api/c1-stop-quote'){
   if(state.fail==='stop-quote-body-hold'&&url.searchParams.get('symbol')==='LLL'){
    res.writeHead(200,{'content-type':'application/json','content-length':100000});res.write('{"contract":"c1-stop-quote-v1",');
    await new Promise(resolve=>state.held.push(resolve));res.end();return;
   }
   let status=200,value;const headers={};
   await stopQuoteHandler({method:req.method,query:Object.fromEntries(url.searchParams)},{setHeader(k,v){headers[k]=v;},status(code){status=code;return this;},json(data){value=data;return this;}});
   for(const [name,value]of Object.entries(headers))res.setHeader(name,value);
   if(state.fail==='stop-quote-success-hold'&&url.searchParams.get('symbol')==='LLL'){
    const serialized=JSON.stringify(value);res.writeHead(status,{'content-type':'application/json','content-length':Buffer.byteLength(serialized)});res.write(serialized.slice(0,12));
    await new Promise(resolve=>state.held.push(resolve));res.end(serialized.slice(12));return;
   }
   return json(value,status);
  }
  if(url.pathname==='/api')return json({stock:{...api.fixture.screenRows().find(row=>row.symbol===url.searchParams.get('symbol')),quoteVerification:{verifiedRegularSession:true,providerAttempted:true,newDataAccepted:true}}});
  if(url.pathname==='/api/version')return json(versionPayload());
  if(url.pathname==='/client.js'){res.setHeader('content-type','text/javascript');res.end(fs.readFileSync(path.join(out,'client.js')));return;}
  if(url.pathname==='/'){
   state.documentLoads++;const portfolio=JSON.stringify(api.fixture.portfolio),css=fs.readFileSync('styles/card-layout.css','utf8');
   res.setHeader('content-type','text/html');res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style><script>window.__C1_TEST_CLOCK=${JSON.stringify(api.fixture.now.toISOString())};const NativeDate=Date;window.Date=class extends NativeDate{constructor(...a){super(...(a.length?a:[window.__C1_TEST_CLOCK]));}static now(){return NativeDate.parse(window.__C1_TEST_CLOCK);}};localStorage.setItem('stock_screener_portfolio_v1',${JSON.stringify(portfolio)});localStorage.setItem('stock_screener_portfolio_sync_key_v1','offline_workflow_fixture_key_000001');const originalFetch=window.fetch.bind(window);window.fetch=async(...args)=>{const response=await originalFetch(...args);const clock=response.headers.get('x-fixture-clock');if(clock)window.__C1_TEST_CLOCK=clock;return response;};</script></head><body><div id="root"></div><script src="/client.js"></script></body></html>`);return;
  }res.writeHead(404);res.end('Unexpected fixture URL');
 }catch(error){res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({error:error.message}));}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
 const profile=fs.mkdtempSync(path.join(out,'profile-')),chrome=spawn(binary,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-background-networking','--disable-component-update','--disable-sync','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:['ignore','ignore',fs.openSync(path.join(out,'chromium.log'),'w')]});
 let socket,accountRecordUnchanged=()=>null;
 try{
  const portFile=path.join(profile,'DevToolsActivePort');for(let i=0;!fs.existsSync(portFile)&&i<200;i++)await pause(50);trace.browserStartup={binary,exitCode:chrome.exitCode,signal:chrome.signalCode};assert(fs.existsSync(portFile),'Chromium did not start: '+JSON.stringify(trace.browserStartup)+' '+fs.readFileSync(path.join(out,'chromium.log'),'utf8').slice(-2000));
  const [port,endpoint]=fs.readFileSync(portFile,'utf8').trim().split('\n');socket=new WebSocket('ws://127.0.0.1:'+port+endpoint);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  let serial=0;const pending=new Map();trace.browserErrors=[];trace.refreshFailures=[];socket.addEventListener('message',event=>{const r=JSON.parse(event.data);if(r.method==='Runtime.exceptionThrown')trace.browserErrors.push(String(r.params?.exceptionDetails?.exception?.description||r.params?.exceptionDetails?.text||'Browser exception').split('\n')[0]);if(r.method==='Runtime.consoleAPICalled'&&r.params?.args?.[0]?.value==='C1_REFRESH_FAILURE')try{trace.refreshFailures.push(JSON.parse(r.params.args[1].value));}catch{}if(r.id&&pending.has(r.id)){const {resolve,reject}=pending.get(r.id);pending.delete(r.id);r.error?reject(Error(JSON.stringify(r.error))):resolve(r.result);}});
  const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});
  const target=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId:target.targetId,flatten:true});
  const cdp=(m,p)=>send(m,p,sessionId);await cdp('Page.enable');await cdp('Runtime.enable');await cdp('Emulation.setTimezoneOverride',{timezoneId:'UTC'});await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  async function js(expression){const r=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
  async function wait(expression,description,timeoutMs=10000){const deadline=Date.now()+timeoutMs;while(Date.now()<deadline){if(await js(`Boolean(${expression})`))return;await pause(50);}throw Error('Browser timeout: '+description+'\n'+await js('document.body.innerText'));}
  const click=label=>js(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent===${JSON.stringify(label)}&&!b.disabled);if(!b)throw Error('Button unavailable: '+${JSON.stringify(label)});b.click();})()`);
  const control=(fail,extra={})=>js(`fetch('/__control',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(${JSON.stringify({fail,...extra})})})`);
  async function input(label,value){await js(`(()=>{const e=document.querySelector('[aria-label='+JSON.stringify(${JSON.stringify(label)})+']');if(!e)throw Error('Missing input');const proto=e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);}
  async function shot(name){const {cssContentSize:s}=await cdp('Page.getLayoutMetrics');const r=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:Math.min(s.width,1440),height:s.height,scale:1}});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(r.data,'base64'));}
  await cdp('Page.navigate',{url});
  await wait('document.querySelector("header button")?.textContent==="Reload"&&document.querySelector("[aria-label=\\"C1 account opportunities\\"]")','normal signed-in synthetic page');
  await wait('/Buy \\d+ shares/.test(document.body.innerText)','initial checked quantity');
  await wait('document.querySelector("header button")?.textContent==="Reload"','initial reload settled');
  let baseline=JSON.stringify(api.fixture.account);const beforeText=await js('document.body.innerText');
  accountRecordUnchanged=()=>JSON.stringify(api.fixture.account)===baseline;
  trace.initial={checkedQuantity:/Buy \d+ shares/.test(beforeText),normalAccountReads:requests.filter(r=>r.path==='/api/c1-account'&&r.method==='GET').length,normalOpeningReviews:requests.filter(r=>r.operation==='prepare-execution').length};
  async function settledReload(){
   const cursor=requests.length;await click('Reload');
   for(let i=0;i<200&&!requests.slice(cursor).some(r=>r.path==='/api/c1-account'&&r.method==='GET');i++)await pause(25);
   assert(requests.slice(cursor).some(r=>r.path==='/api/c1-account'&&r.method==='GET'),'Reload reached the real account handler');
   // Wait for rendering after HTTP settlement; fast clocked fixtures can finish
   // before an intermediate React loading state is committed.
   await pause(150);await wait('document.querySelector("header button")?.textContent==="Reload"','Reload settled');
  }
  const cases=(process.env.C1_NORMAL_BROWSER_CASES||'account-transport,account-body,account-interrupted,account-shape,opening,opening-body,screen,screen-body,screen-shape,screen-row-shape,screen-provider-malformed').split(',').filter(mode=>mode!=='none');
  for(const mode of cases){
   trace.activeCase=mode;
   const count=requests.length,priorQuantities=await js('document.body.innerText.match(/Buy \\d+ shares/g)||[]');
   await control(mode,actualScreen?{resetScreen:true}:{});
   await settledReload();
   const text=await js('document.body.innerText'),during=requests.slice(count);
   assert(text.includes('Signals based on 2026-10-14 close'),'Prior account/source analysis retained');
   // Performance history is explicitly optional display telemetry; it is not
   // one of the current account/quote/event/opening authority checks.
   if(mode==='performance-body')assert.deepEqual(text.match(/Buy \d+ shares/g)||[],priorQuantities,'Optional history failure cannot change fully checked C1 quantities');
   else assert(!/Buy \d+ shares/.test(text),'Failed independent verification suppresses purchase quantities');
   assert(during.some(r=>r.path==='/api/c1-account'&&r.method==='GET'),'The normal read occurred; Chromium may retry a safe GET at transport level');
   assert.equal(during.filter(r=>r.operation==='prepare-execution').length,mode.startsWith('opening')||mode.startsWith('screen')||mode.startsWith('provider')||mode==='quote-malformed'||mode==='performance-body'?1:0,'No automatic opening POST retry');
   assert.equal(JSON.stringify(api.fixture.account),baseline,'Failed normal refresh cannot rewrite account holdings/cash/history');
   await control(null,actualScreen?{expireScreen:true}:{});
   await settledReload();await wait('/Buy \\d+ shares/.test(document.body.innerText)','normal independent recovery');
   assert.equal(JSON.stringify(api.fixture.account),baseline,'Recovery cannot change account economic history');
   trace.cases.push({failure:mode,retainedAnalysis:true,...(mode==='performance-body'?{optionalTelemetryOnly:true,checkedQuantitiesUnchanged:true}:{quantitiesSuppressed:true}),normalReloadRecovered:true,automaticMutationRetries:0,accountRecordIdentical:true});
  }
  const advanced=(process.env.C1_NORMAL_BROWSER_ADVANCED||'stop-verification-screen-pending,opening-pending,portfolio-inputs-pending,portfolio-account-failure,overlap-tabs,overlap-cloud,body-timeout,bounded-async,version-result').split(',').filter(mode=>mode!=='none');
  async function requestSeen(cursor,predicate,description){for(let i=0;i<200;i++){if(requests.slice(cursor).some(predicate))return;await pause(25);}throw Error('HTTP fixture timeout: '+description);}
  if(advanced.includes('stop-verification-screen-pending')){
   trace.activeCase='stop-verification-screen-pending';await click('Opportunities');await wait('document.querySelector("header button")?.textContent==="Reload"','Ready before stop-only verification');
   assert(await js('document.querySelector(\'[aria-label="C1 stop verification"]\')?.hidden===true && getComputedStyle(document.querySelector(\'[aria-label="C1 stop verification"]\')).display==="none"'),'Manual stop-verification panel must not be visible');
   await control('screen-hold');const cursor=requests.length;await click('Reload');
   for(let i=0;i<200&&!state.held.length;i++)await pause(25);assert(state.held.length,'Unrelated purchase screen reached delayed HTTP gate');
   await requestSeen(cursor,r=>r.operation==='prepare-execution'&&r.finished,'Account and opening ownership verification completed while screen waits');
   await control('screen-hold',{prices:{LLL:85},advanceMs:1000});const verifyCursor=requests.length;
   await js(`document.querySelector('[aria-label="Verify stop now for LLL"]').click()`);
   await wait(`/SELL.*STOP TRIGGERED/.test(document.querySelector('[aria-label="C1 stop verification"]')?.textContent)`,'Explicit held quote promptly shows Sell while purchase screen remains pending');
   const riskText=await js(`document.querySelector('[aria-label="C1 stop verification"]').textContent`);
   assert(riskText.includes('Sell 800 shares'),'Action includes the recorded affected sleeve quantity');
   assert(riskText.includes('does not place or maintain a Schwab stop order'),'Manual brokerage execution remains explicit');
   assert.equal(await js('document.querySelector("header button")?.textContent'),'Reloading...','Stop instruction bypasses an unresolved unrelated screen');
   const direct=requests.slice(verifyCursor);assert.equal(direct.filter(r=>r.path==='/api/c1-stop-quote').length,1,'Direct action uses the quote-only path once');
   assert.equal(direct.filter(r=>r.path==='/api/c1-account'||r.path==='/api/top5').length,0,'Stop-only verification performs no account or purchase-screen call');
   assert.equal(JSON.stringify(api.fixture.account),baseline,'Verification cannot alter saved stops, accepted exits, cash, holdings or history');
   await shot('stop-verification-screen-pending');
   await control(null,{release:true,prices:{LLL:100},advanceMs:1000});await wait('document.querySelector("header button")?.textContent==="Reload"','Delayed atomic refresh completes');
   await js(`document.querySelector('[aria-label="Verify stop now for LLL"]').click()`);await wait(`!/SELL.*STOP TRIGGERED/.test(document.querySelector('[aria-label="C1 stop verification"]')?.textContent)`,'A newer verified recovery preserves existing nonlatched behavior');
   await control(null,{prices:{LLL:85},advanceMs:1000});await settledReload();await wait(`/SELL.*STOP TRIGGERED/.test(document.querySelector('[aria-label="C1 stop verification"]')?.textContent)`,'Fresh base-frame stop is actionable before ownership changes');
   await control('screen-hold',{shadowOwnership:true});const ownershipCursor=requests.length;await click('Reload');
   for(let i=0;i<200&&!state.held.length;i++)await pause(25);assert(state.held.length,'Ownership-changing response is followed by a held screen');
   await requestSeen(ownershipCursor,r=>r.path==='/api/c1-account'&&r.method==='GET'&&r.finished,'A newer synthetic ownership revision was observed');
   await wait(`document.querySelector('[aria-label="C1 stop verification"]')?.textContent.includes('Reconciled holding and stop evidence are unavailable')`,'Observed new ownership invalidates old quantities without clicking Verify or completing the screen');
   const invalidated=await js(`document.querySelector('[aria-label="C1 stop verification"]').textContent`);assert(!invalidated.includes('Sell 800 shares'),'No old quantity remains actionable after a newer account is observed');
   assert(await js(`document.querySelector('[aria-label="Verify stop now for LLL"]').disabled`),'Verification is unavailable until matching ownership publishes');
   assert.equal(await js('document.querySelector("header button")?.textContent'),'Reloading...','Ownership metadata invalidation does not publish the incomplete account/screen frame');
   assert.equal(JSON.stringify(api.fixture.account),baseline,'Shadow response does not mutate even synthetic account records');
   await control(null,{shadowOwnership:false,prices:{LLL:100},release:true});await wait('document.querySelector("header button")?.textContent==="Reload"','Held shadow frame settled');
   await settledReload();await wait('/Buy \\d+ shares/.test(document.body.innerText)','Normal purchase flow remains available after explicit recovery');
   await control('stop-quote-body-hold');const heldCursor=requests.length;
   await js(`document.querySelector('[aria-label="Verify stop now for LLL"]').click()`);
   await requestSeen(heldCursor,r=>r.path==='/api/c1-stop-quote','Stop-only request reached stalled-body fixture');
   await wait(`document.querySelector('[aria-label="Verify stop now for LLL"]').textContent.includes('Verifying')`,'Selected holding shows verification progress');
   assert(await js(`[...document.querySelectorAll('[aria-label^="Verify stop now for "]')].filter(b=>b.getAttribute('aria-label')!=='Verify stop now for LLL').every(b=>!b.textContent.includes('Verifying'))`),'Other holdings do not falsely show Verifying');
   await wait(`document.querySelector('[aria-label="C1 stop verification"]').textContent.includes('Quote verification timed out')`,'Stalled body produces a visible holding error',16000);
   assert.equal(await js(`document.querySelector('[aria-label="Verify stop now for LLL"]').disabled`),false,'Timed-out verification releases its button');
   assert.equal(JSON.stringify(api.fixture.account),baseline,'Timeout never changes actual account records');
   await control(null,{release:true,prices:{LLL:100},advanceMs:1000});
   await js(`document.querySelector('[aria-label="Verify stop now for LLL"]').click()`);
   await wait(`document.querySelector('[aria-label="Verify stop now for LLL"]').closest('li').textContent.includes('Current price is above the recorded stops.')`,'Explicit retry recovers after stalled body');
   assert.equal(requests.slice(heldCursor).filter(r=>r.path==='/api/c1-account'||r.path==='/api/top5').length,0,'Timeout and retry never invoke financial or screen routes');
   await control('stop-quote-success-hold');const refreshCursor=requests.length;
   await js(`document.querySelector('[aria-label="Verify stop now for LLL"]').click()`);
   for(let i=0;i<200&&!state.held.length;i++)await pause(25);assert(state.held.length,'Verification response reached the successful-body gate');
   await control(null);await settledReload();
   await control(null,{release:true});
   await wait(`document.querySelector('[aria-label="Verify stop now for LLL"]').closest('li').querySelector('[role="status"]')?.textContent.includes('Current price is above the recorded stops.')`,'An identical-account refresh completes one bounded fresh quote recheck');
   assert.equal(requests.slice(refreshCursor).filter(r=>r.path==='/api/c1-stop-quote').length,2,'One new quote request follows the superseded response; no retry loop');
   await settledReload();
   assert(!await js(`document.querySelector('[aria-label="C1 stop verification"]').textContent.includes('Holding details changed')`),'Ordinary refresh cannot claim that holdings changed');
   assert.equal(JSON.stringify(api.fixture.account),baseline,'Refresh recovery preserves all account records');
   trace.cases.push({failure:'stop-verification-screen-pending',actualHomeAction:true,verifiedSellBeforePurchaseScreen:true,affectedShares:800,manualExecution:true,newerRecoveryClearsTransientSignal:true,stopOnlyAccountWrites:0,newOwnershipImmediatelyWithdrawsOldQuantity:true,accountRecordIdentical:true});
  }
  if(advanced.includes('opening-pending')){
   trace.activeCase='portfolio-opening-pending';await control('opening-hold');const cursor=requests.length;await click('My Portfolio');
   for(let i=0;i<200&&!state.held.length;i++)await pause(25);assert(state.held.length,'Portfolio opening request reached held HTTP response');
   await requestSeen(cursor,r=>r.path==='/api/top5'&&r.finished,'Portfolio screen settled');await pause(150);
   const pending=await js('({busy:document.querySelector("header button")?.textContent,text:document.body.innerText})');
   trace.openingPending={busy:pending.busy,quantities:/Buy \d+ shares/.test(pending.text)};
   assert.equal(pending.busy,'Reloading...','Portfolio must remain busy until independent opening review settles');
   assert(!/Buy \d+ shares/.test(pending.text),'Pending opening review cannot authorize quantities');
   await control(null,{release:true});await wait('document.querySelector("header button")?.textContent==="Reload"','Opening completion settles normal refresh');await wait('/Buy \\d+ shares/.test(document.body.innerText)','Opening completion recovers checked quantities');
   assert.equal(JSON.stringify(api.fixture.account),baseline,'Opening review leaves account records unchanged');
   assert.equal(requests.slice(cursor).filter(r=>r.operation==='prepare-execution').length,1,'One pending opening POST, never retried');
   trace.cases.push({failure:'portfolio-opening-pending',busyUntilOpeningSettled:true,quantitiesSuppressed:true,normalCompletionRecovered:true,automaticMutationRetries:0,accountRecordIdentical:true});
  }
  if(advanced.includes('portfolio-account-failure')){
   if(await js('document.querySelector("nav .active")?.textContent')!=='My Portfolio'){await click('My Portfolio');await wait('document.querySelector("header button")?.textContent==="Reload"','Initial Portfolio completed');}
   for(const mode of ['account-inputs','account-inputs-conflict']){
    trace.activeCase=mode;await control(mode);const cursor=requests.length;await click('Reload');await requestSeen(cursor,r=>r.operation==='refresh-account-inputs','Portfolio account refresh');await pause(150);await wait('document.querySelector("header button")?.textContent==="Reload"','Failed Portfolio refresh settled');
    const text=await js('document.body.innerText');assert(text.includes('Latest completed signal session: 2026-10-14'),'Portfolio retains prior source analysis');assert(!/Buy \d+ shares/.test(text),'Failed Portfolio account verification suppresses old quantities');
    const during=requests.slice(cursor);assert.equal(during.filter(r=>r.operation==='refresh-account-inputs').length,1,'Never retry potentially committed input POST');assert.equal(during.filter(r=>r.operation==='prepare-execution').length,0,'Failed input review cannot issue opening POST');
    assert.equal(during.filter(r=>r.path==='/api/c1-account'&&r.method==='GET').length,mode==='account-inputs-conflict'?1:0,'Conflict recovery reads once without retrying POST');
    assert.equal(JSON.stringify(api.fixture.account),baseline);await control(null);await click('Reload');await wait('/Buy \\d+ shares/.test(document.body.innerText)','Explicit Portfolio Reload recovers');await wait('document.querySelector("header button")?.textContent==="Reload"','Portfolio recovery settled');
    trace.cases.push({failure:mode,retainedAnalysis:true,...(mode==='performance-body'?{optionalTelemetryOnly:true,checkedQuantitiesUnchanged:true}:{quantitiesSuppressed:true}),normalReloadRecovered:true,automaticMutationRetries:0,accountRecordIdentical:true});
   }
  }
  if(advanced.includes('portfolio-inputs-pending')){
   trace.activeCase='portfolio-inputs-pending';if(await js('document.querySelector("nav .active")?.textContent')!=='My Portfolio'){await click('My Portfolio');await wait('/Buy \\d+ shares/.test(document.body.innerText)','Ready Portfolio before input delay');await wait('document.querySelector("header button")?.textContent==="Reload"','Initial Portfolio completed');}
   await control('account-inputs-hold');const cursor=requests.length;await click('Reload');for(let i=0;i<200&&!state.held.length;i++)await pause(25);assert(state.held.length,'Account input response reached delay gate');await pause(100);
   const text=await js('document.body.innerText');trace.inputsPending={busy:await js('document.querySelector("header button")?.textContent'),quantities:/Buy \d+ shares/.test(text)};assert(!/Buy \d+ shares/.test(text),'Pending independent account read must withhold prior checked quantities');
   await control(null,{release:true});await wait('/Buy \\d+ shares/.test(document.body.innerText)','Delayed account input response recovers');await wait('document.querySelector("header button")?.textContent==="Reload"','Delayed account refresh settled');assert.equal(requests.slice(cursor).filter(r=>r.operation==='refresh-account-inputs').length,1);assert.equal(JSON.stringify(api.fixture.account),baseline);
   trace.cases.push({failure:'portfolio-inputs-pending',quantitiesSuppressed:true,normalCompletionRecovered:true,automaticMutationRetries:0,accountRecordIdentical:true});
  }
  if(advanced.includes('overlap-tabs')){
   trace.activeCase='overlap-opportunities-portfolio';await click('My Portfolio');await wait('document.querySelector(".analysisTimestamp")','Initial Portfolio analysis');await wait('/Buy \\d+ shares/.test(document.body.innerText)','Initial Portfolio checked quantities');await wait('document.querySelector("header button")?.textContent==="Reload"','Initial Portfolio settled');
   const previousAnalysis=await js('document.querySelector(".analysisTimestamp")?.textContent');await click('Opportunities');await wait('document.querySelector("header button")?.textContent==="Reload"','Opportunities idle');
   await control('quote-hold-failure');const cursor=requests.length;await click('Reload');for(let i=0;i<200&&!state.held.length;i++)await pause(25);assert(state.held.length,'Old Opportunities quote is held');await requestSeen(cursor,r=>r.path==='/api/performance'&&r.finished,'Old Opportunities screen settled');
   await control(null,{prices:{LLL:101}});await click('My Portfolio');await click('Analyze Portfolio');await requestSeen(cursor,r=>r.operation==='refresh-account-inputs'&&r.finished,'New Portfolio account completed');
   await wait('document.querySelector(".analysisTimestamp")&&document.querySelector(".analysisTimestamp").textContent!=='+JSON.stringify(previousAnalysis),'New Portfolio analysis completed');
   const latest=await js('document.querySelector("[aria-label=\\"Market data freshness\\"]")?.textContent');assert(latest?.includes('New verified provider quote accepted'),'New Portfolio publishes verified current quote status');
   await control(null,{release:true});await pause(250);await wait('document.querySelector("header button")?.textContent==="Reload"','Overlapping refreshes settled');
   const finalStatus=await js('document.querySelector("[aria-label=\\"Market data freshness\\"]")?.textContent');
   assert(finalStatus?.includes('New verified provider quote accepted')&&!finalStatus.includes('provider verification failed'),'Late Opportunities quote failure cannot replace newer Portfolio verification');assert.equal(JSON.stringify(api.fixture.account),baseline);
   trace.cases.push({failure:'overlap-opportunities-portfolio',newerRefreshRetained:true,automaticMutationRetries:0,accountRecordIdentical:true});
  }
  if(advanced.includes('overlap-cloud')){
   trace.activeCase='overlap-before-cloud-read';await click('Opportunities');await wait('document.querySelector("header button")?.textContent==="Reload"','Opportunities idle before cloud race');
   await control('cloud-hold');await click('Reload');for(let i=0;i<200&&!state.held.length;i++)await pause(25);assert(state.held.length,'Older refresh entered its cloud read');
   await control(null);const cursor=requests.length;await js("window.dispatchEvent(new Event('screener-request-live-refresh'))");
   await requestSeen(cursor,r=>r.operation==='prepare-execution'&&r.finished,'Newer reload opening completed');await wait('document.querySelector("header button")?.textContent==="Reload"','Newer reload completed before older cloud read');
   const latest=await js('document.querySelector("header .updated")?.textContent'),completed=requests.length;
   await control(null,{release:true});await pause(300);await wait('document.querySelector("header button")?.textContent==="Reload"','Old cloud completion settled');
   assert.equal(requests.slice(completed).filter(r=>r.path==='/api/c1-account'||r.path==='/api/top5').length,0,'Superseded cloud read must not start a late account/screen refresh');
   assert.equal(await js('document.querySelector("header .updated")?.textContent'),latest,'Older intent cannot replace latest completion');assert.equal(JSON.stringify(api.fixture.account),baseline);
   trace.cases.push({failure:'overlap-before-cloud-read',supersededIntentNoDownstreamRequests:true,newerRefreshRetained:true,automaticMutationRetries:0,accountRecordIdentical:true});
  }
  if(advanced.includes('body-timeout')){
   trace.activeCase='opening-body-timeout';await click('Opportunities');await wait('document.querySelector("header button")?.textContent==="Reload"','Ready before body stall');await control('opening-body-hold');const cursor=requests.length,started=Date.now();await click('Reload');
   for(let i=0;i<200&&!state.held.length;i++)await pause(25);assert(state.held.length,'Real opening response delivered headers with held body');
   await wait('document.querySelector("header button")?.textContent==="Reload"','90s account body deadline settles the normal refresh',105000);
   const elapsedMs=Date.now()-started,text=await js('document.body.innerText');assert(elapsedMs>=89000&&elapsedMs<105000,'Existing 90s account budget bounds a stalled post-header body');assert(!/Buy \d+ shares/.test(text),'Timed-out opening body cannot authorize quantities');assert(text.includes('Signals based on 2026-10-14 close'),'Prior account/source view survives stalled opening body');
   assert.equal(requests.slice(cursor).filter(r=>r.operation==='prepare-execution').length,1,'No automatic POST retry after body timeout');assert.equal(requests.slice(cursor).find(r=>r.operation==='prepare-execution').finished,false,'Deadline neither aborts nor retries the possibly committed POST');
   assert(trace.refreshFailures.some(f=>f.stage==='opening-review'&&f.code==='ACCOUNT_RESPONSE_TIMEOUT'),'Fixed stage/code identifies body timeout');
   await control(null,{release:true});await pause(150);assert(!/Buy \d+ shares/.test(await js('document.body.innerText')),'Late old body cannot revive checked quantities');
   await settledReload();await wait('/Buy \\d+ shares/.test(document.body.innerText)','Explicit Reload recovers after body timeout');assert.equal(JSON.stringify(api.fixture.account),baseline);
   trace.cases.push({failure:'opening-body-timeout',elapsedMs,retainedAnalysis:true,quantitiesSuppressed:true,lateBodyIgnored:true,normalReloadRecovered:true,automaticMutationRetries:0,accountRecordIdentical:true});
  }
  if(advanced.includes('bounded-async')){
   for(const viewport of [{width:1440,height:1000,mobile:false},{width:390,height:844,mobile:true}]){
    await cdp('Emulation.setDeviceMetricsOverride',{...viewport,deviceScaleFactor:1});
    const status=await js(`(()=>{const root=document.querySelector('[aria-label="Market data freshness"]');return {text:root?.innerText,state:root?.querySelector('[data-publication-state]')?.getAttribute('data-publication-state')};})()`);
    assert(status.text.includes('Analysis source session: 2026-10-14'));assert(status.text.includes('Expected completed session: 2026-10-14'));assert.equal(status.state,'CURRENT');
   }
   await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
   trace.activeCase='opening-header-timeout';await click('Opportunities');await wait('document.querySelector("header button")?.textContent==="Reload"','Ready before opening header stall');
   await control('opening-hold');let cursor=requests.length,started=Date.now();await click('Reload');
   for(let i=0;i<200&&!state.held.length;i++)await pause(25);assert(state.held.length,'Real opening handler completed with headers withheld');
   await wait('document.querySelector("header button")?.textContent==="Reload"','90s deadline settles opening header stall',105000);
   let elapsedMs=Date.now()-started,text=await js('document.body.innerText');assert(elapsedMs>=89000&&elapsedMs<105000);
   assert(text.includes('result is unconfirmed'),'Uncertain result is visible in actual Home/App');assert(!text.includes('holdings changed'),'Ordinary refresh cannot imply a holdings change');assert(!/Buy \d+ shares/.test(text));
   assert(text.includes('Signals based on 2026-10-14 close'));assert.equal(requests.slice(cursor).filter(r=>r.operation==='prepare-execution').length,1);
   assert.equal(requests.slice(cursor).find(r=>r.operation==='prepare-execution').finished,false,'Uncertain opening request is neither aborted nor replayed');
   await control(null,{release:true});await pause(200);assert(!/Buy \d+ shares/.test(await js('document.body.innerText')),'Late old headers cannot revive quantities');
   await settledReload();await wait('/Buy \\d+ shares/.test(document.body.innerText)','Normal refresh recovers after header timeout');assert.equal(JSON.stringify(api.fixture.account),baseline);
   trace.cases.push({failure:'opening-header-timeout',viewport:'desktop',elapsedMs,visibleUnconfirmedResult:true,lateResponseIgnored:true,normalReloadRecovered:true,automaticMutationRetries:0,accountRecordIdentical:true});

   await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
   trace.activeCase='quote-body-timeout';await click('My Portfolio');await wait('document.querySelector("header button")?.textContent==="Reload"','Mobile portfolio ready');
   await control('quote-body-hold');cursor=requests.length;started=Date.now();await click('Reload');
   for(let i=0;i<200&&!state.held.length;i++)await pause(25);assert(state.held.length,'Held quote delivered headers with stalled JSON body');
   await wait('document.querySelector("header button")?.textContent==="Reload"','15s API body deadline settles mobile portfolio',25000);
   elapsedMs=Date.now()-started;text=await js('document.body.innerText');assert(elapsedMs>=14000&&elapsedMs<25000);
   assert(text.includes('provider verification failed; no new data accepted.'),'Mobile refresh has a visible bounded quote result');
   assert.equal(JSON.stringify(api.fixture.account),baseline,'Read failure cannot rewrite ownership/history');
   await control(null,{release:true});await pause(200);assert((await js('document.body.innerText')).includes('provider verification failed; no new data accepted.'),'Late body cannot overwrite failure result');
   await click('Reload');await wait('document.querySelector("header button")?.textContent==="Reload"','Mobile ordinary refresh recovers');
   await wait('!document.querySelector("[aria-label=\\"Market data freshness\\"]")?.textContent.includes("provider verification failed")','Current quote recovery visible');
   assert.equal(JSON.stringify(api.fixture.account),baseline);await shot('bounded-mobile-recovery');
   trace.cases.push({failure:'quote-body-timeout',viewport:'mobile',elapsedMs,visibleBoundedResult:true,lateResponseIgnored:true,normalReloadRecovered:true,automaticMutationRetries:0,accountRecordIdentical:true});
   await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await click('Opportunities');await wait('document.querySelector("header button")?.textContent==="Reload"','Return to desktop opportunities');
  }
  if(advanced.includes('expired-opening-evidence')){
   trace.activeCase='expired-opening-evidence';await click('Opportunities');await wait('document.querySelector("header button")?.textContent==="Reload"','Opportunities ready before delayed screen');await control('screen-hold');const cursor=requests.length;await click('Reload');
   for(let i=0;i<200&&!state.held.length;i++)await pause(25);assert(state.held.length,'Actual produced screen reached the delayed HTTP gate');await requestSeen(cursor,r=>r.operation==='prepare-execution'&&r.finished,'Independent opening completed before evidence expiry');
   await control(null,{advanceMs:10*60000,release:true});await wait('document.querySelector("header button")?.textContent==="Reload"','Delayed response settled after evidence expiry');const expiredText=await js('document.body.innerText');assert(!/Buy \d+ shares/.test(expiredText),'Expired evidence cannot restore quantities when a delayed response finally arrives');assert(expiredText.includes('Signals based on 2026-10-14 close'),'Prior source analysis remains visible after evidence expiry');assert.equal(JSON.stringify(api.fixture.account),baseline);
   await control(null,actualScreen?{expireScreen:true}:{});await settledReload();await wait('/Buy \\d+ shares/.test(document.body.innerText)','Explicit normal refresh acquires current evidence after expiry');assert.equal(JSON.stringify(api.fixture.account),baseline);
   trace.cases.push({failure:'expired-opening-evidence',retainedAnalysis:true,expiredQuantitiesWithheld:true,normalReloadRecovered:true,automaticMutationRetries:0,accountRecordIdentical:true});
  }
  if(advanced.includes('version-result')){
   trace.activeCase='version-unavailable';await control('version-unavailable');await cdp('Page.reload');
   await wait('document.querySelector("[data-version-stamp]")?.textContent==="Production • version unavailable"','Failed version check has a visible finished result');
   await wait('document.querySelector("header button")?.textContent==="Reload"','Application remains usable when version metadata is unavailable');
   assert.equal(JSON.stringify(api.fixture.account),baseline);await control(null);await cdp('Page.reload');
   await wait('document.querySelector("[data-version-stamp]")?.textContent.includes("synthetic-only")','Ordinary next document recovers version metadata');
   await wait('/Buy \\d+ shares/.test(document.body.innerText)','Ordinary account flow recovers independently of version metadata');
   trace.cases.push({failure:'version-unavailable',visibleFinishedResult:true,normalReloadRecovered:true,accountRecordIdentical:true});
  }
  if(advanced.includes('uncertain-cash-write')){
   trace.activeCase='uncertain-cash-write';await control(null);await click('My Portfolio');await wait('document.querySelector("header button")?.textContent==="Reload"','Portfolio ready for isolated cash observation');
   const before=JSON.parse(baseline),writesBefore=api.fixture.writes,cursor=requests.length,ledgerBefore=actualScreen?.storageHash();
   await control('cash-response-lost');await js('document.querySelector(".brokerageCashSummary button").click()');await input('Actual brokerage cash','99999.99');await click('Update Brokerage Cash');
   await requestSeen(cursor,r=>r.operation==='update-brokerage-cash','Actual existing cash form POST');await wait('document.querySelector(".brokerageCash [role=alert]")','Lost cash response reported by actual form');await pause(200);
   const committed=JSON.parse(JSON.stringify(api.fixture.account));assert.equal(api.fixture.writes,writesBefore+1,'One actual synthetic store commit');assert.equal(requests.slice(cursor).filter(r=>r.operation==='update-brokerage-cash').length,1,'Uncertain cash mutation is never retried');
   assert.notDeepEqual(committed,before,'Lost response is not mistaken for a rolled-back write');
   const protectedState=account=>Object.fromEntries(Object.entries(account).filter(([key])=>!['revision','brokerageCash','brokerageCashObservedAt','updatedAt'].includes(key)));
   assert.deepEqual(protectedState(committed),protectedState(before),'Observation does not fabricate fills or rewrite strategy/account history');
   const committedBytes=JSON.stringify(api.fixture.account);baseline=committedBytes;await control(null);await click('Opportunities');await wait('document.querySelector("header button")?.textContent==="Reload"','Opportunities ready for explicit read recovery');const readCursor=requests.length;await click('Reload');await requestSeen(readCursor,r=>r.path==='/api/c1-account'&&r.method==='GET','Explicit normal Reload reads committed version');await wait('document.querySelector("header button")?.textContent==="Reload"','Explicit recovery settled');
   assert.equal(JSON.stringify(api.fixture.account),committedBytes,'Explicit read recovery preserves the complete committed account');assert.equal(api.fixture.writes,writesBefore+1,'Recovery causes no second account commit');assert((await js('document.body.innerText')).includes('99,999.99'),'Recovered UI displays the actually committed synthetic observation');
   trace.cases.push({failure:'uncertain-cash-write',actualForm:true,actualHandlerCommitted:true,accountWrites:1,automaticMutationRetries:0,explicitReadRecovered:true,completeCommittedAccountPreserved:true,protectedHistoryUnchanged:true,ledgerHashBefore:ledgerBefore,ledgerHashAfter:actualScreen?.storageHash()});
  }
  if(advanced.includes('frame-publication')){
   trace.activeCase='frame-publication';await click('My Portfolio');await wait('document.querySelector("header button")?.textContent==="Reload"','Initial Portfolio for frame check');
   const previousPrice=await js('document.querySelector(".mobilePortfolio .portfolioItem .mobileNumbers b")?.textContent');
   await control('opening-hold',{prices:{LLL:107}});const cursor=requests.length;await click('Reload');for(let i=0;i<200&&!state.held.length;i++)await pause(25);
   assert(state.held.length,'Matching opening review reached its delay boundary');await requestSeen(cursor,r=>r.path==='/api/performance'&&r.finished,'Current screen acquired');await requestSeen(cursor,r=>r.path==='/api'&&r.finished,'Current held quote acquired');await pause(150);
   assert.equal(await js('document.querySelector(".mobilePortfolio .portfolioItem .mobileNumbers b")?.textContent'),previousPrice,'The current quote waits for the matching account/screen/opening publication');
   await control(null,{release:true});await wait('document.querySelector("header button")?.textContent==="Reload"','Complete frame settled');
   assert.equal(await js('document.querySelector(".mobilePortfolio .portfolioItem .mobileNumbers b")?.textContent'),'$107.00');assert.equal(JSON.stringify(api.fixture.account),baseline);
   trace.cases.push({failure:'frame-publication',priorViewUntilOpeningSettles:true,currentQuoteAfterSettlement:true,accountRecordIdentical:true});
  }
  if(advanced.includes('lifecycle-client')){
   assert(reliability);await click('Opportunities');await wait('document.querySelector("header button")?.textContent==="Reload"','Friday view ready');
   const lifecycle=[];
   for(const [now,publishNext,expectedSource]of [
    ['2026-10-30T20:05:00Z',false,'2026-10-29'],
    ['2026-10-30T20:20:00Z',true,'2026-10-30'],
    ['2026-11-01T18:00:00Z',false,'2026-10-30'],
    ['2026-11-02T14:20:00Z',false,'2026-10-30'],
    ['2026-11-02T14:35:00Z',false,'2026-10-30']]){
    trace.activeCase='market-lifecycle:'+now;await control(null,{now,publishNext});await settledReload();const text=await js('document.body.innerText');
    assert(text.includes('Signals based on '+expectedSource+' close'),'The actual joined view keeps its accepted signal session across the clock change');
    if(now<'2026-11-02T14:30:00Z')assert(!/Buy \d+ shares/.test(text),'Closed/pre-open or unpublished evidence cannot authorize purchases');
    assert.equal(JSON.stringify(api.fixture.account),baseline,'Calendar transitions and source publication cannot rewrite financial history');
    lifecycle.push({now,sourceSessionDate:expectedSource,accountRecordIdentical:true});
   }
   await wait('window.__c1ClientReleaseGuard','Actual App installed release guard');assert(observations.length>0,'Actual Home emitted a signed, redacted normal-journey observation');
   assert(observations.some(row=>row[0]==='C1_JOURNEY_OBSERVED'));assert(!/offline_|symbol|shares|brokerageCash|strategyCash|price/.test(JSON.stringify(observations)),'Journey logs contain neither account details nor fixture credentials');
   trace.activeCase='version-body-timeout';await control('version-body-hold');const versionCursor=requests.length,versionDocuments=state.documentLoads,versionStarted=Date.now();
   await js("window.__C1_TEST_VERSION_RESULT=null;window.__c1ClientReleaseGuard.check().then(value=>{window.__C1_TEST_VERSION_RESULT=value;});void 0");
   for(let i=0;i<200&&!state.held.length;i++)await pause(25);assert(state.held.length,'Version response delivered headers before its body stalled');
   await wait('window.__C1_TEST_VERSION_RESULT==="UNVERIFIED"','Complete version-body budget releases the checker',15000);
   const versionElapsed=Date.now()-versionStarted;assert(versionElapsed>=9000&&versionElapsed<15000);assert.equal(state.documentLoads,versionDocuments,'Unverified metadata never triggers navigation');
   assert.equal(await js('document.querySelector("header button")?.textContent'),'Reload','A stalled version body does not block the normal application');
   assert.equal(requests.slice(versionCursor).filter(r=>r.path==='/api/version').length,1,'Version expiry does not retry the request automatically');assert(!requests.slice(versionCursor).some(r=>r.path==='/api/c1-account'),'Version detection never replays an account request');
   await control(null,{release:true});await js("window.__C1_TEST_VERSION_RESULT=null;window.__c1ClientReleaseGuard.check().then(value=>{window.__C1_TEST_VERSION_RESULT=value;});void 0");
   await wait('window.__C1_TEST_VERSION_RESULT==="ALIGNED"','Later explicit version check recovers');assert.equal(JSON.stringify(api.fixture.account),baseline);
   trace.cases.push({failure:'version-body-timeout',elapsedMs:versionElapsed,normalAppUsable:true,unverifiedNoNavigation:true,automaticRetries:0,laterExplicitCheckRecovered:true,accountRecordIdentical:true});
   // A changed deployment is detected while the real body response is pending.
   // A separate actual form draft must also survive until explicitly cleared.
   await click('My Portfolio');await wait('document.querySelector("header button")?.textContent==="Reload"','Portfolio ready for client handoff');
   await js(`(()=>{const e=document.querySelector('input[placeholder="Symbol"]');e.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'UNSAVED');e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
   await control('opening-body-hold');await click('Reload');for(let i=0;i<200&&!state.held.length;i++)await pause(25);assert(state.held.length);
   const documents=state.documentLoads;await control('opening-body-hold',{versionCommit:'b'.repeat(40)});await js("window.dispatchEvent(new Event('focus'))");
   await wait('window.__c1ClientReleaseGuard.state().updatePending','Release mismatch detected');await pause(200);assert.equal(state.documentLoads,documents);assert(await js('window.__c1ClientReleaseGuard.state().writes>0'),'Save tracking waits for the real response body, not headers');
   await control(null,{release:true});await wait('document.querySelector("header button")?.textContent==="Reload"','Original opening body completed');await pause(200);
   assert.equal(state.documentLoads,documents,'A remaining form draft prevents full navigation');assert.equal(await js('document.querySelector(\'input[placeholder="Symbol"]\').value'),'UNSAVED');
   await js(`(()=>{const e=document.querySelector('input[placeholder="Symbol"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'');e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
   for(let i=0;i<200&&state.documentLoads===documents;i++)await pause(50);assert.equal(state.documentLoads,documents+1,'One safe full navigation loads the updated app');
   await wait('window.__c1ClientReleaseGuard&&document.querySelector("header button")?.textContent==="Reload"','New document settles');await js("window.dispatchEvent(new Event('focus'))");await pause(300);assert.equal(state.documentLoads,documents+1,'An unchanged fixture bundle cannot cause an update loop');assert.equal(JSON.stringify(api.fixture.account),baseline);
   trace.cases.push({failure:'lifecycle-client',lifecycle,signedObservations:observations.length,bodyWait:true,draftPreserved:true,safeFullNavigation:true,reloadLoopPrevented:true,accountRecordIdentical:true});
  }
  delete trace.activeCase;
  assert(!requests.some(r=>['record-intraday','record-session',...(!advanced.includes('uncertain-cash-write')?['update-brokerage-cash']:[])].includes(r.operation)));assert(!requests.some(r=>r.path==='/api/portfolio-sync'&&r.method==='PUT'));
  if(actualScreen){trace.screen={sources:actualScreen.sources(),providerCalls:actualScreen.calls,conditionalWrites:actualScreen.writes,ledgerRecordCount:actualScreen.ledger()?.records.length||0,storageHash:actualScreen.storageHash(),mockedBoundaries:['provider HTTP transport','accepted book/snapshot reads','Blob memory backend'],realModules:['top5 handler','quote/fundamental/event/timing providers','scoring/selection/gates','performanceStore','performanceLedger','strongBuyPersistence']};assert(actualScreen.writes.some(row=>row.name==='screener-performance-ledger.json'),'Actual screen path persists its synthetic observation through the real performance store');}
  assert.deepEqual(trace.browserErrors,[],'Actual application rendering must recover without browser exceptions');
  trace.status='PASS';trace.browser=(await send('Browser.getVersion')).product;trace.requests=requests;fs.writeFileSync(path.join(out,'normal-journey.json'),JSON.stringify(trace,null,2)+'\n');console.log('PASS: actual Home/App normal Reload retains account and suppresses/recovers quantities across '+trace.cases.length+' HTTP failures; no automatic mutation retry or live request.');
 }finally{trace.accountRecordIdentical=accountRecordUnchanged();trace.syntheticAccountWrites=api.fixture.writes;state.held.splice(0).forEach(release=>release());try{socket?.close();}catch{}await new Promise(resolve=>{if(chrome.exitCode!==null||chrome.signalCode!==null)resolve();else{chrome.once('exit',resolve);chrome.kill('SIGTERM');}});server.closeAllConnections();await new Promise(r=>server.close(r));fs.rmSync(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100});fs.writeFileSync(path.join(out,'normal-journey.json'),JSON.stringify(trace,null,2)+'\n');}
}
main().catch(error=>{trace.status='FAIL';trace.failure=error.message;fs.writeFileSync(path.join(out,'normal-journey.json'),JSON.stringify(trace,null,2)+'\n');console.error(error);process.exitCode=1;});
