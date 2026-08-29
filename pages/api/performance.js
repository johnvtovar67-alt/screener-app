import {normalizeLedgerRecords,summarizePerformance} from '../../lib/performanceLedger';
import {readPerformanceLedger,updatePerformanceLedger} from '../../lib/performanceStore';

export const config={api:{bodyParser:{sizeLimit:'8mb'}}};
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store, max-age=0');
  if(req.method==='GET'){
    const ledger=await readPerformanceLedger(),records=normalizeLedgerRecords(ledger.records,new Date());
    return res.status(200).json({records:records.slice(-1000),summary:summarizePerformance(records),warning:ledger.warning||null,persistentStorage:!ledger.warning,sessionBasis:'U.S. market sessions'});
  }
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  const rows=Array.isArray(req.body?.stocks)?req.body.stocks:[],now=req.body?.timestamp||new Date().toISOString(),result=await updatePerformanceLedger(rows,now);
  if(!result.ok)console.warn('performance ledger persistence:',result.warning);
  return res.status(result.status).json({persisted:result.ok,records:result.records.length,summary:summarizePerformance(result.records),warning:result.warning||null,persistentStorage:result.ok,sessionBasis:'U.S. market sessions'});
}
