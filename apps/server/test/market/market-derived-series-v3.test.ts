import { describe, expect, it } from 'vitest';
import {
  deriveMarketSeriesV3,
  type MarketDerivedSeriesInputV3,
} from '../../src/market/market-derived-series-v3.js';

function input(): MarketDerivedSeriesInputV3 {
  const availableAt = '2026-09-27T00:00:00Z';
  const timestamps = ['2025-06-01T07:00:00Z', '2025-06-02T07:00:00Z'];
  return {
    identity: { symbol: '510300.SH', assetType: 'ETF', timeframe: '1d', adjustment: 'none' },
    rawEvidenceRef: 'raw-fixture',
    dataAsOf: availableAt,
    bars: timestamps.map((timestamp, index) => ({
      timestamp,
      open: 2 - index,
      high: 2 - index,
      low: 2 - index,
      close: 2 - index,
      volume: 100,
      amount: 200,
      completionStatus: 'complete',
      availableAt,
    })),
    conversion: {
      kind: 'multiplicative-price-factor',
      adjustment: 'qfq',
      evidenceRef: 'factor-fixture',
      sourceRevision: 'factor-v1',
      basisRef: 'fixed-anchor',
      anchorFactor: 2,
      anchorAvailableAt: availableAt,
      volumeSemantics: 'unadjusted',
      amountSemantics: 'unadjusted',
      factors: timestamps.map((timestamp, index) => ({ timestamp, value: index + 1, availableAt })),
    },
  };
}

describe('固定基准派生序列', () => {
  it('按明确锚点转换价格，保留量额和真实观测时间', () => {
    const result = deriveMarketSeriesV3(input());
    expect(result.bars.map((bar) => bar.close)).toEqual([1, 1]);
    expect(result.bars[0]).toMatchObject({
      volume: 100,
      amount: 200,
      availableAt: '2026-09-27T00:00:00Z',
    });
    expect(result.kind).toBe('locally-derived');
  });
  it('同一锚点的分段与整段数值一致', () => {
    const source = input();
    const full = deriveMarketSeriesV3(source);
    source.bars = source.bars.slice(1);
    source.conversion.factors = source.conversion.factors.slice(1);
    expect(deriveMarketSeriesV3(source).bars).toEqual(full.bars.slice(1));
  });
  it('拒绝晚于截点一微秒的 Bar、因子与锚点观察', () => {
    for (const field of ['bar', 'factor', 'anchor'] as const) {
      const source = input();
      source.dataAsOf = '2026-09-27T00:00:00.123455Z';
      if (field === 'bar') source.bars[0]!.availableAt = '2026-09-27T00:00:00.123456Z';
      else if (field === 'factor')
        source.conversion.factors[0]!.availableAt = '2026-09-27T00:00:00.123456Z';
      else source.conversion.anchorAvailableAt = '2026-09-27T00:00:00.123456Z';
      expect(() => deriveMarketSeriesV3(source)).toThrow();
    }
  });
  it('保留决定输出可用时刻的微秒精度', () => {
    const source = input();
    source.dataAsOf = '2026-09-27T00:00:00.123457Z';
    source.bars[0]!.availableAt = '2026-09-27T00:00:00.123455Z';
    source.conversion.factors[0]!.availableAt = '2026-09-27T00:00:00.123456Z';
    expect(deriveMarketSeriesV3(source).bars[0]!.availableAt).toBe('2026-09-27T00:00:00.123456Z');
  });
  it('Bar 与因子相差一微秒时不视为同一交易时刻', () => {
    const source = input();
    source.conversion.factors[0]!.timestamp = '2025-06-01T07:00:00.000001Z';
    expect(() => deriveMarketSeriesV3(source)).toThrow('派生因子必须与原始 Bar 严格递增且逐项对齐');
  });
  it.each(['basisRef', 'sourceRevision', 'evidenceRef'] as const)(
    '转换证据 %s 变化更新指纹',
    (field) => {
      const source = input();
      const before = deriveMarketSeriesV3(source).derivation.inputFingerprint;
      source.conversion[field] += '-changed';
      expect(deriveMarketSeriesV3(source).derivation.inputFingerprint).not.toBe(before);
    },
  );
  it.each(['missing', 'late', 'duplicate', 'zero', 'overflow', 'incomplete'] as const)(
    '拒绝 %s 输入',
    (kind) => {
      const source = input();
      if (kind === 'missing') source.conversion.factors.pop();
      else if (kind === 'late') source.conversion.anchorAvailableAt = '2099-01-01T00:00:00Z';
      else if (kind === 'duplicate') source.bars[1]!.timestamp = source.bars[0]!.timestamp;
      else if (kind === 'zero') source.conversion.anchorFactor = 0;
      else if (kind === 'overflow') source.conversion.factors[0]!.value = Number.MAX_VALUE;
      else source.bars[0]!.completionStatus = 'incomplete';
      if (kind === 'overflow') source.conversion.anchorFactor = Number.MIN_VALUE;
      expect(() => deriveMarketSeriesV3(source)).toThrow();
    },
  );
});
