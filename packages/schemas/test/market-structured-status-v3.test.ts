import { describe, expect, it } from 'vitest';
import { marketTradingStatusResponseV3Schema } from '../src/market-trading-status-v3.js';
import { backtestTradingStatusSnapshotV3Schema } from '../src/backtest-trading-status-v3.js';

const response = () => ({
  contractVersion: 3,
  consumer: 'thesis-ledger',
  requestId: 'structured-status',
  routeKey: {
    kind: 'data',
    market: 'CN',
    assetType: 'STOCK',
    capability: 'HISTORICAL_TRADING_STATUS',
  },
  routeTarget: { providerId: 'baostock', upstreamSource: 'baostock', routeIndex: 0 },
  symbol: '300757.SZ',
  range: { start: '2023-08-31', end: '2023-09-01' },
  status: 'supported',
  days: [
    {
      date: '2023-08-31',
      state: 'suspended',
      coarseST: 'notFlagged',
      sourceRecordIds: ['query-1'],
    },
    { date: '2023-09-01', state: 'unknown' },
  ],
  sourceDocuments: [],
  sourceRecords: [
    {
      id: 'query-1',
      kind: 'normalizedQueryResponse',
      providerId: 'baostock',
      upstreamSource: 'baostock',
      symbol: '300757.SZ',
      range: { start: '2023-08-31', end: '2023-09-01' },
      queryMethod: 'query_history_k_data_plus+query_trade_dates',
      queryFields: 'date,code,tradestatus,isST',
      normalizerRevision: 'baostock-daily-flags-v1',
      responseSha256: 'a'.repeat(64),
      observedAt: '2026-10-09T00:00:00Z',
    },
  ],
  structuredCoverage: {
    expectedSessions: ['2023-08-31', '2023-09-01'],
    calendarUnknownDates: [],
    statusUnknownDates: ['2023-09-01'],
    stUnknownDates: ['2023-09-01'],
    complete: false,
  },
  provenance: {
    providerId: 'baostock',
    upstreamSource: 'baostock',
    providerRevision: 'bs-v1',
    datasetId: 'bs-query-1',
    fetchedAt: '2026-10-09T00:00:00Z',
    granularity: '1d',
    historicalAvailability: 'notVerified',
  },
});

describe('结构化状态保留逐维覆盖及独立证据', () => {
  it('已知停牌与未知日可以共存，不能要求逐日公告', () => {
    expect(marketTradingStatusResponseV3Schema.parse(response())).toEqual(response());
  });
  it('状态未知时仍可保留已知粗 ST，不生成细分风险', () => {
    const value = response();
    value.days[0]!.state = 'unknown';
    value.structuredCoverage.statusUnknownDates.unshift('2023-08-31');
    expect(marketTradingStatusResponseV3Schema.parse(value).days[0]!.coarseST).toBe('notFlagged');
  });
  it.each([
    'reference',
    'symbolSource',
    'range',
    'clock',
    'complete',
    'precise',
    'missingCoverage',
    'duplicate',
  ])('拒绝无效 %s', (field) => {
    const value = response();
    if (field === 'reference') value.days[0]!.sourceRecordIds = ['missing'];
    else if (field === 'symbolSource') value.sourceRecords[0]!.symbol = '600221.SH';
    else if (field === 'range') value.sourceRecords[0]!.range.end = '2023-09-02';
    else if (field === 'clock') value.sourceRecords[0]!.observedAt = '2026-10-10T00:00:00Z';
    else if (field === 'complete') value.structuredCoverage.complete = true;
    else if (field === 'precise')
      Object.assign(value.days[0]!, { riskWarning: { delisting: 'active', other: 'unknown' } });
    else if (field === 'missingCoverage')
      delete (value as Partial<typeof value>).structuredCoverage;
    else value.sourceRecords.push(value.sourceRecords[0]!);
    expect(marketTradingStatusResponseV3Schema.safeParse(value).success).toBe(false);
  });
  it('新结构化来源只能使用新冻结版本，旧公告版本仍独立', () => {
    const snapshot = {
      freezeVersion: 'frozen-trading-status-v4',
      runConfigChecksum: 'b'.repeat(64),
      disclosure: {
        status: 'source',
        response: response(),
        structuredResearch: {
          mode: 'fixed-source-status-research-v1',
          priceDataAsOf: '2026-10-09T00:00:00Z',
          frozenAt: '2026-10-09T00:00:00Z',
          observedAfterPriceCutoff: false,
        },
      },
    };
    expect(backtestTradingStatusSnapshotV3Schema.safeParse(snapshot).success).toBe(true);
    for (const freezeVersion of [
      'frozen-trading-status-v1',
      'frozen-trading-status-v2',
      'frozen-trading-status-v3',
    ])
      expect(
        backtestTradingStatusSnapshotV3Schema.safeParse({ ...snapshot, freezeVersion }).success,
      ).toBe(false);
  });
});
