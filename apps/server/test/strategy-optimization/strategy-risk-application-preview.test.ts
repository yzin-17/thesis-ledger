import { describe, expect, it, vi } from 'vitest';
import { StrategyRiskApplicationService } from '../../src/strategy-optimization/strategy-risk-application.service.js';
import { createStrategyFixture } from './strategy-optimization-postgres-fixtures.js';

const strategyVersionId = '11111111-1111-4111-8111-111111111111';
const accountId = '22222222-2222-4222-8222-222222222222';
const symbol = '600519.SH';

describe('StrategyRiskApplicationService preview', () => {
  it('行情暂时不可用时仍返回规则预览，并把依赖价格的判断标记为 unavailable', async () => {
    const strategy = createStrategyFixture(symbol, '行情不可用预览')('0.08');
    const prisma = {
      strategyVersion: {
        findUnique: vi.fn(async () => ({
          id: strategyVersionId,
          strategyId: '33333333-3333-4333-8333-333333333333',
          version: 1,
          schemaVersion: 2,
          schema: strategy,
        })),
      },
    };
    const contexts = {
      load: vi.fn(async () => ({
        positionId: 'position-1',
        context: { quantity: '100', averageCost: '100' },
      })),
    };
    const service = new StrategyRiskApplicationService(
      prisma as never,
      contexts as never,
      {} as never,
      {} as never,
    );

    const result = await service.preview({
      strategyVersionId,
      accountId,
      symbol,
      cycleMode: 'existingAndFuture',
    });

    expect(result.plan.rules).toHaveLength(1);
    expect(result.evaluations).toEqual([
      expect.objectContaining({
        state: 'unavailable',
        reason: '缺少已完成评价时点价格',
      }),
    ]);
    expect(result.context).toEqual({
      positionId: 'position-1',
      tradeId: null,
      openedAt: null,
      occurredAt: null,
      availableAt: null,
    });
  });
});
