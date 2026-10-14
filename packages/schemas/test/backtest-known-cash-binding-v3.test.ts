import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  knownCashRunBindingIssuesV3,
  backtestKnownCashSnapshotRefV3Schema,
} from '../src/backtest-known-cash-binding-v3.js';
import { backtestKnownCashPreparationV3Schema } from '../src/backtest-known-cash-preparation-v3.js';
import { runConfigSchemaV3 } from '../src/backtest-run.js';

function fixture() {
  const exchange = JSON.parse(
    readFileSync(
      new URL('../fixtures/market-known-cash-v3.exchange.json', import.meta.url),
      'utf8',
    ),
  );
  const executionPriceProtocol = {
    ...JSON.parse(
      readFileSync(new URL('../fixtures/execution-price.raw-events.json', import.meta.url), 'utf8'),
    ),
    history: { basis: 'fixed-provider-snapshot' },
    cashEventResearch: 'ex-date-entitlement-payment-date-cash-v1',
  };
  const scope = {
    symbol: exchange.request.symbol,
    market: 'CN',
    instrumentType: 'ETF',
    currency: 'CNY',
    startDate: exchange.request.start,
    endDate: exchange.request.end,
    dataAsOf: exchange.request.dataAsOf,
  };
  const prepared = backtestKnownCashPreparationV3Schema.parse({
    version: 'known-cash-preparation-v1',
    acquisition: {
      version: 'known-cash-acquisition-v1',
      clock: {
        mode: 'requested-time',
        requestedDataAsOf: scope.dataAsOf,
        startedAt: '2026-10-09T13:00:00Z',
        completedAt: '2026-10-09T13:01:00Z',
      },
      exchange,
    },
    input: {
      policy: exchange.request.researchPolicy,
      scope,
      executionPriceProtocol,
      source: exchange.response.source,
      revisions: { desiredRevision: 1, effectivePolicyRevision: 1, catalogRevision: 1 },
      coverage: exchange.response.coverage,
      ignoredEmptyRows: 0,
      records: exchange.response.records,
      recordsHash: 'a'.repeat(64),
      contentHash: 'b'.repeat(64),
    },
    contentHash: 'c'.repeat(64),
  });
  return {
    startDate: scope.startDate,
    endDate: scope.endDate,
    dataAsOf: scope.dataAsOf,
    baseCurrency: 'CNY',
    executionPriceProtocol: prepared.input.executionPriceProtocol,
    executionModel: { scope },
    knownCashPreparation: prepared,
    priceInputBindings: {},
    frozenExecutionWindow: {},
  };
}

describe('现金原包的运行绑定与快照版本', () => {
  it('独立准备只接受同范围/价格/时钟，旧无字段配置无需原包', () => {
    const value = fixture();
    expect(knownCashRunBindingIssuesV3(value)).toEqual([]);
    expect(knownCashRunBindingIssuesV3({ ...value, knownCashPreparation: undefined })).toEqual([]);
    expect(runConfigSchemaV3.shape.knownCashPreparation.safeParse(undefined).success).toBe(true);
  });
  it.each(['startDate', 'endDate', 'dataAsOf', 'baseCurrency', 'symbol', 'price'])(
    '拒绝%s换版本',
    (field) => {
      const value = fixture();
      if (field === 'symbol') value.executionModel.scope.symbol = '510050.SH';
      else if (field === 'price')
        value.executionPriceProtocol = {
          ...value.executionPriceProtocol,
          priceBasis: {
            ...value.executionPriceProtocol.priceBasis,
            observedAt: '2026-09-01T00:00:00Z',
          },
        };
      else Object.assign(value, { [field]: 'different' });
      expect(knownCashRunBindingIssuesV3(value)).toHaveLength(1);
    },
  );
  it('新资料引用不允许完整覆盖，准备摘要必需', () => {
    const ref = {
      version: 'known-cash-snapshot-v1',
      preparationHash: 'a'.repeat(64),
      coverageComplete: false,
    };
    expect(backtestKnownCashSnapshotRefV3Schema.parse(ref)).toEqual(ref);
    expect(
      backtestKnownCashSnapshotRefV3Schema.safeParse({ ...ref, coverageComplete: true }).success,
    ).toBe(false);
    expect(backtestKnownCashSnapshotRefV3Schema.safeParse({ version: ref.version }).success).toBe(
      false,
    );
  });
});
