const assert=require('node:assert/strict'),fs=require('node:fs');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const loader=createResearchModuleLoader(process.cwd());
const {normalizeHistoricalBars}=loader.load('lib/fmpPriceBars.js');

const rows=[
 {date:'2026-10-23T20:00:00Z',open:100,high:110,low:90,close:100,adjClose:50,volume:'123'},
 {date:'2026-10-22',open:20,high:22,low:19,close:21,volume:null},
 {date:'bad',open:1,high:1,low:1,close:1},
 null,
];
assert.deepEqual(JSON.parse(JSON.stringify(normalizeHistoricalBars(rows))),[
 {date:'2026-10-22',open:20,high:22,low:19,close:21,volume:0,adjusted:false},
 {date:'2026-10-23',open:50,high:55,low:45,close:50,volume:123,adjusted:true},
]);
assert.deepEqual(JSON.parse(JSON.stringify(normalizeHistoricalBars({date:'2026-10-23',open:10,high:11,low:9,close:10,adjOpen:8,adjHigh:9,adjLow:7,adjClose:8},{sourceAdjusted:true}))),[
 {date:'2026-10-23',open:8,high:9,low:7,close:8,volume:0,adjusted:true},
]);

for(const file of ['lib/c1LiveInputProvider.js','lib/c1AccountOpeningProvider.js','lib/c1HeldRankProvider.js','lib/c1HoldingCoverage.js']){
 const source=fs.readFileSync(file,'utf8');
 assert(source.includes("from './fmpPriceBars'"),file+' must use the small production price boundary');
 assert(!source.includes('fmpResearchBacktest'),file+' must not import the research monolith');
}
const researchSource=fs.readFileSync('lib/fmpResearchBacktest.js','utf8');
assert(researchSource.includes('import { normalizeHistoricalBars as normalizeFmpHistoricalBars } from "./fmpPriceBars";'));
assert(researchSource.includes('return normalizeFmpHistoricalBars(rows, options);'),'Research keeps the identical public normalizer contract');
console.log('PASS: production and research share one pure historical-bar normalizer; live providers do not import the research monolith.');
