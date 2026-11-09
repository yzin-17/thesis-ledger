import { describe, expect, it } from 'vitest';
import {
  strategyInstrumentFromDirectory,
  withStrategyExecutionInstrument,
} from '../src/strategy-instrument-selection.js';

describe('策略目录标的身份', () => {
  it.each([
    ['600519.SH', 'SH', 'STOCK', 'CN', 'stock'],
    ['510300.SH', 'SH', 'ETF', 'CN', 'etf'],
    ['000001.SZ', 'SZ', 'STOCK', 'CN', 'stock'],
    ['430047.BJ', 'BJ', 'STOCK', 'CN', 'stock'],
    ['00700.HK', 'HK', 'STOCK', 'HK', 'stock'],
    ['02800.HK', 'HK', 'ETF', 'HK', 'etf'],
    ['AAPL.US', 'US', 'STOCK', 'US', 'stock'],
    ['SPY.US', 'US', 'ETF', 'US', 'etf'],
  ])('从 %s 的目录事实读取市场和类型', (symbol, market, instrumentType, expectedMarket, assetType) => {
    expect(strategyInstrumentFromDirectory({ symbol, market, instrumentType, active: true }, 'exchange'))
      .toEqual({ symbol, market: expectedMarket, assetType });
  });

  it('类型取自目录，不能按代码形状猜测；净值模式保留场外基金范围', () => {
    const item = { symbol: '000001.OF', market: 'OF', instrumentType: 'MUTUAL_FUND', active: true };
    expect(strategyInstrumentFromDirectory(item, 'nav')).toEqual({ symbol: '000001.OF', market: 'CN', assetType: 'fund' });
    expect(strategyInstrumentFromDirectory(item, 'exchange')).toBeNull();
    expect(strategyInstrumentFromDirectory({ ...item, market: 'US' }, 'nav')).toBeNull();
    expect(strategyInstrumentFromDirectory({ ...item, symbol: '510300.SH', market: 'SH', instrumentType: 'STOCK' }, 'exchange')?.assetType).toBe('stock');
  });

  it.each([
    { market: 'UNKNOWN' }, { instrumentType: 'INDEX' }, { instrumentType: 'FUTURE' },
    { active: false }, { symbol: '' },
  ])('拒绝不适用的目录记录 %j', (change) => {
    expect(strategyInstrumentFromDirectory({ symbol: 'AAPL.US', market: 'US', instrumentType: 'STOCK', active: true, ...change }, 'exchange')).toBeNull();
  });

  it('原子同步执行标的与 execution 信号源，保留独立信号源、精度和原定义', () => {
    const identity = { symbol: '600519.SH', market: 'CN', assetType: 'stock' };
    const other = { id: 'benchmark', asset: { symbol: 'SPY.US', market: 'US', assetType: 'etf' }, timeframe: '1d' };
    const original = { executionInstrument: identity, signalSources: [{ id: 'execution', asset: identity, timeframe: '60m', series: ['open', 'close'] }, other], cost: { commissionRate: '0.00030000000000000001' } };
    const before = structuredClone(original);
    const selected = { symbol: '02800.HK', market: 'HK', assetType: 'etf' } as const;
    const result = withStrategyExecutionInstrument(original, selected);
    expect(result).toMatchObject({ executionInstrument: selected, signalSources: [{ id: 'execution', asset: selected, timeframe: '60m', series: ['open', 'close'] }, other], cost: original.cost });
    expect(original).toEqual(before);
    expect((result.signalSources as unknown[])[1]).toBe(other);
    expect(withStrategyExecutionInstrument(result, null)).toMatchObject({ executionInstrument: { symbol: '' }, signalSources: [{ asset: { symbol: '' } }, other] });
  });
});
