import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  backtestKnownCashAcquisitionV3Schema,
  backtestKnownCashPreparationV3Schema,
} from '../src/backtest-known-cash-preparation-v3.js';
import { backtestRunPreparationIntentV3Schema } from '../src/backtest-run-preparation-v3.js';

function fixture() {
  const exchange = JSON.parse(
    readFileSync(
      new URL('../fixtures/market-known-cash-v3.exchange.json', import.meta.url),
      'utf8',
    ),
  );
  const protocol = JSON.parse(
    readFileSync(new URL('../fixtures/execution-price.raw-events.json', import.meta.url), 'utf8'),
  );
  return {
    version: 'known-cash-preparation-v1',
    acquisition: {
      version: 'known-cash-acquisition-v1',
      clock: {
        mode: 'requested-time',
        requestedDataAsOf: exchange.request.dataAsOf,
        startedAt: '2026-10-09T13:00:00Z',
        completedAt: '2026-10-09T13:01:01Z',
      },
      exchange,
    },
    input: {
      policy: exchange.request.researchPolicy,
      scope: {
        symbol: exchange.request.symbol,
        market: 'CN',
        instrumentType: 'ETF',
        currency: 'CNY',
        startDate: exchange.request.start,
        endDate: exchange.request.end,
        dataAsOf: exchange.request.dataAsOf,
      },
      executionPriceProtocol: {
        ...protocol,
        history: { basis: 'fixed-provider-snapshot' },
        cashEventResearch: 'ex-date-entitlement-payment-date-cash-v1',
      },
      source: exchange.response.source,
      revisions: { desiredRevision: 1, effectivePolicyRevision: 1, catalogRevision: 1 },
      coverage: exchange.response.coverage,
      ignoredEmptyRows: 0,
      records: exchange.response.records,
      recordsHash: 'a'.repeat(64),
      contentHash: 'b'.repeat(64),
    },
    contentHash: 'c'.repeat(64),
  };
}

describe('生产已知方案准备绑定', () => {
  it('保留标准身份、未知覆盖与用户截止，空记录仍不证明零分红', () => {
    const value = fixture();
    expect(
      backtestKnownCashPreparationV3Schema.parse(value).input.source.queryIdentity?.currencyBasis,
    ).toBe('explicit-research-scope');
    value.acquisition.exchange.response.records = [];
    value.input.records = [];
    value.acquisition.exchange.response.ignoredEmptyRows = 1;
    value.input.ignoredEmptyRows = 1;
    expect(backtestKnownCashPreparationV3Schema.parse(value).input.coverage.complete).toBe(false);
  });
  it.each([
    ['source', 'queryIdentity'],
    ['source', 'controlIdentity'],
    ['scope', 'symbol'],
    ['scope', 'dataAsOf'],
    ['policy', 'version'],
  ])('缺少%s/%s不能用D2本地缺省冒充生产输入', (section, key) => {
    const value = fixture();
    value.input.source = structuredClone(value.input.source);
    delete value.input[section as keyof typeof value.input][key];
    expect(backtestKnownCashPreparationV3Schema.safeParse(value).success).toBe(false);
  });
  it.each([
    [
      '范围',
      (x: ReturnType<typeof fixture>) => {
        x.input.scope.endDate = '2025-07-01';
      },
    ],
    [
      '来源',
      (x: ReturnType<typeof fixture>) => {
        x.input.source = { ...x.input.source, providerRevision: 'changed' };
      },
    ],
    [
      '版本',
      (x: ReturnType<typeof fixture>) => {
        x.input.revisions.catalogRevision = 2;
      },
    ],
    [
      '记录',
      (x: ReturnType<typeof fixture>) => {
        x.input.records = [];
      },
    ],
    [
      '覆盖原因',
      (x: ReturnType<typeof fixture>) => {
        x.input.coverage = { ...x.input.coverage, reason: 'changed' };
      },
    ],
    [
      '占位',
      (x: ReturnType<typeof fixture>) => {
        x.input.ignoredEmptyRows = 1;
      },
    ],
    [
      '截止',
      (x: ReturnType<typeof fixture>) => {
        x.input.scope.dataAsOf = '2026-10-09T14:01:00Z';
      },
    ],
  ])('%s不同则拒绝，不能仅自校验冻结包', (_label, mutate) => {
    const value = fixture();
    mutate(value);
    expect(backtestKnownCashPreparationV3Schema.safeParse(value).success).toBe(false);
  });
});

