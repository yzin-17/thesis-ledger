import { describe, expect, it } from 'vitest';
import type { TradeChartMarker } from '@thesis-ledger/schemas';
import {
  measureChartRange,
  overlayPriceScope,
  placeTradeMarkers,
} from './market-trading-overlay-model.js';
import type { MarketChartBar } from './market-chart-types.js';

const day = (date: string, close = 10): MarketChartBar => ({
  symbol: '600519.SH',
  timeframe: '1d',
  timestamp: `${date}T00:00:00+08:00`,
  observedAt: '2026-11-04T16:00:00Z',
  adjustment: 'none',
  open: 10,
  high: 15,
  low: 8,
  close,
  volume: 100,
  amount: 1000,
});
const marker = (change: Partial<TradeChartMarker> = {}): TradeChartMarker => ({
  id: 'buy-1',
  eventId: 'event-1',
  factId: 'fact-1',
  side: 'buy',
  currency: 'CNY',
  price: '10',
  quantity: '100',
  tradingDate: '2026-11-04',
  occurredAt: '2026-11-04T02:00:00Z',
  timePrecision: 'INSTANT',
  ...change,
});

describe('交易叠加价格与时间坐标', () => {
  it('港股人民币和美元柜台按交易币种比较，特殊海外柜台不推定港币', () => {
    const scope = (symbol: string) => overlayPriceScope([{ ...day('2026-11-04'), symbol }]);
    expect(scope('80700.HK')).toMatchObject({ currency: 'CNY', comparable: true });
    expect(scope('09088.HK')).toMatchObject({ currency: 'USD', comparable: true });
    expect(scope('09840.HK')).toMatchObject({ currency: 'USD', comparable: true });
    expect(scope('41500.HK')).toMatchObject({ currency: 'USD', comparable: true });
    expect(scope('09988.HK')).toMatchObject({ currency: 'HKD', comparable: true });
    expect(scope('04338.HK').comparable).toBe(false);
    expect(scope('06200.HK').comparable).toBe(false);
  });
  it('成本仅在同一证券、不复权和一致币种时可比，B股未知口径不推成CNY', () => {
    const bars = [day('2026-11-04')];
    const position = {
      symbol: '600519.SH',
      currency: 'CNY' as const,
      costPrice: 10.12,
      asset: { name: '受控股票', assetType: 'stock' as const },
    };
    expect(overlayPriceScope(bars, position)).toMatchObject({
      comparable: true,
      currency: 'CNY',
      cost: 10.12,
    });
    expect(overlayPriceScope([{ ...bars[0]!, adjustment: 'qfq' }], position).comparable).toBe(
      false,
    );
    expect(overlayPriceScope(bars, { ...position, currency: 'USD' }).cost).toBeUndefined();
    expect(overlayPriceScope(bars, { ...position, symbol: '000001.SZ' }).comparable).toBe(false);
    expect(overlayPriceScope([{ ...bars[0]!, symbol: '900901.SH' }]).comparable).toBe(false);
  });
  it('日线保留逐条买卖和DATE精度，币种及未来日期不混入当前序列', () => {
    const result = placeTradeMarkers(
      [day('2026-11-04')],
      [
        marker(),
        marker({ id: 'sell-1', side: 'sell', timePrecision: 'DATE' }),
        marker({ id: 'wrong', currency: 'USD' }),
        marker({
          id: 'future',
          tradingDate: '2026-11-06',
          occurredAt: '2026-11-06T00:00:00Z',
          timePrecision: 'DATE',
        }),
      ],
      'CNY',
    );
    expect(result.markers.map((value) => value.side)).toEqual(['buy', 'sell']);
    expect(result.markers.every((value) => value.key === '2026-11-04')).toBe(true);
    expect(result.omitted).toBe(2);
  });
  it('周线按真实桶日期归属，未来DATE事实不因属于本周而泄漏', () => {
    const bars = [
      {
        ...day('2026-11-02'),
        timeframe: '1w' as const,
        bucketStartDate: '2026-11-02',
        bucketEndDate: '2026-11-08',
        observedTradingDates: ['2026-11-02', '2026-11-03', '2026-11-04'],
      },
    ];
    const result = placeTradeMarkers(
      bars,
      [
        marker(),
        marker({
          id: 'future',
          timePrecision: 'DATE',
          occurredAt: '2026-11-06T00:00:00Z',
          tradingDate: '2026-11-06',
        }),
      ],
      'CNY',
    );
    expect(result.markers).toHaveLength(1);
    expect(result.markers[0]!.key).toBe('2026-11-02');
  });
  it('分钟只接收INSTANT，桶边界、实际源末分钟及观测时刻分别限制', () => {
    const base = {
      ...day('2026-11-04'),
      symbol: 'SPY.US',
      timeframe: '5m' as const,
      tradingDate: '2026-11-04',
      observedAt: '2026-11-04T14:37:30Z',
    };
    const bars = [
      {
        ...base,
        timestamp: '2026-11-04T14:30:00Z',
        bucketEndAt: '2026-11-04T14:35:00Z',
        observedEndAt: '2026-11-04T14:35:00Z',
      },
      {
        ...base,
        timestamp: '2026-11-04T14:35:00Z',
        bucketEndAt: '2026-11-04T14:40:00Z',
        observedEndAt: '2026-11-04T14:37:00Z',
      },
    ];
    const make = (time: string, id = time) =>
      marker({ id, currency: 'USD', occurredAt: `2026-11-04T${time}Z` });
    const result = placeTradeMarkers(
      bars,
      [
        make('14:34:00'),
        make('14:35:00'),
        make('14:37:00'),
        make('14:37:15'),
        make('14:38:00'),
        { ...make('14:30:00'), timePrecision: 'DATE' },
      ],
      'USD',
    );
    expect(result.markers.map((value) => value.key)).toEqual([
      '2026-11-04T14:30:00.000Z',
      '2026-11-04T14:35:00.000Z',
      '2026-11-04T14:35:00.000Z',
    ]);
    expect(result.omitted).toBe(3);
  });
  it('富途原生末端分钟戳采用区间边界，未知来源不继承其时标', () => {
    const bars = [31, 32].map((minute) => ({
      ...day('2026-11-04'),
      symbol: 'SPY.US',
      timeframe: '1m' as const,
      session: 'regular' as const,
      upstreamSource: 'futu',
      observedAt: '2026-11-04T14:33:00Z',
      timestamp: `2026-11-04T14:${minute}:00Z`,
    }));
    const value = marker({ currency: 'USD', occurredAt: '2026-11-04T14:31:00Z' });
    expect(placeTradeMarkers(bars, [value], 'USD').markers[0]!.key).toBe(
      '2026-11-04T14:32:00.000Z',
    );
    expect(
      placeTradeMarkers(
        bars.map((bar) => ({ ...bar, upstreamSource: 'unknown' })),
        [value],
        'USD',
      ).omitted,
    ).toBe(1);
  });
  it('正向、反向、同点、缺点及零价格测量不产生错误百分比', () => {
    const bars = [day('2026-11-02', 10), day('2026-11-03', 11), day('2026-11-04', 12)];
    expect(measureChartRange(bars, '2026-11-02', '2026-11-04')).toMatchObject({
      difference: 2,
      bars: 3,
    });
    expect(measureChartRange(bars, '2026-11-02', '2026-11-04')?.percent).toBeCloseTo(20);
    expect(measureChartRange(bars, '2026-11-04', '2026-11-02')).toMatchObject({
      difference: -2,
      bars: 3,
    });
    expect(measureChartRange(bars, '2026-11-02', '2026-11-02')).toMatchObject({
      difference: 0,
      bars: 1,
      percent: 0,
    });
    expect(measureChartRange(bars, 'missing', null)).toBeUndefined();
    expect(
      measureChartRange([day('2026-11-02', 0), ...bars], '2026-11-02', '2026-11-04')!.percent,
    ).toBeNull();
  });
});
