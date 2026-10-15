// Pinned UI regions from f0d46ffceb98ba3fd5fca121beba6d8f23ccbdde.
// No historical prices, account records, engine fixtures, or old Git objects
// are required in CI. Hashes were calculated directly from that commit.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const crypto=require('node:crypto');
const page=fs.readFileSync('pages/index.js','utf8');
const opportunities=fs.readFileSync('components/C1AccountOpportunities.js','utf8');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const exact=(name,value,expected)=>assert.equal(sha(value),expected,`${name} must match the pinned historical UI region`);
const between=(text,start,end)=>{
 const a=text.indexOf(start),b=text.indexOf(end,a);assert.ok(a>=0&&b>a,'Historical region anchors must exist: '+start);return text.slice(a,b);
};

// Original Git blobs: pages/index.js b2a7d3638c2344ad262e095ed7825194239ab36d;
// C1AccountOpportunities.js 0bed093604f2233d349179b267103b5a270b7bf9;
// styles/card-layout.css b652f6ff7a40fbe70ebbbd6cd465f68c58563b08.
// Only these owner-requested content omissions differ from the historical Card.
let card=between(page,'function Card(','function RecentSignalChanges(');
card=card.replace('Outside today’s C1 opportunities.','Standalone result — outside today’s Opportunities universe and relative capital ranking.');
assert.equal(card.split('{e?.label&&<span className="eventTag">').length-1,1,'Only a labeled event renders the original event badge');
card=card.replace('{e?.label&&<span className="eventTag">','{e&&<span className="eventTag">');
card=card.replace('<span className="themeTag">{theme(s)}</span>{e&&','<span className="themeTag">{theme(s)}</span><span className="entryTag">Entry: {entry(s)}</span>{e&&');
card=card.replace('{c1PlainDecisionReason({action:a,reason:d.reason})}','{d.reason}');
card=card.replace('    <p className="why">{d.reason}</p>\n','    <p className="why">{d.reason}</p>\n    <div className="decision"><div><small>Timing</small><b>{d.timing}</b></div><div><small>Size</small><b>{d.size}</b></div><div><small>Priority</small><b>{d.priority}</b></div></div>\n    <div className="plan"><small>Plan</small><b>{riskText(s)}</b></div>\n');
exact('Historical Card with enumerated content omissions',card,'afdbde4a0867f65976f204fd963efedde18bd4fc102aa817f32cf42cb28185ea');
exact('Authorized plain-language function RecentSignalChanges',between(page,"function RecentSignalChanges(","function VerificationPaused("),'ff73b4400651882f67f7dc4bd967dde3991964bff5227e8fb381d5047ff7f982');
exact('Authorized plain-language function VerificationPaused',between(page,"function VerificationPaused(","function OnDeck("),'86d88ef81a89a4c92d0c00405d23620edac0a51bdddb449ce7afab31e803b0a0');
exact('Authorized plain-language function OnDeck',between(page,"function OnDeck(","function fullMarketCoverageFallback("),'cca1cbf365bf3e980a201991021e16f8a8aac1ca536bbb5c3ef542353c80a860');
const portfolio=between(page,'    if(mobile)return <article className="portfolioItem">','\n  }\n\n  const missingOpenDateSymbols=');
const currentColor='className={`pill ${actionClass}`}';
assert.equal(portfolio.split(currentColor).length-1,2,'Only the two original action pills use the current decision color adapter');
let historicalPortfolio=portfolio.replaceAll(currentColor,'className={`pill ${cls(d.action)}`}');
historicalPortfolio=historicalPortfolio.replaceAll('<div className="positionBadges">{specialSituation(s)','<div className="positionBadges">{badge}{specialSituation(s)');
historicalPortfolio=historicalPortfolio.replace('<div className="mobileField"><small>Why</small>','{showMomentumEvidence&&<div className="mobileField momentumEvidenceText"><small>Evidence</small>{evidenceText}</div>}<div className="mobileField"><small>Why</small>');
historicalPortfolio=historicalPortfolio.replace('</b></td><td>{d.reason}</td>','</b></td><td className={showMomentumEvidence?"momentumEvidenceText":undefined}>{evidenceText}</td><td>{d.reason}</td>');
exact('Desktop/mobile Portfolio with only technical-content omissions',historicalPortfolio,'ad611a6d2deeb4758fcc6eaab43e6c243d95283f1d06f019795358135a07fa66');
const headers=page.match(/<thead><tr><th>Position<\/th>[\s\S]*?<\/thead>/)?.[0];
assert.ok(headers,'The historical holdings table must exist');
exact('Historical Portfolio headers with only Evidence omitted',headers.replace('<th>Why</th>','<th>Evidence</th><th>Why</th>'),'4b145a6924d8258079e036c5b4755351436dcf2adb87f8f0fac0d0c196ea48cf');
const globalCss=page.match(/<style jsx global>\{`([\s\S]*?)`}\s*<\/style>/)?.[1];
assert.ok(globalCss,'The historical application stylesheet must exist');
exact('Historical application CSS',globalCss,'fe3b39074dfa1061bda6ba18e80d207df25249d38440635c0114c4fd875dddd2');
exact('Historical external card CSS',fs.readFileSync('styles/card-layout.css'),'7deed53e823d07eee10cb4dd5cdfa7929e6576b1b0311d05f0faf93c48be4477');
const opportunityCss=opportunities.match(/<style jsx>\{`([\s\S]*?)`}\s*<\/style>/)?.[1];
assert.ok(opportunityCss,'The historical account Opportunities stylesheet must exist');
exact('Historical account Opportunities CSS',opportunityCss,'1040a44e51ecf2f74a26094a5a4f398cd6940b04cd562a15f161e61e8357ba46');
exact('Original account evidence, authorization and Watch composition',between(opportunities,' const [,expire]=useState(0);',' const holdingPresentation='),'1213174d9a7e2d939ff29111976bc90485be041eac58e694f9fa54d945c62215');
exact('Current Home data and account handlers retained from 0a5ceab',between(page,'export default function Home(','  function momentumEvidenceFor(s){'),'15025cba43bbc0e8aeecc5f14260ca8986fad2feb70bdd129e8ebadf54484c94');
assert.ok(opportunities.includes("presentation.tiles.map(tile=>{const held=holdingPresentation(tile.symbol),canPurchase=ready&&tile.order&&(!held||held.canAdd);return <article className=\"idea green\" key={tile.symbol}>"),'Every ranked Opportunities card retains the literal historical green frame while current purchase eligibility remains separately checked');
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
 ['<th>Decision</th><th>Why</th>','<th>Decision</th><th>Evidence</th><th>Why</th>'],
 ['Add the opening date for {missingOpenDateSymbols.join(", ")} to complete its position review.','Add the opening date for {missingOpenDateSymbols.join(", ")} so its holding-period review can run. Its price, fundamentals, momentum, sizing, and portfolio-risk analysis are still active.'],
 ['Use Opportunities for C1 trading actions.','Additional stock analysis by theme. C1 ratings and account actions appear in Opportunities and My Portfolio.'],
 ['Use Opportunities for C1 trading actions.','Additional analysis for a stock. Use Opportunities and My Portfolio for C1 ratings and account actions.']
];
for(const [current,historical] of copyExceptions){assert.ok(main.includes(current),'The exact approved content exception must remain: '+current);main=main.replace(current,historical);}
const operationalStyle='    <style jsx global>{`.refreshEvidence{font-size:12px;color:#475569;margin:8px 0}.refreshEvidence p{margin:3px 0}.pill.red{white-space:nowrap}.buyGrid .top{flex-wrap:wrap}@media(max-width:700px){nav{flex-wrap:wrap}.portfolioHead{flex-wrap:wrap}.portfolioHead>.pill{max-width:100%;white-space:nowrap}}`}</style>\n';
assert.equal(main.split(operationalStyle).length-1,1,'The single enumerated current-data/mobile-action compatibility stylesheet must remain exact');
main=main.replace(operationalStyle,'');
exact('Historical Home return with enumerated current-data compatibility',main,'69cbd4677de138d58d8ed224547f1791043bde02d435a1ee22955b4066902220');
console.log('PASS: pinned historical layout/styles/fonts and unchanged data/account handlers; only enumerated short-copy omissions and current-decision/data compatibility are allowed.');
