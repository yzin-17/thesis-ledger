import { describe, expect, it } from 'vitest';
import { aggregateMarketDailyBars } from '@thesis-ledger/domain';
import {
  barSeriesIdentitySchema,
  marketDataBarSeriesRequestV3Schema,
  marketDerivedTimeframeSchema,
  marketPeriodAggregationInputSchema,
  marketPeriodBarSeriesSchema,
  marketTimeframeSchema,
} from '../src/index.js';

const fingerprint = 'a'.repeat(64);
const end = '2026-09-11T07:00:00.000Z';
const dates = ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11'];
const input = () => ({
  symbol: '510300.SH',
  timeframe: '1w',
  adjustment: 'none',
  priceBasisFingerprint: fingerprint,
  baseInputFingerprint: fingerprint,
  evaluationAsOf: end,
  ruleVersion: 'market-period-aggregation-v1',
  calendar: {
    market: 'CN',
    timezone: 'Asia/Shanghai',
    revision: 'calendar-r1',
    availableAt: '2026-01-01T00:00:00.000Z',
    coverageStart: '2026-09-07',
    coverageEnd: '2026-09-13',
    sessions: dates.map((tradingDate) => ({
      tradingDate,
      startAt: `${tradingDate}T01:30:00.000Z`,
      endAt: `${tradingDate}T07:00:00.000Z`,
    })),
  },
  bars: dates.map((tradingDate) => ({
    symbol: '510300.SH',
    tradingDate,
    timestamp: `${tradingDate}T07:00:00.000Z`,
    adjustment: 'none',
    priceBasisFingerprint: fingerprint,
    open: 10,
    high: 12,
    low: 9,
    close: 11,
    volume: 2,
    amount: 3,
    completionStatus: 'complete',
    availableAt: `${tradingDate}T07:00:00.000Z`,
  })),
  noTradingEvidence: [],
});
const series = () => ({
  contractVersion: 3,
  identity: { symbol: '510300.SH', assetType: 'ETF', timeframe: '1w', adjustment: 'none' },
  points: [
    {
      timestamp: end,
      tradingDate: dates.at(-1),
      bucketStartDate: '2026-09-07',
      bucketEndDate: '2026-09-13',
      bucketEndAt: end,
      open: 10,
      high: 12,
      low: 9,
      close: 11,
      volume: 10,
      amount: 15,
      completionStatus: 'complete',
      availableAt: end,
      expectedTradingDates: dates,
      observedTradingDates: dates,
      explainedTradingDates: [],
      missingTradingDates: [],
    },
  ],
  coverage: {
    actualStart: end,
    actualEnd: end,
    hasMoreBefore: false,
    latestCompleteTradingDate: dates.at(-1),
  },
  provenance: {
    kind: 'derived',
    provider: 'thesis-ledger-server',
    providerRevision: 'market-period-aggregation-v1',
    baseSources: [
      {
        providerId: 'tencent',
        upstreamSource: 'tencent',
        providerRevision: 'r1',
        inputFingerprint: fingerprint,
        priceBasisFingerprint: fingerprint,
      },
    ],
  },
  derivation: {
    ruleVersion: 'market-period-aggregation-v1',
    calendarRevision: 'calendar-r1',
    baseInputFingerprint: fingerprint,
    priceBasisFingerprint: fingerprint,
    evaluationAsOf: end,
    coverageEvidence: [],
  },
  inputFingerprint: fingerprint,
});

