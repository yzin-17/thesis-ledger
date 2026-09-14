import { describe, expect, it } from 'vitest';
import {
  isRetryableMarketDetailSection,
  marketDetailStatusClass,
  marketDetailStatusLabel,
  mergeMarketDetail,
  getVisibleMarketDetail,
} from './market-detail.types.js';
import type { MarketDetailResponse } from '@thesis-ledger/api-client';
import type { IndicatorV1 } from '@thesis-ledger/schemas';

const indicator = (
  parameters: Record<string, number>,
  end: string,
  anchor: string,
): IndicatorV1 => ({
  version: 1,
  symbol: '600519.SH',
  name: 'MA',
  parameters,
  timeframe: '1d',
  marketTime: end,
  calculatedAt: end,
  values: { ma5: 100 },
  provider: 'efinance',
  engineVersion: 'dsa-v1',
  points: [{ timestamp: end, values: { ma5: 100 }, inputFingerprint: `fp-${end}` }],
  inputProvenance: {
    timeframe: '1d',
    provider: 'efinance',
    inputDateRange: { start: anchor, end },
    inputFingerprint: `full-${anchor}`,
  },
  calculationAnchor: { timestamp: anchor, inputFingerprint: `anchor-${anchor}` },
});

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

  it('详情合并不把不同 anchor 的指标页伪装成一个序列', () => {
    const currentIndicator = indicator(
      { period: 5 },
      '2026-08-20T00:00:00.000Z',
      '2026-08-01T00:00:00.000Z',
    );
    const olderPage = indicator(
      { period: 5 },
      '2026-07-31T00:00:00.000Z',
      '2026-07-01T00:00:00.000Z',
    );
    const merged = mergeMarketDetail(
      {
        ...detail('600519.SH'),
        sections: {
          'indicator:MA': {
            capability: 'indicator:MA',
            status: 'ready',
            data: currentIndicator,
          },
        },
      },
      {
        ...detail('600519.SH'),
        sections: {
          'indicator:MA': {
            capability: 'indicator:MA',
            status: 'ready',
            data: olderPage,
          },
        },
      },
    );
    expect(merged.sections['indicator:MA']?.data).toBe(olderPage);
  });

  it('参数变化时只接受新定义，旧参数 points 不会混入新页', () => {
    const oldIndicator = indicator(
      { period: 5 },
      '2026-08-20T00:00:00.000Z',
      '2026-08-01T00:00:00.000Z',
    );
    const newIndicator = indicator(
      { period: 20 },
      '2026-08-20T00:00:00.000Z',
      '2026-07-01T00:00:00.000Z',
    );
    const merged = mergeMarketDetail(
      {
        ...detail('600519.SH'),
        sections: {
          'indicator:MA': {
            capability: 'indicator:MA',
            status: 'ready',
            data: oldIndicator,
          },
        },
      },
      {
        ...detail('600519.SH'),
        sections: {
          'indicator:MA': {
            capability: 'indicator:MA',
            status: 'ready',
            data: newIndicator,
          },
        },
      },
    );
    expect(merged.sections['indicator:MA']?.data).toBe(newIndicator);
  });
});
