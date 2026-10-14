import { describe, expect, it } from 'vitest';
import {
  canonicalMarketPeriodIndicatorEncoding,
  marketPeriodIndicatorRequestSchema,
} from '@thesis-ledger/schemas';
import { buildMarketPeriodView } from '../../src/market/market-period-view.js';
import { periodContentFingerprint } from '../../src/market/market-period-source.js';
import { periodViewFixture, refreshSourceFingerprint } from './market-period-view.fixture.js';

describe('原生日线到派生显示/计算视图', () => {
  it.each(['5d', '1w', '1mo', '1y'] as const)(
    '%s 使用真实聚合和独立绑定，不改变原始来源',
    (timeframe) => {
      const { source, window } = periodViewFixture(timeframe);
      const before = structuredClone(source);
      const result = buildMarketPeriodView(source, window);
      expect(source).toEqual(before);
      expect(result.visible.series.identity.timeframe).toBe(timeframe);
      expect(result.visible.series.points).toHaveLength(2);
      expect(result.visible.series.provenance).toMatchObject({
        kind: 'derived',
        provider: 'thesis-ledger-server',
        baseSources: [{ providerId: 'controlled-provider', upstreamSource: 'controlled-source' }],
      });
      expect(result.visible.series.inputFingerprint).toBe(
        periodContentFingerprint(
          canonicalMarketPeriodIndicatorEncoding(result.visible.periodContext),
        ),
      );
      expect(
        result.visible.series.points.every(
          (point) => point.availableAt === '2026-10-03T00:00:00.000321Z',
        ),
      ).toBe(true);
    },
  );
  it('周线 OHLCV/金额有独立预期', () => {
    const { source, window } = periodViewFixture();
    expect(buildMarketPeriodView(source, window).visible.series.points[0]).toMatchObject({
      open: 10,
      high: 17,
      low: 9,
      close: 16,
      volume: 60,
      amount: 5100,
    });
  });
  it('预热计算和显示子集分别绑定，计算请求通过现行合同', () => {
    const { source, window } = periodViewFixture('1w', true);
    const result = buildMarketPeriodView(source, window);
    expect(result.visible.series.points).toHaveLength(2);
    expect(result.calculation.series.points).toHaveLength(61);
    expect(result.visible.series.inputFingerprint).not.toBe(
      result.calculation.series.inputFingerprint,
    );
    expect(result.visible.series.coverage.hasMoreBefore).toBe(true);
    expect(
      marketPeriodIndicatorRequestSchema.safeParse({
        contractVersion: 3,
        identity: result.calculation.series.identity,
        inputFingerprint: result.calculation.series.inputFingerprint,
        periodContext: result.calculation.periodContext,
        points: result.calculation.series.points,
        requests: window.indicators,
      }).success,
    ).toBe(true);
  });
  it('完整价格口径变化使摘要变化，即使数值点保持相同', () => {
    const { source, window } = periodViewFixture();
    const before = buildMarketPeriodView(source, window);
    source.chartContextV3!.sourcePriceBasis.volumeBasis = 'split-adjusted';
    const after = buildMarketPeriodView(source, window);
    expect(after.visible.series.points).toEqual(before.visible.series.points);
    expect(after.visible.series.derivation.priceBasisFingerprint).not.toBe(
      before.visible.series.derivation.priceBasisFingerprint,
    );
    expect(after.visible.series.inputFingerprint).not.toBe(before.visible.series.inputFingerprint);
  });
  it('日历 revision 和评估时刻分别进入摘要', () => {
    const { source, window } = periodViewFixture();
    const before = buildMarketPeriodView(source, window).visible.series.inputFingerprint;
    const changedCalendar = {
      ...window,
      calendar: { ...window.calendar, revision: 'next-revision' },
    };
    expect(buildMarketPeriodView(source, changedCalendar).visible.series.inputFingerprint).not.toBe(
      before,
    );
    expect(
      buildMarketPeriodView(source, { ...window, evaluationAsOf: '2026-10-04T00:00:01Z' }).visible
        .series.inputFingerprint,
    ).not.toBe(before);
  });
  it('没有可信解释的缺日保留 unknown，不填零', () => {
    const { source, window } = periodViewFixture();
    const missing = source.points[1]!.timestamp.slice(0, 10);
    source.points.splice(1, 1);
    refreshSourceFingerprint(source);
    const first = buildMarketPeriodView(source, window).visible.series.points[0]!;
    expect(first.completionStatus).toBe('unknown');
    expect(first.missingTradingDates).toEqual([missing]);
    expect(first.observedTradingDates).toHaveLength(4);
    expect(first.volume).toBe(49);
  });
  it('年度未结束保留 incomplete，最新完整日期来自派生完整桶', () => {
    const { source, window } = periodViewFixture('1y');
    const result = buildMarketPeriodView(source, window).visible.series;
    expect(result.points.at(-1)!.completionStatus).toBe('incomplete');
    expect(result.coverage.latestCompleteTradingDate).toBe('2025-12-31');
  });
  it('空输入不生成点，也不凭日历声明有更早数据', () => {
    const { source, window } = periodViewFixture();
    source.points = [];
    source.coverage.hasMoreBefore = true;
    refreshSourceFingerprint(source);
    const result = buildMarketPeriodView(source, window);
    expect(result.visible.series.points).toEqual([]);
    expect(result.visible.series.coverage.hasMoreBefore).toBe(false);
    expect(result.calculation.series.points).toEqual([]);
  });
  it('更早来源覆盖标记与计划桶共同控制分页', () => {
    const { source, window } = periodViewFixture();
    expect(buildMarketPeriodView(source, window).visible.series.coverage.hasMoreBefore).toBe(false);
    source.coverage.hasMoreBefore = true;
    expect(buildMarketPeriodView(source, window).visible.series.coverage.hasMoreBefore).toBe(true);
  });
  it('来源身份和采集上下文变化进入派生指纹', () => {
    const { source, window } = periodViewFixture();
    const before = buildMarketPeriodView(source, window).visible.series.inputFingerprint;
    source.provenance.providerId = 'another-controlled-provider';
    const next = buildMarketPeriodView(source, window).visible.series.inputFingerprint;
    expect(next).not.toBe(before);
    source.chartContextV3!.acquisitionFingerprint = 'b'.repeat(64);
    expect(buildMarketPeriodView(source, window).visible.series.inputFingerprint).not.toBe(next);
  });
  it('评估时刻的微秒不得早于依据，微秒变化也进入指纹', () => {
    const { source, window } = periodViewFixture();
    window.evaluationAsOf = '2026-10-03T00:00:00.000321Z';
    const before = buildMarketPeriodView(source, window).visible.series;
    expect(before.derivation.evaluationAsOf).toBe(window.evaluationAsOf);
    expect(before.points.at(-1)!.availableAt).toBe(window.evaluationAsOf);
    window.evaluationAsOf = '2026-10-03T00:00:00.000322Z';
    expect(buildMarketPeriodView(source, window).visible.series.inputFingerprint).not.toBe(
      before.inputFingerprint,
    );
    window.evaluationAsOf = '2026-10-03T00:00:00.000320Z';
    expect(() => buildMarketPeriodView(source, window)).toThrow();
  });
  it('拒绝没有现行采集上下文或窗口外日线', () => {
    const { source, window } = periodViewFixture();
    const missing = { ...source, chartContextV3: undefined };
    expect(() => buildMarketPeriodView(missing, window)).toThrow();
    source.points[0]!.timestamp = '2020-01-02T07:00:00.000Z';
    source.points[0]!.availableAt = '2020-01-02T07:00:00.000Z';
    refreshSourceFingerprint(source);
    expect(() => buildMarketPeriodView(source, window)).toThrow('实际基础日线超出规划窗口');
  });
  it.each([
    'MUTUAL_FUND',
    'INDEX',
    '1m',
    'basis',
    'fingerprint',
    'future-basis',
    'future-point',
    'future-calendar',
  ] as const)('拒绝不匹配或未来输入 %s', (kind) => {
    const { source, window } = periodViewFixture();
    if (kind === 'MUTUAL_FUND' || kind === 'INDEX') source.identity.assetType = kind;
    if (kind === '1m') source.identity.timeframe = '1m';
    if (kind === 'basis') source.chartContextV3!.sourcePriceBasis.adjustment = 'none';
    if (kind === 'fingerprint') source.points[0]!.volume = source.points[0]!.volume! + 1;
    if (kind === 'future-basis')
      source.chartContextV3!.sourcePriceBasis.observedAt = '2026-10-04T00:00:00.000001Z';
    if (kind === 'future-point') {
      source.points[0]!.availableAt = '2026-10-04T00:00:00.000001Z';
      refreshSourceFingerprint(source);
    }
    if (kind === 'future-calendar') window.calendar.availableAt = '2026-10-04T00:00:00.000001Z';
    expect(() => buildMarketPeriodView(source, window)).toThrow();
  });
});
