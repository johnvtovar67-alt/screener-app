// Local read-only accounting: no portfolio mutations or trading authority.
const HEADER='id,date,type,symbol,shares,price,cash_amount,fee';
const TYPES=new Set(['OPEN_CASH','OPEN_POSITION','BUY','SELL','DEPOSIT','WITHDRAWAL','DIVIDEND','INTEREST','FEE']);
const CASH=new Set(['CASH','SWVXX','VMFXX','SPAXX','FDRXX','MMF']);
function csv(text){
 if(typeof text!=='string'||text.length>2000000)throw new Error('CSV must be smaller than 2 MB');
 const rows=[];let row=[],field='',quoted=false,closed=false;
 const push=()=>{row.push(field);field='';closed=false;};
 text=text.replace(/^\uFEFF/,'').replace(/\r\n/g,'\n');
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else field+=c;continue;}
  if(c==='"'){if(field||closed)throw new Error('Malformed CSV quote');quoted=true;}
  else if(c===',')push();
  else if(c==='\n'){push();if(row.some(x=>x!==''))rows.push(row);row=[];}
  else{if(closed)throw new Error('Unexpected text after closing quote');field+=c;}
 }
 if(quoted)throw new Error('Unclosed CSV quote');
 push();if(row.some(x=>x!==''))rows.push(row);
 if(rows.shift()?.join(',')!==HEADER)throw new Error('Unrecognized CSV columns. Use the supplied template; broker-specific formats must be mapped explicitly.');
 if(!rows.length||rows.length>10000)throw new Error('CSV needs 1–10,000 records');
 return rows;
}
function number(value,label){if(!/^-?\d+(\.\d+)?$/.test(value))throw new Error('Invalid '+label);const n=Number(value);if(!Number.isFinite(n)||Math.abs(n)>1e12)throw new Error('Invalid '+label);return n;}
function symbol(value){if(!/^[A-Z][A-Z0-9.-]{0,15}$/.test(value)||CASH.has(value))throw new Error('Invalid stock symbol');return value;}
export function reconcileBrokerageCSV(text,holdings){
 const rows=csv(text),seen=new Set(),positions=new Map(),opening=new Set();let cash=0,lastDate='',startDate='',activity=false;
 for(let i=0;i<rows.length;i++){
  const r=rows[i];if(r.length!==8)throw new Error('Row '+(i+2)+': expected eight columns');
  const [id,date,type,ticker,q,p,a,f]=r;
  if(!id.trim()||seen.has(id))throw new Error('Missing or duplicate transaction ID');seen.add(id);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||date<lastDate)throw new Error('Invalid or out-of-order date');
  if(!TYPES.has(type))throw new Error('Unsupported action: '+type);
  if(i===0&&type!=='OPEN_CASH')throw new Error('First record must declare opening cash, including zero');
  if(i===0)startDate=date;lastDate=date;
  const amount=number(a,'cash amount'),fee=number(f||'0','fee');if(fee<0)throw new Error('Negative fee');
  if(type.startsWith('OPEN_')){
   if(activity||date!==startDate)throw new Error('Opening balances must precede activity on the opening date');
   if(type==='OPEN_CASH'){if(i!==0||ticker||q||p||fee||amount<0)throw new Error('Invalid opening cash');cash=amount;}
   else{symbol(ticker);const shares=number(q,'opening shares');if(opening.has(ticker)||shares<=0||amount!==0||fee||p)throw new Error('Invalid opening position');opening.add(ticker);positions.set(ticker,shares);}
   continue;
  }
  activity=true;
  if(type==='BUY'||type==='SELL'){
   symbol(ticker);const shares=number(q,'shares'),price=number(p,'price');if(shares<=0||price<=0)throw new Error('Trade shares and price must be positive');
   const expected=(type==='BUY'?-1:1)*shares*price-fee;
   if(Math.abs(expected-amount)>0.010001)throw new Error('Trade cash does not match shares, price and fees');
   const next=(positions.get(ticker)||0)+(type==='BUY'?shares:-shares);
   if(next< -1e-8)throw new Error('Sale exceeds reconstructed shares');
   positions.set(ticker,Math.abs(next)<1e-8?0:next);
  }else{
   if(ticker||q||p||fee)throw new Error('Cash-only records need blank symbol, shares, price and zero fee');
   const debit=type==='WITHDRAWAL'||type==='FEE';if(debit?amount>=0:amount<=0)throw new Error('Cash movement has wrong sign');
  }
  cash+=amount;if(cash< -0.010001)throw new Error('Negative cash: missing funds or unsupported margin activity');
 }
 if(!Array.isArray(holdings)||!holdings.length)throw new Error('Enter all account holdings and explicit CASH before comparing');
 const actual=new Map(),symbols=new Set();let actualCash=0,cashDeclared=false;
 for(const h of holdings){const s=String(h?.symbol||'').toUpperCase();if(symbols.has(s))throw new Error('Duplicate portfolio symbol');symbols.add(s);
  if(typeof h.shares!=='number'||!Number.isFinite(h.shares)||h.shares<0)throw new Error('Invalid portfolio shares');
  if(CASH.has(s)){cashDeclared=true;actualCash+=h.shares;}else{symbol(s);actual.set(s,h.shares);}}
 if(!cashDeclared)throw new Error('Explicit cash balance is required, including zero');
 const differences=[];
 for(const s of new Set([...positions.keys(),...actual.keys()])){const reconstructed=positions.get(s)||0,entered=actual.get(s)||0;if(Math.abs(reconstructed-entered)>1e-8)differences.push({symbol:s,reconstructed,entered});}
 if(Math.abs(cash-actualCash)>0.010001)differences.push({symbol:'CASH',reconstructed:cash,entered:actualCash});
 return {status:differences.length?'differences-found':'balances-match',recordCount:rows.length,startDate,lastTransactionDate:lastDate,differences,
 cash,reconstructedPositions:Object.fromEntries(positions),executable:false,orders:[],brokerageVerified:false,strategyValidated:false,
 limitation:'Balances match only supplied records and entered holdings. Completeness, account identity, timing and investment merit are not verified. No sleeve assignments or orders are inferred.'};
}
