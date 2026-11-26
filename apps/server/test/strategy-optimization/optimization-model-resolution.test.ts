import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { OptimizationModelResolution } from '../../src/strategy-optimization/optimization-model-resolution.js';
import { namedStrategyFixture } from '../backtest/named-v1-strategy.fixture.js';

const strategy = namedStrategyFixture(JSON.parse(
  readFileSync(
    new URL('../../../../packages/schemas/fixtures/backtest-v2.exchange.json', import.meta.url),
    'utf8',
  ),
));
const existing = {
  sourceMode: 'existing',
  strategyVersionId: '11111111-1111-4111-8111-111111111111',
};
const settings = {
  startDate: '2025-01-02',
  endDate: '2025-12-31',
  currency: 'CNY',
  adjustment: 'hfq',
};
function setup(schema = strategy) {
  const findUnique = vi.fn(async () => ({ schemaVersion: 1, schema }));
  return {
    findUnique,
    service: new OptimizationModelResolution({ strategyVersion: { findUnique } } as never),
  };
}
function discovery(market = 'CN', assetType = 'stock') {
  return {
    sourceMode: 'discovery',
    discoveryScope: {
      executionInstrument: {
        market,
        assetType,
        symbol: market === 'HK' ? '00700.HK' : '600519.SH',
      },
      primaryTimeframe: '1d',
    },
  };
}
describe('实验自动成交设置', () => {
  it('沿用所选策略成本并生成归一化研究设置，不改写策略', async () => {
    const { service, findUnique } = setup();
    const before = structuredClone(strategy);
    const result = await service.resolve({ ...settings, target: existing });
    expect(result).toMatchObject({
      status: 'available',
      model: {
        scope: {
          symbol: strategy.executionInstrument.symbol,
          currency: 'CNY',
          range: { start: settings.startDate, end: settings.endDate },
        },
        segments: [
          {
            fees: { commission: { rate: strategy.cost.commissionRate } },
            execution: {
              normalizedExecution: { quantityUnits: 'continuous-normalized-decimal' },
            },
          },
        ],
      },
    });
    expect(findUnique).toHaveBeenCalledExactlyOnceWith({
      where: { id: existing.strategyVersionId },
    });
    expect(strategy).toEqual(before);
  });
  it.each([
    ['CN', 'CNY'],
    ['HK', 'HKD'],
    ['US', 'USD'],
  ])('从零探索 %s 不创建策略，明确零成本与假设来源', async (market, currency) => {
    const { service, findUnique } = setup();
    const result = await service.resolve({ ...settings, currency, target: discovery(market) });
    expect(findUnique).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: 'available',
      notes: expect.arrayContaining([expect.stringContaining('零佣金、零滑点')]),
    });
    if (result.status !== 'available') throw Error('应可用');
    expect(result.model.scope.market).toBe(market);
    expect(result.model.segments[0]?.source.references).toContain('app:strategy-space-price-research-v2');
    expect(result.model.segments[0]?.source.references).not.toContain('strategy-version:discovery');
  });
  it('拒绝市场币种不匹配与基金模式', async () => {
    const { service } = setup();
    expect(
      await service.resolve({ ...settings, currency: 'USD', target: discovery() }),
    ).toMatchObject({ status: 'blocked', reasonCode: 'rules-incompatible' });
    expect(await service.resolve({ ...settings, target: discovery('CN', 'fund') })).toMatchObject({
      status: 'blocked',
      reasonCode: 'unsupported-strategy',
    });
  });
  it('无效区间与不复权请求在访问数据库前拒绝', async () => {
    const { service, findUnique } = setup();
    await expect(
      service.resolve({ ...settings, startDate: '2026-01-01', target: existing }),
    ).rejects.toThrow();
    await expect(
      service.resolve({ ...settings, adjustment: 'none', target: existing }),
    ).rejects.toThrow();
    expect(findUnique).not.toHaveBeenCalled();
  });
  it('不存在或失效的策略不能生成设置', async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const service = new OptimizationModelResolution({ strategyVersion: { findUnique } } as never);
    await expect(service.resolve({ ...settings, target: existing })).rejects.toThrow(
      '策略版本不存在',
    );
    findUnique.mockResolvedValue({ schemaVersion: 2, schema: strategy });
    expect(await service.resolve({ ...settings, target: existing })).toMatchObject({
      status: 'blocked',
    });
  });
});
