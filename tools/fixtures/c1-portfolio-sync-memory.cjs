const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');

// Run the actual server handler. The private Blob boundary is ordered memory
// with strong compare-and-swap, and no path can contact a real store.
function createPortfolioSyncMemory({state,loader,key}){
 const file=path.resolve('pages/api/portfolio-sync.js'),bindings={};
 const target='portfolio-sync/'+require('node:crypto').createHash('sha256').update(key).digest('hex')+'.json';
 const verify=(name,options)=>{assert.equal(name,target);assert.equal(options.access,'private');};
 let version=0;
 const memory={list(){throw Error('Fixture does not accept a health probe');},
  async get(name,options){
   verify(name,options);assert.equal(options.useCache,false);assert.equal(options.headers['accept-encoding'],'identity');
   const {etag,...record}=state.portfolioRecord;
   return {statusCode:200,stream:JSON.stringify(record),blob:{etag}};
  },
  async put(name,json,options){
   verify(name,options);
   if(options.ifMatch!==state.portfolioRecord.etag)throw Object.assign(Error('Fictional ETag mismatch'),{name:'BlobPreconditionFailedError',status:412});
   const etag=`"fictional-portfolio-written-${++version}"`;
   state.portfolioRecord={...JSON.parse(json),etag};return {etag};
  }};
 const date=class extends Date{constructor(...args){super(...(args.length?args:[state.now.getTime()]));}};
 const source=fs.readFileSync(file,'utf8').replace(/import\s*{([^}]+)}\s*from\s*['"]([^'"]+)['"];?/g,(_,names,request)=>{
  const values=request==='@vercel/blob'?memory:request==='crypto'?require('node:crypto'):request.endsWith('c1OwnerAccess')?require('../c1-owner-access-extraction.cjs').ownerAccessFixture():loader.load(request,file);
  for(const name of names.split(',').map(part=>part.trim())){assert(name in values,request+' exports '+name);bindings[name]=values[name];}
  return '';
 }).replace('export const config=','const config=').replace('export default async function handler','globalThis.handler=async function handler');
 const box={...bindings,Date:date,Response,process:{env:{}},console:{warn(){}}};vm.createContext(box);vm.runInContext(source,box,{filename:file});
 return async (method,body)=>{
  const response={headers:{},setHeader(name,value){this.headers[name]=value;},status(status){this.statusCode=status;return this;},json(value){this.body=value;return this;}};
  await box.handler({method,body,query:{},headers:{authorization:'Bearer '+key}},response);
  assert.equal(response.headers['Cache-Control'],'no-store, max-age=0');return response;
 };
}
module.exports={createPortfolioSyncMemory};
