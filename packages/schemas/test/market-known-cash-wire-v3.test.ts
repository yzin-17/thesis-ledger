import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  marketKnownCashExchangeV3Schema,
  marketKnownCashRequestV3Schema,
  marketKnownCashErrorV3Schema,
  marketKnownCashFailureReasonV3Schema,
} from '../src/market-known-cash-wire-v3.js';
import {
  marketEventExchangeV3Schema,
  marketEventRequestV3Schema,
} from '../src/market-event-wire-v3.js';
import { backtestKnownCashResearchInputV3Schema } from '../src/backtest-known-cash-research-v3.js';

const fixture = () =>
  JSON.parse(
    readFileSync(
      new URL('../fixtures/market-known-cash-v3.exchange.json', import.meta.url),
      'utf8',
    ),
  );

describe('显式已知现金方案交换合同', () => {
  const published = new URL(
    '../../../../daily-stock-analysis/tests/fixtures/thesis_ledger_known_cash_v3.shared.json',
    import.meta.url,
  );
  it.skipIf(!existsSync(published))('组合工作区的DSA发布副本与主仓原样例/失败枚举一致', () => {
    const copy = JSON.parse(readFileSync(published, 'utf8'));
    expect(copy.exchange).toEqual(fixture());
    expect(copy.failureReasons).toEqual(marketKnownCashFailureReasonV3Schema.options);
  });
  it('安全失败原因使用标准枚举，不能把上游正文或凭证变为原因', () => {
    const error = {
      contractVersion: 3,
      protocolVersion: 'known-cash-observations-v1',
      requestId: 'known-cash-fixture',
      error: { code: 'upstream_failure', reason: 'permission_denied', message: '读取失败' },
    };
    expect(marketKnownCashErrorV3Schema.safeParse(error).success).toBe(true);
    expect(
      marketKnownCashErrorV3Schema.safeParse({
        ...error,
        error: { ...error.error, reason: 'private-response-body' },
      }).success,
    ).toBe(false);
    expect(
      marketKnownCashErrorV3Schema.safeParse({ ...error, protocolVersion: undefined }).success,
    ).toBe(false);
  });
  it('跨语言样例严格绑定实际查询、未知覆盖和源时钟，没有支付或准入事实', () => {
    const { response } = marketKnownCashExchangeV3Schema.parse(fixture());
    expect(response.source.queryIdentity.currencyBasis).toBe('explicit-research-scope');
    expect(response.coverage.complete).toBe(false);
    expect(response).not.toHaveProperty('facts');
    expect(response).not.toHaveProperty('admission');
  });
  it('默认事件入口拒绝研究字段；研究入口必须完整提供选择', () => {
    const input = fixture();
    expect(marketEventRequestV3Schema.safeParse(input.request).success).toBe(false);
    expect(marketEventExchangeV3Schema.safeParse(input).success).toBe(false);
    for (const key of ['protocolVersion', 'researchPolicy', 'currency']) {
      const missing = fixture().request;
      delete missing[key];
      expect(marketKnownCashRequestV3Schema.safeParse(missing).success).toBe(false);
    }
  });
  it('空记录和占位忽略仍为未知覆盖，不声明历史零分红', () => {
    const input = fixture();
    input.response.records = [];
    input.response.ignoredEmptyRows = 1;
    expect(marketKnownCashExchangeV3Schema.parse(input).response.coverage.complete).toBe(false);
  });
  it('来源身份和查询标识不要求供应商名称或同一种代码格式', () => {
    const input = fixture();
    for (const body of [input.request, input.response])
      body.routeTarget = {
        providerId: 'generic-structured-source',
        upstreamSource: 'announced-plans',
        routeIndex: 1,
      };
    input.response.source.target = { ...input.request.routeTarget };
    input.response.source.queryIdentity.queryIdentifier = 'provider-internal-fund-id';
    input.response.records[0].sourcePlanStatus = 'ANNOUNCED';
    input.response.records[0].sourceSemanticsRevision = 'documented-provider-semantics-v1';
    input.response.records[0].statusBasis = 'source-defined';
    expect(marketKnownCashExchangeV3Schema.safeParse(input).success).toBe(true);
  });
  it.each([
    [
      '请求ID',
      (x: ReturnType<typeof fixture>) => {
        x.response.requestId = 'other';
      },
    ],
    [
      '响应区间',
      (x: ReturnType<typeof fixture>) => {
        x.response.end = '2025-07-01';
      },
    ],
    [
      '目标位置',
      (x: ReturnType<typeof fixture>) => {
        x.response.routeTarget.routeIndex = 1;
      },
    ],
    [
      '来源',
      (x: ReturnType<typeof fixture>) => {
        x.response.source.target.providerId = 'other';
      },
    ],
    [
      '查询证券',
      (x: ReturnType<typeof fixture>) => {
        x.response.source.queryIdentity.requestedSymbol = '510050.SH';
      },
    ],
    [
      '冒充币种回显',
      (x: ReturnType<typeof fixture>) => {
        x.response.source.queryIdentity.currencyBasis = 'provider-echo';
      },
    ],
    [
      '冒充历史身份',
      (x: ReturnType<typeof fixture>) => {
        x.response.source.queryIdentity.historicalIdentity = 'verified';
      },
    ],
    [
      '覆盖完整',
      (x: ReturnType<typeof fixture>) => {
        x.response.coverage.complete = true;
      },
    ],
    [
      '准入字段',
      (x: ReturnType<typeof fixture>) => {
        x.response.admission = {};
      },
    ],
    [
      '已支付事实',
      (x: ReturnType<typeof fixture>) => {
        x.response.facts = [];
      },
    ],
    [
      '旧单位浮点值',
      (x: ReturnType<typeof fixture>) => {
        x.response.records[0].amountPerFundUnit = 0.088;
      },
    ],
    [
      '单位错配',
      (x: ReturnType<typeof fixture>) => {
        x.response.records[0].sourceAmount.value = '0.088';
      },
    ],
    [
      '登记日缺失',
      (x: ReturnType<typeof fixture>) => {
        delete x.response.records[0].recordDate;
      },
    ],
    [
      '未知进度',
      (x: ReturnType<typeof fixture>) => {
        x.response.records[0].planStatus = 'unknown';
      },
    ],
    [
      '区间外事件',
      (x: ReturnType<typeof fixture>) => {
        x.response.records[0].effectiveDate = '2025-07-01';
      },
    ],
    [
      '重复事件',
      (x: ReturnType<typeof fixture>) => {
        x.response.records.push({ ...x.response.records[0] });
      },
    ],
    [
      '策略版本漂移',
      (x: ReturnType<typeof fixture>) => {
        x.response.catalogRevision++;
      },
    ],
    [
      '研究截止后观察',
      (x: ReturnType<typeof fixture>) => {
        x.response.source.observedAt = '2026-10-09T14:00:00.000001Z';
      },
    ],
    [
      '读取结束后观察',
      (x: ReturnType<typeof fixture>) => {
        x.response.source.observedAt = '2026-10-09T13:01:00.000001Z';
      },
    ],
    [
      '观察早于公告',
      (x: ReturnType<typeof fixture>) => {
        x.response.source.observedAt = '2025-06-10T00:00:00Z';
      },
    ],
    [
      '外币',
      (x: ReturnType<typeof fixture>) => {
        x.response.records[0].currency = 'HKD';
      },
    ],
    [
      '沪深以外请求',
      (x: ReturnType<typeof fixture>) => {
        x.request.symbol = '00700.HK';
      },
    ],
  ])('%s时拒绝交换', (_label, change) => {
    const input = fixture();
    change(input);
    expect(marketKnownCashExchangeV3Schema.safeParse(input).success).toBe(false);
  });
});

