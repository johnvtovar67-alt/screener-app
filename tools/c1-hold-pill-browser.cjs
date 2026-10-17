// Real browser geometry using the production styles and presentation helper.
// Synthetic display-only fixtures; no API, account or external requests.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const {c1HoldPillLabel:label,c1HoldPillStyle:style}=createResearchModuleLoader(process.cwd()).load('lib/c1HoldPill.js');
(async()=>{
const out=path.resolve('work/mrna-hold-evidence');fs.mkdirSync(out,{recursive:true});
const source=fs.readFileSync('pages/index.js','utf8'),css=[...source.matchAll(/<style jsx global>\{`([\s\S]*?)`\}<\/style>/g)].map(m=>m[1]).join('\n');assert(css.includes('.pill.yellow'));assert(!css.includes('${'));
const rows=['Portfolio desktop','Portfolio mobile','Card','Opportunities','Watch holding'];
const markup=rows.map((name,index)=>renderToStaticMarkup(React.createElement('section',{style:{fontSize:10+index*4}},name,
 React.createElement('b',{'data-test':'before',className:'pill '+(index%2?'gray':'yellow')},'Hold'),
 React.createElement('b',{'data-test':'hold',className:'pill '+(index%2?'gray':'yellow'),style:style(index%2?'HOLD':'Hold')},label(index%2?'HOLD':'Hold')),
 React.createElement('b',{'data-test':'sell-before',className:'pill red'},'Sell'),
 React.createElement('b',{'data-test':'sell-after',className:'pill red',style:style('Sell')},label('Sell'))))).join('');
const binary=process.env.C1_BROWSER_BIN||'/usr/bin/chromium',profile=fs.mkdtempSync(path.join(out,'profile-'));
const chrome=spawn(binary,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-background-networking','--disable-component-update','--disable-sync','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:['ignore','ignore',fs.openSync(path.join(out,'chromium.log'),'w')]});
const pause=ms=>new Promise(r=>setTimeout(r,ms));let socket;
try{
 const portFile=path.join(profile,'DevToolsActivePort');for(let i=0;!fs.existsSync(portFile)&&i<200;i++)await pause(50);assert(fs.existsSync(portFile),'Chromium did not start');
 const [port,endpoint]=fs.readFileSync(portFile,'utf8').trim().split('\n');socket=new WebSocket('ws://127.0.0.1:'+port+endpoint);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
 let serial=0;const pending=new Map();socket.addEventListener('message',event=>{const r=JSON.parse(event.data);if(r.id&&pending.has(r.id)){const {resolve,reject}=pending.get(r.id);pending.delete(r.id);r.error?reject(Error(JSON.stringify(r.error))):resolve(r.result);}});
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});
 const target=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId:target.targetId,flatten:true});
 const cdp=(m,p)=>send(m,p,sessionId);await cdp('Page.enable');await cdp('Runtime.enable');
 const {frameTree}=await cdp('Page.getFrameTree');await cdp('Page.setDocumentContent',{frameId:frameTree.frame.id,html:'<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>'+css+'</style></head><body>'+markup+'</body></html>'});
 const cases=[];
 for(const width of [1440,390]){
  await cdp('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<700});
  const response=await cdp('Runtime.evaluate',{returnByValue:true,expression:`(()=>{const props=['height','paddingTop','paddingRight','paddingBottom','paddingLeft','fontSize','lineHeight','borderRadius','fontWeight'];const read=e=>Object.fromEntries(props.map(k=>[k,getComputedStyle(e)[k]]));return [...document.querySelectorAll('section')].map(s=>{const q=x=>s.querySelector('[data-test="'+x+'"]'),c=e=>({background:getComputedStyle(e).backgroundColor,color:getComputedStyle(e).color,border:getComputedStyle(e).borderColor});return {geometry:read(q('hold')),label:q('hold').textContent,colorBefore:c(q('before')),colorAfter:c(q('hold')),otherBefore:read(q('sell-before')),otherAfter:read(q('sell-after'))};});})()`});
  assert(!response.exceptionDetails);const values=response.result.value;assert.equal(values.length,5);
  for(const v of values){assert.deepEqual(v.geometry,v.otherBefore,'HOLD must match native SELL in the same context');assert.equal(v.geometry.paddingTop,'5px');assert.equal(v.geometry.paddingRight,'9px');assert.equal(v.geometry.borderRadius,'999px');assert.equal(v.label,'HOLD');assert.deepEqual(v.colorAfter,v.colorBefore);assert.deepEqual(v.otherAfter,v.otherBefore);}
  cases.push({viewport:width,contexts:rows,status:'PASS',geometry:values.map(v=>v.geometry),colorsPreserved:true,nonHoldGeometryUnchanged:true});
 }
 fs.writeFileSync(path.join(out,'hold-browser.json'),JSON.stringify({scope:'Synthetic HOLD rendering in real Chromium; production CSS and helper',cases,liveWrites:0,status:'PASS'},null,2)+'\n');
 console.log('PASS: HOLD matches native SELL geometry across five contexts at desktop/mobile sizes; existing colors and other pills preserved.');
}finally{socket?.close();chrome.kill('SIGTERM');fs.rmSync(profile,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
