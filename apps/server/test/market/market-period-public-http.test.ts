import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Controller, Module, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  marketPeriodBarSeriesSchema,
  indicatorCalculateResponseSchema,
} from '@thesis-ledger/schemas';
import { MarketController } from '../../src/market/market.controller.js';
import { MarketPeriodDisplayService } from '../../src/market/market-period-display.service.js';
import { MarketPeriodReader } from '../../src/market/market-period-reader.js';
import { MarketPeriodIndicatorReader } from '../../src/market/market-period-indicator-reader.js';
import { MarketPeriodViewCache } from '../../src/market/market-period-view-cache.js';
import { buildMarketPeriodView } from '../../src/market/market-period-view.js';
import { ApiExceptionFilter } from '../../src/platform/api-exception.filter.js';
import {
  DSA_MARKET_INDICATOR_ENGINE_VERSION,
  type DsaClient,
} from '../../src/integration/dsa/dsa.client.js';
import { periodViewFixture } from './market-period-view.fixture.js';
import type { MarketPeriod } from '@thesis-ledger/domain';

describe('公开派生 bars/指标的实际装配 HTTP 链', () => {
  let app: INestApplication | undefined;
  let fixture = periodViewFixture();
  const calendar = {
    read: vi.fn(async (input: { start: string; end: string }) => ({
      status: 'ready', calendar: {
        ...fixture.window.calendar, coverageStart: input.start, coverageEnd: input.end,
        sessions: fixture.window.calendar.sessions.filter((session) =>
          session.tradingDate >= input.start && session.tradingDate <= input.end),
      },
    })),
  };
  const native = {
    readChartV3: vi.fn(async (input: unknown) => {
      void input;
      return fixture.source;
    }),
  };
  const dsa = {
    calculateIndicators: vi.fn(),
    calculatePeriodIndicators: vi.fn(
      async (input: Parameters<DsaClient['calculatePeriodIndicators']>[0]) => ({
        contractVersion: 3,
        inputFingerprint: input.inputFingerprint,
        engineVersion: DSA_MARKET_INDICATOR_ENGINE_VERSION,
        results: input.requests.map((request) => ({
          ...request,
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
    timeframe = '1w',
    params: Record<string, string> = {},
    symbol = '510300.SH',
  ) {
    if (!app) {
      const reader = new MarketPeriodReader(
        calendar as never,
        native as never,
        new MarketPeriodViewCache(),
      );
      const periods = new MarketPeriodDisplayService(
        calendar as never,
        reader,
        new MarketPeriodIndicatorReader(dsa as never),
      );
      class HttpController extends MarketController {
        constructor() {
          super(native as never, dsa as never, undefined, undefined, undefined, undefined, periods);
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
    for (const [key, value] of Object.entries({
      assetType: 'ETF',
      timeframe,
      limit: '2',
      ...params,
    }))
      url.searchParams.set(key, value);
    return fetch(url);
  }
  it.each(['5d', '1w', '1mo', '1y'] as const)(
    '%s 返回真实 Domain 装配，基础只读 1d',
    async (timeframe) => {
      fixture = periodViewFixture(timeframe);
      const response = await request('bars', timeframe);
      expect(response.status).toBe(200);
      const series = marketPeriodBarSeriesSchema.parse(await response.json());
      expect(series.identity.timeframe).toBe(timeframe);
      expect(series.points).toHaveLength(2);
      expect(series.provenance).toMatchObject({
        kind: 'derived',
        provider: 'thesis-ledger-server',
      });
      expect(native.readChartV3).toHaveBeenCalledOnce();
      expect(native.readChartV3.mock.calls[0]?.[0]).toMatchObject({
        identity: { timeframe: '1d' },
      });
      if (timeframe === '5d') expect(series.derivation.anchorTradingDate).toBe('2026-10-02');
      expect(dsa.calculateIndicators).not.toHaveBeenCalled();
    },
  );
  it.each(['5d', '1w', '1mo'] as const)(
    '%s 指标经 DSA 消费，显示/计算分别绑定',
    async (timeframe: MarketPeriod) => {
      fixture = periodViewFixture(timeframe, true);
      const bars = buildMarketPeriodView(fixture.source, {
        ...fixture.window,
        evaluationAsOf: new Date().toISOString(),
      }).visible.series;
      const response = await request('indicators/MA', timeframe);
      expect(response.status).toBe(200);
      const indicators = indicatorCalculateResponseSchema.parse(await response.json());
      expect(indicators.inputFingerprint).toBe(bars.inputFingerprint);
      expect(indicators.results[0]?.calculationInput?.pointCount).toBe(61);
      expect(indicators.results[0]?.points.map((point) => point.timestamp)).toEqual(
        bars.points.map((point) => point.timestamp),
      );
      expect(indicators.results[0]?.points[0]?.values.ma5).toBe(59);
      expect(dsa.calculatePeriodIndicators).toHaveBeenCalledOnce();
      expect(dsa.calculateIndicators).not.toHaveBeenCalled();
    },
  );
  it('年度指标超限返回结构化 400，不读取来源或 DSA', async () => {
    const response = await request('indicators/MA', '1y');
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: 'market_period_window_invalid',
      details: { reason: 'calendar_input_limit' },
    });
    expect(native.readChartV3).not.toHaveBeenCalled();
    expect(dsa.calculatePeriodIndicators).not.toHaveBeenCalled();
  });
  it('重复指标命中缓存，refresh 强制重算，asOf 明确拒绝', async () => {
    fixture = periodViewFixture('1w', true);
    expect((await request('indicators/MA')).status).toBe(200);
    expect((await request('indicators/MA')).status).toBe(200);
    expect(dsa.calculatePeriodIndicators).toHaveBeenCalledOnce();
    expect((await request('indicators/MA', '1w', { refresh: '1' })).status).toBe(200);
    expect(dsa.calculatePeriodIndicators).toHaveBeenCalledTimes(2);
    expect(native.readChartV3.mock.calls.at(-1)?.[0]).toMatchObject({ refresh: true });
    const count = native.readChartV3.mock.calls.length;
    expect((await request('indicators/MA', '1w', { asOf: '2026-09-01T00:00:00Z' })).status).toBe(
      400,
    );
    expect(native.readChartV3).toHaveBeenCalledTimes(count);
  });
  it('基金、海外市场和非法周期在 I/O 前拒绝', async () => {
    for (const [symbol, assetType] of [
      ['110011.OF', 'MUTUAL_FUND'],
      ['AAPL.US', 'STOCK'],
    ]) {
      expect((await request('bars', '1w', { assetType: assetType! }, symbol)).status).toBe(422);
    }
    const invalid = await request('bars', 'weekly');
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ error: 'market_timeframe_invalid' });
    expect(calendar.read).not.toHaveBeenCalled();
  });
  it('complete/asOf、非法日期和条数不进入来源', async () => {
    const invalidQueries: Record<string, string>[] = [
      { acceptance: 'complete' },
      { asOf: '2026-09-01T00:00:00Z' },
      { start: '2026-02-30' },
      { limit: '0' },
    ];
    for (const query of invalidQueries)
      expect((await request('bars', '1w', query)).status).toBe(400);
    expect(native.readChartV3).not.toHaveBeenCalled();
  });
  it('日历失败明确降级，不读取来源', async () => {
    calendar.read.mockResolvedValueOnce({
      status: 'unavailable',
      reason: 'calendar_unavailable',
    } as never);
    const response = await request('bars');
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ details: { reason: 'calendar_unavailable' } });
    expect(native.readChartV3).not.toHaveBeenCalled();
  });
  it('来源失败只获取一次，不回退到日线成功响应', async () => {
    native.readChartV3.mockRejectedValueOnce(new Error('transport'));
    const response = await request('bars');
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ details: { reason: 'source_unavailable' } });
    expect(native.readChartV3).toHaveBeenCalledOnce();
  });
  it('DSA 失败保留结构化原因', async () => {
    fixture = periodViewFixture('1w', true);
    dsa.calculatePeriodIndicators.mockRejectedValueOnce(new Error('transport'));
    const response = await request('indicators/MA');
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ details: { reason: 'indicator_unavailable' } });
  });
  it('原生请求绕过派生服务，原 Reader 参数不变', async () => {
    const response = await request('bars', '1d');
    expect(response.status).toBe(200);
    expect(calendar.read).not.toHaveBeenCalled();
    expect(native.readChartV3.mock.calls[0]?.[0]).toMatchObject({
      identity: { timeframe: '1d' },
      window: { limit: 2 },
    });
  });
});
