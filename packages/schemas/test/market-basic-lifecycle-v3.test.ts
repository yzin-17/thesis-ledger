import { describe, expect, it } from 'vitest';
import { marketTradingStatusResponseV3Schema } from '../src/market-trading-status-v3.js';
import { backtestTradingStatusSnapshotV3Schema } from '../src/backtest-trading-status-v3.js';

const response = () => ({
  contractVersion: 3,
  consumer: 'thesis-ledger',
  requestId: 'basic-dates',
  routeKey: {
    kind: 'data',
    market: 'CN',
    assetType: 'STOCK',
    capability: 'HISTORICAL_TRADING_STATUS',
  },
  routeTarget: { providerId: 'baostock', upstreamSource: 'baostock', routeIndex: 0 },
  symbol: '300757.SZ',
  range: { start: '2023-08-31', end: '2023-08-31' },
  status: 'supported',
  days: [{ date: '2023-08-31', state: 'unknown' }],
  sourceDocuments: [],
  sourceRecords: [
    {
      id: 'basic',
      kind: 'normalizedQueryResponse',
      providerId: 'baostock',
      upstreamSource: 'baostock',
      symbol: '300757.SZ',
      range: { start: '2023-08-31', end: '2023-08-31' },
      queryMethod: 'query_stock_basic',
      queryFields: 'code,ipoDate,outDate,type',
      normalizerRevision: 'baostock-basic-dates-v1',
      responseSha256: 'a'.repeat(64),
      observedAt: '2026-10-09T00:00:00Z',
    },
  ],
  structuredCoverage: {
    expectedSessions: ['2023-08-31'],
    calendarUnknownDates: [],
    statusUnknownDates: ['2023-08-31'],
    stUnknownDates: ['2023-08-31'],
    complete: false,
  },
  basicLifecycle: {
    ipoDate: '2019-01-23',
    outDate: null,
    ipoDateStatus: 'known',
    outDateStatus: 'notProvided',
    sourceRecordId: 'basic',
  },
  provenance: {
    providerId: 'baostock',
    upstreamSource: 'baostock',
    providerRevision: 'bs-basic-v1',
    datasetId: 'basic',
    fetchedAt: '2026-10-09T00:00:00Z',
    granularity: '1d',
    historicalAvailability: 'notVerified',
  },
});

describe('单证券基础日期不能回填旧冻结身份或精细规则', () => {
  it('已取得上市日与未提供摘牌日并存，不生成逐日上市阶段', () => {
    const value = marketTradingStatusResponseV3Schema.parse(response());
    expect(value.basicLifecycle?.outDate).toBeNull();
    expect(value.days[0]?.listingPhase).toBeUndefined();
  });
  it.each(['state', 'reference', 'method', 'fields', 'future', 'order'])('拒绝无效 %s', (field) => {
    const value = response();
    if (field === 'state') value.basicLifecycle.ipoDateStatus = 'notProvided';
    if (field === 'reference') value.basicLifecycle.sourceRecordId = 'missing';
    if (field === 'method') value.sourceRecords[0]!.queryMethod = 'query_all_stock';
    if (field === 'fields') value.sourceRecords[0]!.queryFields = 'code';
    if (field === 'future') value.basicLifecycle.ipoDate = '2027-01-01';
    if (field === 'order')
      Object.assign(value.basicLifecycle, { outDate: '2018-01-01', outDateStatus: 'known' });
    expect(marketTradingStatusResponseV3Schema.safeParse(value).success).toBe(false);
  });
  it('日期来源失败独立不可用，不能假装未提供或已摘牌', () => {
    const value = response();
    Object.assign(value.basicLifecycle, {
      ipoDate: null,
      ipoDateStatus: 'unavailable',
      outDateStatus: 'unavailable',
      reason: '基础日期来源不可用',
    });
    delete (value.basicLifecycle as Partial<typeof value.basicLifecycle>).sourceRecordId;
    expect(marketTradingStatusResponseV3Schema.safeParse(value).success).toBe(true);
  });
  it('只有 v5 可带基础日期；旧 v4 无基础日期仍可解析', () => {
    const disclosure = {
      status: 'source',
      response: response(),
      structuredResearch: {
        mode: 'fixed-source-status-research-v1',
        priceDataAsOf: '2024-01-01T00:00:00Z',
        frozenAt: '2026-10-09T00:00:00Z',
        observedAfterPriceCutoff: true,
      },
    };
    const snapshot = {
      freezeVersion: 'frozen-trading-status-v5',
      runConfigChecksum: 'b'.repeat(64),
      disclosure,
    };
    expect(backtestTradingStatusSnapshotV3Schema.safeParse(snapshot).success).toBe(true);
    for (const v of [1, 2, 3, 4])
      expect(
        backtestTradingStatusSnapshotV3Schema.safeParse({
          ...snapshot,
          freezeVersion: `frozen-trading-status-v${v}`,
        }).success,
      ).toBe(false);
    delete (disclosure.response as Partial<typeof disclosure.response>).basicLifecycle;
    expect(
      backtestTradingStatusSnapshotV3Schema.safeParse({
        ...snapshot,
        freezeVersion: 'frozen-trading-status-v4',
      }).success,
    ).toBe(true);
    expect(backtestTradingStatusSnapshotV3Schema.safeParse(snapshot).success).toBe(false);
  });
});
