import { describe, expect, it, vi } from 'vitest';
import { StrategyRiskContextService } from '../../src/risk/strategy-risk-context.service.js';
import { StrategyRiskApplicationService } from '../../src/strategy-optimization/strategy-risk-application.service.js';
import { createStrategyFixture } from './strategy-optimization-postgres-fixtures.js';

const strategyVersionId = '11111111-1111-4111-8111-111111111111';
const accountId = '22222222-2222-4222-8222-222222222222';
const symbol = '600519.SH';

const harness = (account: unknown) => {
  const prisma = {
    account: { findUnique: vi.fn(async () => account) },
    position: { findUnique: vi.fn(async () => null) },
    trade: { findFirst: vi.fn(async () => null) },
    strategyVersion: {
      findUnique: vi.fn(async () => ({
        id: strategyVersionId,
        strategyId: accountId,
        version: 1,
        schemaVersion: 2,
        schema: createStrategyFixture(symbol, '账户准入预览')('0.05'),
      })),
    },
  };
  const bars = { readV3: vi.fn(async () => ({ status: 'unavailable' })) };
  const writes = { insertApplication: vi.fn(), createFrozenRules: vi.fn(), audit: vi.fn() };
  const contexts = new StrategyRiskContextService(prisma as never, bars as never);
  const service = new StrategyRiskApplicationService(
    prisma as never,
    contexts,
    writes as never,
    {} as never,
  );
  return { prisma, bars, writes, service };
};

describe('实际风险预览的账户准入', () => {
  it.each([
    [
      '现金账户',
      { active: true, mode: 'actual', type: 'cash' },
      '风险应用只支持启用的实际投资账户',
    ],
    [
      '模拟投资账户',
      { active: true, mode: 'shadow', type: 'securities' },
      '风险应用只支持启用的实际投资账户',
    ],
    [
      '模拟现金账户',
      { active: true, mode: 'shadow', type: 'cash' },
      '风险应用只支持启用的实际投资账户',
    ],
    ['停用账户', { active: false, mode: 'actual', type: 'securities' }, '账户已停用'],
    ['不存在的账户', null, '账户不存在'],
  ])('公开预览拒绝%s，且不读取持仓、成交或行情', async (_label, account, message) => {
    const h = harness(account);
    await expect(h.service.preview({ strategyVersionId, accountId, symbol })).rejects.toThrow(
      message,
    );
    expect(h.prisma.position.findUnique).not.toHaveBeenCalled();
    expect(h.prisma.trade.findFirst).not.toHaveBeenCalled();
    expect(h.bars.readV3).not.toHaveBeenCalled();
    expect(h.writes.insertApplication).not.toHaveBeenCalled();
    expect(h.writes.createFrozenRules).not.toHaveBeenCalled();
    expect(h.writes.audit).not.toHaveBeenCalled();
  });

  it.each(['securities', 'fund'])('实际%s账户没有持仓时仍可预览缺口', async (type) => {
    const h = harness({ active: true, mode: 'actual', type });
    const result = await h.service.preview({ strategyVersionId, accountId, symbol });
    expect(result.plan.rules).toHaveLength(1);
    expect(result.evaluations[0]).toMatchObject({
      state: 'unavailable',
      reason: '缺少实际持仓数量',
    });
    expect(h.writes.insertApplication).not.toHaveBeenCalled();
  });
});
