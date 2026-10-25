const assert=require('node:assert/strict'),fs=require('node:fs');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
// Reverse only the separately verified render extraction before applying the
// original presentation-source assertions and their unchanged historical pins.
function readSource(file){
 const current=fs.readFileSync(file,'utf8');
 if(file!=='components/C1AccountOpportunities.js')return current;
 const source=require('./c1-opportunities-projection-extraction.cjs').restoreOpportunitiesProjection(current);
 const view=fs.readFileSync('components/C1AccountOpportunitiesView.js','utf8');
 const start=source.indexOf(' return renderC1AccountOpportunitiesView('),body=view.indexOf(' return <><section');
 assert(start>=0&&body>=0);
 return "import {c1HoldPillLabel,c1HoldPillStyle} from '../lib/c1HoldPill';\n"+source.slice(0,start).replace("import {renderC1AccountOpportunitiesView} from './C1AccountOpportunitiesView';\n",'')+view.slice(body);
}
const {c1HoldPillLabel:label,c1HoldPillStyle:style}=createResearchModuleLoader(process.cwd()).load('lib/c1HoldPill.js');
for(const value of ['Hold','HOLD','hold',' HOLD ']){
 assert.equal(label(value),'HOLD');assert.equal(style(value),style('HOLD'));
 assert.equal(style(value),undefined,'Use native WATCH/SELL pill geometry, without color changes');
}
for(const value of ['Buy','Strong Buy','Add','Sell','SELL — STOP TRIGGERED','Verification needed','WATCH',null,undefined]){assert.equal(label(value),value);assert.equal(style(value),undefined);}
for(const [file,count] of [['pages/index.js',3],['components/C1AccountOpportunities.js',2]]){
 const source=readSource(file);assert.equal((source.match(/style=\{c1HoldPillStyle\(/g)||[]).length,count);assert.equal((source.match(/\{c1HoldPillLabel\(/g)||[]).length,count);
}
// Reverse the five declared presentation bindings and recover the exact
// deployed files. No handler, decision, color or layout body may drift.
for(const [file,labels,hash] of [
 ['pages/index.js',['a','displayAction'],'3697e36a01ecd7c5105125dd6365456302e7021d82b84c343964e5532b890849'],
 ['components/C1AccountOpportunities.js',["held?.label||(canPurchase?tile.rating:'NO PURCHASE')","row.holding?.label||'WATCH'"],'37d8898ef55fa9db4e5de509ab91449a571a264295dfec5f9f2465b3e94391d5']
]){
 let source=readSource(file).replace("<h2>{portfolioOnly?'Portfolio Action':'Opportunities'}</h2>","<h2>{portfolioOnly?'Portfolio actions':'Opportunities'}</h2>").replace("import {c1HoldPillLabel,c1HoldPillStyle} from '../lib/c1HoldPill';\n",'');
 if(file==='pages/index.js')source=require('./c1-refresh-generation-ui-seams.cjs').restore(source);
 if(file==='pages/index.js'){
  const diagnosticProp=' purchaseDiagnostics={accountView.purchaseDiagnostics}';
  assert.equal(source.split(diagnosticProp).length,2,'Only the reviewed request-diagnostic presentation prop may be reversed');
  source=source.replace(diagnosticProp,'');
 }
 if(file==='pages/index.js')for(const [before,after] of require('./c1-opening-refresh-ui-seams.cjs')){assert.equal(source.split(after).length,2);source=source.replace(after,before);}
 if(file==='components/C1AccountOpportunities.js'){
  // Reverse only the independently authorized rating-presentation seam before
  // asserting the original frozen deployed source hash.
  source=source.replace(' const ratedTiles=evidence.verified?presentation.tiles:[];\n','');
  source=source.replace('const actionableTiles=ratedTiles.filter','const actionableTiles=presentation.tiles.filter');
  source=source.replace('!ratedTiles.includes(tile)','!actionableTiles.includes(tile)');
  source=source.replace('let nextWatchPriority=ratedTiles.length;','let nextWatchPriority=actionableTiles.length;');
  source=source.replace('ratedTiles.length>0','actionableTiles.length>0');
  source=source.replace('ratedTiles.map(tile=>','actionableTiles.map(tile=>');
  source=source.replace('  {!portfolioOnly&&ratedTiles.length>0&&!ready?<p role="status">{waitingReason}</p>:null}\n','');
  source=source.replace('Account purchase status — separate from C1 rating','Your next action');
  source=source.replace("held?.label||tile.rating","held?.label||(canPurchase?tile.rating:'NO PURCHASE')");
  const current="{!ready&&<span> {waitingReason}</span>}",prior="{!ready&&<span> {openingError?'Opening checks unavailable: '+openingError:c1PlainDecisionReason({action:'NO PURCHASE',reason:waitingReason})}</span>}";
  assert.equal(source.split(current).length,2);source=source.replace(current,prior);
 }
 for(const value of labels)source=source.replaceAll(' style={c1HoldPillStyle('+value+')} >{c1HoldPillLabel('+value+')}','>{'+value+'}');
 // Reverse only the verified-refresh review binding; preserve the original
 // deployed-source hash and every unrelated presentation assertion.
 if(file==='components/C1AccountOpportunities.js'){
  const binding=',reviewCurrent:Boolean(openingPlan)&&c1ManualReviewCurrent(manualRecommendations,executionDecision)';
  assert.equal(source.split(binding).length,2);source=source.replace(binding,'');
  const prior=`  {!portfolioOnly&&evidence.pending&&<p role="status">{c1PlainDecisionReason({action:'NO PURCHASE',reason:evidence.reason})}</p>}`;
  const details=`  {!portfolioOnly&&evidence.pending&&<div role="status" aria-label="Entry verification details"><p>{c1PlainDecisionReason({action:'NO PURCHASE',reason:evidence.reason})}</p><ul>{evidence.issues.map(issue=><li key={issue}>{issue}</li>)}</ul>{!ready&&<p>Account/opening review: {openingError||manualRecommendations?.reason||'No checked opening review has returned. Tap Reload to request it.'}</p>}</div>}`;
  assert.equal(source.split(details).length,2);source=source.replace(details,prior);
 }
 if(file==='pages/index.js'){assert.equal(source.split("    const heldSector=position?.entryContext?.sector;\n    const displaySector=sectorEvidence||heldSector;\n    const sector=typeof displaySector==='string'&&displaySector.trim()&&!/^(other|unknown|unclassified)$/i.test(displaySector.trim())?displaySector.trim():'Sector unavailable';").length,2);source=source.replace("    const heldSector=position?.entryContext?.sector;\n    const displaySector=sectorEvidence||heldSector;\n    const sector=typeof displaySector==='string'&&displaySector.trim()&&!/^(other|unknown|unclassified)$/i.test(displaySector.trim())?displaySector.trim():'Sector unavailable';","    const sector=typeof sectorEvidence==='string'&&sectorEvidence.trim()&&!/^(other|unknown|unclassified)$/i.test(sectorEvidence.trim())?sectorEvidence.trim():'Sector unavailable';");}
 if(file==='pages/index.js')for(const [a,b] of require('./c1-combined-evidence-ui-seams.cjs')){assert.equal(source.split(b).length,2);source=source.replace(b,a);}
 if(file==='pages/index.js')for(const [a,b] of require('./c1-holding-timing-ui-seams.cjs')){assert.equal(source.split(b).length,2);source=source.replace(b,a);}
 if(file==='pages/index.js')for(const [before,after] of require('./c1-non-cash-ui-seams.cjs')){assert.equal(source.split(after).length,2);source=source.replace(after,before);}
 if(file==='pages/index.js')assert.equal(require('node:crypto').createHash('sha256').update(source).digest('hex'),hash,'Exact deployed source after reversing HOLD bindings: '+file);
 else {assert.ok(source.includes("const actionableTiles=presentation.tiles.filter"),'Original account action filtering remains reversible');assert.equal((readSource(file).match(/style=\{c1HoldPillStyle\(/g)||[]).length,2,'Only the two declared account HOLD pill bindings exist');}
}
console.log('PASS: all five HOLD pill paths share geometry and capitalization; colors and non-HOLD labels unchanged.');

assert([fs.readFileSync('components/C1AccountOpportunities.js','utf8'),fs.readFileSync('components/C1AccountOpportunitiesView.js','utf8')].join('\n').includes("<h2>{portfolioOnly?'Portfolio Action':'Opportunities'}</h2>"),'Exact requested visible Portfolio Action heading');
