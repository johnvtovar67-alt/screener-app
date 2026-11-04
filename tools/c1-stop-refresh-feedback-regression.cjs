// Actual Home component/hook replay with isolated synthetic account data. No live I/O.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=process.cwd(),babel=require(path.join(root,'node_modules/next/dist/compiled/babel/core'));
const {createWorkflowApi}=require(path.join(root,'tools/fixtures/c1-trading-workflow-api.cjs'));
(async()=>{
 const api=createWorkflowApi('buy');api.fixture.setCash(100000);
 const d=(await api.request('GET',null,true)).body;
 const NativeDate=Date;class Clock extends NativeDate{constructor(...args){super(...(args.length?args:[api.fixture.now]));}static now(){return api.fixture.now.getTime();}}
 let si=0,ri=0,states=[],refs=[],pending=[];const values=new Map();
 const storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};
 const React=require(path.join(root,'node_modules/react'));
 const react={...React,useState(initial){const index=si++;if(!(index in states))states[index]=typeof initial==='function'?initial():initial;return[states[index],value=>{states[index]=typeof value==='function'?value(states[index]):value;}];},useRef(initial){const index=ri++;return refs[index]||(refs[index]={current:initial});},useEffect(){},useMemo(fn){return fn();}};
 const cache=new Map(),win={localStorage:storage};
 let fetcher=async()=>{throw Error('Unexpected synthetic fetch');};
 function load(file){if(!path.extname(file))file+='.js';if(cache.has(file))return cache.get(file).exports;const m={exports:{}};cache.set(file,m);
  const code=babel.transformSync(fs.readFileSync(file,'utf8'),{filename:file,babelrc:false,configFile:false,presets:[[path.join(root,'node_modules/next/babel'),{'preset-env':{modules:'commonjs'}}]]}).code;
  const req=name=>{if(name==='react')return react;if(name.startsWith('@babel/runtime/'))return require(path.join(root,'node_modules/next/dist/compiled',name));if(name.startsWith('.')){const target=path.resolve(path.dirname(file),name);if(target.includes('/components/'))return {__esModule:true,default:()=>null};return load(target);}return require(require.resolve(name,{paths:[root]}));};
  new Function('require','module','exports','Date','window','localStorage','fetch',code)(req,m,m.exports,Clock,win,storage,(...args)=>fetcher(...args));return m.exports;
 }
 const Home=load(path.join(root,'pages/index.js')).default;
 function render(){si=ri=0;return Home();}
 render();
 states[0]='portfolio';states[4]=JSON.parse(JSON.stringify(api.fixture.portfolio));states[5]=api.fixture.screenRows().map(s=>({...s,...states[4].find(p=>p.symbol===s.symbol)}));states[7]=d;states[11]=true;
 storage.setItem('stock_screener_portfolio_v1',JSON.stringify(states[4]));
 refs[0].current=1;refs[8].current=1;refs[4].current=load(path.join(root,'lib/c1StopVerification.js')).c1StopDecisionIdentity(d.decision);
 function find(node,predicate){if(!node||typeof node!=='object')return null;if(predicate(node))return node;for(const child of [node.props?.children].flat(Infinity)){const result=find(child,predicate);if(result)return result;}return null;}
 let tree=render();const button=find(tree,n=>n.props?.['aria-label']==='Verify stop now for LLL');if(!button)throw Error('Synthetic button missing');
 fetcher=(url,opts)=>new Promise(resolve=>pending.push({url,opts,resolve}));
 const request=button.props.onClick();render();
 pending[0].resolve({ok:true,json:async()=>({contract:'c1-stop-quote-v1',stock:api.fixture.screenRows().find(r=>r.symbol==='LLL')})});await request;tree=render();
 assert.equal(states[14].LLL.binding,refs[3].current.binding);assert.match(states[14].LLL.message,/Price \$100.00/);assert.match(states[14].LLL.message,/above the recorded stops/);
 // A normal account/cloud read changes request generations without changing any holding.
 refs[0].current++;refs[8].current++;tree=render();
 const section=find(tree,n=>n.props?.['aria-label']==='C1 stop verification');
 const status=find(section,n=>n.props?.role==='status');
 assert.match(status.props.children,/page refreshed.*current stop status/i);
 assert(!String(status.props.children).includes('Holding details changed'));
 const cursor=pending.length;
 const check=find(tree,n=>n.props?.['aria-label']==='Verify stop now for LLL').props.onClick();render();
 refs[0].current++;refs[8].current++;render();
 pending[cursor].resolve({ok:true,json:async()=>({contract:'c1-stop-quote-v1',stock:api.fixture.screenRows().find(r=>r.symbol==='LLL')})});
 for(let i=0;i<20&&pending.length<cursor+2;i++)await new Promise(r=>setTimeout(r,0));
 assert.equal(pending.length,cursor+2,'Same reconciled account/portfolio permits one new quote after a superseded response');
 pending[cursor+1].resolve({ok:true,json:async()=>({contract:'c1-stop-quote-v1',stock:api.fixture.screenRows().find(r=>r.symbol==='LLL')})});
 await check;tree=render();
 assert.equal(states[14].LLL.binding,refs[3].current.binding,'Success feedback uses the new request binding');
 assert.match(states[14].LLL.message,/above the recorded stops/);
 assert.equal(states[13].LLL,false,'The actual Home button releases its busy state');
 const failedCursor=pending.length;
 const failed=find(tree,n=>n.props?.['aria-label']==='Verify stop now for LLL').props.onClick();render();
 refs[0].current++;refs[8].current++;render();
 pending[failedCursor].resolve({ok:true,json:async()=>({contract:'c1-stop-quote-v1',stock:api.fixture.screenRows().find(r=>r.symbol==='LLL')})});
 for(let i=0;i<20&&pending.length<failedCursor+2;i++)await new Promise(r=>setTimeout(r,0));
 assert.equal(pending.length,failedCursor+2);
 pending[failedCursor+1].resolve({ok:false});await failed;render();
 assert.match(states[14].LLL.message,/New quote check failed/,'A failed second request has a visible result');
 assert.equal(states[14].LLL.binding,refs[3].current.binding);assert.equal(states[13].LLL,false);
 console.log('PASS: actual Home shows price/stop completion, never falsely reports changed holdings on ordinary refresh, and completes one safe quote recheck under the shared deadline.');
})().catch(e=>{console.error(e);process.exitCode=1});
