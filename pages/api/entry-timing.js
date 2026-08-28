import {fetchEntryTimingMap} from '../../lib/entryTiming';

const normalize=s=>String(s||'').replace('-','.').toUpperCase().trim();

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store, max-age=0');
  try{
    const raw=Array.isArray(req.query.symbols)?req.query.symbols.join(','):String(req.query.symbols||''),symbols=[...new Set(raw.split(',').map(normalize).filter(Boolean))].slice(0,25);
    if(!symbols.length)return res.status(400).json({error:'At least one portfolio symbol is required.'});
    const map=await fetchEntryTimingMap(symbols),timing=Object.fromEntries(symbols.map(symbol=>[symbol,map.get(symbol)||{symbol,available:false,pass:false,strongPass:false,status:'Historical timing unavailable',reason:'Historical timing could not be verified; do not describe short-term technicals as supportive.'}]));
    return res.status(200).json({timing,meta:{requested:symbols.length,returned:Object.keys(timing).length,maxSymbols:25}});
  }catch(err){
    console.error('portfolio entry timing error:',err);
    return res.status(503).json({error:'Portfolio timing analysis failed.',detail:err?.message||'Unknown error.'});
  }
}
