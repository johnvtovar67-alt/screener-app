// Pinned UI regions from f0d46ffceb98ba3fd5fca121beba6d8f23ccbdde.
// No historical prices, account records, engine fixtures, or old Git objects
// are required in CI. Hashes were calculated directly from that commit.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const crypto=require('node:crypto');
let page=require('./c1-reliability-source-seams.cjs').restore('pages/index.js',fs.readFileSync('pages/index.js','utf8')).replace(/ style=\{c1HoldPillStyle\((a|displayAction)\)\} /g,'').replace(/\{c1HoldPillLabel\((a|displayAction)\)\}/g,'{$1}').replace("import {c1HoldPillLabel,c1HoldPillStyle} from '../lib/c1HoldPill';\n",'');
page=require('./c1-refresh-generation-ui-seams.cjs').restore(page);
const purchaseDiagnosticProp=' purchaseDiagnostics={accountView.purchaseDiagnostics}';
assert.equal(page.split(purchaseDiagnosticProp).length,2,'Only the authorized diagnostic presentation prop may be reversed');
page=page.replace(purchaseDiagnosticProp,'');
for(const [before,after] of require('./c1-opening-refresh-ui-seams.cjs')){assert.equal(page.split(after).length,2);page=page.replace(after,before);}
for(const [a,b] of require('./c1-combined-evidence-ui-seams.cjs')){assert.equal(page.split(b).length,2);page=page.replace(b,a);}for(const [a,b] of require('./c1-holding-timing-ui-seams.cjs')){assert.equal(page.split(b).length,2);page=page.replace(b,a);}
for(const [before,after] of require('./c1-non-cash-ui-seams.cjs')){assert.equal(page.split(after).length,2,'Only the declared adoption UI seam');page=page.replace(after,before);}
const opportunities=[fs.readFileSync('components/C1AccountOpportunities.js','utf8'),fs.readFileSync('components/C1AccountOpportunitiesView.js','utf8'),fs.readFileSync('lib/c1OpportunitiesProjection.js','utf8'),fs.readFileSync('lib/c1OpportunitiesContract.js','utf8')].join('\n');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const exact=(name,value,expected)=>assert.equal(sha(value),expected,`${name} must match the pinned historical UI region`);
const between=(text,start,end)=>{
 const a=text.indexOf(start),b=text.indexOf(end,a);assert.ok(a>=0&&b>a,'Historical region anchors must exist: '+start);return text.slice(a,b);
};

// Original Git blobs: pages/index.js b2a7d3638c2344ad262e095ed7825194239ab36d;
// C1AccountOpportunities.js 0bed093604f2233d349179b267103b5a270b7bf9;
// styles/card-layout.css b652f6ff7a40fbe70ebbbd6cd465f68c58563b08.
// The literal historical Card differs only at the read-only copy bindings
// and the event-label guard that prevents an empty badge.
let card=between(page,'function Card(','function RecentSignalChanges(');
assert.equal(card.split('{e?.label&&<span className="eventTag">').length-1,1,'Only a labeled event renders the original event badge');
card=card.replace('{e?.label&&<span className="eventTag">','{e&&<span className="eventTag">');
card=card.replace('{c1PlainDecisionReason({action:a,reason:d.reason,stock:s,decision:d})}','{d.reason}');
card=card.replace('{c1DecisionTrigger({action:a,reason:d.reason,stock:s,decision:d})}','{riskText(s)}');
exact('Literal historical Card with read-only copy bindings',card,'afdbde4a0867f65976f204fd963efedde18bd4fc102aa817f32cf42cb28185ea');
exact('Authorized plain-language function RecentSignalChanges',between(page,"function RecentSignalChanges(","function VerificationPaused("),'4b4fedcc65587b7e6cb9c9d38c3824752c16922bb49d5cdafd2dc5e7988eda26');
exact('Authorized plain-language function VerificationPaused',between(page,"function VerificationPaused(","function OnDeck("),'bd3267c55f6219325aa0b2c8594903d7af85d963677d80ad2610fcbcf1802810');
exact('Authorized plain-language function OnDeck',between(page,"function OnDeck(","function fullMarketCoverageFallback("),'7d94f8ee3508adf96c51741fe8828642c50d4a77c7cec50ba10b5ddcd3e716e8');
const portfolio=between(page,'    if(mobile)return <article className="portfolioItem">','\n  }\n\n  const missingOpenDateSymbols=');
const currentColor='className={`pill ${actionClass}`}';
assert.equal(portfolio.split(currentColor).length-1,2,'Only the two original action pills use the current decision color adapter');
exact('Literal desktop/mobile Portfolio JSX',portfolio.replaceAll(currentColor,'className={`pill ${cls(d.action)}`}'),'ad611a6d2deeb4758fcc6eaab43e6c243d95283f1d06f019795358135a07fa66');
const headers=page.match(/<thead><tr><th>Position<\/th>[\s\S]*?<\/thead>/)?.[0];
assert.ok(headers,'The historical holdings table must exist');
exact('Literal seven historical Portfolio headers',headers,'4b145a6924d8258079e036c5b4755351436dcf2adb87f8f0fac0d0c196ea48cf');
const globalCss=page.match(/<style jsx global>\{`([\s\S]*?)`}\s*<\/style>/)?.[1];
assert.ok(globalCss,'The historical application stylesheet must exist');
exact('Historical application CSS',globalCss,'fe3b39074dfa1061bda6ba18e80d207df25249d38440635c0114c4fd875dddd2');
exact('Historical external card CSS',fs.readFileSync('styles/card-layout.css'),'7deed53e823d07eee10cb4dd5cdfa7929e6576b1b0311d05f0faf93c48be4477');
const opportunityCss=opportunities.match(/<style jsx>\{`([\s\S]*?)`}\s*<\/style>/)?.[1];
assert.ok(opportunityCss,'The historical account Opportunities stylesheet must exist');
exact('Historical account Opportunities CSS',opportunityCss,'1040a44e51ecf2f74a26094a5a4f398cd6940b04cd562a15f161e61e8357ba46');
// The owner-authorized eligibility repair changes Watch composition, not the pinned styles or portfolio layout.
assert.ok(opportunities.includes('const ratedTiles=evidence.verified?presentation.tiles:[]'),'Only verified ratings become green tiles');
assert.ok(opportunities.includes('const watch=[...blockedTiles,...presentation.watch]'),'Watch candidates retain their original table');
exact('Current Home data and account handlers retained from 0a5ceab',between(page,'export default function Home(','  function momentumEvidenceFor(s){'),'15025cba43bbc0e8aeecc5f14260ca8986fad2feb70bdd129e8ebadf54484c94');
assert.ok(opportunities.includes("ratedTiles.map(tile=>{const held=holdingPresentation(tile.symbol),canPurchase=ready&&tile.order&&(!held||held.canAdd);return <article className=\"idea green\" key={tile.symbol}>"),'Every ranked Opportunities card retains the literal historical green frame while current purchase eligibility remains separately checked');
assert.ok(opportunities.includes('<th>Priority</th><th>Stock / Sector</th><th>Momentum score</th><th>Signal closing price</th><th>Entry check</th>'),'The original independent five-column Watch table must exist');
assert.doesNotMatch(page+opportunities,/C1PositionDetails|c1DisplayFormat|opportunityCard|compactReason/,'The superseded rebuilt display components cannot re-enter the historical layout');

