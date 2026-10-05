import { describe, expect, it } from 'vitest';
import {
  journalReviewFallsInWindow,
  journalReviewObjectReference,
  journalReviewObjectTimes,
  journalReviewWindow,
  journalStatisticsEligibility,
  type JournalStatisticsFacts,
  type TradeProjection,
} from '../src/index.js';

const trade: TradeProjection = {
  id: 'trade-1',
  accountId: 'account-1',
  accountMode: 'actual',
  symbol: 'AAPL.US',
  lifecycle: 'ENDED',
  exitProgress: 'FULL',
  endEvidence: 'SELL_EXECUTION',
  openedAt: '2026-01-01T09:00:00Z',
  closedAt: '2026-01-03T09:00:00Z',
  earliestEvidenceAt: '2026-01-01T09:00:00Z',
  sourceQuantity: '2',
  closedQuantity: '2',
  remainingQuantity: '0',
  entryLegs: [],
  baselineComponents: [],
  corporateActionAdjustments: [],
  dividendAttributions: [],
  evidenceSources: [],
  completeness: 'COMPLETE',
  issues: [],
  algorithmVersion: 'fixture',
  closeSlices: [
    {
      id: 'slice-1',
      eventId: 'sell-1',
      factId: 'sell-fact-1',
      occurredAt: '2026-01-02T09:00:00Z',
      currency: 'USD',
      quantity: '1',
      remainingQuantityAfter: '1',
      allocations: [],
    },
  ],
};
const facts: JournalStatisticsFacts = {
  reviewObjectType: 'TRADE_CYCLE',
  lifecycle: 'ENDED',
  endEvidence: 'SELL_EXECUTION',
  openedAt: trade.openedAt,
  statisticsAt: trade.closedAt,
  costEstimated: false,
  costConflict: false,
  fxMissing: false,
  evidenceComplete: true,
  stale: false,
  legacyUnconfirmed: false,
};

describe('统一复盘对象与统计资格', () => {
  it('周期和片段使用不同的稳定对象空间，片段必须属于 Trade', () => {
    expect(journalReviewObjectReference(trade)).toEqual({
      reviewObjectType: 'TRADE_CYCLE',
      reviewObjectId: 'TRADE_CYCLE:trade-1',
      tradeId: 'trade-1',
    });
    expect(journalReviewObjectReference(trade, 'slice-1')).toEqual({
      reviewObjectType: 'CLOSE_SLICE',
      reviewObjectId: 'CLOSE_SLICE:slice-1',
      tradeId: 'trade-1',
      closeSliceId: 'slice-1',
    });
    expect(() => journalReviewObjectReference(trade, 'foreign-slice')).toThrow('不属于');
  });
  it('未知开仓保留为空，ACTIVE 不使用已有 closedAt 伪造结束', () => {
    const active = { ...trade, openedAt: null, lifecycle: 'ACTIVE' as const };
    expect(journalReviewObjectTimes(active, journalReviewObjectReference(active))).toEqual({
      openedAt: null,
      effectiveClosedAt: null,
      executedAt: null,
    });
    expect(
      journalReviewObjectTimes(active, journalReviewObjectReference(active, 'slice-1')),
    ).toEqual({
      openedAt: null,
      effectiveClosedAt: null,
      executedAt: '2026-01-02T09:00:00Z',
    });
  });
  it('拒绝跨 Trade 的复盘引用', () => {
    expect(() =>
      journalReviewObjectTimes(trade, {
        ...journalReviewObjectReference(trade),
        tradeId: 'foreign-trade',
      }),
    ).toThrow('不属于');
  });
  it('完整 SELL 周期纳入默认周期统计', () => {
    expect(journalStatisticsEligibility(facts)).toEqual({ eligible: true, reasons: [] });
  });
  it.each([
    [{ lifecycle: 'ACTIVE' }, 'ACTIVE_TRADE'],
    [{ endEvidence: 'BALANCE_OBSERVATION' }, 'NON_SELL_ENDING'],
    [{ endEvidence: 'UNKNOWN' }, 'NON_SELL_ENDING'],
    [{ openedAt: null }, 'UNKNOWN_OPENED_AT'],
    [{ costEstimated: true }, 'ESTIMATED_COST'],
    [{ costConflict: true }, 'COST_CONFLICT'],
    [{ fxMissing: true }, 'FX_MISSING'],
    [{ evidenceComplete: false }, 'EVIDENCE_INCOMPLETE'],
    [{ statisticsAt: null }, 'EVIDENCE_INCOMPLETE'],
    [{ stale: true }, 'STALE_PROJECTION'],
    [{ legacyUnconfirmed: true }, 'LEGACY_UNCONFIRMED'],
  ] as const)('排除事实 %j 输出明确原因 %s', (change, reason) => {
    expect(journalStatisticsEligibility({ ...facts, ...change })).toEqual({
      eligible: false,
      reasons: [reason],
    });
  });
  it('ACTIVE Baseline 的有效 SELL 片段仍可独立统计，不伪造完整周期', () => {
    expect(
      journalStatisticsEligibility({
        ...facts,
        reviewObjectType: 'CLOSE_SLICE',
        lifecycle: 'ACTIVE',
        endEvidence: 'UNKNOWN',
        openedAt: null,
        statisticsAt: trade.closeSlices[0]!.occurredAt,
      }),
    ).toEqual({ eligible: true, reasons: [] });
  });
  it('多项排除原因同时保留且证据不足不重复', () => {
    expect(
      journalStatisticsEligibility({
        ...facts,
        openedAt: null,
        costEstimated: true,
        costConflict: true,
        fxMissing: true,
        evidenceComplete: false,
        statisticsAt: null,
        stale: true,
      }),
    ).toEqual({
      eligible: false,
      reasons: [
        'UNKNOWN_OPENED_AT',
        'ESTIMATED_COST',
        'COST_CONFLICT',
        'FX_MISSING',
        'EVIDENCE_INCOMPLETE',
        'STALE_PROJECTION',
      ],
    });
  });
});

