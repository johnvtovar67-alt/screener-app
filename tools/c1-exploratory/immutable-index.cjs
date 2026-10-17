// Exact lookup acceleration only for immutable rows. Duplicate/order semantics
// are retained; mutable/nonstandard inputs use the original source filter.
const {replaceOnce}=require('../c1-research/engine.cjs');
function indexTransform(file,source){
 if(file!=='lib/c1RecentMomentumGate.js')return source;
 const helper=`const researchRowIndex=new WeakMap();
function researchRowsForSymbol(rows,wanted){
 if(!Object.isFrozen(rows))return rows.filter(row=>symbolOf(row)===wanted);
 let index=researchRowIndex.get(rows);
 if(!index){
 if(!rows.every(row=>{const d=row&&Object.getOwnPropertyDescriptor(row,'symbol');return Object.isFrozen(row)&&d&&typeof d.value==='string'&&d.value.length>0;}))return rows.filter(row=>symbolOf(row)===wanted);
 index=new Map();for(const row of rows){const symbol=symbolOf(row);if(!index.has(symbol))index.set(symbol,[]);index.get(symbol).push(row);}researchRowIndex.set(rows,index);}
 return index.get(wanted)||[];
}
`;
 source=replaceOnce(source,'function acceptedSignal(session, symbol) {',helper+'function acceptedSignal(session, symbol) {');
 source=replaceOnce(source,'session.prices.filter(row => symbolOf(row) === wanted)','researchRowsForSymbol(session.prices,wanted)');
 source=replaceOnce(source,'session[field].filter(row => symbolOf(row) === symbol)','researchRowsForSymbol(session[field],symbol)');
 const memo=`const researchMomentumCache=new WeakMap(),researchFrozenCache=new WeakSet();
function researchDeepFrozen(value,visiting=new WeakSet()){
 if(value===null||typeof value!=='object')return typeof value!=='function';
 if(researchFrozenCache.has(value))return true;
 if(!Object.isFrozen(value)||visiting.has(value))return false;
 const proto=Object.getPrototypeOf(value);if(!Array.isArray(value)&&proto!==Object.prototype&&proto!==null)return false;
 visiting.add(value);for(const d of Object.values(Object.getOwnPropertyDescriptors(value)))if(!('value' in d)||!researchDeepFrozen(d.value,visiting)){visiting.delete(value);return false;}
 visiting.delete(value);researchFrozenCache.add(value);return true;
}
export function readC1RecentMomentum(args={}){
 const sessions=args.sessions??[],i=args.sessionIndex===undefined&&Array.isArray(sessions)?sessions.length-1:args.sessionIndex;
 if(!Array.isArray(sessions)||!Number.isSafeInteger(i)||i<5||i>=sessions.length)return researchUncachedReadC1RecentMomentum(args);
 const window=sessions.slice(i-5,i+1);
 if(!window.every(value=>researchDeepFrozen(value)))return researchUncachedReadC1RecentMomentum(args);
 const symbol=symbolOf(args.symbol),end=window[5];let bySymbol=researchMomentumCache.get(end);
 if(!bySymbol){bySymbol=new Map();researchMomentumCache.set(end,bySymbol);}
 const saved=bySymbol.get(symbol);
 if(saved&&saved.window.every((s,j)=>s===window[j]))return JSON.parse(saved.json);
 const result=researchUncachedReadC1RecentMomentum(args);bySymbol.set(symbol,{window,json:JSON.stringify(result)});return JSON.parse(JSON.stringify(result));
}
`;
 source=replaceOnce(source,'export function readC1RecentMomentum({ sessions = [], sessionIndex, symbol } = {}) {',memo+'function researchUncachedReadC1RecentMomentum({ sessions = [], sessionIndex, symbol } = {}) {');
 return source;
}
function freezeRows(dataset){
 const seen=new WeakSet();function deep(value){if(value&&typeof value==='object'&&!seen.has(value)){seen.add(value);for(const child of Object.values(value))deep(child);Object.freeze(value);}return value;}
 return deep(dataset);
}
module.exports={indexTransform,freezeRows};
