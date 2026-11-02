const assert=require('node:assert/strict'),fs=require('node:fs');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const {marketExecutionState}=createResearchModuleLoader(process.cwd()).load('lib/marketSession.js');
const text=fs.readFileSync('.github/workflows/ci.yml','utf8');
const schedules=[...text.matchAll(/^    - cron: '([^']+)'$/gm)].map(match=>match[1].split(' '));
assert.equal(schedules.length,2,'Two ordinary pre-open delivery opportunities');
assert.equal(new Set(schedules.map(fields=>fields.join(' '))).size,2);
for(const fields of schedules){
 assert.deepEqual(fields.slice(2),['*','*','1-5']);
 const [minute,hour]=fields.map(Number);assert(Number.isInteger(minute)&&minute>0&&minute<60);assert(Number.isInteger(hour));
 for(const day of ['2026-10-30','2026-11-02']){
  const at=new Date(`${day}T${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:00Z`);
  assert.equal(marketExecutionState(at).phase,'premarket');
  assert.equal(marketExecutionState(new Date(at.getTime()+15*60000)).phase,'premarket','Full job timeout fits before opening on both sides of DST');
 }
}
assert(text.includes('run: npm run build'));
assert(text.includes('journey: [normal, actual-screen, lifecycle-client]'));
assert(text.includes('contents: read'));
assert(!text.includes('workflow_dispatch'),'No manual or research rerun is introduced');
console.log('PASS: two distinct weekday pre-open schedules retain complete build/browser gates and finish before summer and winter opening.');