describe('复盘半开时间窗口', () => {
  it('保留亚毫秒端点，不被 Date 毫秒截断合并为空窗口', () => {
    const window = journalReviewWindow({
      start: '2026-01-02T00:00:00.0001Z',
      end: '2026-01-02T00:00:00.0002Z',
    });
    expect(journalReviewFallsInWindow('2026-01-02T00:00:00.0001Z', window)).toBe(true);
    expect(journalReviewFallsInWindow('2026-01-02T00:00:00.00015Z', window)).toBe(true);
    expect(journalReviewFallsInWindow('2026-01-02T00:00:00.0002Z', window)).toBe(false);
  });
  it('负 epoch 的秒内分数仍按实际先后比较', () => {
    const window = journalReviewWindow({
      start: '1969-12-31T23:59:59.9999Z',
      end: '1970-01-01T00:00:00Z',
    });
    expect(journalReviewFallsInWindow('1969-12-31T23:59:59.99995Z', window)).toBe(true);
    expect(journalReviewFallsInWindow('1970-01-01T00:00:00Z', window)).toBe(false);
  });
  const window = journalReviewWindow({
    start: '2026-01-02T09:00:00+08:00',
    end: '2026-01-03T09:00:00+08:00',
  });
  it('纳入 start 和中间点，排除 end 与窗口外点', () => {
    expect(journalReviewFallsInWindow('2026-01-02T01:00:00Z', window)).toBe(true);
    expect(journalReviewFallsInWindow('2026-01-02T18:00:00Z', window)).toBe(true);
    expect(journalReviewFallsInWindow('2026-01-03T01:00:00Z', window)).toBe(false);
    expect(journalReviewFallsInWindow('2026-01-02T00:59:59.999Z', window)).toBe(false);
  });
  it('按真实时间比较偏移，不按 ISO 文本排序', () => {
    expect(() =>
      journalReviewWindow({
        start: '2026-01-02T09:00:00+08:00',
        end: '2026-01-02T02:00:00Z',
      }),
    ).not.toThrow();
    expect(() =>
      journalReviewWindow({
        start: '2026-01-02T02:00:00Z',
        end: '2026-01-02T09:00:00+08:00',
      }),
    ).toThrow('早于');
  });
  it('无边界可保留未知时间，有任一边界则不能假定命中', () => {
    expect(journalReviewFallsInWindow(null, journalReviewWindow({}))).toBe(true);
    expect(journalReviewFallsInWindow(null, window)).toBe(false);
    expect(journalReviewFallsInWindow(null, journalReviewWindow({ end: window.end! }))).toBe(false);
  });
  it('相等端点形成空窗口', () => {
    const at = '2026-01-02T01:00:00Z';
    expect(journalReviewFallsInWindow(at, journalReviewWindow({ start: at, end: at }))).toBe(false);
  });
  it.each(['2026-01-02', '2026-01-02T09:00:00', '2026-02-30T00:00:00Z', 'invalid'])(
    '%s 不能作为带时区窗口端点',
    (start) => {
      expect(() => journalReviewWindow({ start })).toThrow();
    },
  );
});
