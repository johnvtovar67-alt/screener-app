// Actual production Home/App request flow; localhost synthetic account/evidence only.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {createWorkflowApi}=require('./fixtures/c1-trading-workflow-api.cjs');
const root=process.cwd(),out=path.resolve(process.env.C1_NORMAL_BROWSER_EVIDENCE||'work/normal-refresh-browser');fs.mkdirSync(out,{recursive:true});
const pause=ms=>new Promise(r=>setTimeout(r,ms)),trace={scope:'Actual Home + App → localhost HTTP → real C1 handler / memory fixture; top5/quote bodies supplied synthetic evidence',cases:[],liveWrites:0};
async function main(){
 const w=require('next/dist/compiled/webpack/webpack');w.init();
 await new Promise((resolve,reject)=>w.webpack({mode:'development',target:'web',devtool:false,entry:path.resolve('tools/fixtures/c1-normal-refresh-browser.jsx'),output:{path:out,filename:'client.js'},resolve:{modules:[path.join(root,'node_modules')],alias:{'@babel/runtime':path.join(path.dirname(require.resolve('next/package.json')),'dist/compiled/@babel/runtime')}},module:{rules:[{test:/\.jsx?$/,exclude:/node_modules/,use:{loader:path.join(root,'tools/fixtures/c1-normal-refresh-babel-loader.cjs')}},{test:/\.css$/,type:'asset/source'}]}}).run((error,stats)=>error?reject(error):stats.hasErrors()?reject(Error(stats.toString({all:false,errors:true}))):resolve()));
 const api=createWorkflowApi();api.fixture.setCash(100000);
 const requests=[],state={fail:null,portfolioPuts:0,held:[]};trace.requests=requests;
 const screenPayload=()=>({stocks:api.fixture.screenRows(),meta:{snapshotAsOf:api.fixture.now.toISOString(),quoteFeedStatus:'live',fundamentalFeedStatus:'healthy',coveragePct:100,fundamentalCoveragePct:100},themeLeadership:[]});
 const server=http.createServer(async(req,res)=>{try{
  let raw='';for await(const chunk of req)raw+=chunk;const body=raw?JSON.parse(raw):null,url=new URL(req.url,'http://127.0.0.1');
  const json=(data,status=200)=>{res.writeHead(status,{'content-type':'application/json','x-fixture-clock':api.fixture.now.toISOString()});res.end(JSON.stringify(data));};
  if(url.pathname==='/__control'){state.fail=body.fail;if(body.prices)for(const [symbol,value]of Object.entries(body.prices))api.fixture.setQuote(symbol,value);if(body.release)state.held.splice(0).forEach(release=>release());return json({ok:true});}
  if(url.pathname.startsWith('/api')){const record={path:url.pathname,method:req.method,operation:body?.operation||null,finished:false};requests.push(record);res.on('finish',()=>{record.finished=true;});}
  const target=state.fail&&(state.fail.startsWith('screen')?url.pathname==='/api/top5':state.fail.startsWith('quote')?url.pathname==='/api':state.fail==='cloud-hold'?url.pathname==='/api/portfolio-sync'&&req.method==='GET':state.fail.startsWith('opening')?url.pathname==='/api/c1-account'&&body?.operation==='prepare-execution':state.fail.startsWith('account-inputs')?url.pathname==='/api/c1-account'&&body?.operation==='refresh-account-inputs':state.fail==='performance-body'?url.pathname==='/api/performance':url.pathname==='/api/c1-account'&&req.method==='GET');
  if(target){
   const mode=state.fail;
   if(mode==='screen-hold'){const captured=screenPayload();await new Promise(resolve=>state.held.push(resolve));return json(captured);}
   if(mode==='opening-hold'){const captured=await api.request(req.method,body,true);await new Promise(resolve=>state.held.push(resolve));return json(captured.body,captured.status);}
   if(mode==='opening-body-hold'){const captured=await api.request(req.method,body,true),serialized=JSON.stringify(captured.body);res.writeHead(captured.status,{'content-type':'application/json','content-length':Buffer.byteLength(serialized),'x-fixture-clock':api.fixture.now.toISOString()});res.write(serialized.slice(0,12));await new Promise(resolve=>state.held.push(resolve));res.end(serialized.slice(12));return;}
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
  if(url.pathname==='/api/c1-account'){const result=await api.request(req.method,body,req.headers.authorization==='Bearer offline_workflow_fixture_key_000001');return json(result.body,result.status);}
  if(url.pathname==='/api/top5')return json(screenPayload());
  if(url.pathname==='/api/performance')return json({records:[],persistentStorage:true});
  if(url.pathname==='/api/entry-timing')return json({timing:Object.fromEntries(api.fixture.screenRows().map(row=>[row.symbol,row.entryTiming]))});
  if(url.pathname==='/api/portfolio-sync'){assert.equal(req.method,'GET','Normal Reload must not write portfolio');return json({portfolio:api.fixture.portfolio,etag:'"fixture-portfolio-1"'});}
  if(url.pathname==='/api')return json({stock:{...api.fixture.screenRows().find(row=>row.symbol===url.searchParams.get('symbol')),quoteVerification:{verifiedRegularSession:true,providerAttempted:true,newDataAccepted:true}}});
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
 let socket,accountRecordUnchanged=()=>null;
 try{
  const portFile=path.join(profile,'DevToolsActivePort');for(let i=0;!fs.existsSync(portFile)&&i<200;i++)await pause(50);assert(fs.existsSync(portFile),'Chromium did not start');
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
  const baseline=JSON.stringify(api.fixture.account),beforeText=await js('document.body.innerText');
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
   const count=requests.length;
   await control(mode);
   await settledReload();
   const text=await js('document.body.innerText'),during=requests.slice(count);
   assert(text.includes('Signals based on 2026-10-14 close'),'Prior account/source analysis retained');
   assert(!/Buy \d+ shares/.test(text),'Failed independent verification suppresses purchase quantities');
   assert(during.some(r=>r.path==='/api/c1-account'&&r.method==='GET'),'The normal read occurred; Chromium may retry a safe GET at transport level');
   assert.equal(during.filter(r=>r.operation==='prepare-execution').length,mode.startsWith('opening')||mode.startsWith('screen')?1:0,'No automatic opening POST retry');
   assert.equal(JSON.stringify(api.fixture.account),baseline,'Failed normal refresh cannot rewrite account holdings/cash/history');
   await control(null);
   await settledReload();await wait('/Buy \\d+ shares/.test(document.body.innerText)','normal independent recovery');
   assert.equal(JSON.stringify(api.fixture.account),baseline,'Recovery cannot change account economic history');
   trace.cases.push({failure:mode,retainedAnalysis:true,quantitiesSuppressed:true,normalReloadRecovered:true,automaticMutationRetries:0,accountRecordIdentical:true});
  }
  const advanced=(process.env.C1_NORMAL_BROWSER_ADVANCED||'opening-pending,portfolio-inputs-pending,portfolio-account-failure,overlap-tabs,overlap-cloud,body-timeout').split(',').filter(mode=>mode!=='none');
  async function requestSeen(cursor,predicate,description){for(let i=0;i<200;i++){if(requests.slice(cursor).some(predicate))return;await pause(25);}throw Error('HTTP fixture timeout: '+description);}
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
    trace.cases.push({failure:mode,retainedAnalysis:true,quantitiesSuppressed:true,normalReloadRecovered:true,automaticMutationRetries:0,accountRecordIdentical:true});
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
  delete trace.activeCase;
  assert(!requests.some(r=>['record-intraday','record-session','update-brokerage-cash'].includes(r.operation)));assert(!requests.some(r=>r.path==='/api/portfolio-sync'&&r.method==='PUT'));
  trace.status='PASS';trace.browser=(await send('Browser.getVersion')).product;trace.requests=requests;fs.writeFileSync(path.join(out,'normal-journey.json'),JSON.stringify(trace,null,2)+'\n');console.log('PASS: actual Home/App normal Reload retains account and suppresses/recovers quantities across '+trace.cases.length+' HTTP failures; no mutation retry/account record change/live request.');
 }finally{trace.accountRecordIdentical=accountRecordUnchanged();trace.syntheticAccountWrites=api.fixture.writes;state.held.splice(0).forEach(release=>release());try{socket?.close();}catch{}await new Promise(resolve=>{if(chrome.exitCode!==null)resolve();else{chrome.once('exit',resolve);chrome.kill('SIGTERM');}});server.closeAllConnections();await new Promise(r=>server.close(r));fs.rmSync(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100});fs.writeFileSync(path.join(out,'normal-journey.json'),JSON.stringify(trace,null,2)+'\n');}
}
main().catch(error=>{trace.status='FAIL';trace.failure=error.message;fs.writeFileSync(path.join(out,'normal-journey.json'),JSON.stringify(trace,null,2)+'\n');console.error(error);process.exitCode=1;});
