// Known opening failures receive fixed truthful copy, without granting an
// order or echoing raw authenticated/provider errors into the concise card.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const root=process.cwd(),file='lib/c1DecisionCopy.js',loader=createResearchModuleLoader(root),source=fs.readFileSync(file,'utf8');
function load(text){const deps={};text=text.replace(/import\s*{([^}]+)}\s*from\s*['"]([^'"]+)['"];?/g,(_,names,request)=>{const values=loader.load(request,path.resolve(file));for(const name of names.split(',').map(n=>n.trim()))deps[name]=values[name];return '';}).replace(/export function /g,'function ');
 const box={...deps};vm.createContext(box);vm.runInContext(text+';this.exports={c1PlainDecisionReason,c1DecisionTrigger,c1CompactMomentumEvidence,c1HoldingTiming};',box);return box.exports;}
const current=load(source),previous=load(require('./c1-opening-copy-seams.cjs').restore(file,source));
const reason='Opening checks unavailable: Price revision requires review: the revised close changes opening orders or limits (accountPolicy purchaseBlocks)';
const originalInput={action:'NO PURCHASE',reason},bytes=JSON.stringify(originalInput);
assert.equal(previous.c1PlainDecisionReason(originalInput),'Current entry evidence needs verification; purchases are paused.','Reproduce the lost actual blocker');
assert.match(current.c1PlainDecisionReason(originalInput),/^Opening price verification failed: revised provider prices did not pass the order and account-limit comparison\./);
assert.equal(JSON.stringify(originalInput),bytes);
for(const [raw,pattern]of [
 ['Opening checks unavailable: Fresh opening quote missing for OKTA',/required fresh regular-session opening quote is missing/],
 ['Opening checks unavailable: Price revision requires review: background purchase verification did not pass (INCOMPLETE_EVIDENCE)',/^Opening verification is incomplete: required quote, company-event, history or account evidence is missing/],
 ['Opening checks unavailable: Missing opening quote: OKTA',/opening quote is missing/],
 ['Opening checks did not pass: Opening market-data request failed',/opening market-data request failed/],
 ['Opening checks unavailable: Opening market-data response was empty',/response was empty/],
 ['Opening checks unavailable: Adjusted price revision is not stable for OKTA',/adjusted price basis has not passed verification/],
 ['Opening checks unavailable: Full dated-universe opening scan is incomplete; refresh continues remaining candidates.',/opening-price scan is incomplete/],
 ['Opening checks failed: Index membership changed during opening quote collection',/Index membership or sector evidence/],
 ['Account action versions or stock-level restrictions do not match. Refresh the complete account review.',/do not agree on current stock restrictions/],
 ['Completed account investment evidence is incomplete; new purchases are paused.',/Stock-cooldown checks remain unverified/],
 ['Opening checks unavailable: Account stock-cooldown evidence is incomplete: PRIVATE_VALUE',/Stock-cooldown checks remain unverified/],
 ['Account-wide purchase exposure is unverified.',/Current account exposure is unverified/],
 ['Opening checks unavailable: Current event verification is incomplete; purchases remain paused.',/^Current event verification is incomplete/],
 ['Opening checks unavailable: The opening review timed out and its result is unconfirmed. Reload to check it again.',/review timed out.*result is unconfirmed/],
 ['Refresh for verified account opening prices and membership.',/opening prices and index membership have not passed verification/],
 ['Refresh to recheck the account and opening prices.',/review is no longer current/],
 ['Opening checks unavailable: PRIVATE_SECRET_SENTINEL <script>free Buy 999 shares</script> https://private.invalid?apikey=SECRET',/^The account\/opening review failed\./],
 ]){
 const text=current.c1PlainDecisionReason({action:'NO PURCHASE',reason:raw});assert.match(text,pattern);assert.match(text,/purchases (?:remain |are )?paused/i);
 for(const forbidden of ['OKTA','PRIVATE_VALUE','PRIVATE_SECRET_SENTINEL','<script>','999','private.invalid','apikey','SECRET'])assert(!text.includes(forbidden),'Fixed concise copy cannot echo '+forbidden);
}
// Preserve all other action semantics and ordinary missing-data/no-Buy copy.
for(const action of ['BUY','STRONG BUY','ADD','HOLD','SELL','TRIM','CASH','WATCH'])for(const text of [reason,'Current quote verification is incomplete; fresh capital is paused.','No checked purchase quantity is available for this stock.']){
 assert.equal(current.c1PlainDecisionReason({action,reason:text}),previous.c1PlainDecisionReason({action,reason:text}),action+' behavior unchanged');
}
for(const text of ['Current quote verification is incomplete; fresh capital is paused.','Recent price momentum and MACD do not clear the Buy/Add gate.',
 'Current event verification is incomplete; purchases remain paused.','The earlier purchase plan closed with the sale.',
 'All three C1 position slots are currently allocated.','Brokerage cash is from an earlier Eastern date. Update Brokerage Cash before a new C1 purchase.']){
 assert.equal(current.c1PlainDecisionReason({action:'NO PURCHASE',reason:text}),previous.c1PlainDecisionReason({action:'NO PURCHASE',reason:text}));
}
assert.equal(current.c1DecisionTrigger({action:'NO PURCHASE',reason}),previous.c1DecisionTrigger({action:'NO PURCHASE',reason}));
console.log('PASS: reproduced generic masking, specific fixed opening/quote/account/current-evidence failure copy, no raw values or error leakage, unchanged other action/trigger semantics and immutable inputs.');
