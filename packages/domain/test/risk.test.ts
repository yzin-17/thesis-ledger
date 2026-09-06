import { describe, expect, it } from 'vitest';
import {
  evaluateV01Rule,
  evaluateCompleteRule,
  concentratedExposure,
  crossed,
  currentDrawdown,
  pearsonCorrelation,
  ratioThreshold,
  trailingStopTriggered,
} from '../src/index.js';

describe('V0.1 风险规则', () => {
  const rule = {
    id: 'r1',
    version: 1,
    scope: 'security' as const,
    severity: 'warning' as const,
    enabled: true,
    threshold: 9,
  };
  it('固定价止损只在严格低于阈值时触发', () => {
    expect(
      evaluateV01Rule({ ...rule, kind: 'fixed-stop' }, { symbol: 'x', price: 8, marketTime: 't' })
        ?.triggered,
    ).toBe(true);
    expect(
      evaluateV01Rule({ ...rule, kind: 'fixed-stop' }, { symbol: 'x', price: 9, marketTime: 't' })
        ?.triggered,
    ).toBe(false);
  });
  it('成本百分比止损由确定性代码计算', () =>
    expect(
      evaluateV01Rule(
        { ...rule, kind: 'cost-stop', threshold: 0.08 },
        { symbol: 'x', price: 91, costPrice: 100, marketTime: 't' },
      )?.triggered,
    ).toBe(true));
  it('成本为零时不误触发', () =>
    expect(
      evaluateV01Rule(
        { ...rule, kind: 'cost-stop' },
        { symbol: 'x', price: 1, costPrice: 0, marketTime: 't' },
      ),
    ).toBeNull());
  it('成本类事件保留持仓生命周期上下文', () => {
    const event = evaluateV01Rule(
      { ...rule, kind: 'take-profit', threshold: 0.1 },
      {
        symbol: 'x',
        accountId: 'account-1',
        positionId: 'position-1',
        quantity: 10,
        positionUpdatedAt: '2025-01-01T00:00:00Z',
        price: 120,
        costPrice: 100,
        marketTime: '2025-01-01T01:00:00Z',
      },
    );
    expect(event?.context).toMatchObject({
      accountId: 'account-1',
      positionId: 'position-1',
      quantity: 10,
      positionUpdatedAt: '2025-01-01T00:00:00Z',
    });
  });
  it('事件名与规则预览保持一致并补全账户名称', () => {
    const event = evaluateV01Rule(
      { ...rule, kind: 'cost-stop', threshold: 0.1 },
      {
        symbol: '159516.SZ',
        accountId: 'account-1',
        accountName: '同花顺',
        assetName: '半导体设备ETF国泰',
        price: 89,
        costPrice: 100,
        marketTime: '2025-01-01T01:00:00Z',
      },
    );
    expect(event?.message).toBe('159516.SZ · 半导体设备ETF国泰 · 同花顺 · 成本止损 10% 已触发');
  });
  it('组合事件使用用户可读的组合名称', () => {
    const event = evaluateCompleteRule(
      { ...rule, kind: 'drawdown', threshold: 0.1 },
      {
        symbol: '@portfolio',
        portfolioValues: [100, 80],
        marketTime: '2025-01-01T01:00:00Z',
      },
    );
    expect(event?.message).toBe('组合 · 回撤 0.1 已触发');
  });
  it('集中度使用同一快照权重', () =>
    expect(
      evaluateV01Rule(
        { ...rule, kind: 'position-concentration', threshold: 0.2 },
        { symbol: 'x', weight: 0.3, marketTime: 't' },
      )?.triggered,
    ).toBe(true));
  it('账户绑定的集中度使用账户内权重', () =>
    expect(
      evaluateV01Rule(
        { ...rule, kind: 'position-concentration', threshold: 0.2, accountId: 'account-1' },
        { symbol: 'x', weight: 0.1, accountWeight: 0.3, accountId: 'account-1', marketTime: 't' },
      )?.triggered,
    ).toBe(true));
  it('事件 metadata 携带 valueMetric 语义标识供客户端渲染数值标签', () => {
    const costEvent = evaluateV01Rule(
      { ...rule, kind: 'cost-stop', threshold: 0.08 },
      { symbol: 'x', price: 91, costPrice: 100, marketTime: 't' },
    );
    expect(costEvent?.context.metadata).toMatchObject({ valueMetric: 'distance_to_cost' });

    const weightEvent = evaluateV01Rule(
      { ...rule, kind: 'position-concentration', threshold: 0.2 },
      { symbol: 'x', weight: 0.3, marketTime: 't' },
    );
    expect(weightEvent?.context.metadata).toMatchObject({ valueMetric: 'weight' });

    const drawdownEvent = evaluateCompleteRule(
      { ...rule, kind: 'drawdown', threshold: 0.1 },
      { symbol: '@portfolio', portfolioValues: [100, 80], marketTime: 't' },
    );
    expect(drawdownEvent?.context.metadata).toMatchObject({ valueMetric: 'drawdown' });

    const fixedStopEvent = evaluateV01Rule(
      { ...rule, kind: 'fixed-stop' },
      { symbol: 'x', price: 8, marketTime: 't' },
    );
    expect(fixedStopEvent?.context.metadata).toBeUndefined();
  });
});

