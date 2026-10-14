import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Controller, Module, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  marketDisplayDetailResponseSchema,
  marketPeriodOptionsSchema,
} from '@thesis-ledger/schemas';
import { MarketController } from '../../src/market/market.controller.js';
import { MarketPeriodDisplayService } from '../../src/market/market-period-display.service.js';
import { MarketPeriodReader } from '../../src/market/market-period-reader.js';
import { MarketPeriodIndicatorReader } from '../../src/market/market-period-indicator-reader.js';
import { MarketPeriodDetailService } from '../../src/market/market-period-detail.service.js';
import { MarketPeriodOptionsService } from '../../src/market/market-period-options.service.js';
import { ApiExceptionFilter } from '../../src/platform/api-exception.filter.js';
import {
  DSA_MARKET_INDICATOR_ENGINE_VERSION,
  type DsaClient,
} from '../../src/integration/dsa/dsa.client.js';
import { periodViewFixture, refreshSourceFingerprint } from './market-period-view.fixture.js';
import { planMarketPeriodWindow } from '../../src/market/market-period-window.js';

describe('派生详情与实际日历/口径能力 HTTP', () => {
  let app: INestApplication | undefined;
  let fixture = periodViewFixture();
  const calendar = {
    read: vi.fn(async (input: { start: string; end: string }) => ({
      status: 'ready',
      calendar: {
        ...fixture.window.calendar,
        coverageStart: input.start,
        coverageEnd: input.end,
        sessions: fixture.window.calendar.sessions.filter(
          (item) => item.tradingDate >= input.start && item.tradingDate <= input.end,
        ),
      },
    })),
  };
  const native = { readChartV3: vi.fn(async () => fixture.source) };
  const detail = {
    resolveIdentity: vi.fn(async (symbol: string) => ({
      symbol,
      assetType: symbol.endsWith('.OF') ? 'MUTUAL_FUND' : 'ETF',
      source: 'symbol',
      status: 'confirmed',
    })),
    getDetail: vi.fn(async () => ({
      sections: {
        quote: {
          capability: 'quote',
          status: 'unavailable',
          error: { code: 'quote_unavailable', message: '受控行情不可得', diagnosticId: 'quote' },
        },
      },
      dependencies: {},
    })),
  };
  const chart = {
    options: vi.fn(async () => ({
      contractVersion: 3,
      mode: 'v3',
      symbol: '510300.SH',
      options: ['none', 'qfq', 'hfq'].map((adjustment) => ({
        adjustment,
        available: true,
        reason: null,
      })),
    })),
  };
  const dsa = {
    calculateIndicators: vi.fn(),
    calculatePeriodIndicators: vi.fn(
      async (input: Parameters<DsaClient['calculatePeriodIndicators']>[0]) => ({
        contractVersion: 3,
        inputFingerprint: input.inputFingerprint,
        engineVersion: DSA_MARKET_INDICATOR_ENGINE_VERSION,
        results: input.requests.map((item) => ({
          ...item,
          inputFingerprint: input.inputFingerprint,
          points: input.points.map((point, index) => ({
            timestamp: point.timestamp,
            values: { ma5: index },
          })),
        })),
      }),
    ),
  };
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-04T00:00:00Z'));
    fixture = periodViewFixture();
  });
  afterEach(async () => {
    await app?.close();
    app = undefined;
    vi.useRealTimers();
    vi.clearAllMocks();
  });
  async function request(
    endpoint: string,
    params: Record<string, string> = {},
    symbol = '510300.SH',
  ) {
    if (!app) {
      const periods = new MarketPeriodDisplayService(
        calendar as never,
        new MarketPeriodReader(calendar as never, native as never),
        new MarketPeriodIndicatorReader(dsa as never),
      );
      const derivedDetail = new MarketPeriodDetailService(detail as never, periods);
      const options = new MarketPeriodOptionsService(periods, chart as never);
      class HttpController extends MarketController {
        constructor() {
          super(
            native as never,
            dsa as never,
            undefined,
            detail as never,
            undefined,
            chart as never,
            periods,
            derivedDetail,
            options,
          );
        }
      }
      Controller('api/market')(HttpController);
      class TestModule {}
      Module({ controllers: [HttpController] })(TestModule);
      app = await NestFactory.create(TestModule, { logger: false });
      app.useGlobalFilters(new ApiExceptionFilter());
      await app.listen(0, '127.0.0.1');
    }
    const url = new URL(`/api/market/${symbol}/${endpoint}`, await app.getUrl());
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return fetch(url);
  }
  it.each(['5d', '1w', '1mo', '1y'] as const)(
    '%s 详情返回派生 bars，不调用原生日线详情装配',
    async (timeframe) => {
      fixture = periodViewFixture(timeframe);
      const response = await request('detail', { timeframe, barsLimit: '2', include: 'bars' });
      expect(response.status).toBe(200);
      const result = marketDisplayDetailResponseSchema.parse(await response.json());
      expect(result.barSeries?.identity.timeframe).toBe(timeframe);
      expect(result.barSeries?.points).toHaveLength(2);
      expect(result.sections.bars?.data).toEqual(result.barSeries);
      expect(native.readChartV3).toHaveBeenCalledOnce();
      expect(detail.getDetail).not.toHaveBeenCalled();
    },
  );
  it('bars/两种指标只获取一次真实日线，显示/计算分别绑定', async () => {
    fixture = periodViewFixture('1w', true);
    const response = await request('detail', {
      timeframe: '1w',
      barsLimit: '2',
      include: 'bars,indicator:MA,indicator:MACD',
    });
    expect(response.status).toBe(200);
    const result = marketDisplayDetailResponseSchema.parse(await response.json());
    expect(result.sections['indicator:MA']?.data).toMatchObject({
      inputFingerprint: result.barSeries?.inputFingerprint,
      calculationInput: { pointCount: 61 },
    });
    expect(result.sections['indicator:MACD']?.status).toBe('ready');
    expect(native.readChartV3).toHaveBeenCalledOnce();
    expect(dsa.calculatePeriodIndicators).toHaveBeenCalledOnce();
  });
  it('年度指标预算不足不覆盖年线 bars，不调用 DSA', async () => {
    fixture = periodViewFixture('1y');
    const response = await request('detail', {
      timeframe: '1y',
      barsLimit: '2',
      include: 'bars,indicator:MA,indicator:MACD,indicator:RSI',
    });
    expect(response.status).toBe(200);
    const result = marketDisplayDetailResponseSchema.parse(await response.json());
    expect(result.barSeries?.points).toHaveLength(2);
    expect(result.sections.bars?.status).toBe('ready');
    for (const name of ['MA', 'MACD', 'RSI'])
      expect(result.sections[`indicator:${name}` as 'indicator:MA']?.status).toBe('unavailable');
    expect(native.readChartV3).toHaveBeenCalledOnce();
    expect(dsa.calculatePeriodIndicators).not.toHaveBeenCalled();
  });
  it('DSA 故障只降级指标，bars 和 DAILY_BAR 仍 ready', async () => {
    fixture = periodViewFixture('1w', true);
    dsa.calculatePeriodIndicators.mockRejectedValueOnce(new Error('transport'));
    const response = await request('detail', {
      timeframe: '1w',
      barsLimit: '2',
      include: 'bars,indicator:MA',
    });
    const result = marketDisplayDetailResponseSchema.parse(await response.json());
    expect(result.sections.bars?.status).toBe('ready');
    expect(result.dependencies.DAILY_BAR?.status).toBe('ready');
    expect(result.sections['indicator:MA']?.status).toBe('unavailable');
    expect(native.readChartV3).toHaveBeenCalledOnce();
  });
  it('单一指标预热超限不阻止同周期较短预热指标', async () => {
    fixture = periodViewFixture('1mo', true);
    const plan = planMarketPeriodWindow({
      ...fixture.window,
      indicators: [{ name: 'MACD', parameters: { fast: 12, slow: 26, signal: 9 } }],
    });
    fixture.source.points = fixture.source.points.filter(
      (point) => point.timestamp.slice(0, 10) >= plan.baseStart!,
    );
    fixture.source.chartContextV3!.requestedStart = plan.baseStart!;
    refreshSourceFingerprint(fixture.source);
    const response = await request('detail', {
      timeframe: '1mo',
      barsLimit: '2',
      include: 'bars,indicator:MA,indicator:MACD',
      indicatorParams: '{"period":200}',
    });
    expect(response.status).toBe(200);
    const result = marketDisplayDetailResponseSchema.parse(await response.json());
    expect(result.sections.bars?.status).toBe('ready');
    expect(result.sections['indicator:MA']?.status).toBe('unavailable');
    expect(result.sections['indicator:MACD']?.status).toBe('ready');
    expect(native.readChartV3).toHaveBeenCalledOnce();
  });
  it('来源故障保留非行情分段且不重试', async () => {
    native.readChartV3.mockRejectedValueOnce(new Error('transport'));
    const response = await request('detail', {
      timeframe: '1w',
      barsLimit: '2',
      include: 'quote,bars',
    });
    expect(response.status).toBe(200);
    const result = marketDisplayDetailResponseSchema.parse(await response.json());
    expect(result.sections.quote?.error?.code).toBe('quote_unavailable');
    expect(result.sections.bars?.status).toBe('unavailable');
    expect(native.readChartV3).toHaveBeenCalledOnce();
  });
  it('非法指标/日期仍为 400，基金派生详情为 422', async () => {
    for (const params of [{ indicatorParams: '{"period":201}' }, { start: '2026-02-30' }])
      expect(
        (
          await request('detail', {
            timeframe: '1w',
            include: 'quote,bars,indicator:MA',
            ...params,
          })
        ).status,
      ).toBe(400);
    expect(
      (await request('detail', { timeframe: '1w', include: 'fund-nav' }, '110011.OF')).status,
    ).toBe(422);
    expect(native.readChartV3).not.toHaveBeenCalled();
    expect(detail.getDetail).not.toHaveBeenCalled();
  });
  it('周期能力绑定真实日历及实际基础窗口，年度指标独立不可得，不获取行情', async () => {
    const response = await request('period-options', { barsLimit: '2', adjustment: 'qfq' });
    expect(response.status).toBe(200);
    const result = marketPeriodOptionsSchema.parse(await response.json());
    expect(result.options.every((item) => item.available)).toBe(true);
    expect(result.options.find((item) => item.timeframe === '1w')?.window).toMatchObject({
      calendarRevision: 'controlled-view-calendar-v1',
      dailyPointCount: 10,
    });
    const annual = result.options.find((item) => item.timeframe === '1y')!;
    expect(annual.available).toBe(true);
    expect(annual.indicators.every((item) => !item.available)).toBe(true);
    expect(annual.indicators[0]?.reason).toBe('calendar_input_limit');
    expect(chart.options.mock.calls.length).toBeGreaterThan(1);
    expect(native.readChartV3).not.toHaveBeenCalled();
    expect(dsa.calculatePeriodIndicators).not.toHaveBeenCalled();
  });
  it('所选口径无路由不声明派生，且不读取日历', async () => {
    chart.options.mockResolvedValueOnce({
      contractVersion: 3,
      mode: 'v3',
      symbol: '510300.SH',
      options: [{ adjustment: 'qfq', available: false, reason: 'route_not_configured' }],
    } as never);
    const result = marketPeriodOptionsSchema.parse(await (await request('period-options')).json());
    expect(
      result.options.every((item) => !item.available && item.reason === 'route_not_configured'),
    ).toBe(true);
    expect(calendar.read).not.toHaveBeenCalled();
  });
  it('日历不可得不声明周期，基金也不声明派生', async () => {
    calendar.read.mockResolvedValueOnce({
      status: 'unavailable',
      reason: 'calendar_unavailable',
    } as never);
    const result = marketPeriodOptionsSchema.parse(
      await (await request('period-options', { barsLimit: '2' })).json(),
    );
    expect(result.options[0]?.available).toBe(false);
    expect(result.options[0]?.reason).toBe('calendar_unavailable');
    const fund = marketPeriodOptionsSchema.parse(
      await (await request('period-options', {}, '110011.OF')).json(),
    );
    expect(
      fund.options.every((item) => !item.available && item.reason === 'asset_unsupported'),
    ).toBe(true);
    expect(native.readChartV3).not.toHaveBeenCalled();
  });
  it('周期能力的非法口径/条数/日期在日历与路由前拒绝', async () => {
    for (const params of [
      { adjustment: 'invalid' },
      { barsLimit: '0' },
      { start: '2026-02-30' },
      { indicatorParams: '{"period":201}' },
    ])
      expect((await request('period-options', params)).status).toBe(400);
    expect(calendar.read).not.toHaveBeenCalled();
    expect(chart.options).not.toHaveBeenCalled();
  });
});
