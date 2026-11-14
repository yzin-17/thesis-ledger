import { describe, expect, it, vi } from 'vitest';
import { BacktestService } from '../../src/backtest/backtest.service.js';
import { InstrumentDisplayService } from '../../src/market/instruments/instrument-display.service.js';
import { nameStrategyVersions } from '../../src/backtest/strategy-instrument-display.js';
import { displayPrisma } from '../instrument-display.fixture.js';
import { testResultReadPolicy } from './test-result-read-policy.js';

const versions = () => [{ id: 'v1', schema: {
  executionInstrument: { symbol: '000001.OF', name: '旧名' },
  signalSources: [{ asset: { symbol: '000001.SZ' } }, { asset: { symbol: '000001.OF' } }],
} }, { id: 'v2', schema: { executionInstrument: { symbol: '999999.OF' } } }];

describe('策略版本当前标的名称', () => {
  it('列表跨策略批量解析完整代码，名称与定义分别返回', async () => {
    const rows = versions();
    const frozen = structuredClone(rows);
    const prisma = { ...displayPrisma(), strategy: { findMany: vi.fn(async () =>
      rows.map((version, index) => ({ id: `s${index}`, versions: [version] }))) } };
    const service = new BacktestService(prisma as never, undefined, undefined, testResultReadPolicy());
    const result = await service.listStrategies();
    expect(prisma.instrument.findMany).toHaveBeenCalledTimes(1);
    expect(result[0]?.versions[0]?.instrumentDirectory.items.map((item) => item.displayName))
      .toEqual(['华夏成长混合', '平安银行']);
    expect(result[1]?.versions[0]?.instrumentDirectory).toMatchObject({
      items: [], unresolvedSymbols: ['999999.OF'],
    });
    expect(result[0]?.versions[0]?.schema).toEqual(frozen[0]?.schema);
    expect(rows).toEqual(frozen);
    expect(prisma.instrument.findMany.mock.calls[0]?.[0]).toMatchObject({ where: { OR: [
      { canonicalCode: '000001', market: 'OF' }, { canonicalCode: '000001', market: 'SZ' },
      { canonicalCode: '999999', market: 'OF' },
    ] } });
  });

  it('目录故障保留版本和原始定义，全部名称回退代码', async () => {
    const prisma = displayPrisma();
    prisma.instrument.findMany.mockRejectedValueOnce(new Error('目录不可用'));
    const rows = versions();
    const result = await nameStrategyVersions(rows, new InstrumentDisplayService(prisma as never));
    expect(result.map((row) => row.schema)).toEqual(rows.map((row) => row.schema));
    expect(result[0]?.instrumentDirectory).toMatchObject({
      items: [], unresolvedSymbols: ['000001.OF', '000001.SZ'],
    });
  });
});
