import { describe, expect, it, vi } from 'vitest';
import { compileStrategyMonitoringPlan } from '@thesis-ledger/domain';
import { StrategyRiskMonitoringService } from '../../src/risk/strategy-risk-monitoring.service.js';
import { StrategyRiskApplicationEvaluator } from '../../src/risk/strategy-risk-application-evaluator.js';
import { StrategyRiskRuntimeService } from '../../src/risk/strategy-risk-runtime.service.js';
import { StrategyRiskContextService } from '../../src/risk/strategy-risk-context.service.js';
import { strategyMonitoringIssues } from '../../src/risk/risk-monitoring-projection.js';

const appId = '11111111-1111-4111-8111-111111111111';
const accountId = '22222222-2222-4222-8222-222222222222';
const at = new Date('2026-11-12T08:00:00Z');
const plan = compileStrategyMonitoringPlan(
  {
    executionInstrument: { symbol: '00700.HK' },
    primaryTimeframe: '1d',
    risk: [
      { type: 'fixedStop', percent: '0.03' },
      { type: 'maxHoldingPeriod', periods: 10 },
    ],
  },
  'fixture',
);
const rules = plan.rules.map((config, index) => ({
  id: `33333333-3333-4333-8333-${String(index + 1).padStart(12, '0')}`,
  sourcePlanId: appId,
  version: 1,
  kind: config.kind,
  config,
  enabled: true,
  needsRepair: false,
  repairReason: null,
  scope: 'security',
  severity: 'warning',
  threshold: config.threshold,
  symbol: '00700.HK',
  accountId,
}));
function harness() {
  let clock = at.getTime();
  const values = new Map<string, { value: string; until: number }>();
  const health: Record<string, string> = {};
  const get = (key: string) => {
    const row = values.get(key);
    return row && row.until > clock ? row.value : null;
  };
  const client = {
    get: vi.fn(async (key: string) => get(key)),
    set: vi.fn(async (key: string, value: string, _ex: string, ttl: number, nx?: string) => {
      if (nx === 'NX' && get(key)) return null;
      values.set(key, { value, until: clock + ttl * 1000 });
      return 'OK';
    }),
    hset: vi.fn(async (_key: string, ...fields: string[]) => {
      for (let i = 0; i < fields.length; i += 2) health[fields[i]!] = fields[i + 1]!;
      return 1;
    }),
  };
  const evaluate = vi.fn(async () => ({
    evaluations: plan.rules.map((rule) => ({
      sourceKey: rule.sourceKey,
      threshold: rule.threshold,
      state: 'unavailable',
      reasonCode: 'position_missing',
      reason: '缺少实际持仓数量',
    })),
  }));
  return {
    health,
    evaluate,
    client,
    create: () =>
      new StrategyRiskMonitoringService(
        { evaluateStrategyApplication: evaluate } as never,
        { client } as never,
      ),
    advance: (ms: number) => {
      clock += ms;
      return new Date(clock);
    },
  };
}

