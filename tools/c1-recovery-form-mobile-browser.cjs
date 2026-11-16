// Presentation-only real Chromium check. Production component and Home/App CSS;
// fictional selected-form state only. No account, provider, or brokerage API.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),babel=require('next/dist/compiled/babel/core');
const {waitForBrowserStartup}=require('./c1-browser-startup.cjs');
const root=process.cwd(),out=path.resolve(process.env.C1_RECOVERY_FORM_EVIDENCE||'work/recovery-form-mobile');
const componentFile=path.join(root,'components/C1IntradayActivity.js'),componentSource=fs.readFileSync(componentFile,'utf8');
const homeSource=fs.readFileSync(path.join(root,'pages/index.js'),'utf8');
const homeCss=[...homeSource.matchAll(/<style jsx global>\{`([\s\S]*?)`\}<\/style>/g)].map(match=>match[1]).join('\n');
const cardCss=fs.readFileSync(path.join(root,'styles/card-layout.css'),'utf8');
assert(homeCss.includes('button,select,input')&&!homeCss.includes('${'),'Use actual static Home global CSS');
assert(cardCss.includes('.c1TradeRecorder'),'Use actual imported recorder styles');
let states,hookIndex;
const mockReact={...React,useMemo:calculate=>calculate(),useState:initial=>[hookIndex<states.length?states[hookIndex++]:typeof initial==='function'?initial():initial,()=>{throw Error('Static geometry fixture must not dispatch state changes');}]};
const compiled=babel.transformSync(componentSource,{filename:componentFile,babelrc:false,configFile:false,presets:[[require.resolve('next/babel'),{'preset-env':{modules:'commonjs'}}]]}).code;
const moduleRecord={exports:{}};
new Function('require','module','exports',compiled)(name=>name==='react'?mockReact:name.startsWith('@babel/runtime/')?require('next/dist/compiled/'+name):require(name),moduleRecord,moduleRecord.exports);
const Component=moduleRecord.exports.default;
const session={date:'2026-11-16',revision:7,sellOnly:true,fills:[],tickets:[],issuedChoices:[],plan:{providerVerified:false,executable:false,recordingOnly:true,orders:[],openingBooks:{
 base:{cash:5000,positions:{ZZQA:{shares:6,avgCost:100,openedAt:'2026-11-13'}}},
 cooldown15:{cash:5000,positions:{ZZQA:{shares:12,avgCost:100,openedAt:'2026-11-13'}}},
 sector40:{cash:5000,positions:{ZZQA:{shares:6,avgCost:100,openedAt:'2026-11-13'}}}}}};