describe('完整风险计算', () => {
  const rule = {
    id: 'rule',
    version: 1,
    scope: 'security' as const,
    severity: 'warning' as const,
    threshold: 0.1,
    enabled: true,
  };
  const context = { symbol: '600519.SH', marketTime: '2025-01-01T01:00:00Z' };
  it('移动止损和回撤使用明确峰值', () => {
    expect(trailingStopTriggered(105, 120, 0.1)).toMatchObject({ triggered: true });
    expect(currentDrawdown([100, 120, 110, 105])).toBeCloseTo(-0.125);
  });
  it('识别 MA/MACD 上下穿边界', () => {
    expect(crossed(9, 10, 11, 10, 'above')).toBe(true);
    expect(crossed(11, 10, 9, 10, 'below')).toBe(true);
    expect(crossed(11, 10, 12, 10, 'below')).toBe(false);
  });
  it('数据不足时波动和量能比例不可用', () => {
    expect(ratioThreshold(5, 0, 2)).toBeNull();
    expect(ratioThreshold(5, 2, 2)).toEqual({ ratio: 2.5, triggered: true });
  });
  it('行业与资产类型集中度暴露覆盖率', () =>
    expect(
      concentratedExposure(
        [{ key: '消费', weight: 0.6 }, { key: '消费', weight: 0.1 }, { weight: 0.3 }],
        0.5,
      ),
    ).toMatchObject({
      coverage: 0.7,
      missingCount: 1,
      exposures: [{ key: '消费', triggered: true }],
    }));
  it('计算组合收益相关性并拒绝历史不足', () => {
    expect(pearsonCorrelation([1, 2, 3], [2, 4, 6])).toBeCloseTo(1);
    expect(pearsonCorrelation([1], [1])).toBeNull();
  });
  it('回归移动止损、组合回撤与数据不足', () => {
    expect(
      evaluateCompleteRule(
        { ...rule, kind: 'trailing-stop' },
        { ...context, price: 105, holdingPeak: 120 },
      )?.triggered,
    ).toBe(true);
    expect(
      evaluateCompleteRule(
        { ...rule, kind: 'drawdown' },
        { ...context, portfolioValues: [100, 120, 105] },
      )?.triggered,
    ).toBe(true);
    expect(evaluateCompleteRule({ ...rule, kind: 'drawdown' }, context)).toBeNull();
  });
  it('回归 MA、RSI 和 MACD 交叉规则', () => {
    expect(
      evaluateCompleteRule(
        { ...rule, kind: 'ma', parameters: { direction: 'above' } },
        { ...context, price: 11, indicators: { ma: 10, previousPrice: 9, previousMa: 10 } },
      )?.triggered,
    ).toBe(true);
    expect(
      evaluateCompleteRule(
        { ...rule, kind: 'rsi', threshold: 70, parameters: { direction: 'above' } },
        { ...context, indicators: { rsi: 71 } },
      )?.triggered,
    ).toBe(true);
    expect(
      evaluateCompleteRule(
        { ...rule, kind: 'macd', parameters: { direction: 'below' } },
        { ...context, indicators: { dif: -1, dea: 0, previousDif: 1, previousDea: 0 } },
      )?.triggered,
    ).toBe(true);
  });
  it('回归 ATR 与成交量异常并拒绝缺失分母', () => {
    expect(
      evaluateCompleteRule(
        { ...rule, kind: 'atr', threshold: 0.05 },
        { ...context, price: 100, indicators: { atr: 6 } },
      )?.triggered,
    ).toBe(true);
    expect(
      evaluateCompleteRule(
        { ...rule, kind: 'volume', threshold: 2 },
        { ...context, indicators: { volume: 500, averageVolume: 100 } },
      )?.triggered,
    ).toBe(true);
    expect(
      evaluateCompleteRule(
        { ...rule, kind: 'volume' },
        { ...context, indicators: { volume: 500, averageVolume: 0 } },
      ),
    ).toBeNull();
  });
  it('回归筹码峰、比例时间一致性与峰值迁移', () => {
    const chip = {
      mainPeak: 100,
      profitRatio: 0.8,
      concentration: 0.7,
      previousMainPeaks: [110],
      engineVersion: 'v1',
      calculatedAt: context.marketTime,
    };
    expect(
      evaluateCompleteRule(
        { ...rule, kind: 'chip-peak', threshold: 0.05 },
        { ...context, price: 90, chip },
      )?.triggered,
    ).toBe(true);
    expect(
      evaluateCompleteRule({ ...rule, kind: 'chip-ratio', threshold: 0.75 }, { ...context, chip })
        ?.triggered,
    ).toBe(true);
    expect(
      evaluateCompleteRule(
        { ...rule, kind: 'chip-ratio' },
        { ...context, chip: { ...chip, calculatedAt: '2025-01-02T01:00:00Z' } },
      ),
    ).toBeNull();
    expect(
      evaluateCompleteRule(
        { ...rule, kind: 'chip-migration', threshold: 0.05 },
        { ...context, chip },
      )?.triggered,
    ).toBe(true);
  });
  it('回归组合集中度、高波动暴露和相关性', () => {
    const positions = [
      { symbol: 'A', weight: 0.6, sector: '消费', assetType: 'stock', volatility: 0.4 },
      { symbol: 'B', weight: 0.2, sector: '消费', assetType: 'stock', volatility: 0.1 },
      { symbol: 'C', weight: 0.2 },
    ];
    expect(
      evaluateCompleteRule(
        { ...rule, kind: 'sector-concentration', threshold: 0.7 },
        { ...context, positions },
      )?.triggered,
    ).toBe(true);
    expect(
      evaluateCompleteRule(
        { ...rule, kind: 'asset-concentration', threshold: 0.7 },
        { ...context, positions },
      )?.context.inputs.coverage,
    ).toBeCloseTo(0.8);
    expect(
      evaluateCompleteRule(
        {
          ...rule,
          kind: 'volatility-exposure',
          threshold: 0.5,
          parameters: { assetThreshold: 0.3 },
        },
        { ...context, positions },
      )?.triggered,
    ).toBe(true);
    expect(
      evaluateCompleteRule(
        { ...rule, kind: 'correlation', threshold: 0.9 },
        { ...context, returns: { A: [1, 2, 3], B: [2, 4, 6], C: [3, 2, 1] } },
      )?.triggered,
    ).toBe(true);
  });
});
