import { describe, expect, it } from 'vitest';
import {
  behaviorMetrics,
  counterfactualStop,
  detectBehavior,
  extractShadowStrategy,
  holdingPeriodMetrics,
  plannedVsActual,
  positionDeviation,
  tradingActivityMetrics,
  plannedVsActualStop,
  counterfactualReplay,
  reviewWindow,
} from '../src/index.js';

describe('复盘与反事实', () => {
  const trade = {
    symbol: '600519.SH',
    entryAt: '2025-01-01',
    exitAt: '2025-01-05',
    pnl: -20,
    entryPrice: 10,
    actualExit: 9,
    plannedStop: 9.5,
  };
  it('识别计划止损触发与延迟执行', () =>
    expect(
      plannedVsActualStop(
        {
          triggeredAt: '2025-01-02',
          plannedStop: 9.5,
          actualExitAt: '2025-01-05',
          actualExitPrice: 9,
        },
        -20,
      ),
    ).toMatchObject({ executed: true, delayDays: 3, plannedStop: 9.5 }));
  it('反事实结果保留假设并与真实收益分开', () =>
    expect(
      counterfactualReplay({ trades: [trade], enforceStop: true, stopPrice: 9.5 }),
    ).toMatchObject({
      actualPnl: -20,
      counterfactualPnl: -0.5,
      assumptions: { enforceStop: true },
    }));
  it('周期复盘只包含窗口内交易', () =>
    expect(reviewWindow({ trades: [trade], start: '2025-01-01', end: '2025-01-04' })).toMatchObject(
      {
        tradeCount: 0,
        start: '2025-01-01',
      },
    ));
});

describe('行为指标', () => {
  it('计算胜率、盈亏比、持有期和未执行止损', () =>
    expect(
      behaviorMetrics([
        {
          symbol: 'A',
          entryAt: '2025-01-01',
          exitAt: '2025-01-11',
          pnl: 20,
          plannedStop: 9,
          actualExit: 8,
        },
        { symbol: 'B', entryAt: '2025-01-01', exitAt: '2025-01-06', pnl: -10 },
      ]),
    ).toEqual({ winRate: 0.5, profitLossRatio: 2, averageHoldingDays: 7.5, missedStops: 1 }));
});

describe('行为分析与反事实', () => {
  const trade = {
    symbol: 'A',
    entryAt: '2025-01-01',
    exitAt: '2025-01-10',
    pnl: -10,
    plannedStop: 9,
    actualExit: 8,
  };
  it('行为标签保存证据', () =>
    expect(detectBehavior(trade, { recentTradeCount: 12, entryGapRatio: 0.06 })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'missed-stop', detected: true }),
        expect.objectContaining({ label: 'overtrading', detected: true }),
        expect.objectContaining({ label: 'chasing', detected: true }),
      ]),
    ));
  it('数据不足时不强行判断', () =>
    expect(detectBehavior({ ...trade, plannedStop: undefined }, {})[0]).toMatchObject({
      detected: null,
      reason: 'insufficient data',
    }));
  it('Shadow 只生成研究候选', () =>
    expect(extractShadowStrategy([trade]).kind).toBe('research-candidate'));
  it('反事实区分实际与假设收益', () =>
    expect(counterfactualStop(trade, -10, -5)).toMatchObject({
      actualPnl: -10,
      counterfactualPnl: -5,
      difference: 5,
    }));
  it('比较计划与实际价格、周期和仓位偏差', () => {
    const plannedTrade = {
      symbol: 'A',
      entryAt: '2025-01-01',
      exitAt: '2025-01-11',
      pnl: 10,
      plannedEntry: 10,
      entryPrice: 11,
      plannedExit: 15,
      exitPrice: 14,
      plannedHoldingDays: 8,
      targetWeight: 0.1,
      peakWeight: 0.25,
      turnover: 1000,
    };
    expect(plannedVsActual(plannedTrade)).toMatchObject({
      entryDeviation: 1,
      entryDeviationRatio: 0.1,
      exitDeviation: -1,
      holdingDayDeviation: 2,
    });
    expect(positionDeviation(plannedTrade)).toMatchObject({ deviation: 0.15, exceeded: true });
    expect(tradingActivityMetrics([plannedTrade])).toMatchObject({
      tradeCount: 1,
      turnover: 1000,
    });
  });
  it('计算平均与中位持仓周期', () =>
    expect(
      holdingPeriodMetrics([
        { symbol: 'A', entryAt: '2025-01-01', exitAt: '2025-01-03', pnl: 1 },
        { symbol: 'B', entryAt: '2025-01-01', exitAt: '2025-01-07', pnl: -1 },
      ]),
    ).toEqual({ average: 4, median: 4 }));
  it('过早止盈、追涨、锚定和处置效应均保存证据', () => {
    const evidence = detectBehavior(
      {
        symbol: 'A',
        entryAt: '2025-01-01',
        exitAt: '2025-01-02',
        pnl: 1,
        plannedExit: 15,
        actualExit: 12,
      },
      {
        entryGapRatio: 0.06,
        recentTradeCount: 11,
        anchoredPrice: 12,
        referencePrice: 10,
        winnerHoldingDays: 2,
        loserHoldingDays: 8,
      },
    );
    expect(evidence.filter((item) => item.detected).map((item) => item.label)).toEqual([
      'early-profit',
      'overtrading',
      'chasing',
      'anchoring',
      'disposition-effect',
    ]);
    expect(
      evidence
        .filter((item) => item.detected)
        .every((item) => Object.keys(item.evidence).length > 0),
    ).toBe(true);
  });
});