function markup(mode){
 states=['completed-add:ZZQA','2','101.35','0','2026-11-16T10:05:47',mode!=='disabled','',null,null,null,'','','','',{base:'1',cooldown15:'1',sector40:'0'}];hookIndex=0;
 const html=renderToStaticMarkup(React.createElement(Component,{session,busy:mode==='busy',onSave:()=>{throw Error('No account writes allowed');},onCorrectDetails:()=>{throw Error('No account writes allowed');}}));
 assert.equal(hookIndex,states.length,'Recheck mocked form hook mapping after component changes');
 return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>'+cardCss+'</style><style>'+homeCss+'</style></head><body><main>'+html+'</main></body></html>';
}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function rgb(value){const numbers=value.match(/[\d.]+/g)?.map(Number);assert(numbers&&numbers.length>=3,'Expected computed RGB color: '+value);return numbers.slice(0,3);}
function blend(foreground,background,opacity){return foreground.map((value,index)=>value*opacity+background[index]*(1-opacity));}
function luminance(color){return color.map(value=>{const n=value/255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;}).reduce((sum,value,index)=>sum+value*[.2126,.7152,.0722][index],0);}
function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const binary=process.env.C1_BROWSER_BIN||'/usr/bin/chromium',profile=fs.mkdtempSync(path.join(out,'profile-'));
 const chrome=spawn(binary,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-background-networking','--disable-component-update','--disable-sync','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:['ignore','ignore',fs.openSync(path.join(out,'chromium.log'),'w')]});
 let socket;const pending=new Map();let serial=0;
 try{
  const portFile=path.join(profile,'DevToolsActivePort'),startup=await waitForBrowserStartup({process:chrome,isReady:()=>fs.existsSync(portFile),timeoutMs:60000});
  assert(startup.ready,'Chromium did not start: '+JSON.stringify(startup));
  const [port,endpoint]=fs.readFileSync(portFile,'utf8').trim().split('\n');socket=new WebSocket('ws://127.0.0.1:'+port+endpoint);
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  socket.addEventListener('message',event=>{const result=JSON.parse(event.data),promise=pending.get(result.id);if(promise){pending.delete(result.id);result.error?promise.reject(Error(JSON.stringify(result.error))):promise.resolve(result.result);}});
  const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});
  const target=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId:target.targetId,flatten:true});
  const cdp=(method,params)=>send(method,params,sessionId);await cdp('Page.enable');await cdp('Runtime.enable');await cdp('Network.enable');await cdp('Network.setBlockedURLs',{urls:['http://*','https://*']});
  await cdp('Emulation.setTimezoneOverride',{timezoneId:'UTC'});const {frameTree}=await cdp('Page.getFrameTree');
  const cases=[];
  for(const width of [320,390,1440])for(const mode of ['disabled','enabled','busy']){
   await cdp('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<700});
   await cdp('Page.setDocumentContent',{frameId:frameTree.frame.id,html:markup(mode)});await pause(20);
   const result=await cdp('Runtime.evaluate',{returnByValue:true,expression:`(()=>{const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};const section=document.querySelector('.c1TradeRecorder'),button=section.querySelector('.c1TradeSave'),s=getComputedStyle(button);return {viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,section:rect(section),controls:[...section.querySelectorAll('input,select,button,fieldset')].map(e=>({label:e.getAttribute('aria-label')||e.textContent.trim(),tag:e.tagName,type:e.type,...rect(e)})),allocations:[...section.querySelectorAll('.c1RecoveryFields label')].map(e=>({label:e.querySelector('span').textContent,text:rect(e.querySelector('span')),input:rect(e.querySelector('input')),value:e.querySelector('input').value,display:getComputedStyle(e).display,direction:getComputedStyle(e).flexDirection})),date:rect(section.querySelector('[aria-label="Execution time"]')),button:{text:button.textContent,disabled:button.disabled,color:s.color,textFill:s.webkitTextFillColor,background:s.backgroundColor,opacity:Number(s.opacity),fontSize:parseFloat(s.fontSize),...rect(button)},bodyBackground:getComputedStyle(document.body).backgroundColor};})()`});
   assert(!result.exceptionDetails,JSON.stringify(result.exceptionDetails));const observed=result.result.value;
   assert.equal(observed.viewport,width);assert(observed.documentWidth<=width+1,'No horizontal document overflow at '+width+' / '+mode);
   for(const control of observed.controls){assert(control.x>=-1&&control.right<=width+1,'Control stays within viewport: '+control.label);assert(control.width>0&&control.height>0,'Control is visible: '+control.label);}
   assert.equal(observed.allocations.length,3);assert.deepEqual(observed.allocations.map(row=>row.value),['1','1','0'],'An explicitly assigned zero remains visible');
   for(const row of observed.allocations){assert.equal(row.display,'flex');assert.equal(row.direction,'column');assert(row.text.bottom<=row.input.y+1,'Allocation label remains above its input');assert(row.input.right<=observed.section.right+1);}
   assert(observed.date.x>=observed.section.x&&observed.date.right<=observed.section.right+1,'Date/time control stays inside the card');
   assert.equal(observed.button.text,mode==='busy'?'Saving trade…':'Save trade and update C1');assert.equal(observed.button.disabled,mode!=='enabled');assert(observed.button.height>=44,'Save touch target is at least44px');
   assert.deepEqual(rgb(observed.button.textFill),rgb(observed.button.color),'WebKit text fill matches explicit button foreground');
   const surface=[255,255,255],foreground=blend(rgb(observed.button.color),surface,observed.button.opacity),background=blend(rgb(observed.button.background),surface,observed.button.opacity),ratio=contrast(foreground,background);
   assert(ratio>=(mode==='enabled'?4.5:3),'Save label has visible effective contrast: '+ratio);
   cases.push({width,mode,...observed,effectiveSaveContrast:Number(ratio.toFixed(3)),status:'PASS'});
   const screenshot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width,height:Math.ceil((await cdp('Page.getLayoutMetrics')).cssContentSize.height),scale:1}});
   fs.writeFileSync(path.join(out,'recovery-'+width+'-'+mode+'.png'),Buffer.from(screenshot.data,'base64'));
  }
  const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
  fs.writeFileSync(path.join(out,'geometry.json'),JSON.stringify({scope:'Actual component static rendering and actual Home/App CSS in Chromium; fictional holdings6/12/6 and explicit added-share split1/1/0. Geometry only; hooks regression verifies interactions separately.',componentSha256:sha(componentSource),homeCssSha256:sha(homeCss),cardCssSha256:sha(cardCss),cssOrder:['styles/card-layout.css','Home global CSS'],cases,productionRequests:0,accountWrites:0,status:'PASS'},null,2)+'\n');
  console.log('PASS: actual recovery form and Home/App CSS fit320/390/1440px, stack allocation labels, retain explicit zero and date bounds, and keep disabled/enabled/busy Save labels legible; no account or backend requests.');
 }finally{socket?.close();chrome.kill('SIGTERM');fs.rmSync(profile,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
