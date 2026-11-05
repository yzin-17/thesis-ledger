import { describe, expect, it } from 'vitest';
import {
  executionRulePackSchema,
  executionRuleRequestSchema,
  executionRuleResponseSchema,
  type ExecutionRuleRequest,
  type ExecutionRuleResponse,
} from '../src/market-execution-rules.js';

const scope = {
  symbol: '510300.SH',
  market: 'CN',
  exchange: 'SSE',
  board: null,
  assetType: 'ETF',
  currency: 'CNY',
  businessType: 'AUCTION',
  side: 'BUY',
  subject: 'SINGLE_EXECUTION',
} as const;
const request = {
  contractVersion: 3,
  consumer: 'thesis-ledger',
  requestId: 'controlled',
  scope,
  // 一整个上海日期，不以单个伪造时刻代替仅日期成交。
  window: { start: '2026-10-18T16:00:00Z', end: '2026-10-19T15:59:59.999Z' },
} as const;
const available = (): Extract<ExecutionRuleResponse, { status: 'available' }> => ({
  request: structuredClone(request),
  status: 'available',
  pack: {
    ruleVersion: `sha256:${'a'.repeat(64)}`,
    provider: 'controlled-contract-only',
    fetchedAt: '2026-10-20T08:00:00Z',
    scope: structuredClone(scope),
    sourceReview: { amendments: 'checked', deferrals: 'checked', conflicts: 'resolved' },
    sources: [
      {
        issuer: '受控样本',
        publicationId: 'contract-only',
        publishedOn: '2026-04-24',
        role: 'text',
        url: 'https://example.invalid/rule',
        sha256: 'b'.repeat(64),
      },
    ],
    validity: {
      effectiveFrom: '2026-07-05T16:00:00Z',
      effectiveUntil: null as string | null,
      verifiedThrough: '2026-10-20T07:00:00Z',
    },
    quantity: { step: '1', decimals: 0 },
    price: { step: '0.001', decimals: 3 },
  },
});

