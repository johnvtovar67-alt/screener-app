// Calendar/status and real account analysis, all synthetic in-memory I/O.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const babel=require('next/dist/compiled/babel/core');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const {createWorkflowFixture}=require('./fixtures/c1-trading-workflow.cjs');
const loader=createResearchModuleLoader(process.cwd());
const {c1PublicationStatus:status}=loader.load('lib/c1PublicationStatus.js');
const plain=x=>JSON.parse(JSON.stringify(x));
const check=(at,source,analysis,code,expected)=>{
 const input={sourceSessionDate:source,analysisSessionDate:analysis,now:new Date(at)},before=JSON.stringify(input),s=status(input);
 assert.equal(s.code,code,JSON.stringify(s));assert.equal(s.expectedSessionDate,expected);assert.equal(s.sourceSessionDate,source);
 assert.equal(s.analysisSessionDate,analysis);assert.equal(s.executable,false);
 assert.equal(JSON.stringify(input),before,'Display classifier cannot mutate its inputs');
 assert.deepEqual(Object.keys(s).sort(),['contract','code','sourceSessionDate','analysisSessionDate','expectedSessionDate','message','executable'].sort());
 return s;
};
// Successive sessions and the November clock change. Previous-session analysis
// is current throughout opening/regular trading, then waits only until close+35.
check('2026-10-30T13:29:00Z','2026-10-29','2026-10-29','CURRENT','2026-10-29');
check('2026-10-30T13:30:00Z','2026-10-29','2026-10-29','CURRENT','2026-10-29');
check('2026-10-30T19:59:59Z','2026-10-29','2026-10-29','CURRENT','2026-10-29');
check('2026-10-30T20:00:00Z','2026-10-29','2026-10-29','CLOSING_PUBLICATION_PENDING','2026-10-30');
check('2026-10-30T20:34:59Z','2026-10-29','2026-10-29','CLOSING_PUBLICATION_PENDING','2026-10-30');
const overdue=check('2026-10-30T20:35:00Z','2026-10-29','2026-10-29','SOURCE_OVERDUE','2026-10-30');
assert.match(overdue.message,/overdue/);assert.match(overdue.message,/recovery has not been confirmed/);assert.doesNotMatch(overdue.message,/Reload after|update completes|reconciliation failed/i);
check('2026-10-31T18:00:00Z','2026-10-30','2026-10-30','CURRENT','2026-10-30');
check('2026-11-01T18:00:00Z','2026-10-30','2026-10-30','CURRENT','2026-10-30');
check('2026-11-02T14:30:00Z','2026-10-30','2026-10-30','CURRENT','2026-10-30');
check('2026-11-02T20:59:59Z','2026-10-30','2026-10-30','CURRENT','2026-10-30');
check('2026-11-02T21:00:00Z','2026-10-30','2026-10-30','CLOSING_PUBLICATION_PENDING','2026-11-02');
check('2026-11-02T21:35:00Z','2026-10-30','2026-10-30','SOURCE_OVERDUE','2026-11-02');
check('2026-11-02T21:36:00Z','2026-11-02','2026-11-02','CURRENT','2026-11-02');
check('2026-11-03T21:35:00Z','2026-11-02','2026-11-02','SOURCE_OVERDUE','2026-11-03');
check('2026-11-03T21:36:00Z','2026-11-03','2026-11-03','CURRENT','2026-11-03');
// A backlog predating the immediately prior session never looks like today's
// normal close window; private-account completion remains a distinct reason.
check('2026-11-03T21:01:00Z','2026-10-30','2026-10-30','SOURCE_OVERDUE','2026-11-03');
const activity=check('2026-11-03T21:36:00Z','2026-11-03','2026-11-02','ACCOUNT_ACTIVITY_PENDING','2026-11-03');
assert.match(activity.message,/Confirm completed-session activity/);assert.doesNotMatch(activity.message,/overdue/);
// Holiday and early close use the actual exchange calendar, not UTC weekdays.
check('2026-11-26T21:30:00Z','2026-11-25','2026-11-25','CURRENT','2026-11-25');
check('2026-11-27T17:59:59Z','2026-11-25','2026-11-25','CURRENT','2026-11-25');
check('2026-11-27T18:00:00Z','2026-11-25','2026-11-25','CLOSING_PUBLICATION_PENDING','2026-11-27');
check('2026-11-27T18:35:00Z','2026-11-25','2026-11-25','SOURCE_OVERDUE','2026-11-27');
check('2026-12-24T18:00:00Z','2026-12-23','2026-12-23','CLOSING_PUBLICATION_PENDING','2026-12-24');
check('2026-12-25T21:00:00Z','2026-12-24','2026-12-24','CURRENT','2026-12-24');
for(const source of [undefined,'2026-02-31','2026-11-01','2026-11-04']){
 const s=status({sourceSessionDate:source,analysisSessionDate:'2026-11-02',now:new Date('2026-11-03T21:40:00Z')});
 assert.equal(s.code,'SOURCE_UNAVAILABLE');assert.equal(s.executable,false);assert.match(s.message,/unknown/);
}
assert.equal(status({sourceSessionDate:'2026-11-02',analysisSessionDate:'2026-11-03',now:new Date('2026-11-03T21:40:00Z')}).code,'SOURCE_UNAVAILABLE');
assert.equal(status({sourceSessionDate:'2026-11-02',analysisSessionDate:'2026-11-02',now:new Date('invalid')}).code,'SOURCE_UNAVAILABLE');
// Actual account service: grace -> overdue -> published next-session analysis.
// Display changes cannot change shares, stops, orders, cash, IDs or source hashes.
const f=createWorkflowFixture('buy');f.setCash(20000);
const service=loader.load('lib/c1AccountService.js');
const snapshot=JSON.stringify({book:f.book,account:f.account,portfolio:f.portfolio});
const grace=service.evaluateC1Account({account:f.account,book:f.book,now:new Date('2026-10-15T20:10:00Z')});
const late=service.evaluateC1Account({account:f.account,book:f.book,now:new Date('2026-10-15T20:35:00Z')});
assert.equal(grace.publicationStatus.code,'CLOSING_PUBLICATION_PENDING');assert.equal(late.publicationStatus.code,'SOURCE_OVERDUE');
assert.equal(grace.current,false);assert.equal(late.current,false);
const economic=view=>{const {updateReason,publicationStatus,...value}=plain(view);value.positions=value.positions.map(({reason,...position})=>position);return value;};
assert.deepEqual(economic(grace),economic(late),'Closing grace expiration changes explanation only');
const next=f.sessions.find(session=>session.date==='2026-10-15');assert(next);
const recoveredBook={...f.book,model:{...f.book.model,sessions:[...f.book.model.sessions,next]},captures:[...f.book.captures,{sessionDate:next.date,hash:'synthetic-workflow:'+next.date,observedAt:next.decisionAt}]};
const recovered=service.deriveC1AccountAnalysis({account:f.account,book:recoveredBook,now:new Date('2026-10-15T21:01:00Z')});
assert.equal(recovered.decision.current,true);assert.equal(recovered.decision.publicationStatus.code,'CURRENT');assert.equal(recovered.decision.sourceSessionDate,'2026-10-15');assert.equal(recovered.decision.updateReason,null);
assert.equal(recovered.account.revision,f.account.revision);assert.equal(recovered.account.records.at(-1).fills.length,0);
assert.equal(recovered.decision.actualCash,late.actualCash);
assert.deepEqual(plain(recovered.decision.positions.map(position=>[position.symbol,position.shares,position.avgCost])),plain(late.positions.map(position=>[position.symbol,position.shares,position.avgCost])));
assert.equal(JSON.stringify({book:f.book,account:f.account,portfolio:f.portfolio}),snapshot);assert.equal(f.writes,0);
// Compile the exact banner from Home, so source/expected dates and status are
// verified in both trading tabs independently of a proposed mock component.
const page=fs.readFileSync('pages/index.js','utf8'),marker='    {["opportunities","portfolio"].includes(tab)&&<div className="refreshEvidence"',start=page.indexOf(marker),end=page.indexOf('\n',start);
assert(start>=0&&end>start);const expression=page.slice(start,end).trim().slice(1,-1),record={exports:{}};
// A loaded new client may receive an earlier API response. Its account date
// does not prove which session the accepted market book contains. Keep that
// source unknown instead of manufacturing a server-update failure.
const binding=page.match(/^  const publicationStatus=c1PublicationStatus\([^\n]+/m)?.[0];assert(binding);
const classifyHome=new Function('accountView','c1PublicationStatus','Date',binding+'\nreturn publicationStatus;');
const FixedDate=class extends Date{constructor(...args){super(...(args.length?args:['2026-11-03T21:36:00Z']));}};
const earlierResponse={decision:{sourceSessionDate:'2026-11-02',current:false,updateReason:'Confirm completed-session activity in Account settings.'}},earlierBefore=JSON.stringify(earlierResponse);
const unknown=classifyHome(earlierResponse,status,FixedDate);
assert.equal(unknown.code,'SOURCE_UNAVAILABLE');assert.equal(unknown.sourceSessionDate,null);assert.equal(unknown.analysisSessionDate,'2026-11-02');assert.equal(unknown.expectedSessionDate,'2026-11-03');assert.match(unknown.message,/unknown/);assert.doesNotMatch(unknown.message,/overdue|server update is unavailable/);assert.equal(JSON.stringify(earlierResponse),earlierBefore);
const code=babel.transformSync('import React from "react";function Banner({tab,accountView,applicationRefreshAt,quoteRefreshStatus,publicationStatus}){return ('+expression+');}module.exports=Banner;',{
 filename:'publication-banner-regression.jsx',babelrc:false,configFile:false,presets:[[require.resolve('next/babel'),{'preset-env':{modules:'commonjs'}}]]}).code;
new Function('require','module','exports',code)(name=>require(name.startsWith('@babel/runtime/')?'next/dist/compiled/'+name:name),record,record.exports);
for(const tab of ['opportunities','portfolio'])for(const width of [390,1280])for(const publicationStatus of [grace.publicationStatus,late.publicationStatus,activity,unknown]){
 const html=renderToStaticMarkup(React.createElement('div',{style:{width}},React.createElement(record.exports,{tab,accountView:{decision:{sourceSessionDate:publicationStatus.analysisSessionDate}},applicationRefreshAt:new Date('2026-11-03T21:36:00Z'),quoteRefreshStatus:'Quote refresh completed; holdings unchanged.',publicationStatus})));
 assert.match(html,/Analysis source session:/);assert.match(html,/Expected completed session:/);assert.match(html,new RegExp('data-publication-state="'+publicationStatus.code+'"'));assert(html.includes(publicationStatus.message));assert.doesNotMatch(html,/Latest completed signal session/);
}
console.log('PASS: successive-session publication/grace/overdue/recovery calendar states, immutable real account economics, and actual Home banner desktop/mobile markup.');
