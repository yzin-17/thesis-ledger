import { describe, expect, it, vi } from 'vitest';
import {
  concentrationGroups,
  deriveAccountContexts,
  derivePortfolioContext,
} from '../../src/risk/risk-context-aggregation.js';
import type { SecurityContext } from '../../src/risk/risk-types.js';
import { RiskEventService } from '../../src/risk/risk-event.service.js';

const accountA = '10000000-0000-4000-8000-000000000001';
const accountB = '10000000-0000-4000-8000-000000000002';
const row = (patch: Partial<SecurityContext> = {}): SecurityContext => ({
  symbol: 'TEST.US',
  accountId: accountA,
  mode: 'actual',
  marketTime: '2026-11-07T00:00:00Z',
  dataQuality: {},
  ...patch,
});

describe('风险上下文的科学计数权重', () => {
  it.each([1e-9, Number.MIN_VALUE])('同代码跨账户权重 %s 保持非零合并', (weight) => {
    const contexts = [row({ weight }), row({ accountId: accountB, weight })];
    expect(concentrationGroups(contexts)).toMatchObject([
      { weight: weight * 2, affectedAccountIds: [accountA, accountB] },
    ]);
    expect(derivePortfolioContext(contexts)?.positions).toEqual([
      { symbol: 'TEST.US', weight: weight * 2 },
    ]);
  });

  it('账户派生使用账户内权重，组合仍使用组合权重', () => {
    const contexts = [
      row({ weight: 1e-9, accountWeight: 2e-9, dataQuality: { accountWeight: 'live' } }),
      row({ weight: 2e-9, accountWeight: 3e-9, dataQuality: { accountWeight: 'live' } }),
    ];
    expect(deriveAccountContexts(contexts)[0]?.positions).toEqual([
      { symbol: 'TEST.US', weight: 5e-9 },
    ]);
    expect(derivePortfolioContext(contexts)?.positions).toEqual([
      { symbol: 'TEST.US', weight: 3e-9 },
    ]);
  });

  it('汇总不截断超过 100% 的原值，并保留缺失权重语义', () => {
    const contexts = [row({ weight: 0.6 }), row({ weight: 0.4000000000000002 })];
    expect(derivePortfolioContext(contexts)?.positions).toEqual([{ symbol: 'TEST.US', weight: 1.0000000000000002 }]);
    expect(concentrationGroups([row({ weight: 1e-9 }), row()])[0]?.weight).toBeUndefined();
    expect(derivePortfolioContext([])).toBeUndefined();
  });

  it('历史事件按冻结消息读取，不重新格式化旧阈值', async () => {
    const historical = Object.freeze({
      id: 'historical-event',
      message: 'TEST.US · 历史标的 · 成本止损 0% 已触发',
      threshold: 1e-9,
      context: Object.freeze({ accountName: '历史账户' }),
    });
    const findMany = vi.fn(async () => [historical]);
    const service = new RiskEventService({ riskEvent: { findMany } } as never, {} as never);
    const events = await service.history();
    expect(events[0]).toBe(historical);
    expect(events[0]?.message).toBe('TEST.US · 历史标的 · 成本止损 0% 已触发');
  });
});
