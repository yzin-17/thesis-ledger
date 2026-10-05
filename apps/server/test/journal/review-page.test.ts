import { describe, expect, it } from 'vitest';
import { journalReviewQuerySchema } from '@thesis-ledger/schemas';
import { journalReviewCandidate } from '../../src/journal/journal-review-candidate.js';
import { journalReviewPage } from '../../src/journal/journal-review-page.js';
import { reviewEvidenceFixture } from './review-evidence.fixture.js';

const version = { ledgerRevision: '12', projectionGeneration: '7' };
const candidate = (id: string, closedAt: string | null) => {
  const evidence = reviewEvidenceFixture();
  evidence.trade.id = id;
  evidence.trade.closedAt = closedAt;
  evidence.reference = {
    reviewObjectType: 'TRADE_CYCLE',
    reviewObjectId: `TRADE_CYCLE:${id}`,
    tradeId: id,
  };
  return journalReviewCandidate({ evidence, fxMissing: false, projectionStale: false });
};
const query = (extra = {}) =>
  journalReviewQuerySchema.parse({
    accountId: reviewEvidenceFixture().trade.accountId,
    mode: 'actual',
    limit: 1,
    ...extra,
  });
const records = [
  candidate('older', '2026-01-02T01:00:00Z'),
  candidate('newer', '2026-01-03T01:00:00Z'),
  candidate('latest', '2026-01-04T01:00:00Z'),
];

describe('复盘窗口与世代分页', () => {
  it('倒序分页使用稳定对象 ID，下一页不重复或跳过', () => {
    const first = journalReviewPage(records, query(), version);
    expect(first.items[0]!.input.reference.tradeId).toBe('latest');
    expect(first.total).toBe(3);
    const second = journalReviewPage(records, query({ cursor: first.nextCursor }), version);
    expect(second.items[0]!.input.reference.tradeId).toBe('newer');
    const third = journalReviewPage(records, query({ cursor: second.nextCursor }), version);
    expect(third.items[0]!.input.reference.tradeId).toBe('older');
    expect(third.nextCursor).toBeNull();
  });
  it('窗口使用真实偏移与半开端点', () => {
    const page = journalReviewPage(
      records,
      query({
        start: '2026-01-02T09:00:00+08:00',
        end: '2026-01-04T09:00:00+08:00',
        limit: 10,
      }),
      version,
    );
    expect(page.items.map((row) => row.input.reference.tradeId)).toEqual(['newer', 'older']);
  });
  it('无窗口可展示未知时间，有窗口不伪造纳入', () => {
    const unknown = candidate('unknown', null);
    expect(journalReviewPage([...records, unknown], query({ limit: 10 }), version).total).toBe(4);
    expect(
      journalReviewPage(
        [...records, unknown],
        query({ start: '2026-01-01T00:00:00Z', limit: 10 }),
        version,
      ).total,
    ).toBe(3);
  });
  it('减仓按自身执行时间，不按父周期完成时间', () => {
    const evidence = reviewEvidenceFixture();
    evidence.reference = {
      reviewObjectType: 'CLOSE_SLICE',
      reviewObjectId: 'CLOSE_SLICE:slice-1',
      tradeId: 'trade-1',
      closeSliceId: 'slice-1',
    };
    const slice = journalReviewCandidate({ evidence, fxMissing: false, projectionStale: false });
    const page = journalReviewPage(
      [slice],
      query({ start: '2026-01-02T00:00:00Z', end: '2026-01-03T00:00:00Z' }),
      version,
    );
    expect(page.total).toBe(1);
  });
  it.each([{ projectionGeneration: '8' }, { ledgerRevision: '13' }])(
    '版本变化 %j 使旧游标失效',
    (change) => {
      const first = journalReviewPage(records, query(), version);
      const currentVersion = { ...version, ...change };
      const currentRecords = structuredClone(records);
      for (const row of currentRecords) Object.assign(row.input.projection, currentVersion);
      expect(() =>
        journalReviewPage(currentRecords, query({ cursor: first.nextCursor }), currentVersion),
      ).toThrow('更新');
    },
  );
  it.each([{ mode: 'shadow' }, { symbol: '600519.SH' }, { start: '2026-01-01T00:00:00Z' }])(
    '游标不跨查询范围 %j 复用',
    (scope) => {
      const first = journalReviewPage(records, query(), version);
      expect(() =>
        journalReviewPage(records, query({ ...scope, cursor: first.nextCursor }), version),
      ).toThrow('更新');
    },
  );
  it('当前版本与输入候选不一致时拒绝混代分页', () => {
    expect(() =>
      journalReviewPage(records, query(), { ...version, projectionGeneration: '8' }),
    ).toThrow('更新');
  });
  it('无效游标及消失的对象分别返回明确错误', () => {
    expect(() => journalReviewPage(records, query({ cursor: 'invalid' }), version)).toThrow('无效');
    const first = journalReviewPage(records, query(), version);
    expect(() =>
      journalReviewPage(records.slice(0, 2), query({ cursor: first.nextCursor }), version),
    ).toThrow('更新');
  });
});
