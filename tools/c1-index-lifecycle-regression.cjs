const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const { timingSafeEqual } = require('node:crypto');
const { createResearchModuleLoader } = require('./research-module-loader.cjs');
const market = createResearchModuleLoader(process.cwd()).load('lib/marketSession.js');
const source = file => fs.readFileSync(file, 'utf8').replace(/^import .*;\n/gm, '').replace(/export default /g, '').replace(/export /g, '');
const box = { ...market, Date }; vm.createContext(box);
vm.runInContext(source('lib/c1IndexLifecycle.js') + '\nglobalThis.run=refreshC1Index;', box);
(async () => {
  const now = new Date('2026-09-11T22:00:00Z');
  let collections = 0, connections = 0; const stages = [];
  const dependencies = { now, onStage: stage => stages.push(stage), prepare: async () => ({sourceSessionDate:'2026-09-11'}),
    collect: async () => {collections++;return {sourceSessionDate:'2026-09-11'};},
    connect: async input => {connections++;return input;} };
  const cached = await box.run(dependencies);
  assert.equal(cached.status,'already-current');assert.equal(collections,0);assert.equal(connections,0);
  const advanced = await box.run({...dependencies,prepare:async()=>({sourceSessionDate:'2026-09-10'})});
  assert.equal(advanced.status,'advanced');assert.equal(collections,1);assert.equal(connections,1);
  assert.equal(stages.join(','),'prepare,prepare,collect,connect');
  await assert.rejects(()=>box.run({...dependencies,prepare:async()=>{throw new Error('Changed seed');}}),/Changed seed/);
  assert.equal(collections,1,'Seed integrity is checked before provider calls');
  await assert.rejects(()=>box.run({...dependencies,prepare:async()=>({sourceSessionDate:'2026-09-10'}),collect:async()=>{throw new Error('Provider unavailable');}}),/Provider unavailable/);
  assert.equal(connections,1,'Failed acquisition never advances a book');

  let calls=0; const logs=[];
  const route={Buffer,timingSafeEqual,console:{info:(...args)=>logs.push(args.join(' ')),error:(...args)=>logs.push(args.join(' '))},process:{env:{CRON_SECRET:'test-secret'}},refreshC1Index:async()=>{calls++;return {status:'advanced',decisionSnapshot:{decisionId:'same'}};}};
  vm.createContext(route);vm.runInContext(source('pages/api/cron/c1-index.js')+'\nglobalThis.run=handler;',route);
  async function request(method,authorization) {
    const response={headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(v){this.body=v;return this;}};
    await route.run({method,headers:{authorization}},response);return response;
  }
  assert.equal((await request('POST','Bearer test-secret')).code,405);
  assert.equal((await request('GET','')).code,401);
  assert.equal((await request('GET','Bearer wrong')).code,401);
  assert.equal(calls,0);
  const good=await request('GET','Bearer test-secret');assert.equal(good.code,200);assert.equal(calls,1);
  assert.equal(good.body.executable,false);assert.equal(good.body.activationAuthorized,false);
  route.process.env.CRON_SECRET='';assert.equal((await request('GET','')).code,503);assert.equal(calls,1);
  route.process.env.CRON_SECRET='test-secret';route.refreshC1Index=async()=>{throw new Error('Revision requires reconciliation');};
  assert.equal((await request('GET','Bearer test-secret')).code,503);
    route.refreshC1Index=async ({onStage})=>{onStage('collect');throw new Error('Market data provider returned HTTP 429');};
  assert.equal((await request('GET','Bearer test-secret')).code,503);
  assert.ok(logs.some(line=>line.includes('"stage":"collect"') && line.includes('HTTP 429')));
  assert.ok(logs.some(line=>line.includes('"stage":"configuration"')));
  route.refreshC1Index=async ({onStage})=>{onStage('prepare');throw new Error('https://provider.invalid/?apikey=test-secret private-account');};
  await request('GET','Bearer test-secret');
  assert.ok(logs.at(-1).includes('Unclassified Error'));
  assert.ok(!logs.join(' ').includes('test-secret'));
  assert.ok(!logs.join(' ').includes('private-account'));
  assert.ok(!logs.join(' ').includes('https://'));
  route.refreshC1Index=async ({onStage})=>{
    onStage('connect'); const error=new Error('Corporate action, removal, or price revision requires reconciliation: ABBV');
    error.priceAnchorMismatch={previousSessionDate:'2026-09-10',currentSessionDate:'2026-09-11',
      mismatchCount:2,mismatches:[{symbol:'ABBV',previousClose:200,observedPriorClose:199.5,ignored:'test-secret'},
        {symbol:'AAA',previousClose:100,observedPriorClose:null}]};
    throw error;
  };
  assert.equal((await request('GET','Bearer test-secret')).code,503);
  const diagnostic=JSON.parse(logs.at(-1).slice('[c1-index] '.length));
  assert.equal(diagnostic.priceAnchors.mismatchCount,2);
  assert.equal(diagnostic.priceAnchors.sample[0].observedPriorClose,199.5);
  assert.equal(diagnostic.priceAnchors.sample[1].kind,'missing-anchor');
  assert.ok(!logs.join(' ').includes('test-secret'));
  assert.equal(route.anchorDiagnostic({priceAnchorMismatch:{previousSessionDate:'2026-09-10',currentSessionDate:'2026-09-11',
    mismatchCount:1,mismatches:[{symbol:'https://private',previousClose:100,observedPriorClose:99}]}}),undefined);
  const config=JSON.parse(fs.readFileSync('vercel.json','utf8'));
  assert.ok(config.crons.some(c=>c.path==='/api/cron/c1-index'),'Scheduled advancement must ship with the handler');
  assert.ok(!config.crons.some(c=>c.path==='/api/cron/fmp-research-backtest'),'Frozen research must not restart every minute');
  console.log('PASS: daily source lifecycle, retry no-op, failure preservation, authenticated collection, unchanged trading authority');
})().catch(error=>{console.error(error);process.exitCode=1;});
