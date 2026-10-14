import { describe, expect, it } from 'vitest';
import { journalAnalyzePeriod } from '../src/journal-period-analysis.js';
import { journalStatisticsEligibility } from '../src/journal-review.js';
import { journalAnalysisFixture, journalSliceAnalysisFixture } from './journal-analysis.fixture.js';

const window = { start: '2026-01-02T09:00:00Z', end: '2026-01-04T09:00:00Z' };
const samples = () => {
  const cycle = journalAnalysisFixture();
  const first = journalSliceAnalysisFixture();
  const second = journalSliceAnalysisFixture();
  second.input.reference = {
    reviewObjectType: 'CLOSE_SLICE',
    reviewObjectId: 'CLOSE_SLICE:slice-2',
    tradeId: 'trade-1',
    closeSliceId: 'slice-2',
  };
  return [cycle, first, second];
};
describe('按资格、粒度及窗口分开的周期复盘', () => {
  it('一个完整周期与两次减仓分别统计，不形成三笔完整交易', () => {
    const result = journalAnalyzePeriod(samples(), window);
    expect(result.tradeCycles.metrics.sampleCount.value).toBe('1');
    expect(result.closeSlices.metrics.sampleCount.value).toBe('2');
    expect(result.tradeCycles.metrics.netRealizedPnl.value).toBe('4');
    expect(result.closeSlices.metrics.netRealizedPnl.value).toBe('4');
    expect(result.tradeCycles.metrics.averageHoldingDays.value).toBe('2');
    expect(result.closeSlices.metrics.averageHoldingDays.value).toBe('1.5');
  });
  it('半开窗口按结束/片段时间归属，不按 entryAt 落窗或包含 end', () => {
    const result = journalAnalyzePeriod(samples(), { ...window, end: '2026-01-03T09:00:00Z' });
    expect(result.tradeCycles.observedSampleCount).toBe(0);
    expect(result.closeSlices.includedObjectIds).toEqual(['CLOSE_SLICE:slice-1']);
  });
  it('不合格周期保留排除原因，其已发生的合格片段仍能独立统计', () => {
    const input = samples();
    input[0]!.statisticsEligibility = {
      eligible: false,
      reasons: ['UNKNOWN_OPENED_AT', 'ESTIMATED_COST'],
    };
    const result = journalAnalyzePeriod(input, window);
    expect(result.tradeCycles.observedSampleCount).toBe(1);
    expect(result.tradeCycles.excluded).toEqual([
      { reviewObjectId: 'TRADE_CYCLE:trade-1', reasons: ['UNKNOWN_OPENED_AT', 'ESTIMATED_COST'] },
    ]);
    expect(result.tradeCycles.metrics.winRate.status).toBe('NOT_APPLICABLE');
    expect(result.closeSlices.metrics.sampleCount.value).toBe('2');
  });
  it('ACTIVE/未知统计时间单列，不用当前时间塞进窗口', () => {
    const input = samples();
    input[0]!.input.trade.lifecycle = 'ACTIVE';
    input[0]!.input.trade.closedAt = null;
    input[0]!.statisticsEligibility = {
      eligible: false,
      reasons: ['ACTIVE_TRADE', 'EVIDENCE_INCOMPLETE'],
    };
    const result = journalAnalyzePeriod(input, window);
    expect(result.tradeCycles.observedSampleCount).toBe(0);
    expect(result.unknownTime[0]!.reasons).toContain('STATISTICS_TIME_UNKNOWN');
    expect(result.closeSlices.metrics.sampleCount.value).toBe('2');
  });
  it('跨币种不相加金额或盈亏比，胜率与持有时间可独立返回', () => {
    const usd = journalAnalysisFixture();
    const cny = journalAnalysisFixture();
    cny.input.reference = {
      reviewObjectType: 'TRADE_CYCLE',
      reviewObjectId: 'TRADE_CYCLE:trade-2',
      tradeId: 'trade-2',
    };
    cny.input.trade.id = 'trade-2';
    cny.input.trade.closeSlices.forEach((row) => {
      row.currency = 'CNY';
    });
    cny.input.trade.netRealizedPnl = '-3';
    const result = journalAnalyzePeriod([usd, cny], window);
    expect(result.tradeCycles.metrics.netRealizedPnl).toMatchObject({
      value: null,
      missingEvidence: ['FX_MISSING'],
    });
    expect(result.tradeCycles.metrics.profitLossRatio).toMatchObject({
      value: null,
      missingEvidence: ['FX_MISSING'],
    });
    expect(result.tradeCycles.metrics.winRate.value).toBe('0.5');
    expect(result.tradeCycles.metrics.averageHoldingDays.value).toBe('2');
  });
  it('金额先精确相加再舍入，大数抵消不丢失末位小额结果', () => {
    const first = journalAnalysisFixture();
    const second = journalAnalysisFixture();
    first.input.trade.netRealizedPnl = '9007199254740993.000000000000000001';
    second.input.trade.netRealizedPnl = '-9007199254740992.999999990000000001';
    second.input.trade.id = 'trade-2';
    second.input.reference = {
      reviewObjectType: 'TRADE_CYCLE',
      reviewObjectId: 'TRADE_CYCLE:trade-2',
      tradeId: 'trade-2',
    };
    const result = journalAnalyzePeriod([first, second], window);
    expect(result.tradeCycles.metrics.netRealizedPnl.value).toBe('0.00000001');
    expect(result.tradeCycles.metrics.winRate.value).toBe('0.5');
  });
  it('没有亏损样本或样本不足时，不返回零盈亏比或 Infinity', () => {
    const result = journalAnalyzePeriod([journalAnalysisFixture()], window);
    expect(result.tradeCycles.metrics.profitLossRatio).toMatchObject({
      value: null,
      missingEvidence: ['LOSS_SAMPLE_MISSING'],
    });
    expect(journalAnalyzePeriod([], window).tradeCycles.metrics.netRealizedPnl.status).toBe(
      'NOT_APPLICABLE',
    );
  });
  it('未知开仓的合格片段仍有金额和胜率，平均持有时间明确不足', () => {
    const candidate = journalSliceAnalysisFixture();
    candidate.input.trade.openedAt = null;
    const result = journalAnalyzePeriod([candidate], window);
    expect(result.closeSlices.metrics.netRealizedPnl.value).toBe('2');
    expect(result.closeSlices.metrics.averageHoldingDays).toMatchObject({
      value: null,
      missingEvidence: ['UNKNOWN_HOLDING_TIME'],
    });
  });
  it('已知开仓晚于退出是冲突证据，不进入默认统计', () => {
    const result = journalStatisticsEligibility({
      reviewObjectType: 'TRADE_CYCLE',
      lifecycle: 'ENDED',
      endEvidence: 'SELL_EXECUTION',
      openedAt: '2026-01-04T09:00:00Z',
      statisticsAt: '2026-01-03T09:00:00Z',
      costEstimated: false,
      costConflict: false,
      fxMissing: false,
      evidenceComplete: true,
      stale: false,
      legacyUnconfirmed: false,
    });
    expect(result).toEqual({ eligible: false, reasons: ['EVIDENCE_INCOMPLETE'] });
  });
  it('拒绝重复对象，不通过重复输入抬高样本数', () => {
    const candidate = journalAnalysisFixture();
    expect(() => journalAnalyzePeriod([candidate, candidate], window)).toThrow(
      '周期输入包含重复复盘对象',
    );
  });
});
