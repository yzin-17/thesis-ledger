import { describe, expect, it, vi } from 'vitest';
import { RiskService } from '../../src/risk/risk.service.js';
import { StrategyRiskContextService } from '../../src/risk/strategy-risk-context.service.js';
import { StrategyRiskRuntimeService } from '../../src/risk/strategy-risk-runtime.service.js';

const accountId = '11111111-1111-4111-8111-111111111111';
const applicationId = '22222222-2222-4222-8222-222222222222';
const evaluatedAt = new Date('2026-09-11T08:00:00.000Z');

const storedBar = (timestamp: string, close: string, fetchedAt = timestamp) => ({
  id: 1n,
  symbol: '600519.SH',
  timeframe: '1m',
  timestamp: new Date(timestamp),
  open: { toString: () => close },
  high: { toString: () => close },
  low: { toString: () => close },
  close: { toString: () => close },
  volume: { toString: () => '100' },
  amount: { toString: () => '10000' },
  provider: 'fixture',
  upstreamSource: null,
  fetchedAt: new Date(fetchedAt),
  freshness: 'live',
  fallbackUsed: false,
});

describe('统一策略风险运行时', () => {
  it('策略规则由 RiskService 分派到 Strategy evaluator，并复用 RiskEvent/Notification 管线', async () => {
    const stored = {
      id: 'rule-strategy',
      version: 1,
      kind: 'cost-stop',
      scope: 'security',
      severity: 'warning',
      threshold: '-0.08',
      enabled: true,
      needsRepair: false,
      repairReason: null,
      symbol: '600519.SH',
      accountId,
      sourcePlanId: applicationId,
      parameters: { applicationRevision: 1 },
    };
    const ruleService = { listEnabledRules: vi.fn(async () => [stored]) };
    const contextService = {
      prepare: vi.fn(async () => ({ security: [], accounts: [], allowStale: false })),
    };
    const eventService = { persist: vi.fn(async () => ({ eventId: 'event-1', created: true })) };
    const strategyRuntime = {
      evaluateStoredRule: vi.fn(async () => ({
        application: {
          id: applicationId,
          accountId,
          symbol: '600519.SH',
          revision: 1,
          cycleMode: 'existingAndFuture',
          cycleAnchor: null,
          enabled: true,
          notification: { enabled: true, cooldownMinutes: 45 },
        },
        evaluation: { sourceKey: 'risk:0:fixedStop', state: 'triggered', value: '-0.08', threshold: '-0.08' },
        candidate: {
          scope: 'security',
          mode: 'actual',
          marketTime: '2026-09-11T08:00:00.000Z',
          dataQuality: { source: 'strategy-monitoring' },
          symbol: '600519.SH',
          accountId,
          domain: { symbol: '600519.SH', accountId, marketTime: '2026-09-11T08:00:00.000Z' },
        },
        event: {
          id: 'runtime-event',
          ruleId: 'rule-strategy',
          triggered: true,
          severity: 'warning',
          message: '600519.SH · 成本止损 已触发',
          evaluatedAt: '2026-09-11T08:00:00.000Z',
          context: {
            value: -0.08,
            reference: -0.08,
            symbol: '600519.SH',
            accountId,
            marketTime: '2026-09-11T08:00:00.000Z',
            inputs: {},
          },
        },
        notification: { enabled: true, cooldownMinutes: 45 },
      })),
    };
    const notifications = {
      enqueue: vi.fn(async () => []),
      subjectDeliveryStatus: vi.fn(async () => ({ shouldRetry: false })),
    };
    const service = new RiskService(
      {} as never,
      notifications as never,
      ruleService as never,
      contextService as never,
      eventService as never,
      strategyRuntime as never,
    );

    const result = await service.scan({ contexts: [] }, { evaluatedAt });

    expect(strategyRuntime.evaluateStoredRule).toHaveBeenCalledWith(stored, evaluatedAt);
    expect(eventService.persist).toHaveBeenCalledOnce();
    expect(notifications.enqueue).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      expect.objectContaining({ cooldownMinutes: 45 }),
    );
    expect(result.results).toEqual([{ ruleId: 'rule-strategy', eventId: 'event-1' }]);
  });

  it('shadow 扫描不重复评价只属于实际账户的策略来源规则', async () => {
    const stored = {
      id: 'rule-strategy',
      version: 1,
      kind: 'cost-stop',
      scope: 'security',
      severity: 'warning',
      threshold: '-0.08',
      enabled: true,
      needsRepair: false,
      repairReason: null,
      symbol: '600519.SH',
      accountId,
      sourcePlanId: applicationId,
    };
    const strategyRuntime = { evaluateStoredRule: vi.fn() };
    const service = new RiskService(
      {} as never,
      { enqueue: vi.fn(), subjectDeliveryStatus: vi.fn() } as never,
      { listEnabledRules: vi.fn(async () => [stored]) } as never,
      { prepare: vi.fn(async () => ({ security: [], accounts: [], allowStale: false })) } as never,
      { persist: vi.fn() } as never,
      strategyRuntime as never,
    );

    const result = await service.scan(
      { contexts: [] },
      { evaluatedAt, includeStrategyRules: false },
    );

    expect(strategyRuntime.evaluateStoredRule).not.toHaveBeenCalled();
    expect(result.results).toEqual([]);
  });

  it('策略上下文只读取已在评价时点闭合且可用的 MarketBar，不依赖实时 quote', async () => {
    const prisma = {
      account: { findUnique: vi.fn(async () => ({ active: true })) },
      position: {
        findUnique: vi.fn(async () => ({
          id: 'position-1',
          quantity: { toString: () => '100' },
          costPrice: { toString: () => '100' },
        })),
      },
      trade: { findFirst: vi.fn(async () => null) },
      marketBar: {
        findMany: vi.fn(async () => [storedBar('2026-09-10T00:00:00.000Z', '92', '2026-09-10T08:01:00.000Z')]),
      },
    };
    const service = new StrategyRiskContextService(prisma as never);

    const actual = await service.load(
      accountId,
      '600519.SH',
      { executionInstrument: { symbol: '600519.SH', assetType: 'stock', market: 'CN' }, primaryTimeframe: '1d' },
      evaluatedAt,
    );

    expect(prisma.marketBar.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ symbol: '600519.SH', timeframe: '1d' }),
        take: 64,
      }),
    );
    expect(actual.context).toMatchObject({ price: '92', averageCost: '100' });
    expect(actual.context.holdingPeriods).toBeUndefined();
  });

  it('日线盘中已有当日数据时仍回退到上一根已闭合日线', async () => {
    const intraday = new Date('2026-09-11T06:00:00.000Z');
    const prisma = {
      account: { findUnique: vi.fn(async () => ({ active: true })) },
      position: {
        findUnique: vi.fn(async () => ({
          id: 'position-1',
          quantity: { toString: () => '100' },
          costPrice: { toString: () => '100' },
        })),
      },
      trade: { findFirst: vi.fn(async () => null) },
      marketBar: {
        findMany: vi.fn(async () => [
          storedBar('2026-09-11T00:00:00.000Z', '80', '2026-09-11T05:30:00.000Z'),
          storedBar('2026-09-10T00:00:00.000Z', '95', '2026-09-10T08:01:00.000Z'),
        ]),
      },
    };
    const service = new StrategyRiskContextService(prisma as never);

    const actual = await service.load(
      accountId,
      '600519.SH',
      { executionInstrument: { symbol: '600519.SH', assetType: 'stock', market: 'CN' }, primaryTimeframe: '1d' },
      intraday,
    );

    expect(actual.context.price).toBe('95');
    expect(actual.context.occurredAt).toBe('2026-09-10T00:00:00.000Z');
  });

  it('5m 策略复用 V2 1m 聚合语义，不要求持久化派生 Bar', async () => {
    const minuteBars = [
      ['2026-09-11T01:30:00.000Z', '100'],
      ['2026-09-11T01:31:00.000Z', '101'],
      ['2026-09-11T01:32:00.000Z', '102'],
      ['2026-09-11T01:33:00.000Z', '103'],
      ['2026-09-11T01:34:00.000Z', '104'],
    ].map(([timestamp, close]) => storedBar(timestamp!, close!, '2026-09-11T01:35:00.000Z'));
    const prisma = {
      account: { findUnique: vi.fn(async () => ({ active: true })) },
      position: {
        findUnique: vi.fn(async () => ({
          id: 'position-1',
          quantity: { toString: () => '100' },
          costPrice: { toString: () => '100' },
        })),
      },
      trade: { findFirst: vi.fn(async () => null) },
      marketBar: { findMany: vi.fn(async () => minuteBars) },
    };
    const service = new StrategyRiskContextService(prisma as never);

    const actual = await service.load(
      accountId,
      '600519.SH',
      { executionInstrument: { symbol: '600519.SH', assetType: 'stock', market: 'CN' }, primaryTimeframe: '5m' },
      new Date('2026-09-11T01:35:01.000Z'),
    );

    expect(prisma.marketBar.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ timeframe: '1m' }) }),
    );
    expect(actual.context.price).toBe('104');
    expect(actual.context.occurredAt).toBe('2026-09-11T01:35:00.000Z');
  });

  it('策略 fixedStop 在等于阈值时仍按 V2 Monitoring 语义触发', async () => {
    const prisma = {
      $queryRaw: vi.fn(async () => [
        {
          id: applicationId,
          accountId,
          symbol: '600519.SH',
          revision: 1,
          cycleMode: 'existingAndFuture',
          cycleAnchor: null,
          enabled: true,
          notification: { enabled: true, cooldownMinutes: 60 },
        },
      ]),
      asset: { findUnique: vi.fn(async () => ({ assetType: 'stock', market: 'CN' })) },
    };
    const contexts = {
      load: vi.fn(async () => ({
        positionId: 'position-1',
        tradeId: 'trade-1',
        openedAt: '2026-09-01T00:00:00.000Z',
        context: {
          quantity: '100',
          averageCost: '100',
          price: '92',
          holdingPeriods: 5,
          occurredAt: '2026-09-10T08:00:00.000Z',
          availableAt: '2026-09-10T08:01:00.000Z',
        },
      })),
    };
    const runtime = new StrategyRiskRuntimeService(prisma as never, contexts as never);
    const result = await runtime.evaluateStoredRule({
      id: 'rule-strategy',
      version: 1,
      kind: 'cost-stop',
      scope: 'security',
      severity: 'warning',
      threshold: '-0.08',
      enabled: true,
      needsRepair: false,
      repairReason: null,
      symbol: '600519.SH',
      accountId,
      sourcePlanId: applicationId,
      parameters: { applicationRevision: 1 },
      config: {
        sourceKey: 'risk:0:fixedStop',
        sourceRiskIndex: 0,
        semanticVersion: 'strategy-monitoring-v1',
        kind: 'cost-stop',
        label: '成本止损',
        metric: 'priceToAverageCostReturn',
        operator: 'lte',
        threshold: '-0.08',
        evaluationTimeframe: '1d',
        costBasisPolicy: 'account-projection-average-cost-including-known-fees',
      },
    });

    expect(contexts.load).toHaveBeenCalledWith(
      accountId,
      '600519.SH',
      expect.objectContaining({ primaryTimeframe: '1d', requiresHoldingPeriods: false }),
      expect.any(Date),
    );
    expect(result.evaluation).toMatchObject({ state: 'triggered', value: '-0.08' });
    expect(result.event).toMatchObject({ triggered: true });
  });
});
