import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { executionPriceProtocolSchema } from '../src/market-price-protocol.js';
import { backtestKnownCashResearchInputV3Schema } from '../src/backtest-known-cash-research-v3.js';

const fixture = () => ({
  policy: {
    version: 'known-announced-cash-events-v1',
    entitlement: 'settled-record-date-holdings',
    receivable: 'ex-date',
    settlement: 'assume-scheduled-payment-date',
    missingEvents: 'excluded-with-unknown-coverage',
    usage: 'accounting-only',
    splitEvents: 'not-modelled',
    historicalAvailability: 'notVerified',
  },
  scope: {
    symbol: '510300.SH',
    market: 'CN',
    instrumentType: 'ETF',
    currency: 'CNY',
    startDate: '2025-06-01',
    endDate: '2025-06-30',
    dataAsOf: '2026-10-09T14:00:00Z',
  },
  executionPriceProtocol: {
    ...JSON.parse(
      readFileSync(new URL('../fixtures/execution-price.raw-events.json', import.meta.url), 'utf8'),
    ),
    history: { basis: 'fixed-provider-snapshot' },
    cashEventResearch: 'ex-date-entitlement-payment-date-cash-v1',
  },
  source: {
    target: { providerId: 'provider-a', upstreamSource: 'fund-distributions', routeIndex: 0 },
    providerRevision: 'response-v1',
    adapterRevision: 'adapter-v1',
    normalizationRevision: 'normalizer-v1',
    responseSha256: 'a'.repeat(64),
    observedAt: '2026-10-09T13:00:00Z',
  },
  revisions: { desiredRevision: 3, effectivePolicyRevision: 3, catalogRevision: 74 },
  coverage: { complete: false, reason: '历史覆盖未知' },
  ignoredEmptyRows: 0,
  records: [
    {
      symbol: '510300.SH',
      announcementDate: '2025-06-11',
      recordDate: '2025-06-17',
      effectiveDate: '2025-06-18',
      paymentDate: '2025-06-27',
      amountPerFundUnit: '0.088',
      currency: 'CNY',
      planStatus: 'implementation-plan-announced',
      statusBasis: 'research-assumption',
      sourcePlanStatus: 'opaque-status',
      sourceSemanticsRevision: 'source-semantics-v1',
      sourceAmount: { value: '0.88', unit: 'per-ten-fund-units' },
    },
  ],
  recordsHash: 'b'.repeat(64),
  contentHash: 'c'.repeat(64),
});

describe('覆盖未知的已公布现金方案合同', () => {
  it('保留未知覆盖、独立来源与原始单位；空记录也不证明零分红', () => {
    expect(backtestKnownCashResearchInputV3Schema.parse(fixture()).coverage.complete).toBe(false);
    const empty = fixture();
    empty.records = [];
    empty.ignoredEmptyRows = 1;
    expect(backtestKnownCashResearchInputV3Schema.parse(empty).coverage.complete).toBe(false);
  });
  it.each(['policy', 'coverage', 'source', 'recordsHash', 'contentHash'])(
    '缺少显式%s时拒绝',
    (key) => {
      const input = fixture() as Record<string, unknown>;
      delete input[key];
      expect(backtestKnownCashResearchInputV3Schema.safeParse(input).success).toBe(false);
    },
  );
  it.each([
    [
      '完整覆盖',
      (x: ReturnType<typeof fixture>) => {
        x.coverage.complete = true;
      },
    ],
    [
      '实际支付',
      (x: ReturnType<typeof fixture>) => {
        x.policy.settlement = 'verified-paid';
      },
    ],
    [
      '事件信号',
      (x: ReturnType<typeof fixture>) => {
        x.policy.usage = 'strategy-signal';
      },
    ],
    [
      '股票',
      (x: ReturnType<typeof fixture>) => {
        x.scope.instrumentType = 'STOCK';
      },
    ],
    [
      '港币',
      (x: ReturnType<typeof fixture>) => {
        x.scope.currency = 'HKD';
      },
    ],
    [
      '策略版本变化',
      (x: ReturnType<typeof fixture>) => {
        x.revisions.effectivePolicyRevision = 4;
      },
    ],
    [
      '复权价格',
      (x: ReturnType<typeof fixture>) => {
        x.executionPriceProtocol.priceBasis.adjustment = 'qfq';
      },
    ],
    [
      '严格PIT',
      (x: ReturnType<typeof fixture>) => {
        x.executionPriceProtocol.history.basis = 'point-in-time';
      },
    ],
    [
      '旧现金模型未选择',
      (x: ReturnType<typeof fixture>) => {
        x.executionPriceProtocol.cashEventResearch = undefined;
      },
    ],
    [
      '源时钟晚于截止',
      (x: ReturnType<typeof fixture>) => {
        x.source.observedAt = '2026-10-09T14:00:00.000001Z';
      },
    ],
    [
      '价格时钟晚于截止',
      (x: ReturnType<typeof fixture>) => {
        x.executionPriceProtocol.priceBasis.observedAt = '2026-10-10T00:00:00Z';
      },
    ],
    [
      '其他证券',
      (x: ReturnType<typeof fixture>) => {
        x.records[0]!.symbol = '510050.SH';
      },
    ],
    [
      '区间外',
      (x: ReturnType<typeof fixture>) => {
        x.scope.startDate = '2025-06-19';
      },
    ],
    [
      '公告晚于登记',
      (x: ReturnType<typeof fixture>) => {
        x.records[0]!.announcementDate = '2025-06-18';
      },
    ],
    [
      '登记等于除息',
      (x: ReturnType<typeof fixture>) => {
        x.records[0]!.recordDate = '2025-06-18';
      },
    ],
    [
      '支付早于除息',
      (x: ReturnType<typeof fixture>) => {
        x.records[0]!.paymentDate = '2025-06-17';
      },
    ],
    [
      '观察早于公告',
      (x: ReturnType<typeof fixture>) => {
        x.source.observedAt = '2025-06-10T00:00:00Z';
      },
    ],
    [
      '重复方案',
      (x: ReturnType<typeof fixture>) => {
        x.records.push({ ...x.records[0]! });
      },
    ],
  ])('%s不能进入研究输入', (_label, mutate) => {
    const input = fixture();
    mutate(input);
    expect(backtestKnownCashResearchInputV3Schema.safeParse(input).success).toBe(false);
  });
  it('旧价格协议仍拒绝新增研究选择，不能静默降级为旧计算', () => {
    const input = fixture();
    expect(
      executionPriceProtocolSchema.safeParse({
        ...input.executionPriceProtocol,
        knownCashResearch: input.policy,
      }).success,
    ).toBe(false);
  });
});
