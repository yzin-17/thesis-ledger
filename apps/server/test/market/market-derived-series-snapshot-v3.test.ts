import { describe, expect, it } from 'vitest';
import {
  freezeMarketDerivedSeriesV3,
  readMarketDerivedSeriesV3,
} from '../../src/market/market-derived-series-snapshot-v3.js';
import {
  MARKET_DERIVATION_ALGORITHM_V3,
  type MarketDerivedSeriesInputV3,
} from '../../src/market/market-derived-series-v3.js';

function fixture(): MarketDerivedSeriesInputV3 {
  const availableAt = '2026-09-27T00:00:00Z';
  const timestamps = ['2025-06-01T07:00:00Z', '2025-06-02T07:00:00Z'];
  return {
    identity: { symbol: '510300.SH', assetType: 'ETF', timeframe: '1d', adjustment: 'none' },
    rawEvidenceRef: 'raw-fixture',
    dataAsOf: availableAt,
    bars: timestamps.map((timestamp) => ({
      timestamp,
      open: 2,
      high: 2,
      low: 2,
      close: 2,
      volume: 100,
      amount: 200,
      completionStatus: 'complete',
      availableAt,
    })),
    conversion: {
      kind: 'multiplicative-price-factor',
      adjustment: 'qfq',
      evidenceRef: 'factor-fixture',
      sourceRevision: 'v1',
      basisRef: 'anchor-fixture',
      anchorFactor: 2,
      anchorAvailableAt: availableAt,
      volumeSemantics: 'unadjusted',
      amountSemantics: 'unadjusted',
      factors: timestamps.map((timestamp, index) => ({ timestamp, value: index + 1, availableAt })),
    },
  };
}

describe('派生序列冻结与显示裁剪', () => {
  it('JSON 往返后完整重算，显示裁剪不改变基准或指纹', () => {
    const frozen = freezeMarketDerivedSeriesV3(fixture());
    const payload: unknown = JSON.parse(JSON.stringify(frozen));
    const full = readMarketDerivedSeriesV3(payload, frozen.inputFingerprint);
    const view = readMarketDerivedSeriesV3(payload, frozen.inputFingerprint, 1);
    expect(view.bars).toEqual(full.bars.slice(-1));
    expect(view.derivation).toEqual(full.derivation);
    expect(view.fullBarCount).toBe(2);
  });
  it('新冻结使用精确时钟修订，旧算法冻结明确拒绝', () => {
    const source = fixture();
    source.dataAsOf = '2026-09-27T00:00:00.123457Z';
    source.bars[0]!.availableAt = '2026-09-27T00:00:00.123455Z';
    source.conversion.factors[0]!.availableAt = '2026-09-27T00:00:00.123456Z';
    const frozen = freezeMarketDerivedSeriesV3(source);
    expect(frozen.algorithmRevision).toBe(MARKET_DERIVATION_ALGORITHM_V3);
    expect(readMarketDerivedSeriesV3(frozen, frozen.inputFingerprint).bars[0]!.availableAt).toBe(
      '2026-09-27T00:00:00.123456Z',
    );

    expect(() =>
      readMarketDerivedSeriesV3(
        {
          ...frozen,
          algorithmRevision: 'raw-times-factor-over-fixed-anchor-binary64-v1',
        },
        frozen.inputFingerprint,
      ),
    ).toThrow();
  });
  it('冻结输入和读取结果不共享可修改对象', () => {
    const input = fixture();
    const frozen = freezeMarketDerivedSeriesV3(input);
    input.conversion.factors[0]!.value = 99;
    const view = readMarketDerivedSeriesV3(frozen, frozen.inputFingerprint);
    view.bars[0]!.close = 99;
    expect(readMarketDerivedSeriesV3(frozen, frozen.inputFingerprint).bars[0]!.close).toBe(1);
  });
  it.each(['anchor', 'factor', 'raw', 'reference', 'revision', 'hidden-prefix'] as const)(
    '篡改 %s 时即使仅显示尾部仍拒绝',
    (change) => {
      const frozen = freezeMarketDerivedSeriesV3(fixture());
      if (change === 'anchor') frozen.input.conversion.anchorFactor = 3;
      else if (change === 'factor') frozen.input.conversion.factors[1]!.value = 3;
      else if (change === 'raw') frozen.input.bars[1]!.amount = 300;
      else if (change === 'reference') frozen.input.rawEvidenceRef = 'other';
      else if (change === 'revision') frozen.input.conversion.sourceRevision = 'v2';
      else frozen.input.bars[0]!.volume = 300;
      expect(() => readMarketDerivedSeriesV3(frozen, frozen.inputFingerprint, 1)).toThrow();
    },
  );
  it('拒绝未知算法和另一个冻结引用', () => {
    const frozen = freezeMarketDerivedSeriesV3(fixture());
    expect(() =>
      readMarketDerivedSeriesV3(
        { ...frozen, algorithmRevision: 'future' },
        frozen.inputFingerprint,
      ),
    ).toThrow();
    expect(() => readMarketDerivedSeriesV3(frozen, 'a'.repeat(64))).toThrow();
  });
  it.each([0, -1, 0.5, Infinity, 100001])('拒绝非法显示条数 %s', (limit) => {
    const frozen = freezeMarketDerivedSeriesV3(fixture());
    expect(() => readMarketDerivedSeriesV3(frozen, frozen.inputFingerprint, limit)).toThrow();
  });
});
