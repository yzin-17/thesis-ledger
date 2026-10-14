import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  runConfigSchemaV3,
  executionPriceProtocolSchema,
  backtestRunPreparationRequestV3Schema,
  strategySchema,
  type BacktestStrategy,
} from '@thesis-ledger/schemas';
import { deriveEventDependencyPlan } from '../../src/backtest/backtest-dependency-events.js';
import { backtestResearchReadOptionsV3 } from '../../src/backtest/backtest-research-read-options-v3.js';
import { researchBenchmarkLimitV3 } from '../../src/backtest/backtest-research-benchmark-limit-v3.js';

const fixture = (name: string) =>
  JSON.parse(
    readFileSync(new URL(`../../../../packages/schemas/fixtures/${name}`, import.meta.url), 'utf8'),
  );
function input() {
  const executionModel = fixture('backtest-execution-model.cn-2024q1.json');
  const protocol = fixture('execution-price.raw-events.json');
  protocol.history = { basis: 'fixed-provider-snapshot' };
  protocol.marketRuleResearch = 'raw-prices-no-corporate-actions-v1';
  const config = runConfigSchemaV3.parse({
    schemaVersion: '3',
    startDate: '2024-01-02',
    endDate: '2024-03-29',
    dataAsOf: '2026-10-07T00:00:00Z',
    baseCurrency: 'CNY',
    initialCash: { CNY: '100000' },
    valuationPolicy: {
      baseTimezone: 'Asia/Shanghai',
      dailyValuationTime: '15:00',
      pricePolicy: 'latestAvailable',
      fxPolicy: 'latestAvailable',
    },
    executionModel,
    executionPriceProtocol: protocol,
  });
  const strategy = fixture('backtest-v2.exchange.json');
  strategy.executionInstrument = {
    market: 'CN',
    symbol: executionModel.scope.symbol,
    assetType: 'stock',
  };
  strategy.signalSources = [
    { id: 'execution', asset: strategy.executionInstrument, timeframe: '1d', series: ['close'] },
  ];
  const series = { type: 'series', sourceId: 'execution', field: 'close' };
  strategy.entry = {
    type: 'compare',
    operator: 'gt',
    left: series,
    right: { type: 'constant', value: '0' },
  };
  strategy.exit = {
    type: 'compare',
    operator: 'lt',
    left: series,
    right: { type: 'constant', value: '0' },
  };
  return { config, strategy: strategySchema.parse(strategy) as BacktestStrategy };
}
describe('显式股票原价规则研究', () => {
  it('只由明确意图准备，不与现金、复权、严格PIT混用，模型必填', () => {
    const { config } = input();
    const { schemaVersion: _schema, executionPriceProtocol: protocol, ...runConfig } = config;
    void _schema;
    const request = {
      contractVersion: 3,
      requestId: 'rule-intent',
      strategyVersionId: '11111111-1111-4111-8111-111111111111',
      runConfig,
      adjustment: 'none',
      accountingBasis: 'raw-events',
      history: protocol.history,
      marketRuleResearch: protocol.marketRuleResearch,
    };
    expect(backtestRunPreparationRequestV3Schema.safeParse(request).success).toBe(true);
    for (const patch of [
      { cashEventResearch: 'ex-date-entitlement-payment-date-cash-v1' },
      { adjustment: 'qfq', accountingBasis: 'normalized-series' },
      { history: { basis: 'point-in-time', reconstructionEvidenceRef: 'verified' } },
      { runConfig: { ...runConfig, executionModel: undefined } },
    ])
      expect(
        backtestRunPreparationRequestV3Schema.safeParse({ ...request, ...patch }).success,
      ).toBe(false);
    expect(runConfigSchemaV3.safeParse({ ...config, executionModel: undefined }).success).toBe(
      false,
    );
    expect(
      executionPriceProtocolSchema.safeParse({
        ...protocol,
        cashEventResearch: 'ex-date-entitlement-payment-date-cash-v1',
      }).success,
    ).toBe(false);
  });
  it('规则研究不声称事件覆盖；普通raw仍要求三类事件，事件信号明确拒绝', () => {
    const { config, strategy } = input();
    const planned = deriveEventDependencyPlan(strategy, config, '2023-12-15', undefined);
    expect(planned.dependencies).toHaveLength(0);
    expect(planned.validation).toBe('not-required');
    const raw = structuredClone(config);
    delete raw.executionPriceProtocol.marketRuleResearch;
    expect(
      deriveEventDependencyPlan(strategy, raw, '2023-12-15', undefined).dependencies[0]?.eventTypes,
    ).toEqual(['CASH_DIVIDEND', 'REVERSE_SPLIT', 'SPLIT']);
    const withSignal = {
      ...strategy,
      entry: { type: 'corporateActionEvent' as const, eventType: 'CASH_DIVIDEND' as const },
    };
    expect(deriveEventDependencyPlan(withSignal, config, '2023-12-15', undefined).issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'RULE_INCOMPATIBLE' })]),
    );
  });
  it('当前事实研究读选项和独立基准身份保留；现金基准身份不变', () => {
    const { config } = input();
    expect(backtestResearchReadOptionsV3('CN', config.executionPriceProtocol)).toEqual({
      tradabilityMode: 'assume-untradable-no-bar',
      priceResearch: true,
    });
    const rule = researchBenchmarkLimitV3(config.executionPriceProtocol)!;
    expect(rule.cost.kind).toBe('unsupported');
    expect(rule.reason).toContain('状态模型');
    const cash = {
      ...config.executionPriceProtocol,
      marketRuleResearch: undefined,
      cashEventResearch: 'ex-date-entitlement-payment-date-cash-v1' as const,
    };
    const cashLimit = researchBenchmarkLimitV3(cash)!;
    expect(cashLimit.cost).toMatchObject({ version: 'v3-cash-event-benchmark-unavailable-v1' });
    expect(cashLimit.cost).not.toEqual(rule.cost);
    const legacy = { ...config.executionPriceProtocol, marketRuleResearch: undefined };
    expect(researchBenchmarkLimitV3(legacy)).toBeUndefined();
  });
});