describe('策略应用自动监控', () => {
  it('尚无 Asset 记录且无持仓时优先报告持仓缺失，不取行情或改写资产', async () => {
    const db = {
      $queryRaw: async () => [
        {
          id: appId,
          accountId,
          symbol: '00700.HK',
          revision: 1,
          cycleMode: 'existingAndFuture',
          enabled: true,
          notification: { enabled: false },
        },
      ],
      asset: { findUnique: vi.fn(async () => null) },
      account: { findUnique: async () => ({ active: true, mode: 'actual', type: 'fund' }) },
      position: { findUnique: async () => null },
      trade: { findFirst: async () => null },
    };
    const readV3 = vi.fn();
    const runtime = new StrategyRiskRuntimeService(
      db as never,
      new StrategyRiskContextService(db as never, { readV3 } as never),
    );
    const persist = vi.fn();
    const result = await new StrategyRiskApplicationEvaluator(
      runtime,
      { persist } as never,
      {} as never,
    ).evaluate(rules, at, true);
    expect(result.evaluations.every((entry) => entry.reasonCode === 'position_missing')).toBe(true);
    expect(readV3).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
    await expect(runtime.evaluateStoredRule(rules[0]!, at)).rejects.toThrow('标的不存在');
  });
  it('首次执行并展示逐条原因；跨实例和修订保留检查窗口，恢复后清除原因', async () => {
    const h = harness();
    await h.create().runNow(rules, at);
    expect(h.evaluate).toHaveBeenCalledWith(appId, at, {
      background: true,
      ruleIds: rules.map((rule) => rule.id),
    });
    expect(strategyMonitoringIssues(rules, h.health)).toHaveLength(2);
    await h.create().runNow(rules, at);
    expect(h.evaluate).toHaveBeenCalledOnce();
    const revised = rules.map((rule) => ({ ...rule, version: 2 }));
    await h.create().runNow(revised, at);
    expect(
      strategyMonitoringIssues(revised, h.health).every(
        (issue) => issue.reasonCode === 'evaluation_pending',
      ),
    ).toBe(true);
    h.evaluate.mockResolvedValueOnce({
      evaluations: plan.rules.map((rule) => ({
        sourceKey: rule.sourceKey,
        threshold: rule.threshold,
        state: 'not_triggered',
        reasonCode: '',
        reason: '',
      })),
    });
    await h.create().runNow(revised, h.advance(60_000));
    expect(h.evaluate).toHaveBeenCalledTimes(2);
    expect(strategyMonitoringIssues(revised, h.health)).toEqual([]);
    await h.create().runNow([], h.advance(1000));
    expect(h.health.strategyRuleIssues).toBe('[]');
  });
  it('单个应用失败时保留原因并继续其他应用', async () => {
    const h = harness();
    h.evaluate.mockRejectedValueOnce(new Error('受控失败'));
    const other = {
      ...rules[0]!,
      id: '44444444-4444-4444-8444-444444444444',
      sourcePlanId: '55555555-5555-4555-8555-555555555555',
    };
    await h.create().runNow([...rules, other], at);
    expect(h.evaluate).toHaveBeenCalledTimes(2);
    const issues = strategyMonitoringIssues([...rules, other], h.health);
    expect(issues.filter((issue) => issue.reasonCode === 'evaluation_failed')).toHaveLength(2);
    expect(issues.find((issue) => issue.ruleId === other.id)?.reasonCode).toBe('position_missing');
  });
  it('状态投影丢弃旧版本及无效缓存，不访问行情', () => {
    expect(
      strategyMonitoringIssues(rules, { strategyRuleIssues: 'not json' }).every(
        (issue) => issue.state === 'pending',
      ),
    ).toBe(true);
    expect(strategyMonitoringIssues([], { strategyRuleIssues: 'not json' })).toEqual([]);
  });
  it('同一应用复用实际上下文，关闭通知仍评估并持久化风险', async () => {
    const load = vi.fn(async () => ({
      context: { quantity: '100', averageCost: '100', price: '90', holdingPeriods: 10 },
    }));
    const db = {
      $queryRaw: vi.fn(async () => [
        {
          id: appId,
          accountId,
          symbol: '00700.HK',
          revision: 1,
          cycleMode: 'existingAndFuture',
          enabled: true,
          notification: { enabled: false },
        },
      ]),
      asset: { findUnique: vi.fn(async () => ({ assetType: 'stock', market: 'HK' })) },
    };
    const runtime = new StrategyRiskRuntimeService(db as never, { load } as never);
    const persist = vi.fn(async () => ({ eventId: 'event', created: true }));
    const enqueue = vi.fn();
    const evaluator = new StrategyRiskApplicationEvaluator(
      runtime,
      { persist } as never,
      { enqueue } as never,
    );
    const result = await evaluator.evaluate(rules, at, true);
    expect(load).toHaveBeenCalledOnce();
    expect(load).toHaveBeenCalledWith(
      accountId,
      '00700.HK',
      expect.objectContaining({ requiresHoldingPeriods: true }),
      at,
      true,
    );
    expect(result.evaluations.every((entry) => entry.state === 'triggered')).toBe(true);
    expect(persist).toHaveBeenCalledTimes(2);
    expect(
      persist.mock.calls.every(
        (call) => (call as unknown as [unknown, { mode: string }])[1].mode === 'actual',
      ),
    ).toBe(true);
    expect(enqueue).not.toHaveBeenCalled();
  });
});