// Explicit operational compatibility differences in the otherwise literal
// historical Home return: retain refresh evidence, held quotes and fresh quotes
// on the original Analyze button. No other layout normalization is allowed.
let main=page.slice(page.indexOf('  return <main>'));
assert.ok(main.startsWith('  return <main>'),'The historical Home return must exist');
main=main.replace(/^    \{\["opportunities","portfolio"\]\.includes\(tab\)&&<div className="refreshEvidence" aria-label="Market data freshness">[^\n]+\n/m,'');
main=main.replace('Screen data as of {lastUpdated.toLocaleTimeString','Last refreshed {lastUpdated.toLocaleTimeString');
main=main.replace(' positionRows={results}','');
main=main.replace('analyze(await refreshEnteredPortfolio()||portfolio,{forceQuotes:true})','analyze(await refreshEnteredPortfolio()||portfolio)');
// Restore only the explicitly approved short-copy substitutions for comparison.
const copyExceptions=[
 ['Your holdings and current trading actions.','Core and Swing holdings are tracked separately. C1 determines Swing entries, position sizes and exits.'],
 ['Add the opening date for {missingOpenDateSymbols.join(", ")} to complete its position review.','Add the opening date for {missingOpenDateSymbols.join(", ")} so its holding-period review can run. Its price, fundamentals, momentum, sizing, and portfolio-risk analysis are still active.'],
 ['Use Opportunities for C1 trading actions.','Additional stock analysis by theme. C1 ratings and account actions appear in Opportunities and My Portfolio.'],
 ['Use Opportunities for C1 trading actions.','Additional analysis for a stock. Use Opportunities and My Portfolio for C1 ratings and account actions.']
];
for(const [current,historical] of copyExceptions){assert.ok(main.includes(current),'The exact approved content exception must remain: '+current);main=main.replace(current,historical);}
const operationalStyle='    <style jsx global>{`.refreshEvidence{font-size:12px;color:#475569;margin:8px 0}.refreshEvidence p{margin:3px 0}.pill.red{white-space:nowrap}.buyGrid .top{flex-wrap:wrap}@media(max-width:700px){nav{flex-wrap:wrap}.portfolioHead{flex-wrap:wrap}.portfolioHead>.pill{max-width:100%;white-space:nowrap}}`}</style>\n';
assert.equal(main.split(operationalStyle).length-1,1,'The single enumerated current-data/mobile-action compatibility stylesheet must remain exact');
main=main.replace(operationalStyle,'');
exact('Historical Home return with enumerated current-data compatibility',main,'69cbd4677de138d58d8ed224547f1791043bde02d435a1ee22955b4066902220');
console.log('PASS: pinned historical layout/styles/fonts and unchanged data/account handlers; literal original display slots with read-only copy bindings and current-decision/data compatibility.');
