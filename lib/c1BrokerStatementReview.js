import {createHash} from 'node:crypto';
import {reconcileC1ActualAccountFills} from './c1AccountLedger';
import {c1AccountCashAvailability} from './c1BrokerageCash';
import {isPortfolioCash} from './c1AccountPortfolio';
import {easternMarketClock} from './marketSession';

export const C1_BROKER_STATEMENT_REVIEW='c1-broker-statement-review-v1';
const ids=['base','cooldown15','sector40'];
const clone=value=>JSON.parse(JSON.stringify(value));
const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const fail=message=>{throw new Error('Broker statement review: '+message);};
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const near=(left,right)=>finite(left)&&finite(right)&&Math.abs(left-right)<1e-8;
const cents=value=>Math.round((value+Number.EPSILON)*100)/100;
const symbol=value=>String(value||'').trim().toUpperCase();
const validSymbol=value=>/^[A-Z][A-Z0-9.-]{0,15}$/.test(value);
const key=(date,ticker,side)=>JSON.stringify([date,ticker,side]);

function day(value){
 const text=String(value||'').trim(),iso=/^\d{4}-\d{2}-\d{2}$/.test(text)?text:null,us=text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
 const date=iso||(us?`${us[3]}-${us[1].padStart(2,'0')}-${us[2].padStart(2,'0')}`:null);
 if(!date||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)fail('a valid statement date is required');
 return date;
}
function statementDates(value,effective){
 const text=String(value||'').trim(),asOf=text.match(/^(.+?)\s+as\s+of\s+(.+)$/i),postedDate=day(asOf?asOf[1]:text),asOfDate=asOf?day(asOf[2]):null;
 const effectiveDate=effective?day(effective):asOfDate||postedDate;
 if(asOfDate&&effective&&asOfDate!==effectiveDate)fail('statement effective dates conflict');
 return {postedDate,effectiveDate,...(asOfDate?{asOfDate}:{})};
}
function number(value,{blank=false,money=false}={}){
 let text=String(value??'').trim();if(!text){if(blank)return null;fail('a numeric statement field is missing');}
 let negative=false;if(/^\(.*\)$/.test(text)){negative=true;text=text.slice(1,-1).trim();}
 text=text.replace(/^([+-]?)\$/,'$1');
 if(!/^[+-]?(?:(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?|\.\d+)$/.test(text))fail('a statement numeric field is invalid');
 if(negative&&/^[+-]/.test(text))fail('a statement numeric sign is ambiguous');
 const result=Number(text.replace(/,/g,''))*(negative?-1:1);
 if(!finite(result)||Math.abs(result)>Number.MAX_SAFE_INTEGER/100||money&&((text.split('.')[1]||'').replace(/0+$/,'').length>2||!near(result*100,Math.round(result*100))))fail('a statement cash amount is invalid');
 return result;
}
function table(text,delimiter){
 const rows=[];let row=[],field='',quoted=false,closed=false,line=1,start=1;
 const pushField=()=>{row.push(field);field='';closed=false;};
 const pushRow=()=>{pushField();if(row.some(value=>value.trim()))rows.push({line:start,fields:row});row=[];start=line+1;};
 for(let index=0;index<text.length;index++){
  const char=text[index];
  if(quoted){
   if(char==='"'){if(text[index+1]==='"'){field+='"';index++;}else{quoted=false;closed=true;}}
   else{field+=char;if(char==='\n')line++;}
   continue;
  }
  if(char==='"'){if(field.length||closed)fail('statement quoting is invalid');quoted=true;continue;}
  if(char===delimiter){pushField();continue;}
  if(char==='\n'||char==='\r'){
   if(char==='\r'&&text[index+1]==='\n')index++;
   pushRow();line++;continue;
  }
  if(closed&&!/\s/.test(char))fail('statement quoting is invalid');
  if(!closed)field+=char;
 }
 if(quoted)fail('statement quoting is incomplete');
 if(field.length||row.length)pushRow();
 return rows;
}
const aliases={date:'date',transactiondate:'date',tradedate:'date',action:'action',type:'action',symbol:'symbol',ticker:'symbol',
 quantity:'quantity',qty:'quantity',price:'price',fee:'fee',fees:'fee',feescomm:'fee',feescommission:'fee',amount:'amount',netamount:'amount',
 effectivedate:'effectiveDate',description:'description'};
const actions={buy:'Buy',sell:'Sell',journal:'Journal',bankinterest:'Bank Interest',interest:'Bank Interest',
 adrmgmtfee:'Fee',fee:'Fee',fees:'Fee',servicefee:'Fee'};

// Statement amounts are signed net cash facts. Displayed prices are retained
// as evidence only; rounded displays never become inferred execution prices.
export function parseC1BrokerStatement(statementText){
 if(typeof statementText!=='string'||!statementText.trim())fail('statement text is required');
 const text=statementText.replace(/^\uFEFF/,''),first=text.split(/\r?\n/).find(line=>line.trim())||'',delimiter=first.includes('\t')?'\t':',';
 const parsed=table(text,delimiter);if(parsed.length<2)fail('statement header and activity rows are required');
 const columns=parsed[0].fields.map(value=>aliases[value.trim().toLowerCase().replace(/[^a-z0-9]/g,'')]);
 if(columns.some(value=>!value)||new Set(columns).size!==columns.length)fail('statement headers are unsupported or duplicated');
 for(const required of ['date','action','symbol','quantity','price','fee','amount'])if(!columns.includes(required))fail('required statement headers are missing');
 const rows=[],seen=new Set();
 for(const source of parsed.slice(1)){
  if(source.fields.length!==columns.length)fail('statement row width does not match its header');
  const raw=Object.fromEntries(columns.map((name,index)=>[name,source.fields[index].trim()])),action=actions[raw.action.toLowerCase().replace(/[^a-z]/g,'')];
  if(!action)fail('a statement action is unsupported');
  const dates=statementDates(raw.date,raw.effectiveDate),{postedDate,effectiveDate}=dates,ticker=symbol(raw.symbol);
  if(ticker&&!validSymbol(ticker))fail('a statement symbol is invalid');
  const trade=action==='Buy'||action==='Sell',quantity=number(raw.quantity,{blank:!trade}),displayedPrice=number(raw.price,{blank:!trade}),fee=number(raw.fee,{blank:true,money:true})??0,amount=number(raw.amount,{money:true});
  if(trade&&(!validSymbol(ticker)||!finite(quantity)||quantity<=0||!finite(displayedPrice)||displayedPrice<=0||!finite(fee)||fee<0||
    action==='Buy'&&amount>=0||action==='Sell'&&amount<=0))fail('a statement trade has inconsistent quantity, price, fee or cash sign');
  if(!trade&&((quantity!==null&&quantity!==0)||(displayedPrice!==null&&displayedPrice!==0)||(fee!==null&&fee<0)||amount===0||
    action==='Journal'&&ticker||action==='Bank Interest'&&amount<0||action==='Fee'&&amount>0))fail('a statement cash event is inconsistent');
  const row={line:source.line,...dates,action,symbol:ticker,quantity:quantity??0,quantityText:raw.quantity.replace(/[$,+\s]/g,''),displayedPrice:displayedPrice??0,fee,amount,
   ...(raw.description?{description:raw.description}:{})};
  const identity=JSON.stringify([postedDate,effectiveDate,action,ticker,row.quantity,row.displayedPrice,row.fee,amount]);
  if(seen.has(identity))fail('duplicate statement activity is ambiguous');seen.add(identity);
  rows.push({...row,evidenceId:hash(identity)});
 }
 return {contract:'c1-owner-broker-statement-v1',statementHash:hash(statementText),delimiter:delimiter==='\t'?'TSV':'CSV',rows};
}

function exactQuantityMatches(rows,quantity){
 const parts=rows.map(row=>{const [integer='',fraction='']=row.quantityText.split('.');return {integer:integer||'0',fraction};});
 const places=Math.max(...parts.map(part=>part.fraction.length)),scale=10n**BigInt(places);
 const total=parts.reduce((sum,part)=>sum+BigInt(part.integer+part.fraction)*10n**BigInt(places-part.fraction.length),0n);
 return total===BigInt(quantity)*scale;
}

function savedFills(account,time){
 if(account?.contract!=='c1-private-account-v1'||!Number.isSafeInteger(account.revision)||account.revision<0||!Array.isArray(account.records)||
  account.records.some(record=>record?.complete!==true))fail('a versioned saved C1 account with completed records is required');
 const records=[...account.records,...(account.intradayActivity?[{...account.intradayActivity,executionEvidence:account.intradayActivity.plan}]:[])],groups=new Map(),seen=new Set();
 let previous=null;
 for(const record of records){
  const date=day(record.date);if(previous&&date<=previous)fail('saved execution sessions are duplicated or unordered');previous=date;
  if(!Array.isArray(record.fills))fail('saved fill history is incomplete');
  const plan=record.executionEvidence||record.recordingEvidence;
  for(const fill of record.fills){
   const at=Date.parse(fill?.executedAt),clock=easternMarketClock(new Date(at)),ticker=symbol(fill?.symbol);
   if(typeof fill?.id!=='string'||!fill.id||seen.has(fill.id)||typeof fill.orderId!=='string'||!fill.orderId||!validSymbol(ticker)||
    !['buy','sell'].includes(fill.side)||!Number.isSafeInteger(fill.shares)||fill.shares<=0||!finite(fill.price)||fill.price<=0||
    !finite(fill.fee)||fill.fee<0||!Number.isFinite(at)||at>time.getTime()||clock?.key!==date)fail('saved fill identity or economics are invalid');
   if(plan){
    const orders=plan.orders?.filter(order=>order.id===fill.orderId);
    if(orders?.length!==1||orders[0].symbol!==ticker||orders[0].side!==fill.side)fail('a saved fill does not match its original order');
   }else if(!ids.some(id=>fill.orderId.startsWith(id+':'+date+':')))fail('a legacy saved fill lacks its dated allocation identity');
   seen.add(fill.id);const groupKey=key(date,ticker,fill.side);
   if(!groups.has(groupKey))groups.set(groupKey,{date,symbol:ticker,side:fill.side,quantity:0,rawNetCash:0,rawFillIds:[],rawFills:[]});
   const group=groups.get(groupKey);group.quantity+=fill.shares;if(!Number.isSafeInteger(group.quantity))fail('a saved aggregate quantity is invalid');
   group.rawNetCash+=(fill.side==='sell'?1:-1)*fill.shares*fill.price-fill.fee;
   group.rawFillIds.push(fill.id);group.rawFills.push(clone(fill));
  }
 }
 return groups;
}
function coreAuthorities(account,portfolio){
 if(!Array.isArray(portfolio))fail('the saved server portfolio is required');
 const current=new Set(),seen=new Set();
 for(const position of portfolio){
  const ticker=symbol(position?.symbol);
  if(!validSymbol(ticker)||seen.has(ticker)||!finite(Number(position.shares))||Number(position.shares)<0)fail('saved portfolio ownership is invalid or duplicated');
  seen.add(ticker);if(position.role==='Core'&&Number(position.shares)>0&&!isPortfolioCash(position))current.add(ticker);
 }
 const inherited=[],events=account.adoption?.nonCashHoldings||[];if(!Array.isArray(events))fail('original in-kind Core receipts are invalid');
 for(const event of events){
  if(!event||typeof event!=='object')fail('an original in-kind Core receipt is invalid');
  const {id,recordedAt,reviewId,reviewPayload,...proposal}=event;
  if(typeof event.contract!=='string'||!event.contract||typeof id!=='string'||id!==reviewId||!/^[a-f0-9]{64}$/.test(id)||
   event.cashChange!==0||event.original?.role!=='Core'||!validSymbol(symbol(event.original.symbol))||JSON.stringify(proposal)!==reviewPayload)
   fail('an original in-kind Core receipt is invalid');
  inherited.push({symbol:symbol(event.original.symbol),from:day(String(event.original.openedAt||'').slice(0,10)),through:day(event.effectiveSessionDate),receiptHash:hash(event)});
 }
 return (ticker,date)=>current.has(ticker)?{kind:'current-server-Core-holding',symbol:ticker}:
  inherited.find(event=>event.symbol===ticker&&date>=event.from&&date<event.through)?
   {kind:'original-in-kind-Core-receipt',...inherited.find(event=>event.symbol===ticker&&date>=event.from&&date<event.through)}:null;
}
function originalCash(account,groups,completedBooks,time){
 if(!finite(account.adoption?.actualCash)||account.adoption.actualCash<0)fail('original adopted cash is required');
 const reconciliations=account.cashReconciliations||[];if(!Array.isArray(reconciliations))fail('existing cash reconciliation history is invalid');
 const seen=new Set();let adjustment=0;
 for(const event of reconciliations){
  const identity=hash(event);if(!finite(event?.amount)||seen.has(identity))fail('existing cash reconciliation history is invalid or duplicated');
  seen.add(identity);adjustment+=event.amount;
 }
 const rawCash=account.adoption.actualCash+[...groups.values()].reduce((sum,group)=>sum+group.rawNetCash,0)+adjustment;
 if(!finite(rawCash))fail('original accounting cash is invalid');
 if(account.intradayActivity){
  const plan=account.intradayActivity.plan,financial=plan?.cashAccounting;
  if(financial&&(financial.contract!=='c1-effective-cash-accounting-v1'||!/^[a-f0-9]{64}$/.test(financial.sourceDigest||'')||
   !/^[a-f0-9]{64}$/.test(financial.reviewId||'')))fail('saved financial plan identity is invalid');
  let captured;
  try{captured=reconcileC1ActualAccountFills({plan,fills:account.intradayActivity.fills,observedAt:time.toISOString()}).actualCash;}
  catch{fail('saved intraday accounting cannot be reconciled');}
  if(!financial&&!near(captured,rawCash))fail('saved original intraday cash differs from immutable accounting history');
 }
 if(completedBooks){
  if(ids.some(id=>!completedBooks[id]||!finite(completedBooks[id].cash)))fail('server-reconciled completed books are invalid');
  if(!account.intradayActivity&&!account.cashAccountingCorrections?.length&&!near(ids.reduce((sum,id)=>sum+completedBooks[id].cash,0),rawCash))
   fail('server-reconciled original cash differs from immutable accounting history');
 }
 return rawCash;
}
function priorBalanceAdjustments(account,from,through){
 const receipts=account.cashAccountingCorrections||[];if(!Array.isArray(receipts))fail('prior confirmed cash journal history is invalid');
 const seen=new Map(),events=[];
 // Superseding reviews already embed earlier adjustments. Read only each
 // capsule's OWN closing residual, once under its original receipt identity.
 for(const receipt of receipts){
  const amount=receipt?.review?.remainingRoundedBalanceAdjustment?.amount,date=day(receipt?.review?.window?.through),id=receipt?.id;
  if(typeof id!=='string'||!/^[a-f0-9]{64}$/.test(id)||receipt.review?.reviewId!==id||receipt.ownerConfirmed!==true||
   receipt.review.remainingRoundedBalanceAdjustment.allowed!==true||!finite(amount)||Math.abs(amount)>5||
   !near(amount*100,Math.round(amount*100))||date<from||date>through)fail('prior confirmed balance adjustment is invalid');
  const identity=JSON.stringify([date,amount]);
  if(seen.has(id)){if(seen.get(id)!==identity)fail('prior confirmed balance adjustment identity conflicts');continue;}
  seen.set(id,identity);
  if(amount!==0)events.push({kind:'prior-confirmed-balance-adjustment',date,netCash:amount,sourceReceiptId:id,
   receiptReference:{id,reviewId:receipt.review.reviewId},statementEvidence:[]});
 }
 return events;
}

// Read-only review. completedBooks is an optional server consistency check,
// never cash authority. Cash always comes from original adoption/fill facts.
// Persisted journal capsules must be validated by the server before this call.
export function reviewC1BrokerStatement({account,statementText,portfolio,now=new Date(),completedBooks}={}){
 const time=new Date(now),clock=easternMarketClock(time);if(!Number.isFinite(time.getTime())||!clock)fail('a valid review time is required');
 const statement=parseC1BrokerStatement(statementText),groups=savedFills(account,time),from=day(account.adoption?.sourceSessionDate),through=clock.key,
  core=coreAuthorities(account,portfolio),statementGroups=new Map(),externalCapitalFlows=[],pnlCashEvents=[];
 if(from>through)fail('the account adoption is outside the review window');
 for(const row of statement.rows){
  const trade=row.action==='Buy'||row.action==='Sell',economicDate=trade?row.effectiveDate:row.postedDate;
  if(economicDate<from||economicDate>through||row.postedDate<from||row.postedDate>through)fail('statement activity is outside the account review window');
  if(row.action==='Buy'||row.action==='Sell'){
   const side=row.action==='Buy'?'buy':'sell',groupKey=key(row.effectiveDate,row.symbol,side);
   if(groups.has(groupKey)){
    if(!statementGroups.has(groupKey))statementGroups.set(groupKey,[]);statementGroups.get(groupKey).push(row);continue;
   }
   const authority=core(row.symbol,row.effectiveDate);if(!authority)fail('an unmatched statement trade has no verified Core classification');
   externalCapitalFlows.push({kind:side==='buy'?'core-purchase':'core-sale',date:row.effectiveDate,symbol:row.symbol,quantity:row.quantity,
    netCash:row.amount,coreAuthority:authority,statementEvidence:[clone(row)]});
  }else if(row.action==='Journal')externalCapitalFlows.push({kind:'journal',date:row.postedDate,netCash:row.amount,statementEvidence:[clone(row)]});
  else pnlCashEvents.push({kind:row.action==='Bank Interest'?'interest':'fee',date:row.postedDate,symbol:row.symbol||null,netCash:row.amount,statementEvidence:[clone(row)]});
 }
 pnlCashEvents.push(...priorBalanceAdjustments(account,from,through));
 const matchedTrades=[];
 for(const [groupKey,group]of groups){
  const evidence=statementGroups.get(groupKey);
  if(!evidence||!exactQuantityMatches(evidence,group.quantity))fail('a C1 day/symbol/side quantity is missing or differs from the statement');
  const statementNetCash=evidence.reduce((sum,row)=>sum+row.amount,0);
  matchedTrades.push({...group,statementNetCash,cashAdjustment:statementNetCash-group.rawNetCash,statementEvidence:clone(evidence),
   priceTreatment:'Statement net cash is authoritative for this proposal; displayed prices are not reconstructed exact executions.'});
 }
 matchedTrades.sort((a,b)=>a.date.localeCompare(b.date)||a.symbol.localeCompare(b.symbol)||a.side.localeCompare(b.side));
 const matchedTradeNetCashAdjustments=matchedTrades.filter(row=>Math.abs(row.cashAdjustment)>1e-8),originalLedgerCash=originalCash(account,groups,completedBooks,time),
  currentBrokerAvailability=c1AccountCashAvailability({account,strategyCash:originalLedgerCash,now:time}),
  externalCapitalNet=externalCapitalFlows.reduce((sum,row)=>sum+row.netCash,0),pnlCashNet=pnlCashEvents.reduce((sum,row)=>sum+row.netCash,0),
  tradeCashAdjustment=matchedTradeNetCashAdjustments.reduce((sum,row)=>sum+row.cashAdjustment,0),
  afterKnownEventsCash=originalLedgerCash+externalCapitalNet+pnlCashNet+tradeCashAdjustment,
  statementNetCash=statement.rows.reduce((sum,row)=>sum+row.amount,0),broker=currentBrokerAvailability.brokerageCash,
  amount=finite(broker)?cents(broker-cents(afterKnownEventsCash)):null,
  allowed=currentBrokerAvailability.brokerageCashCurrent===true&&amount!==null&&Math.abs(amount)<=5;
 const bindings={accountHash:hash(account),statementHash:statement.statementHash,portfolioHash:hash(portfolio),
  completedBooksHash:!account.intradayActivity&&completedBooks?hash(completedBooks):null};
 const reviewId=hash({contract:C1_BROKER_STATEMENT_REVIEW,revision:account.revision,bindings,from,through,originalLedgerCash,
  broker,brokerCurrent:currentBrokerAvailability.brokerageCashCurrent,afterKnownEventsCash});
 return {contract:C1_BROKER_STATEMENT_REVIEW,status:'review-only',reviewId,revision:account.revision,reviewedAt:time.toISOString(),window:{from,through},bindings,
  statement:{rowCount:statement.rows.length,format:statement.delimiter,netCash:statementNetCash},originalLedgerCash,currentBrokerAvailability,
  externalCapitalFlows,pnlCashEvents,matchedTrades,matchedTradeNetCashAdjustments,externalCapitalNet,pnlCashNet,tradeCashAdjustment,afterKnownEventsCash,
  remainingRoundedBalanceAdjustment:{amount,allowed,limit:5,reason:!currentBrokerAvailability.brokerageCashCurrent?
   'A current confirmed brokerage balance is required before reviewing a residual balance adjustment.':Math.abs(amount)>5?
   'The remaining difference exceeds the existing small-balance limit and needs transaction evidence.':
   'Within the existing small-balance limit; this proposal does not apply the adjustment or verify its historical cause.'},
  impliedOpeningCash:{status:'UNVERIFIED',amount:finite(broker)?broker-statementNetCash:null,
   differenceFromAdoption:finite(broker)&&finite(account.adoption?.actualCash)?broker-statementNetCash-account.adoption.actualCash:null,
   reason:'Implied only from the terminal balance and supplied statement; not a confirmed opening balance and never an adoption rewrite.'},
  limitations:['Read-only owner-statement proposal; no financial record, cash balance, basis, stop, risk reference or adoption receipt was changed.',
   'Statement completeness and Core classifications require owner review. A statement is not independent broker authentication.',
   'Historical events before the current brokerage observation must not be credited to that observation again.',
   'External capital flows, trading-profit corrections and statement precision differences remain separate. Financial replay must be validated before any confirmation route can apply them.']};
}
