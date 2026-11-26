import { describe, expect, it } from 'vitest';
import {
  isRetryableMarketDetailSection,
  marketDetailStatusVariant,
  marketDetailStatusLabel,
  mergeMarketDetail,
  getVisibleMarketDetail,
} from './market-detail.types.js';
import type { BarSeries } from '@thesis-ledger/schemas';
import type { MarketDetailResponse } from '@thesis-ledger/api-client';

const detail = (symbol: string): MarketDetailResponse => ({
  contractVersion: 1,
  symbol,
  assetType: 'STOCK',
  identity: { source: 'asset', status: 'confirmed' },
  requested: [],
  capabilities: { supported: [], unsupported: [] },
  limits: { bars: 30, nav: 30 },
  sections: {},
  dependencies: {},
  requestId: `request-${symbol}`,
  generatedAt: '2026-08-21T00:00:00.000Z',
});

const series = (timestamps: string[]): BarSeries => ({
  contractVersion: 1 as const,
  identity: { symbol: '600519.SH', assetType: 'STOCK' as const, timeframe: '1d' as const, adjustment: 'qfq' as const },
  points: timestamps.map((timestamp) => ({ timestamp, open: 10, high: 12, low: 9, close: 11, volume: 100, amount: 1100, completionStatus: 'complete' as const, availableAt: timestamp })),
  coverage: { actualStart: timestamps[0] ?? null, actualEnd: timestamps.at(-1) ?? null, hasMoreBefore: false, latestCompleteTradingDate: timestamps.at(-1)?.slice(0, 10) ?? null },
  provenance: { providerId: 'fixture', upstreamSource: 'fixture', routeIndex: 0, effectivePolicyRevision: 1, providerRevision: 'fixture', fetchedAt: timestamps[0] ?? '2026-01-01T00:00:00.000Z', freshUntil: '2099-01-01T00:00:00.000Z', servedFromCache: false, cacheStatus: 'miss' as const },
  inputFingerprint: 'fixture',
});

describe('MarketDetail V2 类型辅助函数', () => {
  it('不会让旧资产响应覆盖当前资产', () => {
    const current = detail('600519.SH');
    expect(mergeMarketDetail(current, detail('000001.SZ'))).toBe(current);
  });

  it('在本地合并状态尚未提交时使用同标的 query 数据', () => {
    const queryData = detail('600519.SH');
    expect(getVisibleMarketDetail(null, queryData, '600519.SH')).toBe(queryData);
    expect(getVisibleMarketDetail(detail('000001.SZ'), queryData, '600519.SH')).toBe(queryData);
  });

  it('合并 V2 bars 页面并保持严格时间顺序', () => {
    const current: MarketDetailResponse = { ...detail('600519.SH'), requested: ['bars'], barSeries: series(['2026-08-20T00:00:00.000Z']) };
    const next: MarketDetailResponse = { ...detail('600519.SH'), requested: ['bars'], barSeries: series(['2026-08-21T00:00:00.000Z']) };
    const merged = mergeMarketDetail(current, next);
    expect(merged.barSeries?.points.map((point) => point.timestamp)).toEqual([
      '2026-08-20T00:00:00.000Z',
      '2026-08-21T00:00:00.000Z',
    ]);
    expect(mergeMarketDetail(current, detail('600519.SH')).barSeries).toBe(current.barSeries);
  });

  it('按交易日替换同日修订，不因 ISO 时刻不同产生重复 bar', () => {
    const current: MarketDetailResponse = {
      ...detail('600519.SH'),
      requested: ['bars'],
      barSeries: series(['2026-08-21T00:00:00.000Z']),
    };
    const revisedSeries = series(['2026-08-21T07:00:00.000Z']);
    revisedSeries.points[0] = {
      ...revisedSeries.points[0]!,
      close: 13,
      completionStatus: 'incomplete',
    };
    const next: MarketDetailResponse = {
      ...detail('600519.SH'),
      requested: ['bars'],
      barSeries: revisedSeries,
    };
    const merged = mergeMarketDetail(current, next);
    expect(merged.barSeries?.points).toHaveLength(1);
    expect(merged.barSeries?.points[0]).toMatchObject({
      timestamp: '2026-08-21T07:00:00.000Z',
      close: 13,
      completionStatus: 'incomplete',
    });
  });

  it('只允许 unavailable 分段进入局部重试并保持状态文案', () => {
    expect(isRetryableMarketDetailSection({ status: 'unavailable' } as never)).toBe(true);
    expect(isRetryableMarketDetailSection({ status: 'unsupported' } as never)).toBe(false);
    expect(marketDetailStatusLabel('empty')).toBe('暂无数据');
    expect(marketDetailStatusVariant('stale')).toBe('outline');
    expect(marketDetailStatusVariant('unavailable')).toBe('destructive');
  });

  it.each(['capability_not_enabled', 'capability_unsupported', 'market_data_unauthorized', 'market_data_contract_invalid'])('配置或契约问题 %s 不提供重试', code => {
    expect(isRetryableMarketDetailSection({ status: 'unavailable', error: { code } } as never)).toBe(false);
  });
  it.each(['market_data_timeout', 'market_data_unavailable', 'provider_policy_unavailable', 'daily_bar_unavailable'])('临时失败 %s 保留重试', code => {
    expect(isRetryableMarketDetailSection({ status: 'unavailable', error: { code } } as never)).toBe(true);
  });

});
