import { timingSafeEqual, createHash } from 'node:crypto';
import { readStoredC1DatedBook } from '../../../lib/c1DatedBookStore';
import { latestCompletedMarketSessionDay } from '../../../lib/marketSession';

// Read-only, authenticated operational acceptance evidence. Never returns account
// holdings, raw provider payloads, orders, prices, credentials or private archive URLs.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(503).json({ error: 'Acceptance diagnostics unavailable' });
  const supplied = Buffer.from(String(req.headers.authorization || ''));
  const expected = Buffer.from('Bearer ' + secret);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
    return res.status(401).json({ error: 'Unauthorized' });
  try {
    const { record, view } = await readStoredC1DatedBook('sp500');
    const captures = record.captures || [];
    const sessions = record.model?.sessions || [];
    const latest = sessions.at(-1);
    const symbols = (latest?.prices || []).map(row => row.symbol);
    const reconciliations = (record.reconciliations || []).map(audit => ({
      contract: audit.contract,
      previousSessionDate: audit.previousSessionDate,
      currentSessionDate: audit.currentSessionDate,
      confirmationCount: audit.confirmationCount ?? null,
      deferredRevisionCount: audit.deferredRevisionCount ?? null,
      mismatchCount: audit.mismatches?.length ?? null,
      observationCount: audit.observations?.length ?? null,
      identicalModelEconomics: audit.identicalModelEconomics === true,
      comparisonHash: audit.comparisonHash || null,
      originalInputsPreserved: audit.originalInputsPreserved === true,
      economicAdjustmentCount: audit.economicAdjustments?.length ?? null
    }));
    const currentSession = latest?.date === latestCompletedMarketSessionDay(new Date());
    const lastAudit = reconciliations.at(-1);
    const complete = Boolean(latest && symbols.length >= 490 && symbols.length <= 520 &&
      new Set(symbols).size === symbols.length && symbols.every(Boolean));
    const modelParity = Boolean(lastAudit && lastAudit.currentSessionDate === latest?.date &&
      lastAudit.identicalModelEconomics && lastAudit.originalInputsPreserved &&
      lastAudit.economicAdjustmentCount === 0);
    return res.status(200).json({
      contract: 'c1-acceptance-report-v1',
      sourceSessionDate: view.sourceSessionDate,
      expectedCompletedSessionDate: latestCompletedMarketSessionDay(new Date()),
      recordHash: record.recordHash,
      captures: captures.length,
      modelSessions: sessions.length,
      constituentCount: symbols.length,
      completeConstituents: complete,
      currentSession,
      reconciliationAudits: reconciliations,
      latestReconciliationModelParity: modelParity,
      privateAccountParity: 'not-established-by-index-model',
      opportunities: { freshVerifiedRecommendations: 'not-established-by-index-model',
        executable: false },
      milestonePassed: false,
      limitation: 'Requires independently verified private-account accounting and Opportunities freshness before acceptance.'
    });
  } catch {
    return res.status(503).json({ error: 'Acceptance evidence unavailable' });
  }
}
