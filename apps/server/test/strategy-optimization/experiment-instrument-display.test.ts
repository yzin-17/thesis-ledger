import type { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { optimizationExperimentInstrumentLabel } from '@thesis-ledger/schemas';
import { StrategyOptimizationReadService } from '../../src/strategy-optimization/strategy-optimization-read.service.js';
import { ResultReadPolicyService } from '../../src/platform/result-read-policy.service.js';
import type { ExperimentReadRow } from '../../src/strategy-optimization/strategy-optimization-common.js';

const row = (symbol = '300058.SZ', extra: Record<string, unknown> = {}) =>
  ({
    id: '11111111-1111-4111-8111-111111111111',
    name: '保留用户实验名',
    sourceMode: 'discovery',
    discoveryScope: {
      executionInstrument: { symbol, market: 'CN', assetType: 'stock' },
      primaryTimeframe: '1d',
    },
    baselineStrategyVersionId: '22222222-2222-4222-8222-222222222222',
    runConfig: {},
    modelConfig: [],
    budget: {},
    costUsed: 0,
    exposure: null,
    testExposedAt: null,
    createdAt: new Date('2026-11-11T00:00:00Z'),
    updatedAt: new Date('2026-11-11T00:00:00Z'),
    ...extra,
  }) as unknown as ExperimentReadRow;
const catalog = (symbol: string, displayName: string) => {
  const index = symbol.lastIndexOf('.');
  return {
    id: symbol,
    canonicalCode: symbol.slice(0, index),
    market: symbol.slice(index + 1),
    displayName,
    instrumentType: 'STOCK',
    generation: 9,
    active: true,
    updatedAt: new Date('2026-11-11T00:00:00Z'),
  };
};
function setup(rows: ExperimentReadRow[], entries = [catalog('300058.SZ', '蓝色光标')]) {
  const prisma = {
    $queryRaw: vi.fn(async (query: Prisma.Sql) =>
      query.sql.includes('COUNT(*)') ? [{ count: BigInt(rows.length) }] : rows,
    ),
    instrument: { findMany: vi.fn().mockResolvedValue(entries) },
    catalogSyncState: { findUnique: vi.fn().mockResolvedValue({ generation: 9 }) },
    asset: { findMany: vi.fn().mockRejectedValue(Error('旧 Asset 名称不可用于当前展示')) },
  };
  return {
    prisma,
    service: new StrategyOptimizationReadService(
      prisma as never,
      {} as never,
      new ResultReadPolicyService(prisma as never),
    ),
  };
}
describe('实验的当前标的目录投影', () => {
  it('列表按完整代码去重后一次批量查名，各市场名称独立，历史内容不变', async () => {
    const rows = [row(), row(), row('300058.HK')];
    const before = structuredClone(rows);
    const { prisma, service } = setup(rows, [
      catalog('300058.SZ', '蓝色光标'),
      catalog('300058.HK', '同代码港股样本'),
    ]);
    const page = await service.list();
    expect(prisma.instrument.findMany).toHaveBeenCalledOnce();
    expect(prisma.instrument.findMany.mock.calls[0]?.[0].where.OR).toHaveLength(2);
    expect(page.items.map(optimizationExperimentInstrumentLabel)).toEqual([
      '蓝色光标 · 300058.SZ',
      '蓝色光标 · 300058.SZ',
      '同代码港股样本 · 300058.HK',
    ]);
    expect(page.items.every((item) => item.instrumentDirectory?.items.length === 1)).toBe(true);
    expect(page.items[0]?.name).toBe('保留用户实验名');
    expect(prisma.asset.findMany).not.toHaveBeenCalled();
    expect(rows).toEqual(before);
  });
  it('已有策略的基线代码和从零探索详情都使用统一目录', async () => {
    const existing = row('', {
      sourceMode: 'existing',
      baselineStrategySchema: { executionInstrument: { symbol: '600519.SH', name: '旧名称' } },
      strategyId: '33333333-3333-4333-8333-333333333333',
      strategyName: '旧策略名',
      strategyVersion: 1,
      strategySchemaVersion: 3,
    });
    const { service } = setup([existing], [catalog('600519.SH', '贵州茅台')]);
    const result = await service.experiment(existing.id);
    expect(optimizationExperimentInstrumentLabel(result)).toBe('贵州茅台 · 600519.SH');
    expect(existing.baselineStrategySchema).toMatchObject({
      executionInstrument: { name: '旧名称' },
    });
  });
  it.each(['missing', 'error', 'ambiguous'])('目录 %s 时保留业务结果并回退代码', async (mode) => {
    const entries =
      mode === 'ambiguous' ? [catalog('300058.SZ', '名称甲'), catalog('300058.SZ', '名称乙')] : [];
    const { prisma, service } = setup([row()], entries);
    if (mode === 'error') prisma.instrument.findMany.mockRejectedValue(Error('目录受控失败'));
    const result = await service.experiment('11111111-1111-4111-8111-111111111111');
    expect(optimizationExperimentInstrumentLabel(result)).toBe('300058.SZ');
    expect(result.name).toBe('保留用户实验名');
  });
});
