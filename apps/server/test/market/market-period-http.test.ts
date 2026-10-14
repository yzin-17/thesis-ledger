import 'reflect-metadata';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Controller, Module, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MarketController } from '../../src/market/market.controller.js';
import { ApiExceptionFilter } from '../../src/platform/api-exception.filter.js';

describe('公开行情周期 HTTP 边界', () => {
  let app: INestApplication | undefined;
  const reader = {
    readChartV3: vi.fn(async (input) => ({ nativeTimeframe: input.identity.timeframe })),
  };
  const dsa = { calculateIndicators: vi.fn() };
  const detail = {
    resolveIdentity: vi.fn(async (symbol: string) => ({
      symbol,
      assetType: symbol.endsWith('.OF') ? 'MUTUAL_FUND' : 'ETF',
      source: 'symbol',
      status: 'confirmed',
    })),
    getDetail: vi.fn(),
  };
  afterEach(async () => {
    await app?.close();
    app = undefined;
    vi.clearAllMocks();
  });
  async function request(symbol: string, endpoint: string, timeframe?: string) {
    if (!app) {
      class HttpController extends MarketController {
        constructor() {
          super(reader as never, dsa as never, undefined, detail as never);
        }
      }
      Controller('api/market')(HttpController);
      class TestModule {}
      Module({ controllers: [HttpController] })(TestModule);
      app = await NestFactory.create(TestModule, { logger: false });
      app.useGlobalFilters(new ApiExceptionFilter());
      await app.listen(0, '127.0.0.1');
    }
    const url = new URL('/api/market/' + symbol + '/' + endpoint, await app.getUrl());
    if (timeframe !== undefined) url.searchParams.set('timeframe', timeframe);
    return fetch(url);
  }
  it.each(['5d', '1w', '1mo', '1y'])('%s 未装配在三端点均明确降级且不读日线', async (timeframe) => {
    for (const endpoint of ['bars', 'indicators/MA', 'detail']) {
      const response = await request('159516.SZ', endpoint, timeframe);
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({
        error: 'market_period_unavailable',
        details: { requestedTimeframe: timeframe, reason: 'aggregation_not_assembled' },
      });
    }
    expect(reader.readChartV3).not.toHaveBeenCalled();
    expect(dsa.calculateIndicators).not.toHaveBeenCalled();
    expect(detail.getDetail).not.toHaveBeenCalled();
  });
  it('股票派生请求不会映射到 ETF 或日线', async () => {
    const response = await request('600519.SH', 'bars', '1w');
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      details: { assetType: 'STOCK', requestedTimeframe: '1w' },
    });
    expect(reader.readChartV3).not.toHaveBeenCalled();
  });
  it('基金派生请求三端点均拒绝，不读取净值替代', async () => {
    for (const endpoint of ['bars', 'indicators/MA', 'detail']) {
      const response = await request('110011.OF', endpoint, '1mo');
      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({ error: 'market_period_asset_unsupported' });
    }
    expect(reader.readChartV3).not.toHaveBeenCalled();
    expect(detail.getDetail).not.toHaveBeenCalled();
  });
  it('非法周期三端点均为结构化 400', async () => {
    for (const endpoint of ['bars', 'indicators/MA', 'detail']) {
      const response = await request('159516.SZ', endpoint, 'weekly');
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: 'market_timeframe_invalid' });
    }
    expect(reader.readChartV3).not.toHaveBeenCalled();
  });
  it('省略周期与显式日线保留原 Reader 参数', async () => {
    for (const timeframe of [undefined, '1d']) {
      const response = await request('159516.SZ', 'bars', timeframe);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ nativeTimeframe: '1d' });
    }
    expect(reader.readChartV3).toHaveBeenCalledTimes(2);
  });
});
