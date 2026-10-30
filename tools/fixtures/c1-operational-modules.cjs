const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
// Real application modules; only the external Blob SDK is forbidden/stubbed.
// Provider I/O must be supplied explicitly by each isolated test.
function createOperationalModuleLoader(root=process.cwd(),overrides={}){
 const cache=new Map(),never=()=>{throw Error('External fixture I/O forbidden');};
 function load(request,from=path.join(root,'__fixture__.js')){
  if(Object.hasOwn(overrides,request))return overrides[request];
  if(request.startsWith('node:'))return require(request);
  if(request==='@vercel/blob')return {get:never,put:never,list:never};
  let file=request.startsWith('.')?path.resolve(path.dirname(from),request):path.resolve(root,request);
  if(!path.extname(file))file+='.js';
  if(cache.has(file))return cache.get(file);
  const names=[],imports={};let source=fs.readFileSync(file,'utf8');
  source=source.replace(/import\s*{([^}]+)}\s*from\s*['"]([^'"]+)['"];?/g,(_,spec,dependency)=>{
   const values=load(dependency,file);for(const item of spec.split(',')){const [remote,local=remote]=item.trim().split(/\s+as\s+/);if(!(remote in values))throw Error('Missing fixture binding '+remote);imports[local]=values[remote];}return '';
  });
  if(/^\s*import\s/m.test(source))throw Error('Unsupported fixture import');
  source=source.replace(/^export default (.*);$/gm,'const fixtureDefault=$1;').replace(/export\s+(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)/g,(match,name)=>{names.push(name);return match.replace('export ','');});
  const box={...imports,Date,Math,Number,String,Object,Array,Set,Map,WeakMap,WeakSet,JSON,RegExp,Boolean,Error,TypeError,
   Promise,URL,URLSearchParams,Response,Request,Headers,AbortController,AbortSignal,DOMException,Buffer,Intl,performance,
   setTimeout,clearTimeout,setInterval,clearInterval,fetch:never,process:{env:{}},console,module:{exports:{}}};
  vm.createContext(box);vm.runInContext(source+'\nmodule.exports={'+names.join(',')+'};',box,{filename:file});
  cache.set(file,box.module.exports);return box.module.exports;
 }
 return {load};
}
module.exports={createOperationalModuleLoader};
