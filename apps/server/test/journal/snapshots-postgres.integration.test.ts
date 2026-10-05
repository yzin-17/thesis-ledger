import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { replaceExecutionCommandSchema } from '@thesis-ledger/schemas';
import type { LedgerCommandService } from '../../src/ledger/ledger-command.service.js';
import type { TradeQueryService } from '../../src/ledger/trade-query.service.js';
import type { JournalReviewQuery } from '../../src/journal/journal-review-query.js';
import type { JournalReviewSnapshots } from '../../src/journal/journal-review-snapshots.js';
import { JournalReviewAnalysis } from '../../src/journal/journal-review-analysis.js';

import {
  createJournalCommandFixture,
  journalExecutionFixture,
  readJournalEconomicRows,
} from './journal-command-postgres.fixture.js';

const databaseUrl = process.env.JOURNAL_REVIEW_DATABASE_URL;

describe.skipIf(!databaseUrl)('隔离 PostgreSQL 正式复盘快照', () => {
  const owner = new PrismaClient({ datasourceUrl: databaseUrl ?? '' });
  let app: PrismaClient;
  let candidates: JournalReviewQuery;
  let snapshots: JournalReviewSnapshots;
  let trades: TradeQueryService;
  let commands: LedgerCommandService;
  const accountId = randomUUID();
  const symbol = `JRL${randomUUID().slice(0, 3).toUpperCase()}.US`;
  const prefix = randomUUID();
  let lastSellEventId: string;
  let tradeId: string;
  let planId: string;
  const execution = journalExecutionFixture(accountId, symbol, prefix);
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
  const economicRows = () => readJournalEconomicRows(owner, accountId);
  beforeAll(async () => {
    const fixture = await createJournalCommandFixture(
      owner,
      databaseUrl!,
      accountId,
      symbol,
      execution,
    );
    ({ app, trades, candidates, snapshots, commands, tradeId, planId, lastSellEventId } = fixture);
  });
  afterAll(async () => {
    await Promise.all([owner.$disconnect(), app?.$disconnect()]);
  });

  it('真实 Ledger 命令生成事实后显式保存，精确输入和舍入结果保留，经济行不变', async () => {
    const before = await economicRows();
    const saved = await snapshots.save(await evidenceRequest());
    expect(saved.compatibility).toBe('CURRENT_CONTRACT');
    if (saved.compatibility !== 'CURRENT_CONTRACT') throw new Error('未保存当前合同快照');
    expect(saved.snapshot.inputSnapshot.trade.sourceQuantity).toBe('2.000000000000000001');
    expect(saved.snapshot.outputSnapshot.metrics.netRealizedPnl!.value).toBe('4.6');
    expect(saved.snapshot.outputSnapshot.metrics.counterfactualNetPnl!.value).toBe('-2.4');
    expect(saved.snapshot.status).toBe('CURRENT');
    const history = await snapshots.list({
      accountId,
      mode: 'actual',
      reviewObjectId: saved.snapshot.inputSnapshot.reference.reviewObjectId,
    });
    expect(history.items).toHaveLength(1);
    expect(await snapshots.get(saved.snapshot.id, { accountId, mode: 'actual' })).toEqual(saved);
    expect(await economicRows()).toEqual(before);
    await expect(
      snapshots.get(saved.snapshot.id, { accountId: randomUUID(), mode: 'actual' }),
    ).rejects.toMatchObject({ response: { errorCode: 'JOURNAL_SNAPSHOT_NOT_FOUND' } });
    await expect(
      snapshots.get(saved.snapshot.id, { accountId, mode: 'shadow' }),
    ).rejects.toMatchObject({ response: { errorCode: 'JOURNAL_SNAPSHOT_NOT_FOUND' } });
  });
  it('计划修订只改变当前状态，旧输入与结果保留；列表分页不重复或跨范围', async () => {
    const first = (await snapshots.list({ accountId })).items[0]!;
    if (first.compatibility !== 'CURRENT_CONTRACT') throw new Error('测试需要当前合同快照');
    const original = await owner.journalReviewSnapshot.findUniqueOrThrow({
      where: { id: first.snapshot.id },
    });
    await app.tradePlan.update({ where: { id: planId }, data: { thesis: '用户显式修改计划' } });
    const stale = await snapshots.get(first.snapshot.id, { accountId });
    expect(stale.compatibility === 'CURRENT_CONTRACT' && stale.snapshot.status).toBe('STALE');
    expect(stale.compatibility === 'CURRENT_CONTRACT' && stale.snapshot.outputSnapshot).toEqual(
      first.snapshot.outputSnapshot,
    );
    expect(
      await owner.journalReviewSnapshot.findUniqueOrThrow({ where: { id: first.snapshot.id } }),
    ).toEqual(original);
    await snapshots.save(await evidenceRequest());
    const page = await snapshots.list({ accountId, limit: 1 });
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).not.toBeNull();
    const second = await snapshots.list({ accountId, limit: 1, cursor: page.nextCursor });
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    expect(second.items[0]).not.toEqual(page.items[0]);
    await expect(
      snapshots.list({ accountId, mode: 'shadow', cursor: page.nextCursor }),
    ).rejects.toMatchObject({ response: { errorCode: 'JOURNAL_SNAPSHOT_CURSOR_INVALID' } });
  });
  it('保存共享锁保护真实 Ledger 更正顺序，保存后更正只将历史结果标为 STALE', async () => {
    const request = await evidenceRequest();
    const originalGet = candidates.get.bind(candidates);
    let announceRead!: () => void;
    const read = new Promise<void>((resolve) => {
      announceRead = resolve;
    });
    let releaseSave!: () => void;
    const release = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    const getSpy = vi.spyOn(candidates, 'get').mockImplementationOnce(async (input, tx) => {
      const result = await originalGet(input, tx);
      announceRead();
      await release;
      return result;
    });
    const saving = snapshots.save(request);
    await Promise.race([
      read,
      saving.then(() => {
        throw new Error('保存未进入证据读取');
      }),
    ]);
    const current = await trades.readVersion(accountId);
    const replacing = commands.replaceExecution(
      replaceExecutionCommandSchema.parse({
        ...execution('SELL', '1.000000000000000001', '14', 3, 'replace-sell'),
        command: 'REPLACE_EXECUTION',
        expectedLedgerRevision: current.ledgerRevision,
        supersedesEventId: lastSellEventId,
        reason: '隔离更正验收',
      }),
    );
    try {
      await vi.waitFor(
        async () => {
          const rows = await owner.$queryRaw<
            Array<{ count: bigint }>
          >`SELECT count(*) AS count FROM pg_stat_activity
          WHERE datname = 'journal_review_fixture' AND wait_event_type = 'Lock' AND query LIKE '%AccountLedgerState%'`;
          expect(Number(rows[0]!.count)).toBeGreaterThan(0);
        },
        { timeout: 5000 },
      );
    } finally {
      releaseSave();
      getSpy.mockRestore();
    }
    const saved = await saving;
    await replacing;
    if (saved.compatibility !== 'CURRENT_CONTRACT') throw new Error('未保存当前合同快照');
    const old = await snapshots.get(saved.snapshot.id, { accountId });
    expect(old.compatibility === 'CURRENT_CONTRACT' && old.snapshot.status).toBe('STALE');
    expect(
      old.compatibility === 'CURRENT_CONTRACT' &&
        old.snapshot.outputSnapshot.metrics.netRealizedPnl!.value,
    ).toBe('4.6');
    await expect(snapshots.save(request)).rejects.toMatchObject({
      response: { errorCode: 'JOURNAL_EVIDENCE_CHANGED' },
    });
  });
  it('草稿与周期统计使用真实投影，保留原计划和全部经济行', async () => {
    const before = await economicRows();
    const plan = await owner.tradePlan.findUniqueOrThrow({ where: { id: planId } });
    const request = await evidenceRequest();
    const analysisDraft = { stopLoss: '8', note: '本次草稿，原计划保持原值' };
    const saved = await snapshots.save({ ...request, analysisDraft });
    if (saved.compatibility !== 'CURRENT_CONTRACT') throw new Error('未保存草稿快照');
    expect(saved.snapshot.inputSnapshot.analysisDraft).toEqual(analysisDraft);
    expect(saved.snapshot.inputSnapshot.plan!.stopLoss).toBe('9');
    expect(saved.snapshot.inputSnapshot.projection.evidenceFingerprint).toBe(
      request.evidenceFingerprint,
    );
    expect(saved.snapshot.outputSnapshot.metrics.netRealizedPnl!.value).toBe('5.6');
    expect(saved.snapshot.outputSnapshot.metrics.counterfactualNetPnl!.value).toBe('-4.4');
    expect(await snapshots.get(saved.snapshot.id, { accountId })).toEqual(saved);
    const period = await new JournalReviewAnalysis(candidates).period({
      accountId,
      mode: 'actual',
      start: '2026-01-02T09:00:00Z',
      end: '2026-01-04T09:00:00Z',
    });
    expect(period.result.tradeCycles.includedObjectIds).toEqual([request.reference.reviewObjectId]);
    expect(period.result.closeSlices.includedObjectIds).toHaveLength(2);
    expect(period.result.tradeCycles.metrics.netRealizedPnl!.value).toBe('5.6');
    expect(period.candidates).toHaveLength(3);
    expect(await owner.tradePlan.findUniqueOrThrow({ where: { id: planId } })).toEqual(plan);
    expect(await economicRows()).toEqual(before);
  });
});
