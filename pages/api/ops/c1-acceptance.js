import { timingSafeEqual } from 'node:crypto';
import { readStoredC1DatedBook } from '../../../lib/c1DatedBookStore';
import { latestCompletedMarketSessionDay } from '../../../lib/marketSession';

// Production-safe diagnostic: only reads the accepted index book; never opens,
// modifies, adopts or authorizes a private account, order, position or cash flow.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(503).json({ error: 'Diagnostic authentication unavailable' });
  const supplied = Buffer.from(String(req.headers.authorization || ''));
  const expected = Buffer.from('Bearer ' + secret);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
    return res.status(401).json({ error: 'Unauthorized' });
  try {
    const now = new Date();
    const { record, view } = await readStoredC1DatedBook('sp500', { now });
    const captures = record.captures || [];
    const sessions = record.model?.sessions || [];
    const latest = sessions.at(-1);
    const symbols = Array.isArray(latest?.prices) ? latest.prices.map(row => row.symbol) : [];
    const unique = new Set(symbols);
    const latestCapture = captures.at(-1);
    const expectedDate = latestCompletedMarketSessionDay(now);
    const reconciliations = record.reconciliations || [];
    const latestAudit = reconciliations.at(-1);
    const constituentComplete = symbols.length >= 490 && symbols.length <= 520 &&
      unique.size === symbols.length && symbols.every(Boolean);
    const captureConsistent = Boolean(latestCapture && latest &&
      latestCapture.sessionDate === latest.date && view.sourceSessionDate === latest.date &&
      view.recordHash === record.recordHash);
    const latestAuditSafe = !latestAudit || (latestAudit.originalInputsPreserved === true &&
      latestAudit.identicalModelEconomics === true &&
      Array.isArray(latestAudit.economicAdjustments) && latestAudit.economicAdjustments.length === 0);
    const report = {
      contract: 'c1-production-readonly-acceptance-v1',
      observedAt: now.toISOString(),
      sourceSessionDate: view.sourceSessionDate,
      expectedCompletedSessionDate: expectedDate,
      recordHash: view.recordHash,
      captureCount: captures.length,
      modelSessionCount: sessions.length,
      constituentCount: symbols.length,
      constituentComplete,
      captureConsistent,
      latestCompletedSessionAccepted: view.sourceSessionDate === expectedDate,
      reconciliationCount: reconciliations.length,
      latestReconciliation: latestAudit ? {
        contract: latestAudit.contract || null,
        previousSessionDate: latestAudit.previousSessionDate || null,
        currentSessionDate: latestAudit.currentSessionDate || null,
        confirmationCount: latestAudit.confirmationCount ?? null,
        deferredRevisionCount: latestAudit.deferredRevisionCount ?? null,
        originalInputsPreserved: latestAudit.originalInputsPreserved === true,
        identicalModelEconomics: latestAudit.identicalModelEconomics === true,
        economicAdjustmentCount: latestAudit.economicAdjustments?.length ?? null
      } : null,
      latestAuditSafe,
      indexRecordChecksPassed: constituentComplete && captureConsistent &&
        view.sourceSessionDate === expectedDate && latestAuditSafe,
      privateAccountParity: 'NOT_VERIFIED',
      opportunitiesFreshness: 'NOT_VERIFIED',
      productionAcceptance: 'NOT_ESTABLISHED',
      executable: false
    };
    // Only aggregate verification flags are logged; no account data, prices, or secrets.
    console.info('[c1-acceptance]', JSON.stringify(report));
    return res.status(200).json(report);
  } catch (error) {
    console.error('[c1-acceptance]', JSON.stringify({ status: 'failed', reason: error?.message || 'unknown' }));
    return res.status(503).json({ error: 'Accepted index evidence unavailable' });
  }
}
