// Bind the actual top-level Home helpers into old extracted-handler harnesses.
// This supplies production code and its real pure dependencies, never a stub.
const assert=require('node:assert/strict'),babel=require('next/dist/compiled/babel/core');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
function bindC1ApprovedRepairClientHelpers(box,page){
 const ast=babel.parseSync(page,{sourceType:'module',babelrc:false,configFile:false,parserOpts:{plugins:['jsx']}});
 const names=['c1ApprovedRepairReceipt','c1ApprovedPortfolioBasis'];
 const code=names.map(name=>{
  const node=ast.program.body.find(row=>row.type==='FunctionDeclaration'&&row.id.name===name);
  assert(node,'The actual Home helper is available: '+name);return page.slice(node.start,node.end);
 }).join('\n');
 const cash=ast.program.body.filter(row=>row.type==='VariableDeclaration').flatMap(row=>row.declarations).find(row=>row.id.name==='CASH');
 assert(cash?.init?.type==='ArrayExpression','The actual Home cash symbols are available');
 const {mergeC1AccountPortfolio}=createResearchModuleLoader(process.cwd()).load('lib/c1AccountPortfolio.js');
 const helpers=new Function('mergeC1AccountPortfolio','CASH',code+';return {'+names.join(',')+'};')(
  mergeC1AccountPortfolio,new Function('return '+page.slice(cash.init.start,cash.init.end))());
 Object.assign(box,helpers);return box;
}
module.exports={bindC1ApprovedRepairClientHelpers};