describe('行情周期公共合同', () => {
  it.each(['MUTUAL_FUND', 'INDEX', 'BOND', 'LOF', 'CONVERTIBLE_BOND'])(
    '派生展示拒绝 %s，原生资产合同保持原枚举',
    (assetType) => {
      const value = series();
      value.identity.assetType = assetType;
      expect(marketPeriodBarSeriesSchema.safeParse(value).success).toBe(false);
      expect(
        barSeriesIdentitySchema.safeParse({ ...value.identity, timeframe: '1d' }).success,
      ).toBe(true);
    },
  );
  it('展示枚举覆盖六种周期，派生枚举拒绝日线与分钟线', () => {
    expect(marketTimeframeSchema.options).toEqual(['1m', '1d', '5d', '1w', '1mo', '1y']);
    expect(marketDerivedTimeframeSchema.safeParse('1d').success).toBe(false);
    expect(marketTimeframeSchema.safeParse('5m').success).toBe(false);
  });
  it('原生身份与来源路由仍仅接收 1m/1d，旧身份解析无新增字段', () => {
    const identity = { symbol: '510300.SH', assetType: 'ETF', timeframe: '1d', adjustment: 'none' };
    expect(barSeriesIdentitySchema.parse(identity)).toEqual(identity);
    expect(barSeriesIdentitySchema.safeParse({ ...identity, timeframe: '1w' }).success).toBe(false);
    expect(
      marketDataBarSeriesRequestV3Schema.safeParse({
        contractVersion: 3,
        requestId: 'test',
        symbol: identity.symbol,
        start: dates[0],
        end: dates.at(-1),
        routeKey: {
          kind: 'bar',
          market: 'CN',
          assetType: 'ETF',
          capability: 'DAILY_BAR',
          timeframe: '1w',
          adjustment: 'none',
        },
      }).success,
    ).toBe(false);
  });
  it('公共输入保留显式评估时刻、完整 Session 与规则版本', () => {
    expect(marketPeriodAggregationInputSchema.parse(input()).evaluationAsOf).toBe(end);
    expect(
      marketPeriodAggregationInputSchema.safeParse({ ...input(), evaluationAsOf: undefined })
        .success,
    ).toBe(false);
    expect(
      marketPeriodAggregationInputSchema.safeParse({ ...input(), ruleVersion: 'r2' }).success,
    ).toBe(false);
  });
  it('Schema 解析输入交给实际 Domain，聚合输出可回到派生展示合同', () => {
    const parsed = marketPeriodAggregationInputSchema.parse(input());
    const result = aggregateMarketDailyBars(parsed);
    const response = marketPeriodBarSeriesSchema.parse({
      ...series(),
      points: result.points,
      derivation: {
        ...series().derivation,
        calendarRevision: result.calendarRevision,
        evaluationAsOf: result.evaluationAsOf,
        coverageEvidence: result.coverageEvidence,
      },
    });
    expect(response.points[0]!.completionStatus).toBe('complete');
    expect(response.points[0]!.amount).toBe(15);
  });
  it('仅五日周期必须指定锚点', () => {
    expect(
      marketPeriodAggregationInputSchema.safeParse({ ...input(), timeframe: '5d' }).success,
    ).toBe(false);
    expect(
      marketPeriodAggregationInputSchema.parse({
        ...input(),
        timeframe: '5d',
        anchorTradingDate: dates.at(-1),
      }).timeframe,
    ).toBe('5d');
    expect(
      marketPeriodAggregationInputSchema.safeParse({ ...input(), anchorTradingDate: dates.at(-1) })
        .success,
    ).toBe(false);
  });
  it.each(['adjustment', 'priceBasisFingerprint', 'symbol'] as const)('拒绝混合 %s', (key) => {
    const value = input();
    Object.assign(value.bars[0]!, { [key]: key === 'adjustment' ? 'qfq' : 'b'.repeat(64) });
    expect(marketPeriodAggregationInputSchema.safeParse(value).success).toBe(false);
  });
  it('拒绝未来日线/日历以及失配或未来的覆盖证据', () => {
    const value = input();
    value.bars[0]!.availableAt = '2027-01-01T00:00:00.000Z';
    expect(marketPeriodAggregationInputSchema.safeParse(value).success).toBe(false);
    expect(
      marketPeriodAggregationInputSchema.safeParse({
        ...input(),
        calendar: { ...input().calendar, availableAt: '2027-01-01T00:00:00.000Z' },
      }).success,
    ).toBe(false);
    const evidence = {
      symbol: '510300.SH',
      tradingDate: dates[0],
      calendarRevision: 'wrong',
      baseInputFingerprint: fingerprint,
      revision: 'r1',
      availableAt: end,
      evidenceRef: 'notice:1',
      reason: 'suspended',
    };
    expect(
      marketPeriodAggregationInputSchema.safeParse({ ...input(), noTradingEvidence: [evidence] })
        .success,
    ).toBe(false);
    expect(
      marketPeriodAggregationInputSchema.safeParse({
        ...input(),
        noTradingEvidence: [
          { ...evidence, calendarRevision: 'calendar-r1', availableAt: '2027-01-01T00:00:00.000Z' },
        ],
      }).success,
    ).toBe(false);
  });
  it('接受独立派生展示序列并保留基础来源', () => {
    const parsed = marketPeriodBarSeriesSchema.parse(series());
    expect(parsed.provenance.kind).toBe('derived');
    expect(parsed.provenance.baseSources[0]!.providerId).toBe('tencent');
  });
  it('拒绝伪造 Server 来源、规则版本、NAV 或混合口径', () => {
    const value = series();
    expect(
      marketPeriodBarSeriesSchema.safeParse({
        ...value,
        provenance: { ...value.provenance, provider: 'tencent' },
      }).success,
    ).toBe(false);
    expect(
      marketPeriodBarSeriesSchema.safeParse({
        ...value,
        provenance: { ...value.provenance, providerRevision: 'r2' },
      }).success,
    ).toBe(false);
    expect(
      marketPeriodBarSeriesSchema.safeParse({
        ...value,
        identity: { ...value.identity, assetType: 'MUTUAL_FUND' },
      }).success,
    ).toBe(false);
    value.provenance.baseSources[0]!.priceBasisFingerprint = 'b'.repeat(64);
    expect(marketPeriodBarSeriesSchema.safeParse(value).success).toBe(false);
  });
  it('拒绝提前完成、未解释缺口和虚假覆盖边界', () => {
    const value = series();
    expect(
      marketPeriodBarSeriesSchema.safeParse({
        ...value,
        derivation: { ...value.derivation, evaluationAsOf: '2026-09-08T07:00:00.000Z' },
      }).success,
    ).toBe(false);
    value.points[0]!.missingTradingDates = [dates[0]!];
    expect(marketPeriodBarSeriesSchema.safeParse(value).success).toBe(false);
    expect(
      marketPeriodBarSeriesSchema.safeParse({
        ...series(),
        coverage: { ...series().coverage, actualEnd: null },
      }).success,
    ).toBe(false);
  });
  it('解释缺日必须携带绑定且可得的证据，不能省略或提前 availableAt', () => {
    const value = series();
    value.points[0]!.observedTradingDates = dates.filter((day) => day !== '2026-09-09');
    value.points[0]!.explainedTradingDates = ['2026-09-09'];
    expect(marketPeriodBarSeriesSchema.safeParse(value).success).toBe(false);
    const evidence = {
      symbol: '510300.SH',
      tradingDate: '2026-09-09',
      calendarRevision: 'calendar-r1',
      baseInputFingerprint: fingerprint,
      revision: 'r1',
      availableAt: end,
      evidenceRef: 'notice:1',
      reason: 'suspended',
    };
    const valid = { ...value, derivation: { ...value.derivation, coverageEvidence: [evidence] } };
    expect(marketPeriodBarSeriesSchema.safeParse(valid).success).toBe(true);
    expect(
      marketPeriodBarSeriesSchema.safeParse({
        ...valid,
        derivation: {
          ...valid.derivation,
          coverageEvidence: [{ ...evidence, symbol: '000001.SZ' }],
        },
      }).success,
    ).toBe(false);
    expect(
      marketPeriodBarSeriesSchema.safeParse({
        ...valid,
        derivation: {
          ...valid.derivation,
          coverageEvidence: [{ ...evidence, availableAt: '2026-09-12T00:00:00.000Z' }],
        },
      }).success,
    ).toBe(false);
  });
});
