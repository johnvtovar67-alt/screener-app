// Display-only regression using the real projection and React table. Synthetic
// dated ranking evidence is explicitly not a production ranking explanation.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const loader=createResearchModuleLoader(process.cwd());
const {projectC1Opportunities:project}=loader.load('lib/c1OpportunitiesProjection.js');
const now=new Date('2026-11-11T15:00:00Z');
const candidates=Array.from({length:350},(_,index)=>({symbol:'T'+String(index).padStart(3,'0'),researchRank:index+1,momentumPercentile:100-index/4,sourcePrice:100}));
const ratings=candidates.map((candidate,index)=>({symbol:candidate.symbol,priority:index,rating:index<3?'Buy':'Watch',entryEvidence:{momentumScore:candidate.momentumPercentile,close:100,sector:'Test'},screenReview:{why:'Synthetic current check',next:'Refresh'}}));
const decision={current:true,revision:1,sourceSessionDate:'2026-11-10',decisionId:'current',actionVersion:'current',positions:[],
 accountPolicy:{active:true,version:'c1-account-policy-v2',blockedSymbols:[]},accountActions:[],stockScreen:{sourceSessionDate:'2026-11-10',fullUniverseSelection:true,candidates}};
const evidence={verified:true,pending:false,decisionId:'current',ratings,buySymbols:ratings.slice(0,3).map(row=>row.symbol)};
const input={decision,evidence};
const before=JSON.stringify(input);
let result=project(input,{readTime:()=>now});
assert.equal(result.watch.length,10,'347 Watch candidates render at most ten');
assert.deepEqual(Array.from(result.watch.map(row=>row.symbol)),candidates.slice(3,13).map(row=>row.symbol));
assert.equal(result.ratedTiles.length,3,'Independent Buy ratings remain intact');
assert.equal(evidence.ratings.length,350,'No upstream candidate/evidence truncation');
assert.equal(JSON.stringify(input),before,'Presentation does not mutate source, orders or account');
const reversed={...input,evidence:{...evidence,ratings:[{...ratings[349],symbol:'OLD'},...ratings.slice().reverse(),ratings[3]]}};
result=project(reversed,{readTime:()=>now});
assert.deepEqual(Array.from(result.watch.map(row=>row.symbol)),candidates.slice(3,13).map(row=>row.symbol),'Prior input order, duplicates and absent old candidates receive no preference');
const restricted={...decision,activeExitSymbols:['T004'],accountPolicy:{...decision.accountPolicy,blockedSymbols:['T003']}};
result=project({...input,decision:restricted},{readTime:()=>now});
assert.deepEqual(Array.from(result.watch.map(row=>row.symbol)),candidates.slice(5,15).map(row=>row.symbol),'Filter account bans and active exits before taking ten');
assert.equal(project({...input,evidence:{...evidence,ratings:ratings.slice(0,7)}},{readTime:()=>now}).watch.length,4,'Never pad a short Watch list');
assert.equal(project({...input,evidence:{...evidence,decisionId:'old'}},{readTime:()=>now}).watch.length,0,'Stale action frame cannot supply Watch candidates');
// Execute the actual view and count table body rows, including its empty state.
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),babel=require('next/dist/compiled/babel/core');
const file=path.resolve('components/C1AccountOpportunitiesView.js');
const compiled=babel.transformSync(fs.readFileSync(file,'utf8'),{filename:file,babelrc:false,configFile:false,presets:[[require.resolve('next/babel'),{'preset-env':{modules:'commonjs'}}]]}).code;
const moduleRecord={exports:{}};
new Function('require','module','exports',compiled)(name=>name.startsWith('../lib/')?loader.load(name,file):require(name.startsWith('@babel/runtime/')?'next/dist/compiled/'+name:name),moduleRecord,moduleRecord.exports);
const html=renderToStaticMarkup(moduleRecord.exports.renderC1AccountOpportunitiesView(result));
const watchHtml=html.slice(html.indexOf('aria-label="Watch opportunities"'));
assert.equal((watchHtml.match(/<tr\b/g)||[]).length,11,'Actual Watch table has ten body rows and one header');
assert(!watchHtml.includes('T003')&&!watchHtml.includes('T004'));
console.log('PASS: real Watch projection and React view bound 347 current candidates to ten after current-rank sorting, bans, exits and deduplication; complete source and purchase inputs remain unchanged. Synthetic evidence only.');
