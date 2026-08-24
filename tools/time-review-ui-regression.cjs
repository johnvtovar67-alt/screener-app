const fs=require('fs');
const vm=require('vm');
const assert=(cond,msg)=>{if(!cond)throw new Error(msg)};

function loadGovernor(){let src=fs.readFileSync('lib/portfolioGovernor.js','utf8').replace(/export function /g,'function ');src+='\nmodule.exports={swingTimeReview};';const sandbox={module:{exports:{}},exports:{},console,Date,Math,Number,String,Object,Array,Set,Map,Boolean,RegExp};vm.createContext(sandbox);vm.runInContext(src,sandbox,{filename:'lib/portfolioGovernor.js'});return sandbox.module.exports;}
const {swingTimeReview}=loadGovernor();
const now=Date.now();
const iso=d=>new Date(now-d*86400000).toISOString();
let r=swingTimeReview({openedAt:iso(43),gainLossPct:0,tradeSetupScore:50,technicalScore:50,momentumScore:50,relativeStrengthScore:50});
assert(r.stage==='Re-underwrite'&&r.review,'43-day weak swing should be under active re-underwrite');
r=swingTimeReview({openedAt:iso(61),gainLossPct:3,tradeSetupScore:55,technicalScore:60,momentumScore:58,relativeStrengthScore:58});
assert(r.stage==='Long Swing Review'&&r.review,'60+ day mediocre swing must trigger long-swing review');
r=swingTimeReview({openedAt:iso(61),gainLossPct:20,tradeSetupScore:75,technicalScore:70,momentumScore:68,relativeStrengthScore:70});
assert(r.stage==='Long Swing Review'&&!r.review,'60+ day strong winner should not be forced into a sale review');
const page=fs.readFileSync('pages/index.js','utf8');
assert(page.includes('Swing Time Reviews'),'time-review panel missing');
assert(page.includes('type="date" value={openedDate}'),'opened-date editor missing');
assert(page.includes('timeReviewRows'),'time-review rows not computed');
assert(page.includes('openedAt:openedAtInput||prior?.openedAt||now'),'manual opened date must be able to correct legacy positions');
console.log('TIME REVIEW UI PASS: aging swing review, winner protection, opened-date correction, and portfolio visibility verified.');
