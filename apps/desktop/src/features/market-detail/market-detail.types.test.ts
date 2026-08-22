import { describe, expect, it } from 'vitest';
import {
  isRetryableMarketDetailSection,
  marketDetailStatusClass,
  marketDetailStatusLabel,
  mergeMarketDetail,
  getVisibleMarketDetail,
} from './market-detail.types.js';
import type { MarketDetailResponse } from '@thesis-ledger/api-client';

const detail = (symbol: string): MarketDetailResponse => ({
  version: 1,
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

describe('MarketDetail 类型辅助函数', () => {
  it('不会让旧资产响应覆盖当前资产', () => {
    const current = detail('600519.SH');
    const previous = detail('000001.SZ');

    expect(mergeMarketDetail(current, previous)).toBe(current);
  });

  it('在本地合并状态尚未提交时使用同标的 query 数据', () => {
    const queryData = detail('600519.SH');
    expect(getVisibleMarketDetail(null, queryData, '600519.SH')).toBe(queryData);
    expect(getVisibleMarketDetail(detail('000001.SZ'), queryData, '600519.SH')).toBe(queryData);
    expect(getVisibleMarketDetail(null, detail('000001.SZ'), '600519.SH')).toBeNull();
  });

  it('合并局部重试结果时保留已成功分段并去重 requested', () => {
    const current: MarketDetailResponse = {
      ...detail('600519.SH'),
      requested: ['quote', 'bars'],
      sections: {
        quote: { capability: 'quote' as const, status: 'ready' as const, data: null },
      },
    };
    const next: MarketDetailResponse = {
      ...detail('600519.SH'),
      requested: ['bars', 'chip'],
      sections: {
        bars: { capability: 'bars' as const, status: 'ready' as const, data: [] },
        chip: { capability: 'chip' as const, status: 'empty' as const, data: null },
      },
    };

    expect(mergeMarketDetail(current, next)).toMatchObject({
      requested: ['quote', 'bars', 'chip'],
      sections: { quote: current.sections.quote, bars: next.sections.bars },
    });
  });

  it('只允许 unavailable 分段进入局部重试并保持状态文案', () => {
    expect(isRetryableMarketDetailSection({ status: 'unavailable' } as never)).toBe(true);
    expect(isRetryableMarketDetailSection({ status: 'unsupported' } as never)).toBe(false);
    expect(marketDetailStatusLabel('empty')).toBe('暂无数据');
    expect(marketDetailStatusLabel('unavailable')).toBe('暂时不可用');
    expect(marketDetailStatusClass('stale')).toBe('tag warning');
  });
});
