// Mechanical source inversion keeps every pre-extraction simulator oracle pin.
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const ACCOUNTING_SHA256='53221eb0d59e1273e8fc0f7ae2f85135c841f067640c0655ca2417749f18d5d1';
const ACCOUNTING_IMPORT="import {createC1SimulatorAccounting} from './c1SimulatorAccounting';\n";
const ACCOUNTING_SETUP='const {metricsFromCurve} = createC1SimulatorAccounting({\n  number, optionalNumber, clamp, round, average, standardDeviation, STOP_EXIT_REASONS,\n});\n\n';
const ACCOUNTING_MARKER='// Pure result-accounting phase is shared through c1SimulatorAccounting.\n\n';
const MODULE_PREFIX='// Pure portfolio result accounting; trading, fills and ownership stay in the simulator.\n// The caller supplies its original numeric helpers and immutable stop-reason set.\nexport function createC1SimulatorAccounting({number,optionalNumber,clamp,round,average,standardDeviation,STOP_EXIT_REASONS}) {\n';
const MODULE_SUFFIX='  return {metricsFromCurve};\n}\n';
function replaceOnce(source,before,after,label){
 assert.equal(source.split(before).length,2,'Expected exactly one accounting '+label+' seam');
 return source.replace(before,after);
}
function checkedAccountingBody(body){
 assert.equal(createHash('sha256').update(body).digest('hex'),ACCOUNTING_SHA256,'Pure accounting phase must retain every original byte');
 return body;
}
function inlineAccountingBody(source){
 const start=source.indexOf('function roundTripDiagnostics('),end=source.indexOf('// Attribute a continuously simulated portfolio',start);
 assert(start>=0&&end>start,'Original accounting boundaries required');
 return checkedAccountingBody(source.slice(start,end));
}
function accountingModuleSource(source){return MODULE_PREFIX+inlineAccountingBody(source)+MODULE_SUFFIX;}
function extractedAccountingBody(){
 const source=fs.readFileSync('lib/c1SimulatorAccounting.js','utf8');
 assert(source.startsWith(MODULE_PREFIX)&&source.endsWith(MODULE_SUFFIX),'Only declared pure accounting wrapper is permitted');
 return checkedAccountingBody(source.slice(MODULE_PREFIX.length,-MODULE_SUFFIX.length));
}
function extractSimulatorAccounting(source){
 const body=inlineAccountingBody(source);
 source=ACCOUNTING_IMPORT+source;
 source=replaceOnce(source,'export function validatePointInTimeDataset(',ACCOUNTING_SETUP+'export function validatePointInTimeDataset(','helper binding');
 source=replaceOnce(source,body,ACCOUNTING_MARKER,'body');
 return require('./c1-simulator-phase-extraction.cjs').extractSimulatorPhases(source);
}
function restoreSimulatorAccounting(source){
 source=require('./c1-simulator-phase-extraction.cjs').restoreSimulatorPhases(source);
 source=replaceOnce(source,ACCOUNTING_IMPORT,'','import');
 source=replaceOnce(source,ACCOUNTING_SETUP,'','helper binding');
 return replaceOnce(source,ACCOUNTING_MARKER,extractedAccountingBody(),'body restoration');
}
module.exports={accountingModuleSource,extractSimulatorAccounting,restoreSimulatorAccounting,ACCOUNTING_SHA256};
