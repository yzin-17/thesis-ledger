import 'reflect-metadata';
import { afterEach, describe, expect, it } from 'vitest';
import { Module, RequestMethod, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DsaClient } from '../../src/integration/dsa/dsa.client.js';
import { InstrumentService } from '../../src/market/instrument.service.js';
import { MarketController } from '../../src/market/market.controller.js';
import { MarketDataController } from '../../src/market/market-data.controller.js';
import { MarketControlService } from '../../src/market/market-control.service.js';

describe('Market 公开路由', () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('只在现行路径提供 Market Data 接口', async () => {
    class TestModule {}
    Module({
      controllers: [MarketDataController],
      providers: [
        { provide: MarketControlService, useValue: { getPolicy: () => ({ revision: 1 }) } },
        { provide: InstrumentService, useValue: {} },
        { provide: DsaClient, useValue: {} },
      ],
    })(TestModule);

    app = await NestFactory.create(TestModule, { logger: false });
    app.setGlobalPrefix('api/v1', {
      exclude: [
        { path: 'api/market/(.*)', method: RequestMethod.ALL },
        { path: 'api/market-data/(.*)', method: RequestMethod.ALL },
      ],
    });
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();

    const current = await fetch(new URL('/api/market-data/policy', base));
    expect(current.status).toBe(200);
    expect(await current.json()).toEqual({ revision: 1 });
    const old = await fetch(new URL('/api/v2/market-data/policy', base));
    expect(old.status).toBe(404);
    expect(Reflect.getMetadata('path', MarketController)).toBe('api/market');
  });
});
