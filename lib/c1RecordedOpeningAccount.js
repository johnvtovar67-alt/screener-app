import {createHash} from 'node:crypto';
import {C1_RECORDED_OPENING_REVIEW as review} from './c1SessionRevisionReview';
import {isC1RecordedOpeningAudit} from './c1RecordedOpeningRecovery';
import {continueC1ActualAccount, reconcileC1ActualAccountFills, c1CompletionPolicy, c1CompletionRules} from './c1AccountLedger';
import {projectC1AccountSession} from './c1AccountProjection';
import {withC1HistoricalPriceEvidence} from './c1AccountSeed';
import {c1CashAccountingForAccount} from './c1BrokerCashJournal';
import {reconcileC1FinancialCurrentBooks} from './c1CashAccounting';
import {C1_PURCHASE_FUNDING_POLICY} from './c1BrokerageCash';

const digest = value => createHash('sha256').update(JSON.stringify(value, (_key, item) =>
  item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item)).digest('hex');

// Compare the private account against the one historical field covered by
// the recorded-model exception. Both sides use the same stored fills, cash
// journal, current session and normal account replay and projection.
export function assertC1RecordedOpeningAccount(audit, book, account, through) {
  const reject = () => { throw new Error('Saved holding price history requires reviewed account reconciliation'); };
  if (!isC1RecordedOpeningAudit(audit, book, digest)) reject();
  const {adoption} = account;
  if (through < review.currentSessionDate || adoption.sourceSessionDate >= review.currentSessionDate) return;

  const accepted = book.model.sessions.filter(session => session.date <= review.currentSessionDate);
  const revised = accepted.map(session => session.date === review.previousSessionDate
    ? {...session, prices: session.prices.map(row =>
      row.symbol === review.symbol ? {...row, open: review.revisedOpen} : row)}
    : session);
  const records = account.records.filter(record => record.date < review.currentSessionDate);
  const completedRecord = account.records.find(record => record.date === review.currentSessionDate);
  const activity = account.intradayActivity?.date === review.currentSessionDate ? account.intradayActivity : null;
  const observedAt = new Date(review.observedAt);
  const cashAccounting = c1CashAccountingForAccount(account);
  const cashReconciliations = account.cashReconciliations?.filter(row => row.effectiveSessionDate <= review.currentSessionDate);
  const completionPolicy = completedRecord?.completionPolicy || activity?.plan?.completionPolicy ||
    c1CompletionPolicy(account.positionContext);

  function replay(historySessions) {
    const source = historySessions.filter(session => session.date >= adoption.sourceSessionDate);
    const sessions = source.slice(0, -1), opening = source.at(-1);
    const baseline = sessions.at(-1);
    if (baseline?.date !== review.previousSessionDate || opening?.date !== review.currentSessionDate) reject();
    const capturedAdoption = withC1HistoricalPriceEvidence(adoption, historySessions, {historicalAdoption: true});
    const common = {adoption: capturedAdoption, historySessions, observedAt, cashAccounting};
    const continued = continueC1ActualAccount({...common, sessions, records,
      cashReconciliations: cashReconciliations?.filter(row => row.effectiveSessionDate <= baseline.date)});
    // A posted closing record supplies today's financial postings through
    // completed replay below. They are not part of its historical opening.
    const financialCurrent = cashAccounting && !completedRecord ? reconcileC1FinancialCurrentBooks({
      completedContinued: continued, cashAccounting, now: observedAt, activity,
      originalResult: activity ? reconcileC1ActualAccountFills({
        plan: activity.plan, fills: activity.fills, observedAt
      }) : undefined
    }) : null;
    const entryRecheck = completedRecord?.entryRecheck || activity?.plan?.entryRecheck;
    const plan = projectC1AccountSession({...common, baseline, sessions,
      opening: entryRecheck ? {...opening, entryRecheck} : opening,
      books: financialCurrent?.books || continued.books, replay: continued.replay,
      financialContinued: continued, financialCurrent,
      purchaseFundingIndependent: records.some(row => row.executionEvidence?.purchaseFundingPolicy === C1_PURCHASE_FUNDING_POLICY),
      accountCompletionRules: c1CompletionRules([...records, {date: opening.date, completionPolicy}], adoption.sourceSessionDate)
    });
    const completed = completedRecord ? continueC1ActualAccount({
      ...common, sessions: source, records: [...records, completedRecord], cashReconciliations
    }) : null;
    return {continued, completed, plan};
  }

  // This covers complete cash and ownership, recorded execution and both
  // replays' orders, stops, cooldowns, exposure and operational risk state.
  if (digest(replay(accepted)) !== digest(replay(revised))) reject();
}
