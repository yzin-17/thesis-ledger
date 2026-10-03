import { describe, expect, it } from 'vitest';
import {
  checkPointInTime,
  parameterGrid,
  periodMetrics,
  splitSample,
  tradeMetrics,
  walkForwardWindows,
} from '../src/index.js';

describe('回测分析', () => {
  it('严格切分样本内外', () =>
    expect(splitSample([{ date: '2025-01-01' }, { date: '2025-02-01' }], '2025-01-15')).toEqual({
      inSample: [{ date: '2025-01-01' }],
      outOfSample: [{ date: '2025-02-01' }],
    }));
  it('生成 Walk Forward 窗口', () =>
    expect(walkForwardWindows(['1', '2', '3', '4', '5'], 3, 1)).toHaveLength(2));
  it('生成参数笛卡尔积', () =>
    expect(parameterGrid({ fast: [5, 10], slow: [20, 30] })).toHaveLength(4));
  it('计算 period 指标', () =>
    expect(periodMetrics([0.1, -0.05]).cumulativeReturn).toBeCloseTo(0.045));
  it('区分逐笔胜率和 period 指标', () =>
    expect(
      tradeMetrics([
        { pnl: 2, holdingDays: 2, turnover: 1 },
        { pnl: -1, holdingDays: 4, turnover: 2 },
      ]),
    ).toEqual({
      tradeCount: 2,
      tradeWinRate: 0.5,
      profitLossRatio: 2,
      averageHoldingDays: 3,
      turnover: 3,
    }));
  it('拒绝使用决策时点之后的数据', () =>
    expect(checkPointInTime([{ availableAt: '2025-02-01' }], '2025-01-01')).toBe(false));
});
