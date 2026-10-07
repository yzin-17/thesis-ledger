import { BadRequestException } from '@nestjs/common';
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

  it('将百分比风险规则按真实账户平均成本解释并重新编译', async () => {
    const strategy = createStrategyFixture(symbol, '真实账户成本重编译')('0.08');
    strategy.exit = {
      type: 'compare',
      operator: 'lte',
      left: { type: 'series', sourceId: strategy.signalSources[0]!.id, field: 'close' },
      right: { type: 'constant', value: '1.5' },
    };
    strategy.sizing = { type: 'fixedQuantity', quantity: '1000000' };
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
        positionId: 'position-actual',
        context: { quantity: '10', averageCost: '200', price: '184' },
      })),
    };
    const storeWrites = {
      insertApplication: vi.fn(),
      createFrozenRules: vi.fn(),
      audit: vi.fn(),
    };
    const service = new StrategyRiskApplicationService(
      prisma as never,
      contexts as never,
      storeWrites as never,
      {} as never,
    );

    const result = await service.preview({
      strategyVersionId,
      accountId,
      symbol,
      cycleMode: 'existingAndFuture',
    });

    expect(result.plan.rules).toEqual([
      expect.objectContaining({
        kind: 'cost-stop',
        metric: 'priceToAverageCostReturn',
        operator: 'lte',
        threshold: '-0.08',
        costBasisPolicy: 'account-projection-average-cost-including-known-fees',
      }),
    ]);
    expect(result.evaluations).toEqual([
      expect.objectContaining({ state: 'triggered', value: '-0.08', threshold: '-0.08' }),
    ]);
    expect(contexts.load).toHaveBeenCalledWith(accountId, symbol, strategy);
    expect(result.plan.coverage.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: 'exit', status: 'unsupported' }),
        expect.objectContaining({ source: 'sizing', status: 'not_risk' }),
      ]),
    );
    expect(JSON.stringify(result.plan.rules)).not.toContain('1.5');
    expect(JSON.stringify(result.plan.rules)).not.toContain('1000000');
    expect(storeWrites.insertApplication).not.toHaveBeenCalled();
    expect(storeWrites.createFrozenRules).not.toHaveBeenCalled();
    expect(storeWrites.audit).not.toHaveBeenCalled();
  });

  it.each([
    ['绝对价格风险规则', { type: 'absoluteStopPrice', price: '92' }],
    ['带归一化绝对价格的止损规则', { type: 'fixedStop', percent: '0.08', price: '92' }],
    ['归一化数量风险规则', { type: 'fixedQuantity', quantity: '100' }],
  ])('直接 API 不能采纳%s', async (_label, riskRule) => {
    const validStrategy = createStrategyFixture(symbol, '拒绝未转换归一化规则')('0.08');
    const invalidStrategy = { ...validStrategy, risk: [riskRule] } as unknown;
    const prisma = {
      strategyVersion: {
        findUnique: vi.fn(async () => ({
          id: strategyVersionId,
          strategyId: '33333333-3333-4333-8333-333333333333',
          version: 1,
          schemaVersion: 2,
          schema: invalidStrategy,
        })),
      },
    };
    const contexts = { load: vi.fn() };
    const store = {
      findByIdempotencyKey: vi.fn(async () => null),
      insertApplication: vi.fn(),
      createFrozenRules: vi.fn(),
      audit: vi.fn(),
    };
    const service = new StrategyRiskApplicationService(
      prisma as never,
      contexts as never,
      store as never,
      {} as never,
    );

    const error = await service
      .create({
        strategyVersionId,
        accountId,
        symbol,
        cycleMode: 'existingAndFuture',
        previewHash: 'preview-hash',
        idempotencyKey: `direct-api-${_label}`,
        enabled: true,
      })
      .catch((value: unknown) => value);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      errorCode: 'STRATEGY_RISK_APPLICATION_INVALID_STRATEGY',
    });
    expect(contexts.load).not.toHaveBeenCalled();
    expect(store.insertApplication).not.toHaveBeenCalled();
    expect(store.createFrozenRules).not.toHaveBeenCalled();
    expect(store.audit).not.toHaveBeenCalled();
  });
});
