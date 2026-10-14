import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { VersionedExecutionRules, tradingCalendarFromFact,
  type FrozenExchangeExecutionModelSegment } from '@thesis-ledger/domain';
import {
  runConfigSchemaV3,
  marketTradingStatusResponseV3Schema,
  backtestTradingStatusSnapshotV3Schema,
  type RunConfigV3,
} from '@thesis-ledger/schemas';
import { statusPriceExecutionModelV3 } from '../../src/backtest/backtest-status-price-model-v3.js';
import {
  collectSnapshotTradingStatusV3,
  readSnapshotTradingStatusV3,
  tradingStatusArtifactRowsV3,
} from '../../src/backtest/backtest-trading-status-snapshot-v3.js';

const fixture = (name: string) =>
  JSON.parse(
    readFileSync(new URL(`../../../../packages/schemas/fixtures/${name}`, import.meta.url), 'utf8'),
  );
function inputs() {
  const response = marketTradingStatusResponseV3Schema.parse(
    fixture('market-risk-price-limits-v3.response.json').response,
  );
  const model = fixture('backtest-execution-model.cn-2024q1.json');
  model.scope.symbol = response.symbol;
  model.scope.range = response.range;
  for (const segment of model.segments) segment.range = response.range;
  const protocol = fixture('execution-price.raw-events.json');
  protocol.history = { basis: 'fixed-provider-snapshot' };
  protocol.marketRuleResearch = 'raw-prices-no-corporate-actions-v1';
  const config = runConfigSchemaV3.parse({
    schemaVersion: '3',
    startDate: response.range.start,
    endDate: response.range.end,
    dataAsOf: '2026-10-08T00:00:00Z',
    baseCurrency: 'CNY',
    initialCash: { CNY: '100000' },
    valuationPolicy: {
      baseTimezone: 'Asia/Shanghai',
      dailyValuationTime: '15:00',
      pricePolicy: 'latestAvailable',
      fxPolicy: 'latestAvailable',
    },
    executionModel: model,
    executionPriceProtocol: protocol,
  });
  return { response, config };
}
function rules(config: RunConfigV3) {
  const observedAt = '2026-10-07T00:00:00Z';
  return new VersionedExecutionRules({
    version: 'risk-source-test',
    factResearch: { basis: 'fixed-provider-snapshot', dataAsOf: config.dataAsOf },
    calendar: tradingCalendarFromFact({
      market: 'CN',
      timezone: 'Asia/Shanghai',
      provider: 'calendar-fixture',
      providerRevision: 'fixture',
      availableAt: observedAt,
      range: { start: config.startDate, end: config.endDate },
      holidays: [],
      sessionOverrides: [],
      sessions: [
        { startMinute: 570, endMinute: 690 },
        { startMinute: 780, endMinute: 900 },
      ],
    }),
    calendarProvider: 'calendar-fixture',
    calendarProviderRevision: 'fixture',
    calendarAvailableAt: observedAt,
    instrument: {
      symbol: '000995.SZ',
      market: 'CN',
      instrumentType: 'STOCK',
      currency: 'CNY',
      lotSize: '100',
      tickSize: '0.01',
      tradable: true,
      provider: 'unit-fixture',
      providerRevision: 'fixture',
      occurredAt: observedAt,
      availableAt: observedAt,
    },
    order: {
      type: 'Market',
      timeInForce: 'DAY',
      executionTiming: 'nextEligibleBarOpen',
      fillPolicy: 'full-or-reject',
      longOnly: true,
    },
    price: { reference: 'previousClose' },
    positionSettlement: { sellableAfterTradingDays: 1 },
    cashSettlement: { buyDebitAfterTradingDays: 0, sellCreditAfterTradingDays: 0 },
    statutoryCharges: [],
  });
}
describe('真实公告风险与日涨跌幅执行组合', () => {
  it.each([
    ['2023-08-16', '10.50', true],
    ['2023-08-16', '10.51', false],
    ['2023-08-16', '9.50', true],
    ['2023-08-16', '9.49', false],
    ['2023-08-18', '11.00', true],
    ['2023-08-18', '11.01', false],
    ['2023-08-18', '9.00', true],
    ['2023-08-18', '8.99', false],
  ] as const)('%s 原价 %s 的实际执行规则为 %s', (date, rawPrice, accepted) => {
    const { response, config } = inputs();
    const original = structuredClone(config);
    const model = statusPriceExecutionModelV3(config, response)!;
    const segment = model.segments.find((item) => item.range.start === date)!;
    if (segment.execution.mode !== 'exchange') throw new Error('exchange required');
    const decision = rules(config)
      .withExecutionModel(segment as FrozenExchangeExecutionModelSegment)
      .evaluate({
        symbol: response.symbol,
        market: 'CN',
        side: 'buy',
        quantity: '100',
        rawPrice,
        previousClose: '10',
        evaluatedAt: `${date}T01:30:00Z`,
      });
    expect(decision.accepted, JSON.stringify(decision)).toBe(accepted);
    expect(config).toEqual(original);
    expect(response.days[0]!.state).toBe('unknown');
  });
  it('只接受同标的原价协议、已核验来源时钟，拒绝复权与漂移', () => {
    const { response, config } = inputs();
    const legacy = structuredClone(config);
    delete legacy.executionPriceProtocol.marketRuleResearch;
    expect(() => statusPriceExecutionModelV3(legacy, response)).toThrow('原价规则研究');
    const adjusted = structuredClone(config);
    adjusted.executionPriceProtocol.priceBasis.adjustment = 'qfq';
    expect(() => statusPriceExecutionModelV3(adjusted, response)).toThrow();
    expect(() =>
      statusPriceExecutionModelV3(config, { ...response, symbol: '600000.SH' }),
    ).toThrow();
    const late = structuredClone(response);
    late.sourceDocuments[0]!.observedAt = '2026-10-09T00:00:00Z';
    expect(() => statusPriceExecutionModelV3(config, late)).toThrow('冻结截点');
  });
  it('使用新冻结版本，离线读回核验版本与模型绑定，旧版本拒绝回填', async () => {
    const { response, config } = inputs();
    const dsa = {
      marketTradingStatusV3: vi.fn(async () => response),
      effectiveControlPolicyV3: vi.fn(async () => ({
        projection: {
          effective: {
            enabled: true,
            routes: [
              { key: response.routeKey, targets: [{ ...response.routeTarget, eligible: true }] },
            ],
          },
        },
      })),
    };
    const snapshot = (await collectSnapshotTradingStatusV3(config, dsa as never))!;
    expect(snapshot.freezeVersion).toBe('frozen-trading-status-v2');
    expect(snapshot.disclosure.status).toBe('source');
    expect(
      backtestTradingStatusSnapshotV3Schema.safeParse({
        ...snapshot,
        freezeVersion: 'frozen-trading-status-v1',
      }).success,
    ).toBe(false);
    const context = {
      runId: 'risk',
      tradingStatus: {
        artifactKey: 'risk/metadata/trading-status-v3.parquet',
        freezeVersion: snapshot.freezeVersion,
      },
    };
    expect(
      readSnapshotTradingStatusV3(context, config, tradingStatusArtifactRowsV3(snapshot)),
    ).toEqual(snapshot);
    expect(() =>
      readSnapshotTradingStatusV3(
        {
          ...context,
          tradingStatus: {
            ...context.tradingStatus,
            freezeVersion: 'frozen-trading-status-v1',
          },
        },
        config,
        tradingStatusArtifactRowsV3(snapshot),
      ),
    ).toThrow('冻结版本');
    const legacy = structuredClone(config);
    delete legacy.executionPriceProtocol.marketRuleResearch;
    expect((await collectSnapshotTradingStatusV3(legacy, dsa as never))!.disclosure.status).toBe(
      'notIncluded',
    );
  });
});