describe('现金方案金额及冻结合同消费', () => {
  it('按十进制原单位精确核对高精度金额，不发生浮点舍入', () => {
    const input = fixture();
    const record = input.response.records[0];
    record.amountPerFundUnit = '0.12345678901234567890123456789';
    record.sourceAmount.value = '1.2345678901234567890123456789';
    expect(marketKnownCashExchangeV3Schema.safeParse(input).success).toBe(true);
    record.sourceAmount.value = '1.2345678901234567890123456788';
    expect(marketKnownCashExchangeV3Schema.safeParse(input).success).toBe(false);
    record.sourceAmount = { unit: 'per-fund-unit', value: record.amountPerFundUnit };
    expect(marketKnownCashExchangeV3Schema.safeParse(input).success).toBe(true);
    record.amountPerFundUnit = 'invalid';
    expect(marketKnownCashExchangeV3Schema.safeParse(input).success).toBe(false);
  });
  it('D2冻结输入接收并保留查询依据，既有缺省本地输入仍可读取', () => {
    const { request, response } = marketKnownCashExchangeV3Schema.parse(fixture());
    const protocol = JSON.parse(
      readFileSync(new URL('../fixtures/execution-price.raw-events.json', import.meta.url), 'utf8'),
    );
    protocol.history = { basis: 'fixed-provider-snapshot' };
    protocol.cashEventResearch = 'ex-date-entitlement-payment-date-cash-v1';
    const input = {
      policy: request.researchPolicy,
      scope: {
        symbol: request.symbol,
        market: 'CN',
        instrumentType: 'ETF',
        currency: 'CNY',
        startDate: request.start,
        endDate: request.end,
        dataAsOf: request.dataAsOf,
      },
      executionPriceProtocol: protocol,
      source: response.source,
      revisions: {
        desiredRevision: request.desiredRevision,
        effectivePolicyRevision: request.effectivePolicyRevision,
        catalogRevision: request.catalogRevision,
      },
      coverage: response.coverage,
      ignoredEmptyRows: response.ignoredEmptyRows,
      records: response.records,
      recordsHash: 'b'.repeat(64),
      contentHash: 'c'.repeat(64),
    };
    expect(backtestKnownCashResearchInputV3Schema.parse(input).source.queryIdentity).toEqual(
      response.source.queryIdentity,
    );
    const legacy = structuredClone(input);
    delete legacy.source.queryIdentity;
    expect(backtestKnownCashResearchInputV3Schema.safeParse(legacy).success).toBe(true);
    input.source.queryIdentity.requestedSymbol = '510050.SH';
    expect(backtestKnownCashResearchInputV3Schema.safeParse(input).success).toBe(false);
  });
});
