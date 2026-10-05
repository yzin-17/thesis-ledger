import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { JournalReviewQuery } from '../../src/journal/journal-review-query.js';
import { JournalReviewSnapshots } from '../../src/journal/journal-review-snapshots.js';
import { JournalReviewAnalysis } from '../../src/journal/journal-review-analysis.js';
import { JournalReviewAi } from '../../src/journal/journal-review-ai.js';
import { JournalPeriodReviewAi } from '../../src/journal/journal-period-review-ai.js';
import { AiRunService } from '../../src/ai/ai-run.service.js';
import {
  createJournalCommandFixture,
  journalExecutionFixture,
  readJournalEconomicRows,
} from './journal-command-postgres.fixture.js';

const databaseUrl = process.env.JOURNAL_REVIEW_DATABASE_URL;
describe.skipIf(!databaseUrl)('隔离 PostgreSQL 复盘解读与快照关联', () => {
  const owner = new PrismaClient({ datasourceUrl: databaseUrl ?? '' });
  const accountId = randomUUID();
  const symbol = `JAI${randomUUID().slice(0, 3).toUpperCase()}.US`;
  let app: PrismaClient;
  let candidates: JournalReviewQuery;
  let tradeId: string;
  beforeAll(async () => {
    ({ app, candidates, tradeId } = await createJournalCommandFixture(
      owner,
      databaseUrl!,
      accountId,
      symbol,
      journalExecutionFixture(accountId, symbol, randomUUID()),
    ));
  });
  afterAll(async () => {
    await Promise.all([owner.$disconnect(), app?.$disconnect()]);
  });
  const economicRows = () => readJournalEconomicRows(owner, accountId);
  const evidenceRequest = async () => {
    const candidate = await candidates.get({
      accountId,
      mode: 'actual',
      reference: {
        reviewObjectType: 'TRADE_CYCLE',
        reviewObjectId: `TRADE_CYCLE:${tradeId}`,
        tradeId,
      },
    });
    return {
      accountId,
      mode: 'actual' as const,
      reference: candidate.input.reference,
      evidenceFingerprint: candidate.input.projection.evidenceFingerprint,
    };
  };
  it('真实数据库冻结 AI 来源并显式关联快照，后续任务状态不重写历史结果', async () => {
    const before = await economicRows();
    const request = {
      ...(await evidenceRequest()),
      analysisDraft: { stopLoss: '8', note: '冻结解读草稿' },
      expectedAlgorithmVersion: 'journal-decimal-1',
    };
    const providers = {
      strictReadyContract: () => ({
        provider: { id: 'isolated-journal-provider' },
        execution: {
          adapter: 'openai-compatible',
          mode: 'json_validated',
          readiness: { configurationFingerprint: 'isolated-journal-provider-v1' },
        },
      }),
    };
    const routing = {
      read: async () => ({
        researchDefault: { providerId: 'isolated-journal-provider', model: 'isolated-model' },
        revision: '7',
      }),
    };
    const runs = new AiRunService(app as never, providers as never, routing as never);
    const executor = { dispatch: vi.fn() };
    const analysis = new JournalReviewAnalysis(candidates);
    const ai = new JournalReviewAi(analysis, runs, executor as never);
    const run = await ai.start(request);
    expect(run.status).toBe('queued');
    const stored = await app.aiRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(stored.modelMetadata).toMatchObject({
      researchSettingsRevision: '7',
      frozenResearch: {
        prompt: { version: 'journal-review-v1' },
        source: {
          evidence: {
            data: {
              analysisDraft: request.analysisDraft,
              result: { metrics: { netRealizedPnl: { value: '4.6' } } },
            },
          },
        },
      },
    });
    const withAi = new JournalReviewSnapshots(app as never, candidates, ai);
    const saved = await withAi.save({ ...request, aiRunId: run.id });
    if (saved.compatibility !== 'CURRENT_CONTRACT') throw new Error('未保存带解读的快照');
    expect(saved.snapshot.outputSnapshot.aiExplanation).toEqual({
      id: run.id,
      provider: 'isolated-journal-provider',
      model: 'isolated-model',
      promptVersion: 'journal-review-v1',
      status: 'queued',
    });
    await app.aiRun.update({
      where: { id: run.id },
      data: { status: 'failed', errorCode: 'fixture-failure', errorSummary: '隔离终态' },
    });
    expect(await withAi.get(saved.snapshot.id, { accountId })).toEqual(saved);
    await expect(
      withAi.save({ ...request, analysisDraft: { stopLoss: '9' }, aiRunId: run.id }),
    ).rejects.toMatchObject({ response: { errorCode: 'JOURNAL_AI_CONTEXT_CHANGED' } });
    const period = await analysis.period({
      accountId,
      mode: 'actual',
      start: '2026-01-02T09:00:00Z',
      end: '2026-01-04T09:00:00Z',
    });
    const periodRequest = {
      accountId,
      mode: 'actual',
      start: period.result.window.start,
      end: period.result.window.end,
      expectedLedgerRevision: period.ledgerRevision,
      expectedProjectionGeneration: period.projectionGeneration,
      expectedAlgorithmVersion: period.result.algorithmVersion,
      objectFingerprints: Object.fromEntries(
        period.candidates.map((row) => [
          row.input.reference.reviewObjectId,
          row.input.projection.evidenceFingerprint,
        ]),
      ),
    };
    const periodAi = new JournalPeriodReviewAi(analysis, runs, executor as never);
    const periodRun = await periodAi.start(periodRequest);
    expect(periodRun.objectFingerprints).toEqual(periodRequest.objectFingerprints);
    await expect(ai.get(periodRun.id, { accountId })).rejects.toMatchObject({
      response: { errorCode: 'JOURNAL_AI_NOT_FOUND' },
    });
    expect(executor.dispatch).toHaveBeenCalledTimes(2);
    expect(await economicRows()).toEqual(before);
  });
});