describe('明确的取得后冻结时钟', () => {
  function captured() {
    const acquisition = fixture().acquisition;
    acquisition.clock = {
      mode: 'after-acquisition',
      requestedDataAsOf: '2026-10-08T00:00:00Z',
      startedAt: '2026-10-09T13:00:00Z',
      completedAt: '2026-10-09T13:00:30Z',
      readDeadlineAt: '2026-10-09T13:01:00Z',
    } as typeof acquisition.clock;
    acquisition.exchange.request.dataAsOf = '2026-10-09T13:01:00Z';
    acquisition.exchange.response.dataAsOf = '2026-10-09T13:01:00Z';
    acquisition.exchange.response.fetchedAt = '2026-10-09T13:00:29Z';
    return acquisition;
  }
  it('读取上限与实际截止独立，不覆盖原请求截止', () => {
    const value = fixture();
    value.acquisition = captured();
    value.input.scope.dataAsOf = value.acquisition.clock.completedAt;
    expect(
      backtestKnownCashPreparationV3Schema.parse(value).acquisition.clock.requestedDataAsOf,
    ).toBe('2026-10-08T00:00:00Z');
  });
  it.each([
    [
      '响应未来微秒',
      (x: ReturnType<typeof captured>) => {
        x.exchange.response.fetchedAt = '2026-10-09T13:00:30.000001Z';
      },
    ],
    [
      '来源未来微秒',
      (x: ReturnType<typeof captured>) => {
        x.exchange.response.source.observedAt = '2026-10-09T13:00:30.000001Z';
        x.exchange.response.fetchedAt = x.exchange.response.source.observedAt;
      },
    ],
    [
      '完成越界',
      (x: ReturnType<typeof captured>) => {
        x.clock.completedAt = '2026-10-09T13:01:00.000001Z';
      },
    ],
    [
      '时钟倒退',
      (x: ReturnType<typeof captured>) => {
        x.clock.completedAt = '2026-10-09T12:59:59Z';
      },
    ],
    [
      '未明确上限',
      (x: ReturnType<typeof captured>) => {
        delete (x.clock as unknown as Record<string, unknown>).readDeadlineAt;
      },
    ],
    [
      '读取截止偷换',
      (x: ReturnType<typeof captured>) => {
        x.exchange.request.dataAsOf = '2026-10-09T13:02:00Z';
        x.exchange.response.dataAsOf = x.exchange.request.dataAsOf;
      },
    ],
    [
      '上限超过60秒微秒',
      (x: ReturnType<typeof captured>) => {
        Object.assign(x.clock, { readDeadlineAt: '2026-10-09T13:01:00.000001Z' });
        x.exchange.request.dataAsOf = '2026-10-09T13:01:00.000001Z';
        x.exchange.response.dataAsOf = x.exchange.request.dataAsOf;
      },
    ],
  ])('%s明确拒绝', (_label, mutate) => {
    const value = captured();
    mutate(value);
    expect(backtestKnownCashAcquisitionV3Schema.safeParse(value).success).toBe(false);
  });
  it('公共准备接受完整显式选择，但拒绝客户端注入冻结原包', () => {
    const executionModel = JSON.parse(
      readFileSync(
        new URL('../fixtures/backtest-execution-model.cn-2024q1.json', import.meta.url),
        'utf8',
      ),
    );
    executionModel.scope.instrumentType = 'ETF';
    const intent = {
      contractVersion: 3,
      requestId: 'old-intent',
      adjustment: 'none',
      accountingBasis: 'raw-events',
      history: { basis: 'fixed-provider-snapshot' },
      cashEventResearch: 'ex-date-entitlement-payment-date-cash-v1',
      runConfig: {
        startDate: '2024-01-02',
        endDate: '2024-03-29',
        dataAsOf: '2026-10-09T14:00:00Z',
        baseCurrency: 'CNY',
        initialCash: { CNY: '10000' },
        executionModel,
        valuationPolicy: {
          baseTimezone: 'Asia/Shanghai',
          dailyValuationTime: '15:00',
          pricePolicy: 'latestAvailable',
          fxPolicy: 'latestAvailable',
        },
      },
    };
    expect(backtestRunPreparationIntentV3Schema.safeParse(intent).success).toBe(true);
    expect(
      backtestRunPreparationIntentV3Schema.safeParse({
        ...intent,
        knownCashResearch: fixture().input.policy,
      }).success,
    ).toBe(true);
    expect(
      backtestRunPreparationIntentV3Schema.safeParse({
        ...intent,
        runConfig: {
          ...intent.runConfig,
          frozenPriceWarmupPolicy: 'cash-reference-calendar-buffer-v1',
        },
      }).success,
    ).toBe(false);
    expect(
      backtestRunPreparationIntentV3Schema.safeParse({
        ...intent,
        runConfig: { ...intent.runConfig, knownCashPreparation: fixture() },
      }).success,
    ).toBe(false);
  });
});
