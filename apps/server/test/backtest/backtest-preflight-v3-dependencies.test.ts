import { describe, expect, it, vi } from 'vitest';
import { planBacktestDependencies } from '../../src/backtest/backtest-dependency-plan.js';
import { preflightBacktestDependenciesV3 } from '../../src/backtest/backtest-preflight-v3-dependencies.js';
import { completeSnapshotFixture } from './v3-complete-snapshot-fixtures.js';
import { makeReaderResult } from './v3-snapshot-fixtures.js';
import { tradabilityWindowFromResponseV3 } from '../../src/backtest/backtest-snapshot-v3-tradability.js';

async function fixture() {
  const value = await completeSnapshotFixture();
  const { strategy, runConfig } = value.input;
  const plan = planBacktestDependencies({ strategy, runConfig });
  const tradabilityWindow = await windowFor(strategy, runConfig, plan);
  return { ...value, input: { strategy, runConfig, plan, tradabilityWindow } };
}

async function windowFor(
  strategy: Awaited<ReturnType<typeof completeSnapshotFixture>>['input']['strategy'],
  runConfig: Awaited<ReturnType<typeof completeSnapshotFixture>>['input']['runConfig'],
  plan: ReturnType<typeof planBacktestDependencies>,
) {
  const result = await makeReaderResult({
    symbol: strategy.executionInstrument.symbol,
    market: 'CN',
    routeKey: {
      kind: 'bar',
      market: 'CN',
      assetType: 'ETF',
      capability: 'DAILY_BAR',
      timeframe: '1d',
      adjustment: 'qfq',
    },
    window: { start: plan.warmup.startDate, end: runConfig.endDate },
  });
  if (result.status !== 'selected') throw new Error('fixture 行情不可用');
  return tradabilityWindowFromResponseV3(result.selection.response);
}

describe('非价格依赖只读预检', () => {
  it('事件读取失败通过真实收集接缝保留能力与范围诊断', async () => {
    const h = await fixture();
    h.input.strategy.entry = { type: 'corporateActionEvent', eventType: 'CASH_DIVIDEND' };
    h.input.plan = planBacktestDependencies(h.input);
    h.input.tradabilityWindow = await windowFor(h.input.strategy, h.input.runConfig, h.input.plan);
    const dsa = {
      ...h.dsa,
      effectiveControlPolicyV3: vi.fn(async () => {
        throw new Error('private-control-detail');
      }),
      marketRouteCatalogV3: vi.fn(async () => {
        throw new Error('private-catalog-detail');
      }),
      marketEventsV3: vi.fn(async () => {
        throw new Error('must not read');
      }),
    };
    const result = await preflightBacktestDependenciesV3(
      {
        ...h.input,
        eventRevisions: { desiredRevision: 1, effectivePolicyRevision: 1, catalogRevision: 1 },
      },
      dsa,
    );
    expect(result).toMatchObject([
      {
        capability: 'CASH_DISTRIBUTION',
        purpose: 'corporateActions',
        symbol: h.input.strategy.executionInstrument.symbol,
        routeKey: { capability: 'CASH_DISTRIBUTION' },
        targetSources: [],
        missingFields: ['corporateActions.CASH_DISTRIBUTION.policy_mismatch'],
      },
    ]);
    expect(JSON.stringify(result)).not.toContain('private-');
    expect(dsa.marketEventsV3).not.toHaveBeenCalled();
  });

  it('普通归一化策略仅检查日历和证券事实，不读取行情或事件', async () => {
    const h = await fixture();
    expect(await preflightBacktestDependenciesV3(h.input, h.dsa)).toEqual([]);
    expect(h.dsa.backtestCalendar).toHaveBeenCalledTimes(1);
    expect(h.dsa.backtestInstrumentFacts).toHaveBeenCalledTimes(1);
    expect(h.reader.readV3).not.toHaveBeenCalled();
  });

  it('一次返回多个独立读取失败，保留用途和范围且不泄漏底层异常', async () => {
    const h = await fixture();
    h.dsa.backtestCalendar.mockRejectedValue(new Error('secret-calendar-token'));
    h.dsa.backtestInstrumentFacts.mockRejectedValue(new Error('secret-provider-token'));
    const result = await preflightBacktestDependenciesV3(h.input, h.dsa);
    expect(result.map((item) => item.purpose).sort()).toEqual(['calendar', 'instrumentFacts']);
    expect(result.every((item) => item.dateRange && item.suggestedActions.length > 0)).toBe(true);
    expect(result.find((item) => item.purpose === 'instrumentFacts')?.symbol).toBe(
      h.input.strategy.executionInstrument.symbol,
    );
    expect(JSON.stringify(result)).not.toContain('secret-');
  });

  it('缺失证券事实返回可定位的诊断', async () => {
    const h = await fixture();
    const read = h.dsa.backtestInstrumentFacts.getMockImplementation()!;
    h.dsa.backtestInstrumentFacts.mockImplementation(async (request) => ({
      ...(await read(request)),
      facts: [],
    }));
    expect(await preflightBacktestDependenciesV3(h.input, h.dsa)).toMatchObject([
      {
        purpose: 'instrumentFacts',
        capability: 'INSTRUMENT_FACTS',
        missingFields: ['instrumentFacts.fact_unavailable'],
      },
    ]);
  });

  it('未来日历事实不会被固定行情快照豁免', async () => {
    const h = await fixture();
    const read = h.dsa.backtestCalendar.getMockImplementation()!;
    h.dsa.backtestCalendar.mockImplementation(async (request) => {
      const response = await read(request);
      return {
        ...response,
        facts: response.facts.map((fact) => ({ ...fact, availableAt: '2099-01-01T00:00:00Z' })),
      };
    });
    expect(await preflightBacktestDependenciesV3(h.input, h.dsa)).toMatchObject([
      {
        purpose: 'calendar',
        code: 'FUTURE_DATA',
        category: 'point-in-time-unavailable',
      },
    ]);
  });

  it('事件策略缺少事件能力读取器时报告缺口，其他依赖仍被检查', async () => {
    const h = await fixture();
    h.input.strategy.entry = { type: 'corporateActionEvent', eventType: 'CASH_DIVIDEND' };
    h.input.plan = planBacktestDependencies(h.input);
    h.input.tradabilityWindow = await windowFor(h.input.strategy, h.input.runConfig, h.input.plan);
    expect(await preflightBacktestDependenciesV3(h.input, h.dsa)).toMatchObject([
      {
        purpose: 'corporateActions',
        missingFields: ['corporateActions.event_plan_blocked'],
      },
    ]);
    expect(h.dsa.backtestCalendar).toHaveBeenCalledTimes(1);
    expect(h.dsa.backtestInstrumentFacts).toHaveBeenCalledTimes(1);
  });

  it('策略改变而依赖计划未更新时在所有读取前拒绝', async () => {
    const h = await fixture();
    h.input.strategy.entry = { type: 'corporateActionEvent', eventType: 'CASH_DIVIDEND' };
    expect(await preflightBacktestDependenciesV3(h.input, h.dsa)).toMatchObject([
      {
        missingFields: ['dependencyPlan.dependency_plan_mismatch'],
      },
    ]);
    expect(h.dsa.backtestCalendar).not.toHaveBeenCalled();
    expect(h.dsa.backtestInstrumentFacts).not.toHaveBeenCalled();
  });
});