describe('成交规则能力结构边界', () => {
  it('完整范围、来源、数量/价格和整日窗口结构自洽，但不产生 VERIFIED', () => {
    const parsed = executionRuleResponseSchema.parse(available());
    expect(parsed.status).toBe('available');
    expect(parsed).not.toHaveProperty('capabilityVerification');
  });

  it.each([
    'symbol',
    'exchange',
    'board',
    'assetType',
    'currency',
    'businessType',
    'side',
    'subject',
  ] as const)('拒绝规则范围与请求的 %s 不同', (key) => {
    const value = available();
    Object.assign(value.pack.scope, {
      [key]: {
        symbol: '510050.SH',
        exchange: 'SZSE',
        board: 'other',
        assetType: 'STOCK',
        currency: 'USD',
        businessType: 'BLOCK',
        side: 'SELL',
        subject: 'AGGREGATED_EXECUTIONS',
      }[key],
    });
    expect(executionRuleResponseSchema.safeParse(value).success).toBe(false);
  });

  it('拒绝市场错配、申报语义和未知额外声明', () => {
    const value = available();
    for (const change of [
      { market: 'HK' },
      { subject: 'ORDER' },
      { symbol: '*' },
      { admitted: true },
    ])
      expect(
        executionRuleRequestSchema.safeParse({ ...request, scope: { ...scope, ...change } })
          .success,
      ).toBe(false);
    expect(
      executionRuleResponseSchema.safeParse({ ...value, capabilityVerification: 'VERIFIED' })
        .success,
    ).toBe(false);
  });

  it.each([
    { effectiveFrom: '2026-10-19T00:00:00Z' },
    { effectiveUntil: request.window.end },
    { verifiedThrough: '2026-10-19T08:00:00Z' },
    { verifiedThrough: '2026-10-21T00:00:00Z' },
  ])('拒绝不覆盖整日、触及失效或超出已核对/抓取边界 %j', (change) => {
    const value = available();
    Object.assign(value.pack.validity, change);
    expect(executionRuleResponseSchema.safeParse(value).success).toBe(false);
  });

  it('允许精确时刻窗口，拒绝窗口倒序和失效边界倒序', () => {
    const value = available();
    value.request = {
      ...value.request,
      window: { start: request.window.start, end: request.window.start },
    };
    expect(executionRuleResponseSchema.safeParse(value).success).toBe(true);
    expect(
      executionRuleRequestSchema.safeParse({
        ...request,
        window: { start: request.window.end, end: request.window.start },
      }).success,
    ).toBe(false);
    value.pack.validity.effectiveUntil = value.pack.validity.effectiveFrom;
    expect(executionRulePackSchema.safeParse(value.pack).success).toBe(false);
  });

  it('来源引用必须含正文与摘要、冲突处理，不用路由版本代替内容版本', () => {
    const value = available();
    for (const change of [
      { sources: [{ ...value.pack.sources[0], role: 'deferral' }] },
      { sources: [{ ...value.pack.sources[0], sha256: 'route-156' }] },
      { ruleVersion: 'route-156' },
      { sourceReview: { ...value.pack.sourceReview, conflicts: 'unresolved' } },
      { price: undefined },
    ])
      expect(executionRulePackSchema.safeParse({ ...value.pack, ...change }).success).toBe(false);
  });

  it('拒绝同一来源的冲突摘要，不由已处理声明掩盖矛盾', () => {
    const value = available();
    value.pack.sources.push({ ...value.pack.sources[0]!, sha256: 'c'.repeat(64) });
    expect(executionRulePackSchema.safeParse(value.pack).success).toBe(false);
  });

  it('不把 CN 一律假定为人民币，显式币种仍与请求一致', () => {
    const value = available();
    const change = { symbol: '900903.SH', assetType: 'STOCK' as const, currency: 'USD' };
    Object.assign(value.request.scope, change);
    Object.assign(value.pack.scope, change);
    expect(executionRuleResponseSchema.safeParse(value).success).toBe(true);
  });

  it('步长保持十进制精确语义，不接受零/指数/精度矛盾', () => {
    const value = available();
    value.pack.price = { step: '0.0100', decimals: 2 };
    expect(executionRulePackSchema.safeParse(value.pack).success).toBe(true);
    for (const price of [
      { step: '0', decimals: 3 },
      { step: '1e-3', decimals: 3 },
      { step: '0.001', decimals: 2 },
      { step: '0.01', decimals: 19 },
    ])
      expect(executionRulePackSchema.safeParse({ ...value.pack, price }).success).toBe(false);
  });

  it('不可用原因明确，不能夹带可消费规则包', () => {
    const value = { request, status: 'unavailable', reasonCode: 'semantics_unsupported' };
    expect(executionRuleResponseSchema.safeParse(value).success).toBe(true);
    expect(
      executionRuleResponseSchema.safeParse({ ...value, pack: available().pack }).success,
    ).toBe(false);
  });

  it('拒绝同一毫秒内倒序一纳秒的请求窗口', () => {
    const value: ExecutionRuleRequest = structuredClone(request);
    value.window = {
      start: '2026-10-19T00:00:00.000000001Z',
      end: '2026-10-19T00:00:00.000000000Z',
    };
    expect(executionRuleRequestSchema.safeParse(value).success).toBe(false);
  });

  it.each(['effectiveFrom', 'verifiedThrough'] as const)(
    '拒绝 %s 晚于后一证据时刻一纳秒',
    (key) => {
      const value = available().pack;
      value.validity.effectiveFrom = '2026-10-20T08:00:00.000000000Z';
      value.validity.verifiedThrough = '2026-10-20T08:00:00.000000000Z';
      value.validity[key] = '2026-10-20T08:00:00.000000001Z';
      expect(executionRulePackSchema.safeParse(value).success).toBe(false);
    },
  );

  it.each(['start', 'end'] as const)('拒绝窗口 %s 超出证明范围一纳秒', (edge) => {
    const value = available();
    value.request.window = {
      start: '2026-10-19T00:00:00.000000000Z',
      end: '2026-10-19T00:00:00.000000001Z',
    };
    if (edge === 'start') value.pack.validity.effectiveFrom = '2026-10-19T00:00:00.000000001Z';
    else value.pack.validity.verifiedThrough = '2026-10-19T00:00:00.000000000Z';
    expect(executionRuleResponseSchema.safeParse(value).success).toBe(false);
  });

  it('失效时刻排他且不截断同一毫秒内合法的一纳秒区间', () => {
    const value = available();
    value.request.window = {
      start: '2026-10-19T00:00:00.000000000Z',
      end: '2026-10-19T00:00:00.000000001Z',
    };
    value.pack.validity.effectiveFrom = value.request.window.start;
    value.pack.validity.effectiveUntil = '2026-10-19T00:00:00.000000002Z';
    expect(executionRuleResponseSchema.safeParse(value).success).toBe(true);
    value.pack.validity.effectiveUntil = value.request.window.end;
    expect(executionRuleResponseSchema.safeParse(value).success).toBe(false);
  });

  it('接受等价偏移并保留原小数秒字符串', () => {
    const value = available();
    value.request.window = {
      start: '2026-10-19T08:00:00.000000001+08:00',
      end: '2026-10-19T00:00:00.000000001Z',
    };
    value.pack.validity.effectiveFrom = value.request.window.start;
    value.pack.validity.verifiedThrough = value.request.window.end;
    const parsed = executionRuleResponseSchema.parse(value);
    expect(parsed.request.window).toEqual(value.request.window);
  });

  it.each([
    '2026-10-19T00:00:00-00:00',
    '0000-01-01T00:00:00Z',
    `2026-10-19T00:00:00.${'1'.repeat(1025)}Z`,
  ])('拒绝未知偏移或超出现有证据时钟范围 %s', (time) => {
    const value: ExecutionRuleRequest = structuredClone(request);
    value.window = { start: time, end: time };
    expect(executionRuleRequestSchema.safeParse(value).success).toBe(false);
    expect(
      executionRulePackSchema.safeParse({ ...available().pack, fetchedAt: time }).success,
    ).toBe(false);
  });
});
