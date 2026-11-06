import {buildC1StockScreenSnapshot} from './c1StockClassification';

// Market-book data already read and validated by the normal index process.
// No account input, additional storage read, provider call or financial write.
export function observeC1MarketScreen(record, view, now, emit=console.info) {
  try {
    const sessions=record.model.sessions.slice(-6), latest=sessions.at(-1);
    if (record.universe!=='sp500' || latest?.date!==view.sourceSessionDate ||
        view.decisionSnapshot?.requiredSessionDate!==latest.date) return;
    const {candidates}=buildC1StockScreenSnapshot(latest,now,sessions);
    const reviewed=candidates.filter(row=>/^[A-Z][A-Z0-9.-]{0,15}$/.test(row.symbol));
    const unavailable=reviewed.filter(row=>row.recentMomentumGate?.available===false)
      .map(row=>({symbol:row.symbol,inputs:row.recentMomentumGate.missingInputs}));
    emit('C1_MARKET_MOMENTUM_INPUTS',JSON.stringify({sourceSessionDate:latest.date,
      rankedSymbols:reviewed.map(row=>row.symbol),unavailable}));
  } catch {
    // An unavailable market diagnostic cannot change the result of the index job.
  }
}
