import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
  barSeriesV2Schema,
  canonicalBarSeriesEncoding,
  indicatorCalculateRequestV2Schema,
  indicatorCalculateResponseV2Schema,
  marketDetailResponseV2Schema,
} from '../src/index.js';

const point = {
  timestamp: '2025-01-02T07:00:00.000Z',
  open: 1,
  high: 1.1,
  low: 0.9,
  close: 1,
  volume: 100,
  amount: 1000,
  completionStatus: 'complete' as const,
  availableAt: '2025-01-02T08:00:00.000Z',
};

describe('BarSeries V2 contract', () => {
  it('校验 identity、coverage 和精确 provenance', () => {
    const result = barSeriesV2Schema.parse({
      contractVersion: 2,
      identity: { symbol: '510300.SH', assetType: 'ETF', timeframe: '1d', adjustment: 'qfq' },
      points: [point],
      coverage: {
        actualStart: point.timestamp,
        actualEnd: point.timestamp,
        hasMoreBefore: false,
        latestCompleteTradingDate: '2025-01-02',
      },
      provenance: {
        providerId: 'tencent',
        upstreamSource: 'tencent',
        routeIndex: 0,
        effectivePolicyRevision: 3,
        providerRevision: 'tencent:manifest:1:config:0',
        fetchedAt: point.availableAt,
        freshUntil: '2025-01-03T01:00:00.000Z',
        servedFromCache: false,
        cacheStatus: 'miss',
      },
      inputFingerprint: 'fingerprint-1',
    });
    expect(result.identity.adjustment).toBe('qfq');
  });

  it('要求指标请求和响应均携带 inputFingerprint', () => {
    const request = indicatorCalculateRequestV2Schema.parse({
      contractVersion: 2,
      identity: { symbol: '510300.SH', assetType: 'ETF', timeframe: '1d', adjustment: 'qfq' },
      inputFingerprint: 'fingerprint-1',
      points: [point],
      requests: [{ name: 'MA', parameters: { period: 5 } }],
    });
    expect(request.inputFingerprint).toBe('fingerprint-1');
    const response = indicatorCalculateResponseV2Schema.parse({
      contractVersion: 2,
      engineVersion: 'dsa-indicator-v2',
      inputFingerprint: request.inputFingerprint,
      results: [{
        name: 'MA',
        parameters: { period: 5 },
        inputFingerprint: request.inputFingerprint,
        points: [{ timestamp: point.timestamp, values: { ma5: 1 } }],
      }],
    });
    expect(response.inputFingerprint).toBe(request.inputFingerprint);
  });

  it('拒绝重复时间戳和违反 OHLC 不变量的 points', () => {
    const base = {
      contractVersion: 2,
      identity: { symbol: '510300.SH', assetType: 'ETF', timeframe: '1d', adjustment: 'qfq' },
      points: [point, point],
      coverage: { actualStart: point.timestamp, actualEnd: point.timestamp, hasMoreBefore: false, latestCompleteTradingDate: '2025-01-02' },
      provenance: { providerId: 'tencent', upstreamSource: 'tencent', routeIndex: 0, effectivePolicyRevision: 3, providerRevision: 'r1', fetchedAt: point.availableAt, freshUntil: '2025-01-03T01:00:00.000Z', servedFromCache: false, cacheStatus: 'miss' },
      inputFingerprint: 'fingerprint-1',
    };
    expect(() => barSeriesV2Schema.parse(base)).toThrow();
    expect(() => barSeriesV2Schema.parse({ ...base, points: [{ ...point, high: 0.5 }] })).toThrow();
  });

  it('canonical encoding 保持跨运行时 golden vector 稳定', () => {
    const identity = { symbol: '510300.SH', assetType: 'ETF', timeframe: '1d', adjustment: 'qfq' } as const;
    const encoding = canonicalBarSeriesEncoding(identity, [point]);
    expect(encoding).toBe(
      '[["510300.SH","ETF","1d","qfq"],[["2025-01-02T07:00:00.000Z","1","1.1000000000000001","0.90000000000000002","1","100","1000","complete","2025-01-02T08:00:00.000Z"]]]',
    );
    expect(createHash('sha256').update(encoding).digest('hex')).toBe('9f35a1b9f4dba8483e6acb2b6214ec2fbaf5d450b91096ce591ada057623cfc5');

    const exponentEncoding = canonicalBarSeriesEncoding(identity, [{
      ...point,
      open: 1e20,
      high: 1e20,
      low: 1e-7,
      close: 0.1,
      volume: 1e20,
      amount: 1e20,
    }]);
    expect(createHash('sha256').update(exponentEncoding).digest('hex')).toBe(
      'bb4a7c6018e1627dbb74cd75ccfece58e85cd8e16c6688d8820756b34bb595d8',
    );
  });

  it('行情详情 v2 的 bars 和指标共享同一个 BarSeries fingerprint', () => {
    const barSeries = barSeriesV2Schema.parse({
      contractVersion: 2,
      identity: { symbol: '510300.SH', assetType: 'ETF', timeframe: '1d', adjustment: 'qfq' },
      points: [point],
      coverage: { actualStart: point.timestamp, actualEnd: point.timestamp, hasMoreBefore: false, latestCompleteTradingDate: '2025-01-02' },
      provenance: { providerId: 'tencent', upstreamSource: 'tencent', routeIndex: 0, effectivePolicyRevision: 3, providerRevision: 'r1', fetchedAt: point.availableAt, freshUntil: '2025-01-03T01:00:00.000Z', servedFromCache: false, cacheStatus: 'miss' },
      inputFingerprint: 'fingerprint-1',
    });
    const detail = {
      contractVersion: 2,
      symbol: '510300.SH',
      assetType: 'ETF',
      identity: { source: 'asset', status: 'confirmed' },
      requested: ['bars', 'indicator:MA'],
      capabilities: { supported: ['bars', 'indicator:MA'], unsupported: [] },
      limits: { bars: 90, nav: 90, barsHasMoreBefore: false },
      barSeries,
      sections: {
        bars: { capability: 'bars', status: 'ready', data: barSeries },
        'indicator:MA': {
          capability: 'indicator:MA',
          status: 'ready',
          data: { name: 'MA', parameters: { period: 5 }, inputFingerprint: barSeries.inputFingerprint, points: [] },
        },
      },
      dependencies: { DAILY_BAR: { status: 'ready' } },
      requestId: 'detail-v2',
      generatedAt: point.availableAt,
    };
    expect(marketDetailResponseV2Schema.parse(detail).barSeries?.inputFingerprint).toBe('fingerprint-1');
    expect(() => marketDetailResponseV2Schema.parse({ ...detail, barSeries: undefined })).toThrow();
    expect(() => marketDetailResponseV2Schema.parse({
      ...detail,
      sections: {
        ...detail.sections,
        'indicator:MA': {
          ...detail.sections['indicator:MA'],
          data: { ...detail.sections['indicator:MA'].data, inputFingerprint: 'different' },
        },
      },
    })).toThrow();
  });
});
