import { describe, expect, it, vi } from 'vitest';
import { RiskService } from '../../src/risk/risk.service.js';
import type { StoredRule } from '../../src/risk/risk-types.js';

const accountId = '11111111-1111-4111-8111-111111111111';
const otherAccountId = '22222222-2222-4222-8222-222222222222';
const marketTime = '2026-11-07T12:30:00Z';
const context = {
  symbol: 'TEST.US',
  accountId,
  mode: 'shadow',
  price: 9,
  marketTime,
  dataQuality: {},
};
const rule = (patch: Partial<StoredRule> = {}): StoredRule => ({
  id: 'price-rule',
  version: 1,
  kind: 'price-below',
  scope: 'security',
  severity: 'warning',
  threshold: 10,
  enabled: true,
  needsRepair: false,
  repairReason: null,
  symbol: 'TEST.US',
  accountId: null,
  ...patch,
});
const fixture = (rules: StoredRule[]) => {
  const persist = vi.fn<(...args: unknown[]) => Promise<{ eventId: string; created: boolean }>>(
    async () => ({ eventId: 'controlled-event', created: false }),
  );
  const recordTestAudit = vi.fn();
  const service = new RiskService(
    {} as never,
    {} as never,
    {
      listEnabledRules: vi.fn(async () => rules),
      getRule: vi.fn(async () => rules[0]),
      recordTestAudit,
    } as never,
    undefined,
    { persist } as never,
  );
  return { service, persist, recordTestAudit };
};

describe('仅实际执行的规则检查业务权重', () => {
  it('无启用规则时允许同基金合并超过 100%，不写事件', async () => {
    const { service, persist } = fixture([]);
    const result = await service.scan({
      security: [
        { ...context, weight: 88.02 / 94.04 },
        { ...context, accountId: otherAccountId, weight: 88.02 / 94.04 },
      ],
    });
    expect(result).toMatchObject({ evaluatedRuleCount: 0, results: [] });
    expect(persist).not.toHaveBeenCalled();
  });

  it('价格规则忽略缺失或不可用权重', async () => {
    const { service } = fixture([rule()]);
    const result = await service.scan([
      { ...context, dataQuality: { portfolioWeight: 'unavailable' } },
    ]);
    expect(result.results).toEqual([{ ruleId: 'price-rule', eventId: 'controlled-event' }]);
  });

  it('相关性只依赖收益序列，不因权重不可用拒绝', async () => {
    const { service } = fixture([
      rule({ kind: 'correlation', scope: 'portfolio', symbol: null, threshold: 0.5 }),
    ]);
    const result = await service.scan({
      portfolio: {
        mode: 'shadow',
        marketTime,
        returns: { A: [1, 2, 3], B: [2, 4, 6] },
        dataQuality: { portfolioWeight: 'unavailable' },
      },
    });
    expect(result.results).toEqual([{ ruleId: 'price-rule', eventId: 'controlled-event' }]);
  });

  it('缺失权重只影响集中度规则，价格规则仍写事件', async () => {
    const { service } = fixture([
      rule({ id: 'weight-rule', kind: 'position-concentration' }),
      rule(),
    ]);
    const result = await service.scan([context]);
    expect(result.evaluatedRuleCount).toBe(2);
    expect(result.results).toEqual([
      expect.objectContaining({
        ruleId: 'weight-rule',
        errorCode: 'input-unavailable',
        error: expect.stringContaining('组合持仓权重缺失或无效'),
      }),
      { ruleId: 'price-rule', eventId: 'controlled-event' },
    ]);
  });

  it.each(['sector-concentration', 'asset-concentration', 'volatility-exposure'])(
    '%s 不使用残缺的持仓权重集合',
    async (kind) => {
      const { service } = fixture([rule({ kind, scope: 'portfolio', symbol: null })]);
      const result = await service.scan([
        { ...context, weight: 0.5 },
        { ...context, symbol: 'OTHER.US' },
      ]);
      expect(result.results).toEqual([
        expect.objectContaining({
          errorCode: 'input-unavailable',
          error: expect.stringContaining('组合持仓权重不完整'),
        }),
      ]);
    },
  );

  it('对象不匹配及被扫描选项排除的规则不检查权重', async () => {
    const { service } = fixture([
      rule({ id: 'unmatched', kind: 'position-concentration', symbol: 'OTHER.US' }),
      rule({ id: 'excluded', kind: 'position-concentration' }),
      rule({ id: 'strategy', sourcePlanId: 'controlled-application' }),
    ]);
    expect(
      await service.scan([context], {
        ruleIds: ['unmatched', 'strategy'],
        includeStrategyRules: false,
      }),
    ).toMatchObject({ evaluatedRuleCount: 1, results: [] });
  });

  it('集中度按超过 100% 的真实比例评估，账户权重独立', async () => {
    const { service, persist } = fixture([
      rule({ kind: 'position-concentration', threshold: 1.5 }),
    ]);
    await service.scan([
      { ...context, weight: 0.9359846873670778, accountWeight: 1 },
      { ...context, accountId: otherAccountId, weight: 0.9359846873670778, accountWeight: 1 },
    ]);
    expect(persist.mock.calls[0]?.[2]).toMatchObject({
      triggered: true,
      context: { value: expect.closeTo(1.8719693747341555, 14) },
    });
  });

  it('人工测试缺少权重返回中文原因且不写审计或事件', async () => {
    const { service, persist, recordTestAudit } = fixture([
      rule({ kind: 'position-concentration' }),
    ]);
    await expect(service.testRule('price-rule', [context])).rejects.toMatchObject({
      response: {
        error: 'input-unavailable',
        message: expect.stringContaining('组合持仓权重缺失或无效'),
      },
    });
    expect(persist).not.toHaveBeenCalled();
    expect(recordTestAudit).not.toHaveBeenCalled();
  });
});
